import { createClient } from '@supabase/supabase-js'

export type BillingAccessAuthorization =
  | { authorized: true; userId: string }
  | { authorized: false; status: 401 | 403 | 500; message: string }

export type BillingAccessOperatorAuthorization =
  | { authorized: true; userId: string; isAccessManager: boolean; isInternalBillingAdmin: boolean }
  | { authorized: false; status: 401 | 403 | 500; message: string }

function bearerToken(authorization: string | undefined): string | null {
  return authorization?.match(/^Bearer\s+([^\s]+)$/i)?.[1] ?? null
}

export async function authorizeBillingAccessManager(
  authorization: string | undefined,
): Promise<BillingAccessAuthorization> {
  const access = await authorizeBillingAccessOperator(authorization)
  if (!access.authorized) return access
  if (!access.isAccessManager) return { authorized: false, status: 403, message: 'Billing access manager permission required.' }
  return { authorized: true, userId: access.userId }
}

export async function authorizeBillingAccessOperator(
  authorization: string | undefined,
): Promise<BillingAccessOperatorAuthorization> {
  const token = bearerToken(authorization)
  if (!token) return { authorized: false, status: 401, message: 'Authentication required.' }
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) return { authorized: false, status: 500, message: 'Server authentication is not configured.' }
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: userData, error: userError } = await client.auth.getUser(token)
  if (userError || !userData.user) return { authorized: false, status: 401, message: 'Authentication required.' }
  const [managerResult, internalResult] = await Promise.all([
    client.rpc('is_billing_access_manager'),
    client.rpc('is_billing_internal_admin'),
  ])
  if (managerResult.error || internalResult.error) {
    return { authorized: false, status: 500, message: 'Unable to verify billing access-management authority.' }
  }
  const isAccessManager = managerResult.data === true
  const isInternalBillingAdmin = internalResult.data === true
  if (!isAccessManager && !isInternalBillingAdmin) {
    return { authorized: false, status: 403, message: 'Internal billing administrator permission required.' }
  }
  return { authorized: true, userId: userData.user.id, isAccessManager, isInternalBillingAdmin }
}
