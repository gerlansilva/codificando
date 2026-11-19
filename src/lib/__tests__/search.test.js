import { describe, expect, it } from 'vitest'
import { makeSearchRegex, searchPattern } from '../search.js'

describe('makeSearchRegex', () => {
  it('encontra termos sem acento em texto acentuado', () => {
    expect('A ciência avança.'.match(makeSearchRegex('ciencia'))).toEqual(['ciência'])
    expect('O código foi revisado.'.match(makeSearchRegex('codigo'))).toEqual(['código'])
    expect('Foi uma ação coletiva.'.match(makeSearchRegex('acao'))).toEqual(['ação'])
  })

  it('encontra termos acentuados em texto sem acento', () => {
    expect('A ciencia avanca.'.match(makeSearchRegex('ciência'))).toEqual(['ciencia'])
    expect('O codigo foi revisado.'.match(makeSearchRegex('código'))).toEqual(['codigo'])
  })

  it('ignora diferença entre maiúsculas e minúsculas', () => {
    const re = makeSearchRegex('CIÊNCIA')
    expect('Ciência e ciência'.match(re)).toEqual(['Ciência', 'ciência'])
    expect(re.flags).toBe('gi')
  })

  it('trata caracteres especiais de regex como literais', () => {
    expect('Custa 1.500 (aprox.)'.match(makeSearchRegex('1.500'))).toEqual(['1.500'])
    expect('Custa 1x500 agora'.match(makeSearchRegex('1.500'))).toBeNull()
    expect('Use [colchetes] e (parênteses)'.match(makeSearchRegex('[colchetes]'))).toEqual(['[colchetes]'])
    expect('Caminho C:\\dados'.match(makeSearchRegex('C:\\dados'))).toEqual(['C:\\dados'])
    expect(() => makeSearchRegex('(')).not.toThrow()
    expect('a(b'.match(makeSearchRegex('('))).toEqual(['('])
  })

  it('preserva o comprimento do texto ao casar acentos', () => {
    const m = makeSearchRegex('codigo').exec('código')
    expect(m[0]).toHaveLength(6)
    expect(m.index).toBe(0)
  })

  it('lida com termo vazio', () => {
    const re = makeSearchRegex('')
    expect(re.flags).toBe('gi')
    const m = re.exec('abc')
    expect(m[0]).toBe('')
    expect(m.index).toBe(0)
  })

  it('produz o padrão com classes de acentos', () => {
    expect(searchPattern('aç')).toBe('[aáàâãäAÁÀÂÃÄ][cçCÇ]')
  })
})
