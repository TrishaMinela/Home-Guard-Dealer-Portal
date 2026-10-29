import type { IncomingMessage, ServerResponse } from 'node:http'
import { createClient, type User } from '@supabase/supabase-js'
import { authorizeBillingAccessManager } from './_lib/authorizeBillingAccessManager.js'

type JsonResponse = ServerResponse<IncomingMessage> & { json?: (value: unknown) => void }
type ActionBody = { action?: 'grant' | 'revoke'; email?: string }
const protectedManagerId = '9ff44f07-b720-4e51-a5a2-a36fdd1c331a'

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
    sendJson(response, access.status, { error: access.message })
    return
  }
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    sendJson(response, 500, { error: 'Billing access management is not configured.' })
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
      if (body.action === 'grant' && !target) {
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
      } else {
        sendJson(response, 400, { error: 'Unsupported access-management action.' })
        return
      }
    }

    const [{ data: principals, error: principalError }, { data: managers, error: managerError }, users] = await Promise.all([
      admin.from('billing_internal_admins').select('user_id,created_at').order('created_at'),
      admin.from('billing_access_managers').select('user_id'),
      allAuthUsers(admin),
    ])
    if (principalError || managerError) throw principalError ?? managerError
    const managerIds = new Set((managers ?? []).map((entry) => entry.user_id))
    const usersById = new Map(users.map((user) => [user.id, user]))
    const safeUsers = (principals ?? []).flatMap((principal) => {
      const user = usersById.get(principal.user_id)
      return user ? [safeUser(user, principal.created_at, managerIds.has(principal.user_id))] : []
    })
    sendJson(response, 200, { users: safeUsers })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Billing access operation failed.'
    console.error('Billing access management operation failed.', { message })
    sendJson(response, 500, { error: 'Unable to complete the billing access operation.' })
  }
}
