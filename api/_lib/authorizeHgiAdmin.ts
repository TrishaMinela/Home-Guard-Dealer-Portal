import { createClient } from '@supabase/supabase-js'

type AuthorizationResult =
  | { authorized: true; userId: string }
  | { authorized: false; status: 401 | 403 | 500; message: string }

function bearerToken(authorization: string | undefined): string | null {
  const match = authorization?.match(/^Bearer\s+([^\s]+)$/i)
  return match?.[1] ?? null
}

export async function authorizeHgiAdmin(
  authorization: string | undefined,
): Promise<AuthorizationResult> {
  const token = bearerToken(authorization)
  if (!token) {
    return { authorized: false, status: 401, message: 'Authentication required.' }
  }

  // These are intentionally the existing browser-safe Supabase values. The
  // caller's bearer token and RLS enforce access; no service-role key is used.
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabasePublishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!supabaseUrl || !supabasePublishableKey) {
    return {
      authorized: false,
      status: 500,
      message: 'Server authentication is not configured.',
    }
  }

  const supabase = createClient(supabaseUrl, supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  if (userError || !userData.user) {
    return { authorized: false, status: 401, message: 'Authentication required.' }
  }

  const { data: admin, error: adminError } = await supabase
    .from('home_guard_admins')
    .select('id')
    .eq('user_id', userData.user.id)
    .maybeSingle()
  if (adminError) {
    return {
      authorized: false,
      status: 500,
      message: 'Unable to verify administrator access.',
    }
  }
  if (!admin) {
    return {
      authorized: false,
      status: 403,
      message: 'Home Guard administrator access required.',
    }
  }

  return { authorized: true, userId: userData.user.id }
}

export async function authorizeInternalBillingAdmin(
  authorization: string | undefined,
): Promise<AuthorizationResult> {
  const token = bearerToken(authorization)
  if (!token) return { authorized: false, status: 401, message: 'Authentication required.' }
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabasePublishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!supabaseUrl || !supabasePublishableKey) {
    return { authorized: false, status: 500, message: 'Server authentication is not configured.' }
  }
  const supabase = createClient(
    supabaseUrl,
    supabasePublishableKey,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    },
  )
  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  if (userError || !userData.user) return { authorized: false, status: 401, message: 'Authentication required.' }
  const { data, error } = await supabase
    .from('billing_internal_admins')
    .select('id')
    .eq('user_id', userData.user.id)
    .maybeSingle()

  if (error) return { authorized: false, status: 500, message: 'Unable to verify internal billing access.' }
  if (!data) return { authorized: false, status: 403, message: 'Internal billing administrator access required.' }
  return { authorized: true, userId: userData.user.id }
}
