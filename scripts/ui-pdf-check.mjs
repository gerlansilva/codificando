/**
 * Verificação visual da página do PDF codificado, num navegador Chromium.
 *
 * O objetivo é rodar o mesmo teste no Windows (WebView2 usa o motor do Edge)
 * e no macOS, para pegar diferenças de renderização das marcações.
 *
 * Uso:
 *   node scripts/ui-pdf-check.mjs            # servidor próprio na 5199
 *   EDGE_PATH=... node scripts/ui-pdf-check.mjs
 *
 * Saídas em qa/pdf-highlights/ (capturas e relatório JSON).
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import puppeteer from 'puppeteer-core'
import { buildDemoPdf } from './demo-pdf.mjs'

const PORT = Number(process.env.PORT || 5199)
const BASE = `http://localhost:${PORT}`
const OUT = path.join(process.cwd(), 'qa', 'pdf-highlights')
const PAGE_COUNT = 1

function findBrowser () {
  const candidates = [
    process.env.EDGE_PATH,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ].filter(Boolean)
  for (const p of candidates) if (fs.existsSync(p)) return p
  throw new Error('Nenhum Chromium/Edge encontrado. Defina EDGE_PATH.')
}

async function waitForServer (timeout = 60000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    try {
      const res = await fetch(BASE)
      if (res.ok) return
    } catch { /* ainda subindo */ }
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error('O servidor de desenvolvimento não respondeu')
}

const data = {
  schema: 1,
  project: { name: 'Teste de marcações', description: '', createdAt: new Date().toISOString() },
  codes: [
    { id: 'c1', name: 'Primeira linha', color: '#4A90E2', order: 0, parentId: null },
    { id: 'c2', name: 'Segunda linha', color: '#E2A64A', order: 1, parentId: null }
  ],
  transcripts: [{
    id: 'doc1',
    name: 'demo.pdf',
    kind: 'document',
    rendererType: 'pdf',
    fileKey: 'demo.pdf',
    pageCount: PAGE_COUNT,
    pageOffsets: [0],
    body: 'Codificando test page\nSecond line of text\nThird line of text\n',
    createdAt: new Date().toISOString()
  }],
  excerpts: []
}

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(PORT), '--strictPort'], {
  stdio: 'ignore',
  env: process.env
})

