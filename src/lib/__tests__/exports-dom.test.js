// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { blobToBase64 } from '../exports.js'

/**
 * Este é o único teste que precisa do jsdom: `blobToBase64` usa FileReader.
 * A geração do DOCX fica no ambiente node (exports.test.js).
 */
describe('blobToBase64', () => {
  it('converte o Blob em base64 sem o prefixo data:', async () => {
    const blob = new Blob(['relatório de teste'], { type: 'text/plain' })
    const base64 = await blobToBase64(blob)

    expect(base64).not.toContain('data:')
    expect(Buffer.from(base64, 'base64').toString('utf8')).toBe('relatório de teste')
  })

  it('devolve string vazia para Blob vazio', async () => {
    expect(await blobToBase64(new Blob([]))).toBe('')
  })
})
