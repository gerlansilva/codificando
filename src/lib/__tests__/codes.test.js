import { describe, expect, it } from 'vitest'
import {
  CODE_COLORS,
  codeStats,
  descendantsOf,
  flattenTree,
  mergeCodeList,
  moveCode,
  nextColor
} from '../codes.js'

/**
 * Codebook realista:
 *
 * Análise (raiz)
 * ├── Rotina
 * │   └── Falta de tempo
 * └── Expectativas
 * Medos (raiz)
 */
function codebook () {
  return [
    { id: 'analise', name: 'Análise', parentId: null, order: 1, color: '#4A90E2' },
    { id: 'expectativas', name: 'Expectativas', parentId: 'analise', order: 2, color: '#E2A64A' },
    { id: 'rotina', name: 'Rotina', parentId: 'analise', order: 1, color: '#7BB661' },
    { id: 'medos', name: 'Medos', parentId: null, order: 2, color: '#C16AA8' },
    { id: 'falta-tempo', name: 'Falta de tempo', parentId: 'rotina', order: 1, color: '#5BB8C4' }
  ]
}

describe('descendantsOf', () => {
  it('retorna todos os descendentes em profundidade', () => {
    expect(descendantsOf(codebook(), 'analise')).toEqual(['expectativas', 'rotina', 'falta-tempo'])
  })

  it('retorna lista vazia para folha ou id inexistente', () => {
    expect(descendantsOf(codebook(), 'expectativas')).toEqual([])
    expect(descendantsOf(codebook(), 'nao-existe')).toEqual([])
    expect(descendantsOf([], 'analise')).toEqual([])
  })
})

describe('flattenTree', () => {
  it('achata a árvore na ordem dos irmãos, com profundidade', () => {
    const flat = flattenTree(codebook())
    expect(flat.map(({ code, depth }) => [code.id, depth])).toEqual([
      ['analise', 0],
      ['rotina', 1],
      ['falta-tempo', 2],
      ['expectativas', 1],
      ['medos', 0]
    ])
  })

  it('considera a subárvore de um pai específico', () => {
    const flat = flattenTree(codebook(), 'rotina', 0)
    expect(flat.map(({ code, depth }) => [code.id, depth])).toEqual([
      ['falta-tempo', 0]
    ])
  })

  it('retorna vazio para codebook vazio', () => {
    expect(flattenTree([])).toEqual([])
  })
})

describe('moveCode', () => {
  it('move um código para antes de um irmão de outro nível', () => {
    const out = moveCode(codebook(), 'medos', 'rotina', 'before')
    const moved = out.find((c) => c.id === 'medos')
    expect(moved.parentId).toBe('analise')
    expect(out.filter((c) => c.parentId === 'analise').map((c) => c.id)).toContain('medos')
    const siblings = out
      .filter((c) => (c.parentId || null) === 'analise')
      .sort((a, b) => a.order - b.order)
      .map((c) => c.id)
    expect(siblings).toEqual(['medos', 'rotina', 'expectativas'])
  })

  it('move para depois de um irmão e herda o pai do alvo', () => {
    const out = moveCode(codebook(), 'expectativas', 'falta-tempo', 'after')
    const moved = out.find((c) => c.id === 'expectativas')
    expect(moved.parentId).toBe('rotina')
    const siblings = out
      .filter((c) => c.parentId === 'rotina')
      .sort((a, b) => a.order - b.order)
      .map((c) => c.id)
    expect(siblings).toEqual(['falta-tempo', 'expectativas'])
  })

  it('move para dentro do alvo, virando o último filho', () => {
    const out = moveCode(codebook(), 'medos', 'rotina', 'inside')
    const moved = out.find((c) => c.id === 'medos')
    expect(moved.parentId).toBe('rotina')
    const children = out
      .filter((c) => c.parentId === 'rotina')
      .sort((a, b) => a.order - b.order)
      .map((c) => c.id)
    expect(children).toEqual(['falta-tempo', 'medos'])
    expect(out.filter((c) => (c.parentId || null) === null).map((c) => c.id)).toEqual(['analise'])
  })

  it('recusa mover um pai para dentro do próprio descendente', () => {
    const codes = codebook()
    expect(moveCode(codes, 'analise', 'falta-tempo', 'inside')).toBe(codes)
  })

  it('ignora movimentos inválidos sem alterar a lista', () => {
    const codes = codebook()
    expect(moveCode(codes, 'analise', 'analise', 'inside')).toBe(codes)
    expect(moveCode(codes, null, 'medos', 'before')).toBe(codes)
    expect(moveCode(codes, 'medos', null, 'before')).toBe(codes)
    expect(moveCode(codes, 'nao-existe', 'medos', 'before')).toBe(codes)
    expect(moveCode(codes, 'medos', 'nao-existe', 'before')).toBe(codes)
  })
})

