export type DealerTypographyValues = {
  headingFontFamily:string; headingFontWeight:string; headingFontSize:string; bodyFontFamily:string; bodyFontWeight:string; bodyFontSize:string
  customHeadingFontUrl:string; customHeadingFontName:string; customHeadingFontWeight:string; customBodyFontUrl:string; customBodyFontName:string; customBodyFontWeight:string
}
type DealerTypographyRecord = {
  heading_font_family?:string|null; heading_font_weight?:number|null; heading_font_size?:number|null; body_font_family?:string|null; body_font_weight?:number|null; body_font_size?:number|null
  custom_heading_font_url?:string|null; custom_heading_font_name?:string|null; custom_heading_font_weight?:number|null; custom_body_font_url?:string|null; custom_body_font_name?:string|null; custom_body_font_weight?:number|null
}

export const dealerFontOptions = [
  ['system','System Default'],['arial','Arial'],['helvetica','Helvetica'],['verdana','Verdana'],['tahoma','Tahoma'],
  ['trebuchet','Trebuchet MS'],['georgia','Georgia'],['times','Times New Roman'],['courier','Courier New'],
  ['montserrat','Montserrat (bundled)'],['caladea','Caladea (bundled)'],['custom','Custom uploaded font'],
] as const

export const dealerFontWeights = [300,400,500,600,700,800] as const

export const fontStacks: Record<string,string> = {
  system: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', arial: 'Arial,sans-serif', helvetica: 'Helvetica,Arial,sans-serif',
  verdana: 'Verdana,Geneva,sans-serif', tahoma: 'Tahoma,Verdana,sans-serif', trebuchet: '"Trebuchet MS",Arial,sans-serif',
  georgia: 'Georgia,"Times New Roman",serif', times: '"Times New Roman",Times,serif', courier: '"Courier New",Courier,monospace',
  montserrat: 'Montserrat,Arial,sans-serif', caladea: 'Caladea,Georgia,serif',
}

export function dealerTypographyValues(dealer: DealerTypographyRecord): DealerTypographyValues {
  const text = (value: string | number | null | undefined) => value == null ? '' : String(value)
  return {
    headingFontFamily:text(dealer.heading_font_family), headingFontWeight:text(dealer.heading_font_weight), headingFontSize:text(dealer.heading_font_size),
    bodyFontFamily:text(dealer.body_font_family), bodyFontWeight:text(dealer.body_font_weight), bodyFontSize:text(dealer.body_font_size),
    customHeadingFontUrl:text(dealer.custom_heading_font_url), customHeadingFontName:text(dealer.custom_heading_font_name), customHeadingFontWeight:text(dealer.custom_heading_font_weight),
    customBodyFontUrl:text(dealer.custom_body_font_url), customBodyFontName:text(dealer.custom_body_font_name), customBodyFontWeight:text(dealer.custom_body_font_weight),
  }
}

export function typographyPayload(values: DealerTypographyValues) {
  const number = (value: string) => value ? Number(value) : null
  const text = (value: string) => value.trim() || null
  return {
    heading_font_family:text(values.headingFontFamily), heading_font_weight:number(values.headingFontWeight), heading_font_size:number(values.headingFontSize),
    body_font_family:text(values.bodyFontFamily), body_font_weight:number(values.bodyFontWeight), body_font_size:number(values.bodyFontSize),
    custom_heading_font_url:text(values.customHeadingFontUrl), custom_heading_font_name:text(values.customHeadingFontName), custom_heading_font_weight:number(values.customHeadingFontWeight),
    custom_body_font_url:text(values.customBodyFontUrl), custom_body_font_name:text(values.customBodyFontName), custom_body_font_weight:number(values.customBodyFontWeight),
  }
}
