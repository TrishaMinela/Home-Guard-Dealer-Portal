import { useState, type ChangeEvent } from 'react'
import { supabase } from '../lib/supabase'
import type { AdminDealer } from '../types/admin'
import { dealerFontOptions, dealerFontWeights, dealerTypographyValues, fontStacks, type DealerTypographyValues } from '../utils/dealerTypography'

type Props = { dealer: AdminDealer; onSave: (values: DealerTypographyValues) => Promise<AdminDealer>; onUpdated: (dealer: AdminDealer) => void }
type FontTarget = 'heading' | 'body'
const maxFontBytes = 2 * 1024 * 1024

export function DealerTypographySettings({ dealer, onSave, onUpdated }: Props) {
  const [values,setValues] = useState(() => dealerTypographyValues(dealer))
  const [saving,setSaving] = useState(false)
  const [uploading,setUploading] = useState<FontTarget|null>(null)
  const [message,setMessage] = useState('')
  const [error,setError] = useState('')
  const set = (key:keyof DealerTypographyValues,value:string) => setValues(current => ({...current,[key]:value}))
  const headingCustom = `DealerPreview-${dealer.id}-Heading`
  const bodyCustom = `DealerPreview-${dealer.id}-Body`
  const headingFamily = values.headingFontFamily === 'custom' && values.customHeadingFontUrl ? headingCustom : fontStacks[values.headingFontFamily]
  const bodyFamily = values.bodyFontFamily === 'custom' && values.customBodyFontUrl ? bodyCustom : fontStacks[values.bodyFontFamily]

  async function save(next=values, success='Typography saved successfully.') {
    setSaving(true); setError(''); setMessage('')
    try { const updated=await onSave(next); onUpdated(updated); setValues(dealerTypographyValues(updated)); setMessage(success) }
    catch (cause) { console.error('Failed to save dealer typography.',cause); setError('We could not save the typography settings. Please try again.') }
    finally { setSaving(false) }
  }

  async function upload(event:ChangeEvent<HTMLInputElement>, target:FontTarget) {
    const file=event.target.files?.[0]; event.target.value=''; if(!file) return
    const extension=file.name.toLowerCase().endsWith('.woff2')?'woff2':file.name.toLowerCase().endsWith('.woff')?'woff':''
    const allowedMime=['font/woff2','font/woff','application/font-woff','application/octet-stream']
    const signature=new TextDecoder('latin1').decode((await file.slice(0,4).arrayBuffer()))
    if(!extension || !allowedMime.includes(file.type || 'application/octet-stream') || !['wOF2','wOFF'].includes(signature) || (signature==='wOF2'&&extension!=='woff2') || (signature==='wOFF'&&extension!=='woff')) { setError('Choose a valid WOFF2 or WOFF font file.'); return }
    if(file.size>maxFontBytes){setError('Custom fonts must be 2 MB or smaller.');return}
    setUploading(target);setError('');setMessage('')
    const objectPath=`${dealer.id}/${target}.${extension}`
    const {error:uploadError}=await supabase.storage.from('dealer-fonts').upload(objectPath,file,{contentType:extension==='woff2'?'font/woff2':'font/woff',upsert:true})
    if(uploadError){console.error('Failed to upload dealer font.',uploadError);setError('We could not upload this font. Please try again.');setUploading(null);return}
    const {data}=supabase.storage.from('dealer-fonts').getPublicUrl(objectPath)
    const url=`${data.publicUrl}?v=${file.lastModified}`
    const next={...values,[target==='heading'?'customHeadingFontUrl':'customBodyFontUrl']:url,[target==='heading'?'customHeadingFontName':'customBodyFontName']:file.name.replace(/\.(woff2?|WOFF2?)$/,''),[target==='heading'?'customHeadingFontWeight':'customBodyFontWeight']:target==='heading'?(values.headingFontWeight||'400'):(values.bodyFontWeight||'400'),[target==='heading'?'headingFontFamily':'bodyFontFamily']:'custom'}
    setValues(next);setUploading(null);await save(next,`${target==='heading'?'Heading':'Body'} font uploaded and saved.`)
  }

  const reset=()=>void save(dealerTypographyValues({...dealer,heading_font_family:null,heading_font_weight:null,heading_font_size:null,body_font_family:null,body_font_weight:null,body_font_size:null,custom_heading_font_url:null,custom_heading_font_name:null,custom_heading_font_weight:null,custom_body_font_url:null,custom_body_font_name:null,custom_body_font_weight:null}),'Typography reset to the HGI defaults.')
  return <section className="content-card dealer-typography-card">
    {(values.customHeadingFontUrl||values.customBodyFontUrl)&&<style>{`${values.customHeadingFontUrl?`@font-face{font-family:"${headingCustom}";src:url("${values.customHeadingFontUrl}") format("woff2");font-weight:${values.customHeadingFontWeight||400};font-display:swap}`:''}${values.customBodyFontUrl?`@font-face{font-family:"${bodyCustom}";src:url("${values.customBodyFontUrl}") format("woff2");font-weight:${values.customBodyFontWeight||400};font-display:swap}`:''}`}</style>}
    <div className="dealer-form__section-heading"><p className="eyebrow">Typography</p><h2>Door Builder Typography</h2><p>Customize typography only for this dealer’s branded Door Builder.</p></div>
    {message&&<div className="portal-alert portal-alert--success" role="status">{message}</div>}{error&&<div className="portal-alert" role="alert">{error}</div>}
    <div className="typography-settings-grid">
      {(['heading','body'] as const).map(target=>{const title=target==='heading'?'Heading Typography':'Body / UI Typography';const prefix=target==='heading'?'heading':'body';return <fieldset key={target}><legend>{title}</legend>
        <label>Font Family<select value={values[`${prefix}FontFamily`]} onChange={e=>set(`${prefix}FontFamily`,e.target.value)}><option value="">HGI Default</option>{dealerFontOptions.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label>Font Weight<select value={values[`${prefix}FontWeight`]} onChange={e=>set(`${prefix}FontWeight`,e.target.value)}><option value="">HGI Default</option>{dealerFontWeights.map(weight=><option key={weight} value={weight}>{weight} — {weight===300?'Light':weight===400?'Regular':weight===500?'Medium':weight===600?'Semi Bold':weight===700?'Bold':'Extra Bold'}</option>)}</select></label>
        <label>Base Size <span className="typography-size-input"><input type="number" min={target==='heading'?24:14} max={target==='heading'?72:22} value={values[`${prefix}FontSize`]} onChange={e=>set(`${prefix}FontSize`,e.target.value)}/><span>px</span></span></label>
        <label className="button button--outline upload-button">{uploading===target?'Uploading...':`Upload Custom ${target==='heading'?'Heading':'Body'} Font`}<input type="file" accept=".woff2,.woff,font/woff2,font/woff" disabled={uploading!==null} onChange={e=>void upload(e,target)}/></label>
      </fieldset>})}
    </div>
    <p className="typography-license-note">Only upload fonts you are licensed or authorized to use. WOFF2 or WOFF, maximum 2 MB.</p>
    <div className="typography-preview" style={{'--preview-heading-font':headingFamily||'var(--font-heading)','--preview-heading-weight':values.headingFontWeight||'700','--preview-heading-size':`${values.headingFontSize||42}px`,'--preview-body-font':bodyFamily||'var(--font-body)','--preview-body-weight':values.bodyFontWeight||'400','--preview-body-size':`${values.bodyFontSize||16}px`} as React.CSSProperties}><p className="eyebrow">Typography Preview</p><h3>Build a Door Made for Your Home.</h3><p>Choose your door style, finish, glass, and hardware.</p><button type="button">Start Building Your Door</button></div>
    <div className="dealer-form__actions"><button type="button" className="button button--outline" disabled={saving} onClick={reset}>Reset Typography to Default</button><button type="button" className="button button--primary" disabled={saving} onClick={()=>void save()}>{saving?'Saving...':'Save Typography'}</button></div>
  </section>
}
