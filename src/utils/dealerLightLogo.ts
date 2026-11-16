import { supabase } from '../lib/supabase'

export async function generateDefaultDealerLightLogo(
  dealerId: string,
  tone: 'white' | 'black' = 'white',
): Promise<{ generatedLightLogoUrl: string | null; generatedLightUsable: boolean | null; generatedLogoUrl: string | null; generatedLogoUsable: boolean | null; error: string | null }> {
  const empty = { generatedLightLogoUrl: null, generatedLightUsable: null, generatedLogoUrl: null, generatedLogoUsable: null }
  try {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) return { ...empty, error: 'Authentication required.' }
    const response = await fetch('/api/dealer-light-logo', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ dealerId, tone }),
    })
    const payload = await response.json().catch(() => null) as { generatedLogoUrl?: string; generatedLogoUsable?: boolean; generatedLightLogoUrl?: string; generatedLightUsable?: boolean; error?: string } | null
    const url = payload?.generatedLogoUrl ?? payload?.generatedLightLogoUrl ?? null
    if (!response.ok || !url) return { ...empty, error: payload?.error ?? 'Logo generation failed.' }
    const usable = (payload?.generatedLogoUsable ?? payload?.generatedLightUsable) === true
    return {
      generatedLogoUrl: url,
      generatedLogoUsable: usable,
      generatedLightLogoUrl: tone === 'white' ? url : null,
      generatedLightUsable: tone === 'white' ? usable : null,
      error: null,
    }
  } catch {
    return { ...empty, error: 'We could not reach the logo service. Please try again.' }
  }
}
