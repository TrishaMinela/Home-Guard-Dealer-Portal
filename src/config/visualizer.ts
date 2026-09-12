export const VISUALIZER_BASE_URL = 'https://homeguardvisualizer.com'
export const VISUALIZER_DISPLAY_DOMAIN = 'homeguardvisualizer.com'

export function getDealerVisualizerUrl(slug: string) {
  return `${VISUALIZER_BASE_URL}/${slug}`
}

export function getDealerVisualizerDisplayUrl(slug: string) {
  return `${VISUALIZER_DISPLAY_DOMAIN}/${slug}`
}
