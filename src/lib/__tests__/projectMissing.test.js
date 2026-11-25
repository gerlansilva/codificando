import { describe, it, expect, vi } from 'vitest'
vi.mock('../bridge.js', () => ({ bridge: { isNative: true, load: async () => null } }))
const { loadData } = await import('../../data/store.js')
const { codeFill } = await import('../network.js')

describe('projeto apagado', () => {
  it('avisa em vez de abrir vazio', async () => {
    await expect(loadData('/Users/x/Apagado.investigando')).rejects.toMatchObject({ code: 'PROJECT_MISSING' })
  })
  it('sem caminho (arquivo interno) continua abrindo vazio', async () => {
    const d = await loadData(null)
    expect(Array.isArray(d.transcripts)).toBe(true)
  })
})

describe('cor das caixas da rede', () => {
  const lum = (h) => {
    const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((x) => x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
  }
  it('texto escuro fica legível em todas as cores', () => {
    for (const c of ['#4A90E2', '#9B2C2C', '#2F855A', '#6B7280', '#C9A227']) {
      const ratio = (lum(codeFill(c)) + 0.05) / (lum('#0b1b33') + 0.05)
      expect(ratio).toBeGreaterThan(7)
    }
  })
})
