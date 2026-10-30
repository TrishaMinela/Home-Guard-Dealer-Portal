import type { IncomingMessage, ServerResponse } from 'node:http'
import { createClient, type User } from '@supabase/supabase-js'
import { authorizeBillingAccessManager } from './_lib/authorizeBillingAccessManager.js'
import { classifyInvitationFailure, type InvitationFailure } from './_lib/invitationDelivery.js'

type JsonResponse = ServerResponse<IncomingMessage> & { json?: (value: unknown) => void }
type ActionBody = {
  action?: 'grant' | 'revoke' | 'grant_client' | 'revoke_client' | 'resend_client'
    | 'grant_portal_admin' | 'revoke_portal_admin' | 'resend_portal_admin'
  email?: string
  role?: 'viewer'
}
type InvitationStatus = 'new_invitation_sent' | 'pending_reinvited' | 'confirmed_access_restored' | 'invite_resent'
type OperationFeedback = { notice?: string; warning?: string; invitationStatus?: InvitationStatus }
const protectedManagerId = '9ff44f07-b720-4e51-a5a2-a36fdd1c331a'
const hgiBillingAccountId = '7791a715-da6b-40bb-8795-4148cecff204'

function inviteRedirectUrl(): string {
  const configured = process.env.PORTAL_INVITE_REDIRECT_URL?.trim()
  if (configured) return configured
  const portalUrl = process.env.PORTAL_URL?.trim() || 'https://home-guard-dealer-portal.vercel.app'
  return new URL('/auth/invite', portalUrl).toString()
}

function invitationFailure(response: JsonResponse, error: unknown): void {
  const failure = classifyInvitationFailure(error)
  console.error('Billing invitation delivery failed.', { code: failure.code, status: failure.status })
  sendJson(response, failure.status, { error: failure.message, code: failure.code })
}

type InviteAdminClient = {
  auth: { admin: { inviteUserByEmail(email: string, options: { redirectTo: string }): Promise<{ data: { user: User | null }; error: unknown }> } }
}

async function sendFreshInvitation(admin: InviteAdminClient, email: string, expectedUserId?: string) {
  const result = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: inviteRedirectUrl() })
  if (result.error || !result.data.user) return { user: null, failure: classifyInvitationFailure(result.error) }
  if (expectedUserId && result.data.user.id !== expectedUserId) {
    return { user: null, failure: classifyInvitationFailure(new Error('Auth user identity mismatch.')) }
  }
  return { user: result.data.user, failure: null }
}

function invitationWarning(failure: InvitationFailure): string {
  if (failure.code === 'invitation_rate_limited') return 'Billing access was granted, but invitation email delivery is temporarily rate limited. Use Resend Invite shortly.'
  if (failure.code === 'invitation_provider_failure') return 'Billing access was granted, but the email provider did not accept the invitation. Use Resend Invite or contact support.'
  return 'Billing access was granted, but the authentication service did not create a new invitation. Use Resend Invite or contact support.'
}

function sendJson(response: JsonResponse, status: number, value: unknown): void {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'private, no-store, max-age=0')
  if (response.json) response.json(value)
  else response.end(JSON.stringify(value))
}

async function readBody(request: IncomingMessage): Promise<ActionBody> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  if (!chunks.length) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as ActionBody
}

function safeUser(user: User, adminCreatedAt: string, isAccessManager: boolean) {
  const metadata = user.user_metadata as Record<string, unknown> | undefined
  const name = typeof metadata?.full_name === 'string' ? metadata.full_name : typeof metadata?.name === 'string' ? metadata.name : null
  return {
    email: user.email ?? '',
    name,
    status: user.email_confirmed_at ? 'active' : 'pending',
    accessGrantedAt: adminCreatedAt,
    invitedAt: user.invited_at ?? null,
    isAccessManager,
  }
}

function safeBillingClient(user: User, membership: { created_at: string; role: string }) {
  return {
    email: user.email ?? '',
    status: user.email_confirmed_at ? 'active' : 'pending',
    role: membership.role,
    accessGrantedAt: membership.created_at,
    invitedAt: user.invited_at ?? null,
  }
}

function safePortalAdmin(
  user: User,
  membership: { created_at: string },
  isInternalBillingAdmin: boolean,
  isAccessManager: boolean,
) {
  const metadata = user.user_metadata as Record<string, unknown> | undefined
  const name = typeof metadata?.full_name === 'string' ? metadata.full_name : typeof metadata?.name === 'string' ? metadata.name : null
  return {
    email: user.email ?? '',
    name,
    status: user.email_confirmed_at ? 'active' : 'pending',
    accessGrantedAt: membership.created_at,
    invitedAt: user.invited_at ?? null,
    isInternalBillingAdmin,
    isAccessManager,
  }
}

