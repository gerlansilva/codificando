/**
 * Exportações do relatório do projeto.
 * - DOCX: gerado com o pacote `docx` (Packer.toBlob) e enviado como base64.
 * - HTML: documento autocontido, com CSS de impressão.
 *
 * O binário é gravado por `bridge.saveBytes` quando existir; sem ela,
 * o navegador baixa o arquivo por um link temporário.
 */

import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from 'docx'
import { bridge } from './bridge.js'
import { projectStats } from './transcript.js'

const FONT = 'Arial'

/* ------------------------------ modelo ------------------------------ */

function fullDateTime (date) {
  const d = date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
  const t = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return `${d}, ${t}`
}

function shortDate (iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function reportSlug (data) {
  const base = String(data?.project?.name || 'projeto').trim() || 'projeto'
  return base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'projeto'
}

/**
 * Reúne os dados do relatório uma única vez, para DOCX e HTML.
 */
export function buildReportModel (data, now = new Date()) {
  const project = data?.project || {}
  const transcripts = data?.transcripts || []
  const codes = data?.codes || []
  const excerpts = data?.excerpts || []
  const memos = data?.memos || []

  const comments = new Map()
  for (const m of memos) {
    if (m.kind !== 'comment') continue
    if (!(m.text || '').trim()) continue
    comments.set(m.quoteId, m.text.trim())
  }

  const transcriptById = new Map(transcripts.map((t) => [t.id, t]))

  const codeRows = codes
    .map((code) => {
      const items = excerpts
        .filter((e) => e.codeId === code.id)
        .map((e) => ({
          id: e.id,
          text: String(e.text || '').replace(/\s+/g, ' ').trim(),
          page: e.page || null,
          document: transcriptById.get(e.transcriptId)?.name || 'Documento removido',
          comment: comments.get(e.quoteId || e.id) || ''
        }))
        .sort((a, b) => a.document.localeCompare(b.document, 'pt-BR'))
      return {
        id: code.id,
        name: code.name || 'Código sem nome',
        color: code.color || null,
        description: (code.description || '').trim(),
        count: items.length,
        items
      }
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'pt-BR'))

  const documents = transcripts.map((t) => ({
    id: t.id,
    name: t.name || 'Documento sem título',
    count: excerpts.filter((e) => e.transcriptId === t.id).length,
    createdAt: t.createdAt || null
  }))

  const unusedCodeCount = codeRows.filter((c) => c.count === 0).length

  return {
    title: project.name || 'Projeto sem título',
    description: (project.description || '').trim(),
    generatedAt: now,
    generatedAtLabel: fullDateTime(now),
    stats: projectStats({
      transcripts,
      codes,
      excerpts
    }),
    codes: codeRows,
    documents,
    unusedCodeCount
  }
}

/* ------------------------------ DOCX ------------------------------ */

const INK = '1F2933'
const MUTED = '52606D'
const LINE = 'CBD2D9'
const HEAD_FILL = 'F0F4F8'

const TABLE_BORDERS = {
  top: { style: BorderStyle.SINGLE, size: 4, color: LINE },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: LINE },
  left: { style: BorderStyle.SINGLE, size: 4, color: LINE },
  right: { style: BorderStyle.SINGLE, size: 4, color: LINE },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: LINE },
  insideVertical: { style: BorderStyle.SINGLE, size: 4, color: LINE }
}

function cell (children, { width, fill, bold = false, align } = {}) {
  return new TableCell({
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    shading: fill ? { type: ShadingType.CLEAR, fill, color: 'auto' } : undefined,
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    children: children.map((text) => new Paragraph({
      alignment: align,
      spacing: { after: 0 },
      children: [new TextRun({ text: String(text ?? ''), bold, size: 20, font: FONT, color: INK })]
    }))
  })
}

function table (head, rows, widths) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: TABLE_BORDERS,
    rows: [
      new TableRow({
        tableHeader: true,
        children: head.map((h, i) => cell([h], { width: widths?.[i], fill: HEAD_FILL, bold: true }))
      }),
      ...rows.map((r) => new TableRow({
        children: r.map((v, i) => cell([v], { width: widths?.[i] }))
      }))
    ]
  })
}

