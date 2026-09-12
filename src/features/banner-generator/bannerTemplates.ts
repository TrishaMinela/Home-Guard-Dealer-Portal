export type BannerSize = {
  id: string
  width: number
  height: number
  label: string
}

export type BannerTemplate = {
  id: string
  name: string
  description: string
  headline: string
  subhead: string
  theme: 'light' | 'dark' | 'split'
}

export const bannerSizes: BannerSize[] = [
  { id: '1200x300', width: 1200, height: 300, label: 'Horizontal Website Banner' },
  { id: '728x90', width: 728, height: 90, label: 'Leaderboard Banner' },
  { id: '600x300', width: 600, height: 300, label: 'Medium Horizontal Banner' },
  { id: '1080x1080', width: 1080, height: 1080, label: 'Square / Social Graphic' },
  { id: '300x250', width: 300, height: 250, label: 'Website Rectangle' },
]

export const bannerTemplates: BannerTemplate[] = [
  {
    id: 'signature-light',
    name: 'Signature Light',
    description: 'A clean white layout with dealer-color accents.',
    headline: 'Design Your New Front Door',
    subhead: 'Visualize It On Your Home',
    theme: 'light',
  },
  {
    id: 'bold-brand',
    name: 'Bold Brand',
    description: 'A rich dealer-color background with high-contrast branding.',
    headline: 'See Your New Door Before You Buy It',
    subhead: 'Design it. Visualize it. Love it.',
    theme: 'dark',
  },
  {
    id: 'doorway-split',
    name: 'Doorway Split',
    description: 'A modern split layout using both dealer brand colors.',
    headline: 'Design Your Door',
    subhead: 'See it on your home before you buy.',
    theme: 'split',
  },
]