type AuthUserLister = {
  auth: { admin: { listUsers(options: { page: number; perPage: number }): Promise<{ data: { users: User[] }; error: Error | null }> } }
}

async function allAuthUsers(admin: AuthUserLister): Promise<User[]> {
  const users: User[] = []
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    users.push(...data.users)
    if (data.users.length < 1000) return users
  }
}

export default async function handler(request: IncomingMessage, response: JsonResponse): Promise<void> {
  if (request.method !== 'GET' && request.method !== 'POST') {
    response.setHeader('Allow', 'GET, POST')
    sendJson(response, 405, { error: 'Method not allowed.' })
    return
  }
  const authorization = Array.isArray(request.headers.authorization) ? request.headers.authorization[0] : request.headers.authorization
  const access = await authorizeBillingAccessManager(authorization)
  if (!access.authorized) {
    const code = access.status === 401
      ? 'authentication_required'
      : access.status === 403
        ? 'permission_denied'
        : 'authorization_unavailable'
    sendJson(response, access.status, { error: access.message, code })
    return
  }
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    sendJson(response, 500, {
      error: 'Billing access management is not configured.',
      code: 'configuration_missing',
    })
    return
  }
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  try {
    let feedback: OperationFeedback = {}
    if (request.method === 'POST') {
      const body = await readBody(request)
      const email = body.email?.trim().toLowerCase() ?? ''
      if (!/^\S+@\S+\.\S+$/.test(email)) {
        sendJson(response, 400, { error: 'Enter a valid email address.' })
        return
      }
      const users = await allAuthUsers(admin)
      let target = users.find((user) => user.email?.toLowerCase() === email)
      let invited = false
      if ((body.action === 'grant' || body.action === 'grant_client' || body.action === 'grant_portal_admin') && !target) {
        const invitation = await sendFreshInvitation(admin, email)
        if (invitation.failure || !invitation.user) {
          invitationFailure(response, invitation.failure)
          return
        }
        target = invitation.user
        invited = true
      }
      if (!target) {
        sendJson(response, 404, { error: 'No Supabase Auth user exists for that email.' })
        return
      }
      if (body.action === 'grant_portal_admin') {
        const { error } = await admin.rpc('manage_portal_administrator_access', {
          p_actor_user_id: access.userId,
          p_target_user_id: target.id,
          p_target_email: email,
          p_operation: 'grant',
          p_invited: invited,
        })
        if (error) {
          if (error.message.includes('incompatible_portal_role')) {
            sendJson(response, 409, { error: 'This user has an incompatible dealer or billing-client membership.' })
            return
          }
          throw error
        }
        if (invited) {
          feedback = { notice: 'Portal administrator access was granted and an invitation was sent.', invitationStatus: 'new_invitation_sent' }
        } else if (target.email_confirmed_at) {
          feedback = {
            notice: 'Portal administrator access was granted. This user can sign in with their existing Portal account.',
            invitationStatus: 'confirmed_access_restored',
          }
        } else {
          const invitation = await sendFreshInvitation(admin, email, target.id)
          if (invitation.failure) {
            console.error('Pending Portal administrator re-invitation failed.', { code: invitation.failure.code, status: invitation.failure.status })
            feedback = { warning: invitationWarning(invitation.failure) }
          } else {
            const { error: auditError } = await admin.from('billing_access_audit_log').insert({
              actor_user_id: access.userId, target_user_id: target.id, target_email: email, action: 'portal_admin_invite_resent',
            })
            if (auditError) throw auditError
            feedback = { notice: 'Portal administrator access was granted and a new invitation was sent.', invitationStatus: 'pending_reinvited' }
          }
        }
      } else if (body.action === 'revoke_portal_admin') {
        const { error } = await admin.rpc('manage_portal_administrator_access', {
          p_actor_user_id: access.userId,
          p_target_user_id: target.id,
          p_target_email: email,
          p_operation: 'revoke',
          p_invited: false,
        })
        if (error) {
          if (error.message.includes('self_revocation_forbidden')) {
            sendJson(response, 409, { error: 'You cannot remove your own Portal administrator access.' })
            return
          }
          if (error.message.includes('last_usable_administrator')) {
            sendJson(response, 409, { error: 'At least one other confirmed administrator must sign in before this access can be removed.' })
            return
          }
          throw error
        }
      } else if (body.action === 'resend_portal_admin') {
        const [homeGuard, internalAdmin, manager] = await Promise.all([
          admin.from('home_guard_admins').select('id').eq('user_id', target.id).maybeSingle(),
          admin.from('billing_internal_admins').select('id').eq('user_id', target.id).maybeSingle(),
          admin.from('billing_access_managers').select('user_id').eq('user_id', target.id).maybeSingle(),
        ])
        if (homeGuard.error || internalAdmin.error || manager.error) throw homeGuard.error ?? internalAdmin.error ?? manager.error
        if (!homeGuard.data || !internalAdmin.data || !manager.data || target.email_confirmed_at) {
          sendJson(response, 409, { error: 'Only pending Portal administrator invitations can be resent.' })
          return
        }
        const invitation = await sendFreshInvitation(admin, email, target.id)
        if (invitation.failure) {
          invitationFailure(response, invitation.failure)
          return
        }
        const { error: auditError } = await admin.from('billing_access_audit_log').insert({
          actor_user_id: access.userId, target_user_id: target.id, target_email: email, action: 'portal_admin_invite_resent',
        })
        if (auditError) throw auditError
        feedback = { notice: 'A new Portal administrator invitation was sent.', invitationStatus: 'invite_resent' }
      } else if (body.action === 'grant') {
        const { error } = await admin.from('billing_internal_admins').upsert({ user_id: target.id }, { onConflict: 'user_id', ignoreDuplicates: true })
        if (error) throw error
        const auditEvents = invited ? ['invited', 'granted'] : ['granted']
        const { error: auditError } = await admin.from('billing_access_audit_log').insert(auditEvents.map((action) => ({
          actor_user_id: access.userId, target_user_id: target.id, target_email: email, action,
        })))
        if (auditError) throw auditError
      } else if (body.action === 'revoke') {
        const { data: manager } = await admin.from('billing_access_managers').select('user_id').eq('user_id', target.id).maybeSingle()
        if (target.id === protectedManagerId || target.id === access.userId || manager) {
          sendJson(response, 409, { error: 'Access-manager billing access is protected to prevent administrative lockout.' })
          return
        }
        const { error } = await admin.from('billing_internal_admins').delete().eq('user_id', target.id)
        if (error) throw error
        const { error: auditError } = await admin.from('billing_access_audit_log').insert({
          actor_user_id: access.userId, target_user_id: target.id, target_email: email, action: 'revoked',
        })
        if (auditError) throw auditError
      } else if (body.action === 'grant_client') {
        if (body.role !== 'viewer') {
          sendJson(response, 400, { error: 'Only the viewer billing role is currently supported.' })
          return
        }
        const [homeGuard, dealer, internalAdmin, manager, memberships] = await Promise.all([
          admin.from('home_guard_admins').select('id').eq('user_id', target.id).maybeSingle(),
          admin.from('dealer_users').select('id').eq('user_id', target.id).limit(1).maybeSingle(),
          admin.from('billing_internal_admins').select('id').eq('user_id', target.id).maybeSingle(),
          admin.from('billing_access_managers').select('user_id').eq('user_id', target.id).maybeSingle(),
          admin.from('billing_account_users').select('billing_account_id').eq('user_id', target.id),
        ])
        if (homeGuard.error || dealer.error || internalAdmin.error || manager.error || memberships.error) {
          throw homeGuard.error ?? dealer.error ?? internalAdmin.error ?? manager.error ?? memberships.error
        }
        const hasOtherBillingAccount = (memberships.data ?? []).some((entry) => entry.billing_account_id !== hgiBillingAccountId)
        if (homeGuard.data || dealer.data || internalAdmin.data || manager.data || hasOtherBillingAccount) {
          sendJson(response, 409, { error: 'This user has an incompatible Portal role or billing-account membership.' })
          return
        }
        const alreadyAssigned = (memberships.data ?? []).some((entry) => entry.billing_account_id === hgiBillingAccountId)
        if (!alreadyAssigned) {
          const { error } = await admin.from('billing_account_users').insert({
            billing_account_id: hgiBillingAccountId, user_id: target.id, role: 'viewer',
          })
          if (error) throw error
          const auditEvents = invited ? ['client_invited', 'client_granted'] : ['client_granted']
          const { error: auditError } = await admin.from('billing_access_audit_log').insert(auditEvents.map((action) => ({
            actor_user_id: access.userId, target_user_id: target.id, target_email: email, action,
          })))
          if (auditError) throw auditError
        }
        if (invited) {
          feedback = { notice: 'Billing access granted and an invitation was sent.', invitationStatus: 'new_invitation_sent' }
        } else if (target.email_confirmed_at) {
          feedback = {
            notice: 'Billing access restored. This user can sign in with their existing Portal account.',
            invitationStatus: 'confirmed_access_restored',
          }
        } else {
          const invitation = await sendFreshInvitation(admin, email, target.id)
          if (invitation.failure) {
            console.error('Pending billing user re-invitation failed.', { code: invitation.failure.code, status: invitation.failure.status })
            feedback = { warning: invitationWarning(invitation.failure) }
          } else {
            const { error: auditError } = await admin.from('billing_access_audit_log').insert({
              actor_user_id: access.userId, target_user_id: target.id, target_email: email, action: 'client_invited',
            })
            if (auditError) throw auditError
            feedback = { notice: 'Billing access granted and a new invitation was sent.', invitationStatus: 'pending_reinvited' }
          }
        }
      } else if (body.action === 'revoke_client') {
        const { error } = await admin.from('billing_account_users').delete()
          .eq('billing_account_id', hgiBillingAccountId).eq('user_id', target.id)
        if (error) throw error
        const { error: auditError } = await admin.from('billing_access_audit_log').insert({
          actor_user_id: access.userId, target_user_id: target.id, target_email: email, action: 'client_revoked',
        })
        if (auditError) throw auditError
      } else if (body.action === 'resend_client') {
        const { data: membership, error: membershipError } = await admin.from('billing_account_users').select('id')
          .eq('billing_account_id', hgiBillingAccountId).eq('user_id', target.id).maybeSingle()
        if (membershipError) throw membershipError
        if (!membership || target.email_confirmed_at) {
          sendJson(response, 409, { error: 'Only pending HGI billing invitations can be resent.' })
          return
        }
        const invitation = await sendFreshInvitation(admin, email, target.id)
        if (invitation.failure) {
          invitationFailure(response, invitation.failure)
          return
        }
        const { error: auditError } = await admin.from('billing_access_audit_log').insert({
          actor_user_id: access.userId, target_user_id: target.id, target_email: email, action: 'client_invite_resent',
        })
        if (auditError) throw auditError
        feedback = { notice: 'A new invitation was sent.', invitationStatus: 'invite_resent' }
      } else {
        sendJson(response, 400, { error: 'Unsupported access-management action.' })
        return
      }
    }

    const [{ data: principals, error: principalError }, { data: managers, error: managerError }, { data: portalMemberships, error: portalError }, { data: clientMemberships, error: clientError }, users] = await Promise.all([
      admin.from('billing_internal_admins').select('user_id,created_at').order('created_at'),
      admin.from('billing_access_managers').select('user_id'),
      admin.from('home_guard_admins').select('user_id,created_at').order('created_at'),
      admin.from('billing_account_users').select('user_id,role,created_at').eq('billing_account_id', hgiBillingAccountId).order('created_at'),
      allAuthUsers(admin),
    ])
    if (principalError || managerError || portalError || clientError) throw principalError ?? managerError ?? portalError ?? clientError
    const managerIds = new Set((managers ?? []).map((entry) => entry.user_id))
    const internalAdminIds = new Set((principals ?? []).map((entry) => entry.user_id))
    const usersById = new Map(users.map((user) => [user.id, user]))
    const safeUsers = (principals ?? []).flatMap((principal) => {
      const user = usersById.get(principal.user_id)
      return user ? [safeUser(user, principal.created_at, managerIds.has(principal.user_id))] : []
    })
    const clientUsers = (clientMemberships ?? []).flatMap((membership) => {
      const user = usersById.get(membership.user_id)
      return user ? [safeBillingClient(user, membership)] : []
    })
    const portalAdmins = (portalMemberships ?? []).flatMap((membership) => {
      const user = usersById.get(membership.user_id)
      return user ? [safePortalAdmin(user, membership, internalAdminIds.has(membership.user_id), managerIds.has(membership.user_id))] : []
    })
    sendJson(response, 200, { users: safeUsers, clientUsers, portalAdmins, ...feedback })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Billing access operation failed.'
    console.error('Billing access management operation failed.', { message })
    sendJson(response, 500, {
      error: 'Unable to complete the billing access operation.',
      code: 'server_failure',
    })
  }
}
