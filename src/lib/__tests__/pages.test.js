import { describe, expect, it, vi } from 'vitest'
import { findHits, indexOnPage, pageForOffset } from '../pages.js'
import { buildTextIndex } from '../pdfText.js'

const pdf = vi.hoisted(() => ({
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({
      numPages: 3,
      getPage: vi.fn(async () => ({
        getViewport: () => ({ width: 600, height: 800, transform: [1, 0, 0, 1, 0, 0] }),
        getTextContent: async () => ({
          items: [
            { str: 'Olá', transform: [1, 0, 0, 1, 1, 1], width: 30, height: 12 },
            { str: '', transform: [1, 0, 0, 1, 1, 1], width: 0, height: 0 }
          ]
        })
      }))
    })
  })),
  transform: vi.fn(() => [1, 0, 0, 12, 120, 600])
}))

vi.mock('../importers.js', () => ({
  ensurePdfJs: async () => ({ getDocument: pdf.getDocument, Util: { transform: pdf.transform } })
}))

const BODY = 'A ciência avança. A CIENCIA também.\nCiência!'

describe('pageForOffset', () => {
  const offsets = [0, 120, 260]

  it('mapeia offsets para a página correspondente (1-based)', () => {
    expect(pageForOffset(offsets, 0)).toBe(1)
    expect(pageForOffset(offsets, 119)).toBe(1)
    expect(pageForOffset(offsets, 120)).toBe(2)
    expect(pageForOffset(offsets, 259)).toBe(2)
    expect(pageForOffset(offsets, 260)).toBe(3)
    expect(pageForOffset(offsets, 9999)).toBe(3)
  })

  it('retorna null sem offsets', () => {
    expect(pageForOffset([], 10)).toBeNull()
    expect(pageForOffset(null, 10)).toBeNull()
    expect(pageForOffset(undefined, 10)).toBeNull()
  })
})

describe('findHits', () => {
  it('encontra todas as ocorrências, com acentos e sem diferenciar caixa', () => {
    const pageOffsets = [0, BODY.indexOf('CIENCIA')]
    const hits = findHits(BODY, 'ciencia', pageOffsets)
    expect(hits).toHaveLength(3)
    expect(hits.map((h) => h.offset)).toEqual([
      BODY.indexOf('ciência'),
      BODY.indexOf('CIENCIA'),
      BODY.indexOf('Ciência!')
    ])
    expect(hits.map((h) => h.page)).toEqual([1, 2, 2])
  })

  it('associa todos os resultados à primeira página com um único offset', () => {
    const hits = findHits('código e código', 'codigo', [0])
    expect(hits.map((h) => h.offset)).toEqual([0, 'código e código'.indexOf('código', 1)])
    expect(hits.every((h) => h.page === 1)).toBe(true)
  })

  it('devolve página nula quando o documento não tem offsets', () => {
    const hits = findHits('código e código', 'codigo')
    expect(hits.map((h) => h.page)).toEqual([null, null])
  })

  it('retorna vazio para termo, corpo ou ausência de ocorrências', () => {
    expect(findHits(BODY, '', [0])).toEqual([])
    expect(findHits('', 'ciencia', [0])).toEqual([])
    expect(findHits(BODY, 'inexistente', [0])).toEqual([])
  })
})

describe('indexOnPage', () => {
  const hits = [
    { page: 1 }, { page: 1 }, { page: 2 }, { page: 2 }, { page: 3 }
  ]

  it('conta a posição da ocorrência dentro da página', () => {
    expect(indexOnPage(hits, 0)).toBe(0)
    expect(indexOnPage(hits, 1)).toBe(1)
    expect(indexOnPage(hits, 2)).toBe(0)
    expect(indexOnPage(hits, 3)).toBe(1)
    expect(indexOnPage(hits, 4)).toBe(0)
  })

  it('retorna 0 para posição inexistente', () => {
    expect(indexOnPage(hits, 99)).toBe(0)
    expect(indexOnPage([], 0)).toBe(0)
  })
})

describe('buildTextIndex', () => {
  it('extrai itens normalizados apenas das páginas existentes e pedidas', async () => {
    const index = await buildTextIndex(new Uint8Array([1, 2, 3]), [1, 2, 4])
    expect([...index.keys()]).toEqual([1, 2])
    const [item] = index.get(1)
    expect(item.str).toBe('Olá')
    expect(item.x).toBeCloseTo(0.2)
    expect(item.y).toBeCloseTo(0.735)
    expect(item.w).toBeCloseTo(0.05)
    expect(item.h).toBeCloseTo(0.015)
    expect(pdf.getDocument).toHaveBeenCalledWith({ data: expect.any(Uint8Array) })
  })

  it('retorna índice vazio quando nenhuma página é pedida', async () => {
    const index = await buildTextIndex(new Uint8Array([1]), [])
    expect(index.size).toBe(0)
  })
})
