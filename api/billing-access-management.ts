import type { IncomingMessage, ServerResponse } from 'node:http'
import { createClient, type User } from '@supabase/supabase-js'
import { authorizeBillingAccessManager } from './_lib/authorizeBillingAccessManager.js'

type JsonResponse = ServerResponse<IncomingMessage> & { json?: (value: unknown) => void }
type ActionBody = {
  action?: 'grant' | 'revoke' | 'grant_client' | 'revoke_client' | 'resend_client'
  email?: string
  role?: 'viewer'
}
const protectedManagerId = '9ff44f07-b720-4e51-a5a2-a36fdd1c331a'
const hgiBillingAccountId = '7791a715-da6b-40bb-8795-4148cecff204'

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
      if ((body.action === 'grant' || body.action === 'grant_client') && !target) {
        const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
          redirectTo: process.env.PORTAL_URL ?? 'https://home-guard-dealer-portal.vercel.app/',
        })
        if (error || !data.user) throw error ?? new Error('Invitation could not be created.')
        target = data.user
        invited = true
      }
      if (!target) {
        sendJson(response, 404, { error: 'No Supabase Auth user exists for that email.' })
        return
      }
      if (body.action === 'grant') {
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
        const { error } = await admin.auth.resend({
          type: 'signup', email, options: { emailRedirectTo: process.env.PORTAL_URL ?? 'https://home-guard-dealer-portal.vercel.app/' },
        })
        if (error) throw error
        const { error: auditError } = await admin.from('billing_access_audit_log').insert({
          actor_user_id: access.userId, target_user_id: target.id, target_email: email, action: 'client_invite_resent',
        })
        if (auditError) throw auditError
      } else {
        sendJson(response, 400, { error: 'Unsupported access-management action.' })
        return
      }
    }

    const [{ data: principals, error: principalError }, { data: managers, error: managerError }, { data: clientMemberships, error: clientError }, users] = await Promise.all([
      admin.from('billing_internal_admins').select('user_id,created_at').order('created_at'),
      admin.from('billing_access_managers').select('user_id'),
      admin.from('billing_account_users').select('user_id,role,created_at').eq('billing_account_id', hgiBillingAccountId).order('created_at'),
      allAuthUsers(admin),
    ])
    if (principalError || managerError || clientError) throw principalError ?? managerError ?? clientError
    const managerIds = new Set((managers ?? []).map((entry) => entry.user_id))
    const usersById = new Map(users.map((user) => [user.id, user]))
    const safeUsers = (principals ?? []).flatMap((principal) => {
      const user = usersById.get(principal.user_id)
      return user ? [safeUser(user, principal.created_at, managerIds.has(principal.user_id))] : []
    })
    const clientUsers = (clientMemberships ?? []).flatMap((membership) => {
      const user = usersById.get(membership.user_id)
      return user ? [safeBillingClient(user, membership)] : []
    })
    sendJson(response, 200, { users: safeUsers, clientUsers })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Billing access operation failed.'
    console.error('Billing access management operation failed.', { message })
    sendJson(response, 500, {
      error: 'Unable to complete the billing access operation.',
      code: 'server_failure',
    })
  }
}