function paragraph (text, options = {}) {
  return new Paragraph({
    spacing: { after: options.after ?? 100 },
    children: [new TextRun({
      text: String(text ?? ''),
      font: FONT,
      size: options.size || 21,
      bold: options.bold,
      italics: options.italics,
      color: options.color || INK
    })]
  })
}

function buildDocxChildren (model) {
  const children = []

  children.push(new Paragraph({
    spacing: { after: 60 },
    children: [new TextRun({ text: 'Relatório de análise qualitativa', font: FONT, size: 20, color: MUTED, allCaps: true })]
  }))

  children.push(new Paragraph({
    heading: HeadingLevel.TITLE,
    spacing: { after: 80 },
    children: [new TextRun({ text: model.title, font: FONT, size: 40, bold: true, color: INK })]
  }))

  children.push(paragraph(`Gerado em ${model.generatedAtLabel}`, { color: MUTED, after: 60 }))

  if (model.description) {
    children.push(paragraph(model.description, { color: MUTED, italics: true, after: 180 }))
  }

  children.push(new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text: 'Resumo', font: FONT, size: 28, bold: true, color: INK })]
  }))

  children.push(table(
    ['Indicador', 'Total'],
    [
      ['Documentos (transcrições)', String(model.stats.transcripts)],
      ['Códigos', String(model.stats.codes)],
      ['Trechos codificados', String(model.stats.excerpts)],
      ['Documentos com pelo menos um código', String(model.stats.codedTranscripts)],
      ...(model.unusedCodeCount ? [['Códigos ainda sem trechos', String(model.unusedCodeCount)]] : [])
    ],
    [75, 25]
  ))

  children.push(new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text: 'Códigos', font: FONT, size: 28, bold: true, color: INK })]
  }))

  if (!model.codes.length) {
    children.push(paragraph('Nenhum código criado neste projeto.', { color: MUTED, italics: true }))
  } else {
    children.push(table(
      ['Código', 'Trechos'],
      model.codes.map((c) => [c.name, String(c.count)]),
      [75, 25]
    ))
  }

  children.push(new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text: 'Trechos codificados por código', font: FONT, size: 28, bold: true, color: INK })]
  }))

  const coded = model.codes.filter((c) => c.count > 0)
  if (!coded.length) {
    children.push(paragraph('Nenhum trecho codificado ainda.', { color: MUTED, italics: true }))
  }

  for (const code of coded) {
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 240, after: 80 },
      children: [new TextRun({
        text: `${code.name} (${code.count} ${code.count === 1 ? 'trecho' : 'trechos'})`,
        font: FONT,
        size: 24,
        bold: true,
        color: INK
      })]
    }))

    if (code.description) {
      children.push(paragraph(code.description, { color: MUTED, italics: true, after: 120 }))
    }

    for (const item of code.items) {
      children.push(new Paragraph({
        spacing: { before: 80, after: 30 },
        indent: { left: 240 },
        children: [new TextRun({ text: `“${item.text}”`, font: FONT, size: 21, italics: true, color: INK })]
      }))
      children.push(new Paragraph({
        spacing: { after: item.comment ? 30 : 120 },
        indent: { left: 240 },
        children: [new TextRun({
          text: item.document + (item.page ? ` · página ${item.page}` : ''),
          font: FONT,
          size: 18,
          color: MUTED
        })]
      }))
      if (item.comment) {
        children.push(new Paragraph({
          spacing: { after: 120 },
          indent: { left: 240 },
          children: [new TextRun({ text: `Comentário: ${item.comment}`, font: FONT, size: 19, color: INK })]
        }))
      }
    }
  }

  children.push(new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text: 'Documentos', font: FONT, size: 28, bold: true, color: INK })]
  }))

  if (!model.documents.length) {
    children.push(paragraph('Nenhum documento no projeto.', { color: MUTED, italics: true }))
  } else {
    children.push(table(
      ['Documento', 'Trechos', 'Adicionado em'],
      model.documents.map((d) => [d.name, String(d.count), shortDate(d.createdAt)]),
      [58, 16, 26]
    ))
  }

  children.push(new Paragraph({
    spacing: { before: 360, after: 0 },
    alignment: AlignmentType.CENTER,
    children: [new TextRun({
      text: 'Gerado pelo Codificando · análise qualitativa de dados',
      font: FONT,
      size: 16,
      color: MUTED
    })]
  }))

  return children
}