describe('mergeCodeList', () => {
  it('absorve o código de origem e reativa os filhos no destino', () => {
    const out = mergeCodeList(codebook(), 'rotina', 'medos')
    expect(out.find((c) => c.id === 'rotina')).toBeUndefined()
    expect(out.find((c) => c.id === 'falta-tempo').parentId).toBe('medos')
    expect(out.find((c) => c.id === 'medos').parentId).toBeNull()
    expect(out).toHaveLength(4)
  })

  it('absorve um pai no próprio filho sem criar ciclo', () => {
    const out = mergeCodeList(codebook(), 'analise', 'rotina')
    expect(out.find((c) => c.id === 'analise')).toBeUndefined()
    expect(out.find((c) => c.id === 'rotina').parentId).toBeNull()
    expect(out.find((c) => c.id === 'expectativas').parentId).toBe('rotina')
    expect(out.find((c) => c.id === 'falta-tempo').parentId).toBe('rotina')
  })

  it('ignora mesclagens inválidas', () => {
    const codes = codebook()
    expect(mergeCodeList(codes, 'rotina', 'rotina')).toBe(codes)
    expect(mergeCodeList(codes, null, 'rotina')).toBe(codes)
    expect(mergeCodeList(codes, 'nao-existe', 'rotina')).toBe(codes)
    expect(mergeCodeList([], 'a', 'b')).toEqual([])
  })
})

describe('codeStats', () => {
  it('conta trechos diretos e o total incluindo descendentes', () => {
    const excerpts = [
      { codeId: 'analise' },
      { codeId: 'rotina' },
      { codeId: 'rotina' },
      { codeId: 'falta-tempo' },
      { codeId: 'medos' }
    ]
    const stats = codeStats(codebook(), excerpts)
    expect(stats.get('analise')).toEqual({ direct: 1, total: 4 })
    expect(stats.get('rotina')).toEqual({ direct: 2, total: 3 })
    expect(stats.get('falta-tempo')).toEqual({ direct: 1, total: 1 })
    expect(stats.get('expectativas')).toEqual({ direct: 0, total: 0 })
    expect(stats.get('medos')).toEqual({ direct: 1, total: 1 })
  })

  it('zera todos os códigos quando não há trechos', () => {
    const stats = codeStats(codebook(), [])
    expect(stats.size).toBe(5)
    expect([...stats.values()].every((s) => s.direct === 0 && s.total === 0)).toBe(true)
  })

  it('retorna mapa vazio sem códigos', () => {
    expect(codeStats([], [])).toEqual(new Map())
  })
})

describe('nextColor', () => {
  it('percorre a paleta e volta ao início', () => {
    expect(nextColor([])).toBe(CODE_COLORS[0])
    expect(nextColor([{ id: 'a' }])).toBe(CODE_COLORS[1])
    expect(nextColor(new Array(CODE_COLORS.length).fill({ id: 'x' }))).toBe(CODE_COLORS[0])
    expect(nextColor(new Array(CODE_COLORS.length + 1).fill({ id: 'x' }))).toBe(CODE_COLORS[1])
  })
})
