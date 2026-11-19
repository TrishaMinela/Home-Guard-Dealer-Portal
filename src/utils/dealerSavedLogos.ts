type QueryResult<T> = { data: T | null; error: unknown }

type SavedLogoFields = {
  logo_generated_light_usable?: boolean | null
  logo_black_url?: string | null
  logo_generated_black_url?: string | null
  logo_generated_black_usable?: boolean | null
  logo_display?: 'single' | 'dual' | null
  logo_secondary_url?: string | null
  logo_secondary_source_url?: string | null
  logo_secondary_light_url?: string | null
  logo_secondary_generated_light_url?: string | null
  logo_secondary_generated_light_usable?: boolean | null
  logo_secondary_black_url?: string | null
  logo_secondary_generated_black_url?: string | null
  logo_secondary_generated_black_usable?: boolean | null
}

type SecondaryLogoRow = {
  logo_display?: 'single' | 'dual' | null
  logo_secondary_url?: string | null
  logo_secondary_source_url?: string | null
  logo_secondary_light_url?: string | null
  logo_secondary_generated_light_url?: string | null
  logo_secondary_generated_light_usable?: boolean | null
  logo_secondary_black_url?: string | null
  logo_secondary_generated_black_url?: string | null
  logo_secondary_generated_black_usable?: boolean | null
}

export function dealerWithSavedLogos<T extends object>(
  dealer: T,
  light: QueryResult<{ logo_generated_light_usable?: boolean | null }>,
  black: QueryResult<{
    logo_black_url?: string | null
    logo_generated_black_url?: string | null
    logo_generated_black_usable?: boolean | null
  }>,
  secondary?: QueryResult<SecondaryLogoRow>,
): T & SavedLogoFields {
  return {
    ...dealer,
    ...(light.error ? {} : { logo_generated_light_usable: light.data?.logo_generated_light_usable ?? null }),
    ...(black.error ? {} : {
      logo_black_url: black.data?.logo_black_url ?? null,
      logo_generated_black_url: black.data?.logo_generated_black_url ?? null,
      logo_generated_black_usable: black.data?.logo_generated_black_usable ?? null,
    }),
    ...(secondary && !secondary.error ? {
      logo_display: secondary.data?.logo_display === 'dual' ? 'dual' : 'single',
      logo_secondary_url: secondary.data?.logo_secondary_url ?? null,
      logo_secondary_source_url: secondary.data?.logo_secondary_source_url ?? null,
      logo_secondary_light_url: secondary.data?.logo_secondary_light_url ?? null,
      logo_secondary_generated_light_url: secondary.data?.logo_secondary_generated_light_url ?? null,
      logo_secondary_generated_light_usable: secondary.data?.logo_secondary_generated_light_usable ?? null,
      logo_secondary_black_url: secondary.data?.logo_secondary_black_url ?? null,
      logo_secondary_generated_black_url: secondary.data?.logo_secondary_generated_black_url ?? null,
      logo_secondary_generated_black_usable: secondary.data?.logo_secondary_generated_black_usable ?? null,
    } : {}),
  } as T & SavedLogoFields
}