/**
 * Gera o relatório completo em DOCX e devolve um Blob.
 */
export async function buildDocxBlob (data) {
  const model = buildReportModel(data)
  const doc = new Document({
    creator: 'Codificando',
    title: `Relatório — ${model.title}`,
    description: 'Relatório de análise qualitativa',
    styles: {
      default: {
        document: {
          run: { font: FONT, size: 21, color: INK },
          paragraph: { spacing: { line: 276, after: 100 } }
        },
        title: {
          run: { font: FONT, size: 40, bold: true, color: INK },
          paragraph: { spacing: { after: 80 } }
        },
        heading1: {
          run: { font: FONT, size: 28, bold: true, color: INK },
          paragraph: { spacing: { before: 320, after: 140 } }
        },
        heading2: {
          run: { font: FONT, size: 24, bold: true, color: INK },
          paragraph: { spacing: { before: 240, after: 80 } }
        }
      }
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 }, // A4
          margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 }
        }
      },
      children: buildDocxChildren(model)
    }]
  })

  return Packer.toBlob(doc)
}

/* ------------------------------ HTML ------------------------------ */

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

/**
 * Gera o relatório completo em HTML autocontido, com CSS de impressão.
 */
export function buildHtmlReport (data) {
  const model = buildReportModel(data)

  const summaryRows = [
    ['Documentos (transcrições)', model.stats.transcripts],
    ['Códigos', model.stats.codes],
    ['Trechos codificados', model.stats.excerpts],
    ['Documentos com pelo menos um código', model.stats.codedTranscripts],
    ...(model.unusedCodeCount ? [['Códigos ainda sem trechos', model.unusedCodeCount]] : [])
  ]

  const codesTable = model.codes.length
    ? `<table>
        <thead><tr><th>Código</th><th class="num">Trechos</th></tr></thead>
        <tbody>
          ${model.codes.map((c) => `<tr><td>${escapeHtml(c.name)}</td><td class="num">${c.count}</td></tr>`).join('\n          ')}
        </tbody>
      </table>`
    : '<p class="empty">Nenhum código criado neste projeto.</p>'

  const coded = model.codes.filter((c) => c.count > 0)
  const codeSections = coded.length
    ? coded.map((c) => `
      <section class="code-block">
        <h2>${escapeHtml(c.name)} <span class="count">${c.count} ${c.count === 1 ? 'trecho' : 'trechos'}</span></h2>
        ${c.description ? `<p class="code-desc">${escapeHtml(c.description)}</p>` : ''}
        <ol class="quotes">
          ${c.items.map((item) => `
          <li>
            <blockquote>“${escapeHtml(item.text)}”</blockquote>
            <p class="source">${escapeHtml(item.document)}${item.page ? ` · página ${item.page}` : ''}</p>
            ${item.comment ? `<p class="comment">Comentário: ${escapeHtml(item.comment)}</p>` : ''}
          </li>`).join('')}
        </ol>
      </section>`).join('\n')
    : '<p class="empty">Nenhum trecho codificado ainda.</p>'

  const documentsTable = model.documents.length
    ? `<table>
        <thead><tr><th>Documento</th><th class="num">Trechos</th><th>Adicionado em</th></tr></thead>
        <tbody>
          ${model.documents.map((d) => `<tr><td>${escapeHtml(d.name)}</td><td class="num">${d.count}</td><td>${escapeHtml(shortDate(d.createdAt))}</td></tr>`).join('\n          ')}
        </tbody>
      </table>`
    : '<p class="empty">Nenhum documento no projeto.</p>'

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Relatório — ${escapeHtml(model.title)}</title>
<style>
  :root {
    --ink: #1f2933;
    --muted: #52606d;
    --line: #cbd2d9;
    --soft: #f0f4f8;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0 auto;
    max-width: 820px;
    padding: 48px 32px 64px;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 15px;
    line-height: 1.55;
    color: var(--ink);
    background: #fff;
  }
  header { border-bottom: 2px solid var(--ink); padding-bottom: 18px; margin-bottom: 28px; }
  .kicker { margin: 0 0 6px; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
  h1 { margin: 0 0 8px; font-size: 30px; line-height: 1.15; }
  .meta { margin: 0; font-size: 13px; color: var(--muted); }
  .description { margin: 12px 0 0; color: var(--muted); font-style: italic; }
  h2 { margin: 34px 0 12px; font-size: 20px; border-bottom: 1px solid var(--line); padding-bottom: 6px; }
  .count { font-size: 13px; font-weight: normal; color: var(--muted); margin-left: 6px; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0 20px; }
  th, td { border: 1px solid var(--line); padding: 8px 10px; text-align: left; vertical-align: top; }
  th { background: var(--soft); font-size: 13px; text-transform: uppercase; letter-spacing: .03em; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  .code-block { margin: 0 0 26px; }
  .code-block h2 { border-bottom: none; margin-bottom: 6px; padding-bottom: 0; }
  .code-desc { margin: 0 0 10px; color: var(--muted); font-style: italic; }
  .quotes { margin: 0; padding-left: 24px; }
  .quotes li { margin: 0 0 16px; }
  blockquote { margin: 0 0 4px; padding: 0; font-style: italic; }
  .source { margin: 0; font-size: 12.5px; color: var(--muted); }
  .comment { margin: 6px 0 0; font-size: 13.5px; }
  .empty { color: var(--muted); font-style: italic; }
  footer { margin-top: 44px; padding-top: 12px; border-top: 1px solid var(--line); font-size: 12px; color: var(--muted); text-align: center; }
  @page { size: A4; margin: 18mm 16mm; }
  @media print {
    body { max-width: none; padding: 0; font-size: 10.5pt; }
    header { margin-bottom: 18px; }
    h1 { font-size: 20pt; }
    h2 { font-size: 13pt; break-after: avoid; }
    table, .code-block, .quotes li { break-inside: avoid; }
    a { color: inherit; text-decoration: none; }
  }
</style>
</head>
<body>
  <header>
    <p class="kicker">Relatório de análise qualitativa</p>
    <h1>${escapeHtml(model.title)}</h1>
    <p class="meta">Gerado em ${escapeHtml(model.generatedAtLabel)}</p>
    ${model.description ? `<p class="description">${escapeHtml(model.description)}</p>` : ''}
  </header>

  <section>
    <h2>Resumo</h2>
    <table>
      <thead><tr><th>Indicador</th><th class="num">Total</th></tr></thead>
      <tbody>
        ${summaryRows.map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td class="num">${value}</td></tr>`).join('\n        ')}
      </tbody>
    </table>
  </section>

  <section>
    <h2>Códigos</h2>
    ${codesTable}
  </section>

  <section>
    <h2>Trechos codificados por código</h2>
    ${codeSections}
  </section>

  <section>
    <h2>Documentos</h2>
    ${documentsTable}
  </section>

  <footer>Gerado pelo Codificando · análise qualitativa de dados</footer>
</body>
</html>
`
}

/* --------------------------- gravação --------------------------- */

function base64ToBytes (base64) {
  const clean = String(base64 || '').replace(/^data:[^;]+;base64,/, '')
  const binary = atob(clean)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function blobToBase64 (blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '')
    reader.onerror = () => reject(reader.error || new Error('falha ao ler o arquivo'))
    reader.readAsDataURL(blob)
  })
}

function downloadBlob (blob, name) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

/**
 * Salva bytes pela ponte nativa; sem `bridge.saveBytes`, baixa pelo navegador.
 */
export async function saveBytes (name, base64, mime) {
  if (bridge && typeof bridge.saveBytes === 'function') {
    return bridge.saveBytes(name, base64, mime)
  }
  downloadBlob(new Blob([base64ToBytes(base64)], { type: mime }), name)
  return true
}

/**
 * Exporta o DOCX do projeto. Devolve o nome usado.
 */
export async function exportDocx (data) {
  const blob = await buildDocxBlob(data)
  const base64 = await blobToBase64(blob)
  const name = `relatorio-${reportSlug(data)}.docx`
  await saveBytes(name, base64, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  return name
}

/**
 * Exporta o HTML do projeto. Devolve o nome usado.
 */
export async function exportHtml (data) {
  const html = buildHtmlReport(data)
  const name = `relatorio-${reportSlug(data)}.html`
  if (typeof bridge.saveFile === 'function') {
    await bridge.saveFile(name, html, 'text/html;charset=utf-8')
  } else {
    downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), name)
  }
  return name
}
