import { supabase } from '../lib/supabase'

export async function generateDefaultDealerLightLogo(
  dealerId: string,
): Promise<{ generatedLightLogoUrl: string | null; generatedLightUsable: boolean | null; error: string | null }> {
  try {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) return { generatedLightLogoUrl: null, generatedLightUsable: null, error: 'Authentication required.' }
    const response = await fetch('/api/dealer-light-logo', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ dealerId }),
    })
    const payload = await response.json().catch(() => null) as { generatedLightLogoUrl?: string; generatedLightUsable?: boolean; error?: string } | null
    if (!response.ok || !payload?.generatedLightLogoUrl) {
      return { generatedLightLogoUrl: null, generatedLightUsable: null, error: payload?.error ?? 'Light-logo generation failed.' }
    }
    return {
      generatedLightLogoUrl: payload.generatedLightLogoUrl,
      generatedLightUsable: payload.generatedLightUsable === true,
      error: null,
    }
  } catch {
    return { generatedLightLogoUrl: null, generatedLightUsable: null, error: 'We could not reach the light-logo service. Please try again.' }
  }
}
