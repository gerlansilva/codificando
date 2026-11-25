import { describe, it, expect } from 'vitest'
import { orderLinesByColumn, coverageColumns, mergeColumns } from '../pdfOrder.js'

const it_ = (x, y, text, h = 10) => ({ x, y, h, text })

describe('ordem de leitura em PDF', () => {
  it('mantém rótulo e valor de uma tabela na mesma linha', () => {
    // coluna esquerda de 50 a 300; nomes alinhados à direita
    const items = [
      it_(50, 0, 'The new Executive Committee will consist of:'),
      it_(50, 14, 'President:'), it_(200, 14, 'Brian Phillips (Australia)'),
      it_(50, 28, 'President Elect:'), it_(190, 28, 'Carmen Batanero (Spain)'),
      it_(50, 42, 'Vice Presidents:'), it_(210, 42, 'Dani Ben-Zvi (Israel)'),
      it_(205, 55, 'Joan Garfield (USA)')
    ]
    const cols = [{ x0: 50, x1: 300 }]
    expect(orderLinesByColumn(items, cols)).toEqual([
      'The new Executive Committee will consist of:',
      'President: Brian Phillips (Australia)',
      'President Elect: Carmen Batanero (Spain)',
      'Vice Presidents: Dani Ben-Zvi (Israel)',
      'Joan Garfield (USA)'
    ])
  })

  it('lê a coluna esquerda inteira antes da direita', () => {
    const items = [it_(320, 0, 'D1'), it_(50, 0, 'E1'), it_(320, 14, 'D2'), it_(50, 14, 'E2')]
    const cols = [{ x0: 50, x1: 300 }, { x0: 320, x1: 560 }]
    expect(orderLinesByColumn(items, cols)).toEqual(['E1', 'E2', 'D1', 'D2'])
  })

  it('cobertura: vão de tabela coberto por parágrafo não vira coluna; calha vira', () => {
    const spans = [
      { x0: 50, x1: 300 }, // parágrafo da coluna esquerda
      { x0: 50, x1: 110 }, { x0: 200, x1: 300 }, // rótulo e valor
      { x0: 320, x1: 560 } // coluna direita
    ]
    expect(coverageColumns(spans, 7)).toEqual([{ x0: 50, x1: 300 }, { x0: 320, x1: 560 }])
  })

  it('funde região que começa dentro de outra', () => {
    expect(mergeColumns([{ x0: 50, x1: 300 }, { x0: 200, x1: 290 }])).toEqual([{ x0: 50, x1: 300 }])
  })
})

import { readingOrder } from '../importers.js'

const line = (y, ...parts) => ({ y, h: 10, items: parts.map(([x, text]) => ({ x, w: text.length * 5, text, h: 10 })) })

describe('extração de PDF em duas colunas', () => {
  it('lê a coluna esquerda inteira antes da direita, separada por título', () => {
    const lines = [
      line(800, [50, 'TITULO QUE ATRAVESSA A PAGINA INTEIRA DE LADO A LADO SEM PARAR ATE A DIREITA']),
      line(780, [50, 'esq 1 aaaaaaaaaaaaaaa'], [320, 'dir 1 bbbbbbbbbbbbbbb']),
      line(766, [50, 'esq 2 aaaaaaaaaaaaaaa'], [320, 'dir 2 bbbbbbbbbbbbbbb']),
      line(752, [50, 'esq 3 aaaaaaaaaaaaaaa'], [320, 'dir 3 bbbbbbbbbbbbbbb']),
      line(738, [50, 'esq 4 aaaaaaaaaaaaaaa'], [320, 'dir 4 bbbbbbbbbbbbbbb']),
      line(724, [50, 'esq 5 aaaaaaaaaaaaaaa'], [320, 'dir 5 bbbbbbbbbbbbbbb'])
    ]
    const order = readingOrder(lines).map((l) => l.items.map((i) => i.text).join(' ').slice(0, 5))
    expect(order).toEqual(['TITUL', 'esq 1', 'esq 2', 'esq 3', 'esq 4', 'esq 5', 'dir 1', 'dir 2', 'dir 3', 'dir 4', 'dir 5'])
  })

  it('não mexe em texto de uma coluna', () => {
    const lines = Array.from({ length: 8 }, (_, k) => line(800 - k * 14, [50, 'linha corrida de uma coluna só que vai até o fim ' + k]))
    expect(readingOrder(lines)).toBe(lines)
  })
})

import { cleanDocName } from '../importOne.js'
describe('cleanDocName', () => {
  it('remove extensão e sublinhados', () => {
    expect(cleanDocName('Entrevista_P03__final.pdf')).toBe('Entrevista P03 final')
    expect(cleanDocName('relatorio.v2.docx')).toBe('relatorio.v2')
    expect(cleanDocName('sem-extensao')).toBe('sem-extensao')
  })
})
