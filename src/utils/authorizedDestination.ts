import { supabase } from '../lib/supabase'

export async function authorizedDestination(userId: string): Promise<string | null> {
  const { data: admin } = await supabase.from('home_guard_admins').select('id').eq('user_id', userId).maybeSingle()
  if (admin) return '/admin'

  const { data: billingAccounts } = await supabase.rpc('list_billing_client_accounts')
  if (billingAccounts?.length) return '/billing'

  const { data: dealer } = await supabase.from('dealer_users').select('dealer_id').eq('user_id', userId).limit(1).maybeSingle()
  return dealer ? '/dashboard' : null
}
