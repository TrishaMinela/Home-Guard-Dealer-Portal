import type { IncomingMessage, ServerResponse } from 'node:http'
import { createClient, type User } from '@supabase/supabase-js'
import { authorizeBillingAccessOperator } from './_lib/authorizeBillingAccessManager.js'
import { classifyInvitationFailure } from './_lib/invitationDelivery.js'

type JsonResponse = ServerResponse<IncomingMessage> & { json?: (value: unknown) => void }
type Body = { action?: 'grant' | 'revoke' | 'resend'; dealerId?: string; email?: string }
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function send(response: JsonResponse, status: number, value: unknown) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'private, no-store, max-age=0')
  if (response.json) response.json(value); else response.end(JSON.stringify(value))
}

async function readBody(request: IncomingMessage): Promise<Body> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) as Body : {}
}

function inviteRedirectUrl() {
  const configured = process.env.PORTAL_INVITE_REDIRECT_URL?.trim()
  if (configured) return configured
  return new URL('/auth/invite', process.env.PORTAL_URL?.trim() || 'https://home-guard-dealer-portal.vercel.app').toString()
}

type AuthAdminClient = {
  auth: { admin: {
    listUsers(options: { page: number; perPage: number }): Promise<{ data: { users: User[] }; error: Error | null }>
    inviteUserByEmail(email: string, options: { redirectTo: string }): Promise<{ data: { user: User | null }; error: unknown }>
  } }
}

async function allUsers(admin: AuthAdminClient): Promise<User[]> {
  const users: User[] = []
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    users.push(...data.users)
    if (data.users.length < 1000) return users
  }
}

async function sendInvitation(admin: AuthAdminClient, email: string, expectedId?: string) {
  const result = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: inviteRedirectUrl() })
  if (result.error || !result.data.user) return { user: null, failure: classifyInvitationFailure(result.error) }
  if (expectedId && result.data.user.id !== expectedId) return { user: null, failure: classifyInvitationFailure(new Error('Auth identity mismatch.')) }
  return { user: result.data.user, failure: null }
}

function safeUser(user: User, membership: { created_at: string; role: string }) {
  return {
    email: user.email ?? '',
    status: user.email_confirmed_at ? 'active' : 'pending',
    role: membership.role,
    accessGrantedAt: membership.created_at,
    invitedAt: user.invited_at ?? null,
  }
}

