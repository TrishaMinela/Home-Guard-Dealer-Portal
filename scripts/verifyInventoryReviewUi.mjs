// Mocked browser checks: no Supabase reads, writes or authentication required.
// Run Vite locally, then PLAYWRIGHT_MODULE=/absolute/path/to/playwright-core/index.mjs node scripts/verifyInventoryReviewUi.mjs
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { mkdir } from 'node:fs/promises'
if (!process.env.PLAYWRIGHT_MODULE) throw new Error('Set PLAYWRIGHT_MODULE to a local Playwright installation.')
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const origin=process.env.PORTAL_TEST_URL ?? 'http://127.0.0.1:5186'
const output=process.env.PORTAL_TEST_OUTPUT ?? '/tmp/hgi-inventory-review-ui'
// Reuse the exact optimized module URLs Vite gives the real components;
// differently versioned router modules create separate React contexts.
const mainSource=await (await fetch(`${origin}/src/main.tsx`)).text()
const reviewSource=await (await fetch(`${origin}/src/pages/AdminInventoryReviewPage.tsx`)).text()
const modulePath=(source,name)=>source.match(new RegExp(`"([^" ]*/${name}\\.js[^" ]*)"`))?.[1]
const reactPath=modulePath(mainSource,'react')
const domPath=modulePath(mainSource,'react-dom_client')
const routerPath=modulePath(reviewSource,'react-router-dom')
if(!reactPath||!domPath||!routerPath)throw new Error('Could not resolve the running Vite development modules.')
await mkdir(output,{recursive:true})
let publications=0
const change=(type, before, after)=>({styleId:'style-1',styleName:'Full Lite door with a longer verified product name',type,label:type,before,after,context:type==='grain_availability'?'Signature / Oak':'',beforeAssetId:null,afterAssetId:null,changedAt:'2026-10-15T08:00:00Z',changedBy:'admin@example.invalid'})
const initial={revision:{id:'draft-1',status:'draft'},fingerprint:'reviewed-fingerprint',changes:[change('name','Original Full Lite','Full Lite'),change('grain_availability',false,true),{...change('thumbnail','old.webp','new.webp'),beforeAssetId:'old',afterAssetId:'new'}],errors:[],styleCount:42,variantCount:127,assets:[{id:'old',bucket:'door-catalog-assets',path:'old.webp'},{id:'new',bucket:'door-catalog-assets',path:'new.webp'}],history:[]}
try {
  for(const [label,width,height] of [['desktop',1440,1000],['tablet-portrait',820,1180],['tablet-landscape',1180,820],['phone',390,844]]) {
    const page=await browser.newPage({viewport:{width,height}})
    let state=structuredClone(initial)
    let failPublish=false
    const errors=[]
    page.on('pageerror',error=>{ errors.push(error.message); console.error('Browser error:',error.message) })
    page.on('console',message=>{if(message.type()==='error')console.error('Browser console:',message.text())})
    await page.route(/\/src\/main\.tsx(?:\?.*)?$/,route=>route.fulfill({contentType:'application/javascript',body:`
      import React from '${reactPath}';
      import ReactDOM from '${domPath}';
      import {MemoryRouter} from '${routerPath}';
      import {AdminInventoryReviewPage} from '/src/pages/AdminInventoryReviewPage.tsx';
      import '/src/index.css'; import '/src/App.css';
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(AdminInventoryReviewPage)));
    `}))
    await page.route('https://**.supabase.co/**',async route=>{
      const url=route.request().url()
      if(url.includes('/rpc/review_door_catalog')) return route.fulfill({json:state})
      if(url.includes('/rpc/publish_door_catalog')) {
        publications++
        assert.deepEqual(route.request().postDataJSON(),{p_revision:'draft-1',p_fingerprint:'reviewed-fingerprint'})
        if(failPublish)return route.fulfill({status:400,json:{message:'The catalog changed after review. Refresh and review the latest changes.'}})
        state={...state,revision:{id:'draft-2',status:'draft'},changes:[],assets:[],history:[{id:'draft-1',status:'published',base_revision_id:null,published_at:'2026-10-15T09:00:00Z',published_by:'admin@example.invalid',publication_change_count:3}]}
        return route.fulfill({json:{publishedRevisionId:'draft-1',draftRevisionId:'draft-2'}})
      }
      if(url.includes('/storage/v1/object/sign/')&&route.request().method()==='POST')return route.fulfill({json:[{path:'old.webp',signedURL:'/object/sign/door-catalog-assets/old.webp?token=test'},{path:'new.webp',signedURL:'/object/sign/door-catalog-assets/new.webp?token=test'}]})
      if(url.includes('/storage/v1/object/')) return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="200"><rect x="10" y="5" width="80" height="190" fill="#08666e"/></svg>'})
      return route.fulfill({status:500,json:{message:'Unexpected test request'}})
    })
    await page.goto(origin)
    try {await page.getByText('3 pending changes').waitFor()} catch(error) {console.error(await page.locator('body').innerText());throw error}
    assert.equal(await page.locator('.inventory-review-images img').count(),2)
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false)
    await page.screenshot({path:`${output}/${label}-review.png`,fullPage:true})
    console.log(label,await page.locator('.inventory-review-images img').first().evaluate(el=>({height:getComputedStyle(el).height,width:getComputedStyle(el).width,complete:el.complete})))
    await page.locator('.inventory-review-filters select').nth(1).selectOption('name')
    assert.equal(await page.locator('.inventory-review-group li').count(),1)
    await page.locator('.inventory-review-filters select').nth(1).selectOption('')
    const countBefore=publications
    await page.getByRole('button',{name:'Publish Catalog',exact:true}).click()
    const dialog=page.getByRole('dialog')
    await dialog.waitFor()
    assert.equal(await page.getByRole('button',{name:'Cancel',exact:true}).evaluate(el=>el===document.activeElement),true)
    await page.screenshot({path:`${output}/${label}-confirmation.png`})
    await page.keyboard.press('Escape')
    await dialog.waitFor({state:'hidden'})
    assert.equal(publications,countBefore)
    assert.equal(await page.getByRole('button',{name:'Publish Catalog',exact:true}).evaluate(el=>el===document.activeElement),true)
    await page.getByRole('button',{name:'Publish Catalog',exact:true}).click()
    await page.getByRole('button',{name:'Cancel',exact:true}).click()
    assert.equal(publications,countBefore)
    // Invalid server results disable publication, rather than UI-only validation.
    state.errors=[{message:'An available variant is missing a render.',styleId:'style-1'}]
    await page.reload(); await page.getByText('Publication checks',{exact:true}).waitFor()
    assert.equal(await page.getByRole('button',{name:'Publish Catalog',exact:true}).isDisabled(),true)
    state.errors=[]
    await page.reload(); await page.getByText('3 pending changes').waitFor()
    failPublish=true
    await page.getByRole('button',{name:'Publish Catalog',exact:true}).click()
    await page.getByRole('button',{name:'Publish',exact:true}).click()
    await page.getByRole('alert').waitFor()
    assert.match(await page.getByRole('alert').innerText(),/changed after review/)
    failPublish=false
    await page.getByRole('button',{name:'Publish Catalog',exact:true}).click()
    await page.getByRole('button',{name:'Publish',exact:true}).click()
    await page.getByText('0 pending changes').waitFor()
    await page.getByText('Current',{exact:true}).waitFor()
    assert.equal(await page.getByRole('button',{name:'Publish Catalog',exact:true}).isDisabled(),true)
    assert.deepEqual(errors,[])
    console.log(`PASS ${label}: filters, assets, no overflow, confirmation/cancel/Escape/focus, validation, stale review, publication/new draft/history`)
    await page.close()
  }
  console.log(`Mocked UI checks passed; screenshots: ${output}. No external database accessed.`)
} finally {await browser.close()}
