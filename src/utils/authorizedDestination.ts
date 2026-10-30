import { supabase } from '../lib/supabase'

export async function authorizedDestination(userId: string): Promise<string | null> {
  const { data: admin, error: adminError } = await supabase.from('home_guard_admins').select('id').eq('user_id', userId).maybeSingle()
  if (adminError) throw new Error('Unable to verify Portal access.')
  if (admin) return '/admin'

  const { data: billingAccounts, error: billingError } = await supabase.rpc('list_billing_client_accounts')
  if (billingError) throw new Error('Unable to verify Portal access.')
  if (billingAccounts?.length) return '/billing'

  const { data: dealer, error: dealerError } = await supabase.from('dealer_users').select('dealer_id').eq('user_id', userId).limit(1).maybeSingle()
  if (dealerError) throw new Error('Unable to verify Portal access.')
  return dealer ? '/dashboard' : null
}