let browser
const problems = []
try {
  await waitForServer()
  fs.mkdirSync(OUT, { recursive: true })

  browser = await puppeteer.launch({
    executablePath: findBrowser(),
    headless: true,
    args: ['--hide-scrollbars', '--force-color-profile=srgb']
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1360, height: 900, deviceScaleFactor: Number(process.env.DPR || 1.25) })
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message))

  await page.goto(BASE, { waitUntil: 'networkidle2' })
  await page.evaluate((d) => {
    localStorage.setItem('investigando.data.v1', JSON.stringify(d))
    localStorage.setItem('investigando.settings.v1', JSON.stringify({ projectPath: null }))
  }, data)

  await page.evaluate(async (b64, key) => {
    const bin = atob(b64)
    const buf = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
    await new Promise((resolve, reject) => {
      const req = indexedDB.open('investigando-files', 1)
      req.onupgradeneeded = () => req.result.createObjectStore('files')
      req.onsuccess = () => {
        const tx = req.result.transaction('files', 'readwrite')
        tx.objectStore('files').put(buf.buffer, key)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      }
      req.onerror = () => reject(req.error)
    })
  }, buildDemoPdf().toString('base64'), 'demo.pdf')

  await page.evaluate(() => { window.location.hash = '#/documents/doc1' })
  await page.reload({ waitUntil: 'networkidle2' })
  await page.waitForSelector('.pdf-page .textLayer span', { timeout: 30000 })
  await new Promise((r) => setTimeout(r, 1200))

  // 1. o PDF e a camada de texto foram renderizados
  const base = await page.evaluate(() => {
    const canvas = document.querySelector('.pdf-page canvas')
    return {
      pages: document.querySelectorAll('.pdf-page').length,
      spans: document.querySelectorAll('.pdf-page .textLayer span').length,
      canvas: canvas ? { w: canvas.width, h: canvas.height } : null
    }
  })
  if (base.pages !== 1) problems.push(`esperava 1 página, veio ${base.pages}`)
  if (!base.canvas || base.canvas.w < 100) problems.push('canvas do PDF não foi pintado')
  if (base.spans < 2) problems.push(`camada de texto vazia (${base.spans} spans)`)

  // 2. marcações com a geometria real dos spans de texto
  const rects = await page.evaluate(() => {
    const pr = document.querySelector('.pdf-page').getBoundingClientRect()
    return [...document.querySelectorAll('.pdf-page .textLayer span')].map((s) => {
      const r = s.getBoundingClientRect()
      return {
        x: (r.x - pr.x) / pr.width,
        y: (r.y - pr.y) / pr.height,
        w: r.width / pr.width,
        h: r.height / pr.height
      }
    })
  })
  const lines = rects.filter((r) => r.w > 0.02)
  const excerptRects = [lines[0], lines[1]].filter(Boolean)

  await page.evaluate((r) => {
    const d = JSON.parse(localStorage.getItem('investigando.data.v1'))
    d.excerpts = r.map((rect, i) => ({
      id: 'ex' + i,
      quoteId: 'q' + i,
      transcriptId: 'doc1',
      codeId: i === 0 ? 'c1' : 'c2',
      layer: 1,
      page: 1,
      rects: [rect],
      text: i === 0 ? 'Codificando test page' : 'Second line of text',
      createdAt: new Date().toISOString()
    }))
    localStorage.setItem('investigando.data.v1', JSON.stringify(d))
  }, excerptRects)
  await page.reload({ waitUntil: 'networkidle2' })
  await page.waitForSelector('.pdf-highlight', { timeout: 30000 })
  await new Promise((r) => setTimeout(r, 800))

  // 3. as marcações existem, estão visíveis e caem sobre o texto
  const check = await page.evaluate(() => {
    const pageEl = document.querySelector('.pdf-page')
    pageEl.scrollIntoView({ block: 'center' })
    const pr = pageEl.getBoundingClientRect()
    const spans = [...pageEl.querySelectorAll('.textLayer span')].map((s) => s.getBoundingClientRect())
    return [...pageEl.querySelectorAll('.pdf-highlight')].map((h) => {
      const r = h.getBoundingClientRect()
      const cs = getComputedStyle(h)
      const cx = r.x + r.width / 2
      const cy = r.y + r.height / 2
      const hits = document.elementsFromPoint(cx, cy)
      return {
        rect: { x: r.x, y: r.y, w: r.width, h: r.height },
        background: cs.backgroundColor,
        opacity: cs.opacity,
        visibility: cs.visibility,
        display: cs.display,
        zIndex: cs.zIndex,
        overText: spans.some((s) => cx >= s.x - 4 && cx <= s.x + s.width + 4 && cy >= s.y - 4 && cy <= s.y + s.height + 4),
        center: { x: cx, y: cy },
        coveredBy: hits.map((el) => el.className || el.tagName).slice(0, 4)
      }
    })
  })

  if (check.length !== 2) problems.push(`esperava 2 marcações, veio ${check.length}`)
  for (const [i, h] of check.entries()) {
    if (h.rect.w < 2 || h.rect.h < 2) problems.push(`marcação ${i} sem tamanho`)
    if (!h.background || h.background === 'rgba(0, 0, 0, 0)' || h.background === 'transparent') {
      problems.push(`marcação ${i} sem cor de fundo`)
    }
    if (h.opacity === '0' || h.visibility === 'hidden' || h.display === 'none') {
      problems.push(`marcação ${i} invisível (opacity/visibility/display)`)
    }
    if (!h.overText) problems.push(`marcação ${i} fora do texto`)
  }

  // 4. pixel pintado no centro da marcação e texto ainda legível por baixo.
  // O screenshot é decodificado pelo próprio navegador, sem dependências.
  const decode = async (b64) => page.evaluate(async (data) => {
    const img = new Image()
    img.src = 'data:image/png;base64,' + data
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.width
    c.height = img.height
    const ctx = c.getContext('2d')
    ctx.drawImage(img, 0, 0)
    const { data: px } = ctx.getImageData(0, 0, img.width, img.height)
    let dark = 0
    let min = 255
    for (let i = 0; i < px.length; i += 4) {
      const lum = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]
      if (lum < 140) dark++
      if (lum < min) min = lum
    }
    return { dark, min: Math.round(min), total: px.length / 4 }
  }, b64)

  for (const [i, h] of check.entries()) {
    const png = await page.screenshot({ encoding: 'base64', clip: { x: h.center.x, y: h.center.y, width: 1, height: 1 } })
    const pixel = await page.evaluate(async (b64) => {
      const img = new Image()
      img.src = 'data:image/png;base64,' + b64
      await img.decode()
      const c = document.createElement('canvas')
      c.width = img.width
      c.height = img.height
      const ctx = c.getContext('2d')
      ctx.drawImage(img, 0, 0)
      return [...ctx.getImageData(0, 0, 1, 1).data]
    }, png)
    h.pixel = pixel
    const [r, g, b] = pixel
    if (r > 250 && g > 250 && b > 250) problems.push(`marcação ${i} não aparece no pixel (branco)`)

    // o texto marcado precisa continuar visível: há glifos escuros na faixa
    const box = await page.screenshot({
      encoding: 'base64',
      clip: { x: h.rect.x, y: h.rect.y, width: Math.max(2, h.rect.w), height: Math.max(2, h.rect.h) }
    })
    const stats = await decode(box)
    h.text = stats
    if (stats.dark < 20) problems.push(`marcação ${i} esconde o texto (${stats.dark} pixels escuros)`)
  }

  await page.screenshot({ path: path.join(OUT, 'editor.png') })
  const el = await page.$('.pdf-page')
  if (el) await el.screenshot({ path: path.join(OUT, 'pagina.png') })

  const report = { platform: process.platform, browser: findBrowser(), base, check, problems }
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
} finally {
  if (browser) await browser.close().catch(() => {})
  server.kill()
}

if (problems.length) {
  console.error('\nFALHOU:\n- ' + problems.join('\n- '))
  process.exit(1)
}
console.log('\nOK: marcações visíveis e alinhadas.')
