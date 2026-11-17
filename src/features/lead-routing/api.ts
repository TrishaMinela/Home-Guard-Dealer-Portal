import { supabase } from '../../lib/supabase'

export async function postLeadRouting(body: Record<string, unknown>) {
  const { data } = await supabase.auth.getSession()
  const response = await fetch('/api/lead-routing', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${data.session?.access_token ?? ''}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({ error: 'Lead routing could not be completed.' }))
  return { ok: response.ok, payload: payload as { error?: string; result?: string; dealerId?: string | null } }
}
