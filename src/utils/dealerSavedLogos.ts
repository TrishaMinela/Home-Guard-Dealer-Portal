type QueryResult<T> = { data: T | null; error: unknown }

type SavedLogoFields = {
  logo_generated_light_usable?: boolean | null
  logo_black_url?: string | null
  logo_generated_black_url?: string | null
  logo_generated_black_usable?: boolean | null
}

export function dealerWithSavedLogos<T extends object>(
  dealer: T,
  light: QueryResult<{ logo_generated_light_usable?: boolean | null }>,
  black: QueryResult<{
    logo_black_url?: string | null
    logo_generated_black_url?: string | null
    logo_generated_black_usable?: boolean | null
  }>,
): T & SavedLogoFields {
  return {
    ...dealer,
    ...(light.error ? {} : { logo_generated_light_usable: light.data?.logo_generated_light_usable ?? null }),
    ...(black.error ? {} : {
      logo_black_url: black.data?.logo_black_url ?? null,
      logo_generated_black_url: black.data?.logo_generated_black_url ?? null,
      logo_generated_black_usable: black.data?.logo_generated_black_usable ?? null,
    }),
  } as T & SavedLogoFields
}