export default async function handler(request: IncomingMessage, response: JsonResponse) {
  if (request.method !== 'GET' && request.method !== 'POST') return send(response, 405, { error: 'Method not allowed.' })
  const authorization = Array.isArray(request.headers.authorization) ? request.headers.authorization[0] : request.headers.authorization
  const access = await authorizeBillingAccessOperator(authorization)
  if (!access.authorized) return send(response, access.status, { error: access.message })
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return send(response, 500, { error: 'Dealer access management is not configured.' })
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

  try {
    const parsedUrl = new URL(request.url ?? '/', 'https://portal.local')
    const body = request.method === 'POST' ? await readBody(request) : {}
    const dealerId = body.dealerId ?? parsedUrl.searchParams.get('dealerId') ?? ''
    if (!uuidPattern.test(dealerId)) return send(response, 400, { error: 'A valid dealer is required.' })
    const { data: dealer, error: dealerError } = await admin.from('dealers').select('id,company_name').eq('id', dealerId).maybeSingle()
    if (dealerError) throw dealerError
    if (!dealer) return send(response, 404, { error: 'Dealer not found.' })

    let notice: string | undefined
    let warning: string | undefined
    if (request.method === 'POST') {
      const email = body.email?.trim().toLowerCase() ?? ''
      if (!/^\S+@\S+\.\S+$/.test(email)) return send(response, 400, { error: 'Enter a valid email address.' })
      const users = await allUsers(admin)
      let target = users.find((user) => user.email?.toLowerCase() === email)
      let invited = false
      if (body.action === 'grant' && !target) {
        const invitation = await sendInvitation(admin, email)
        if (invitation.failure || !invitation.user) return send(response, invitation.failure.status, { error: invitation.failure.message })
        target = invitation.user
        invited = true
      }
      if (!target) return send(response, 404, { error: 'No Supabase Auth user exists for that email.' })

      if (body.action === 'grant') {
        const [homeGuard, internalAdmin, manager, billingClient, dealerMemberships] = await Promise.all([
          admin.from('home_guard_admins').select('id').eq('user_id', target.id).maybeSingle(),
          admin.from('billing_internal_admins').select('id').eq('user_id', target.id).maybeSingle(),
          admin.from('billing_access_managers').select('user_id').eq('user_id', target.id).maybeSingle(),
          admin.from('billing_account_users').select('id').eq('user_id', target.id).limit(1).maybeSingle(),
          admin.from('dealer_users').select('id,dealer_id').eq('user_id', target.id),
        ])
        const queryError = homeGuard.error ?? internalAdmin.error ?? manager.error ?? billingClient.error ?? dealerMemberships.error
        if (queryError) throw queryError
        const otherDealer = (dealerMemberships.data ?? []).some((membership) => membership.dealer_id !== dealerId)
        if (homeGuard.data || internalAdmin.data || manager.data || billingClient.data || otherDealer) {
          return send(response, 409, { error: 'This user has an incompatible Portal role or another dealer membership.' })
        }
        const existing = (dealerMemberships.data ?? []).find((membership) => membership.dealer_id === dealerId)
        if (!existing) {
          const { error } = await admin.from('dealer_users').insert({ user_id: target.id, dealer_id: dealerId, role: 'dealer_admin' })
          if (error) throw error
          const actions = invited ? ['invited', 'granted'] : ['granted']
          const { error: auditError } = await admin.from('dealer_user_access_audit_log').insert(actions.map((action) => ({
            dealer_id: dealerId, actor_user_id: access.userId, target_user_id: target.id, target_email: email, action,
          })))
          if (auditError) throw auditError
        }
        if (invited) notice = 'Dealer access granted and an invitation was sent.'
        else if (target.email_confirmed_at) notice = 'Dealer access granted. This user can sign in with their existing Portal account.'
        else {
          const invitation = await sendInvitation(admin, email, target.id)
          if (invitation.failure) warning = invitation.failure.message
          else {
            const { error: auditError } = await admin.from('dealer_user_access_audit_log').insert({ dealer_id: dealerId, actor_user_id: access.userId, target_user_id: target.id, target_email: email, action: 'invite_resent' })
            if (auditError) throw auditError
            notice = 'Dealer access granted and a new invitation was sent.'
          }
        }
      } else if (body.action === 'revoke') {
        const { error } = await admin.from('dealer_users').delete().eq('dealer_id', dealerId).eq('user_id', target.id)
        if (error) throw error
        const { error: auditError } = await admin.from('dealer_user_access_audit_log').insert({ dealer_id: dealerId, actor_user_id: access.userId, target_user_id: target.id, target_email: email, action: 'revoked' })
        if (auditError) throw auditError
        notice = 'Dealer access removed. The user’s sign-in and other roles were preserved.'
      } else if (body.action === 'resend') {
        const { data: membership, error } = await admin.from('dealer_users').select('id').eq('dealer_id', dealerId).eq('user_id', target.id).maybeSingle()
        if (error) throw error
        if (!membership || target.email_confirmed_at) return send(response, 409, { error: 'Only pending dealer invitations can be resent.' })
        const invitation = await sendInvitation(admin, email, target.id)
        if (invitation.failure) return send(response, invitation.failure.status, { error: invitation.failure.message })
        const { error: auditError } = await admin.from('dealer_user_access_audit_log').insert({ dealer_id: dealerId, actor_user_id: access.userId, target_user_id: target.id, target_email: email, action: 'invite_resent' })
        if (auditError) throw auditError
        notice = 'A new dealer invitation was sent.'
      } else return send(response, 400, { error: 'Unsupported dealer access action.' })
    }

    const [{ data: memberships, error: membershipError }, users] = await Promise.all([
      admin.from('dealer_users').select('user_id,role,created_at').eq('dealer_id', dealerId).order('created_at'),
      allUsers(admin),
    ])
    if (membershipError) throw membershipError
    const usersById = new Map(users.map((user) => [user.id, user]))
    const dealerUsers = (memberships ?? []).flatMap((membership) => {
      const user = usersById.get(membership.user_id)
      return user ? [safeUser(user, membership)] : []
    })
    send(response, 200, { dealer: { id: dealer.id, name: dealer.company_name }, users: dealerUsers, notice, warning })
  } catch (error) {
    console.error('Dealer access management failed.', { message: error instanceof Error ? error.message : 'unknown' })
    send(response, 500, { error: 'Unable to complete the dealer access operation.' })
  }
}
