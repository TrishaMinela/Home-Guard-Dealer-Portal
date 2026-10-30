const DEFAULT_DOOR_BUILDER_BASE_URL = 'https://www.hgidoorbuilder.com'

function normalizeBaseUrl(value: string | undefined) {
  return (value?.trim() || DEFAULT_DOOR_BUILDER_BASE_URL).replace(/\/+$/, '')
}

export const VISUALIZER_BASE_URL = normalizeBaseUrl(import.meta.env.VITE_DOOR_BUILDER_BASE_URL)
export const VISUALIZER_DISPLAY_DOMAIN = VISUALIZER_BASE_URL

export function getDealerVisualizerUrl(slug: string) {
  return `${VISUALIZER_BASE_URL}/${slug}`
}

export function getDealerVisualizerDisplayUrl(slug: string) {
  return `${VISUALIZER_DISPLAY_DOMAIN}/${slug}`
}
