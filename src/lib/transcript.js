const TIME = /^(\d{1,2}:\d{2}(?::\d{2})?)(?:[,.]\d{1,3})?\s*/
const SPEAKER = /^([^:\n]{1,40}):\s+/

export function initials (name) {
  const clean = (name || '').trim()
  if (!clean) return ''
  const parts = clean.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * Converte o body em blocos renderizáveis, guardando offsets absolutos.
 * Assim os excerpts continuam válidos mesmo com o parse visual.
 */
/**
 * Detecta se o texto é um diálogo (transcrição) pela proporção de linhas
 * iniciadas por "Nome:". Assim não é preciso escolher o "tipo" na importação.
 */
export function detectDialogue (body) {
  const lines = body.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length < 2) return false
  const speakers = lines.filter((l) => /^[A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9 ._'-]{0,38}:\s+/.test(l))
  return speakers.length >= 2 && speakers.length / lines.length >= 0.3
}

export function parseBlocks (body, plain = false) {
  const blocks = []
  let offset = 0
  for (const rawLine of body.split('\n')) {
    const lineStart = offset
    offset += rawLine.length + 1
    const line = rawLine.replace(/\s+$/, '')
    if (!line.trim()) continue

    let cursor = 0
    let time = null
    let speaker = null

    if (!plain) {
      const tm = line.match(TIME)
      if (tm) {
        time = tm[1]
        cursor = tm[0].length
      }

      const rest = line.slice(cursor)
      const sm = rest.match(SPEAKER)
      if (sm && !/^\d+$/.test(sm[1].trim())) {
        speaker = sm[1].trim()
        cursor += sm[0].length
      }
    }

    blocks.push({
      start: lineStart,
      end: lineStart + line.length,
      contentStart: lineStart + cursor,
      contentEnd: lineStart + line.length,
      time,
      speaker
    })
  }
  return blocks
}

/**
 * Divide um intervalo em segmentos por código, resolvendo sobreposições
 * (o código mais recente vence no trecho sobreposto).
 */
export function segmentsFor (excerpts, from, to) {
  const relevant = excerpts.filter((e) => e.end > from && e.start < to)
  if (!relevant.length) return [{ from, to, excerpt: null }]

  const points = new Set([from, to])
  for (const e of relevant) {
    if (e.start > from && e.start < to) points.add(e.start)
    if (e.end > from && e.end < to) points.add(e.end)
  }
  const sorted = [...points].sort((a, b) => a - b)
  const segments = []
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]
    const b = sorted[i + 1]
    const covering = relevant
      .filter((e) => e.start <= a && e.end >= b)
      .sort((x, y) => (x.createdAt || '').localeCompare(y.createdAt || ''))
    segments.push({ from: a, to: b, excerpt: covering[covering.length - 1] || null })
  }
  return segments
}

export function projectStats (data) {
  const paragraphs = data.transcripts.reduce(
    (acc, t) => acc + t.body.split('\n').filter((l) => l.trim()).length, 0
  )
  const coded = new Set(data.excerpts.map((e) => e.transcriptId)).size
  return {
    transcripts: data.transcripts.length,
    codes: data.codes.length,
    excerpts: data.excerpts.length,
    paragraphs,
    codedTranscripts: coded
  }
}

export function formatDate (iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}
