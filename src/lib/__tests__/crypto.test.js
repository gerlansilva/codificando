import { describe, expect, it } from 'vitest'
import {
  CryptoError,
  KDF_ITERATIONS,
  decryptJson,
  encryptJson,
  envelopeSalt,
  envelopeToBytes,
  isEncryptedBytes,
  isEncryptedEnvelope
} from '../crypto.js'

function project () {
  return {
    schema: 1,
    project: { name: 'Pesquisa com professores', description: 'Entrevistas — 2026' },
    transcripts: [{ id: 't1', name: 'Entrevista 1', body: 'Texto com acentuação: ção, ã, é — e emoji 🎙️' }],
    codes: [{ id: 'c1', name: 'Rotina', parentId: null }],
    excerpts: [{ id: 'e1', transcriptId: 't1', codeId: 'c1', start: 0, end: 6, text: 'Texto' }]
  }
}

describe('envelope protegido', () => {
  it('faz roundtrip preservando o projeto', async () => {
    const data = project()
    const envelope = await encryptJson(data, 'senha-secreta')

    expect(isEncryptedEnvelope(envelope)).toBe(true)
    expect(envelope.codificando.v).toBe(1)
    expect(envelope.codificando.kdf).toBe('PBKDF2-SHA256')
    expect(envelope.codificando.iter).toBe(KDF_ITERATIONS)
    expect(envelope.codificando.cipher).toBe('AES-GCM')
    expect(typeof envelope.data).toBe('string')

    await expect(decryptJson(envelope, 'senha-secreta')).resolves.toEqual(data)
  })

  it('continua sendo um JSON válido no arquivo', async () => {
    const envelope = await encryptJson(project(), 'abc12345')
    const text = JSON.stringify(envelope)
    const parsed = JSON.parse(text)

    expect(isEncryptedEnvelope(parsed)).toBe(true)
    expect(isEncryptedBytes(new TextEncoder().encode(text))).toBe(true)
    expect(isEncryptedBytes(envelopeToBytes(envelope))).toBe(true)
  })

  it('rejeita senha errada com mensagem clara', async () => {
    const envelope = await encryptJson(project(), 'certa')
    await expect(decryptJson(envelope, 'errada')).rejects.toMatchObject({
      code: 'PASSWORD_INVALID',
      message: 'Senha incorreta.'
    })
    await expect(decryptJson(envelope, '')).rejects.toBeInstanceOf(CryptoError)
  })

  it('não deixa passar conteúdo adulterado', async () => {
    const envelope = await encryptJson(project(), 'certa')
    const tampered = { ...envelope, data: envelope.data.slice(0, -4) + 'AAAA' }
    await expect(decryptJson(tampered, 'certa')).rejects.toMatchObject({ code: 'PASSWORD_INVALID' })
  })

  it('usa salt e IV aleatórios a cada cifragem', async () => {
    const a = await encryptJson(project(), 'mesma-senha')
    const b = await encryptJson(project(), 'mesma-senha')

    expect(a.codificando.salt).not.toBe(b.codificando.salt)
    expect(a.codificando.iv).not.toBe(b.codificando.iv)
    expect(a.data).not.toBe(b.data)
    expect(await decryptJson(a, 'mesma-senha')).toEqual(await decryptJson(b, 'mesma-senha'))
  })

  it('reaproveita o salt quando pedido (mesma chave, IV novo)', async () => {
    const first = await encryptJson(project(), 'senha-fixa')
    const salt = envelopeSalt(first)
    const second = await encryptJson({ schema: 1 }, 'senha-fixa', { salt })

    expect(second.codificando.salt).toBe(salt)
    expect(second.codificando.iv).not.toBe(first.codificando.iv)
    expect(await decryptJson(second, 'senha-fixa')).toEqual({ schema: 1 })
  })

  it('exige senha para cifrar', async () => {
    await expect(encryptJson(project(), '')).rejects.toMatchObject({ code: 'PASSWORD_REQUIRED' })
  })
})

describe('detecção e compatibilidade', () => {
  it('não confunde um projeto JSON simples com envelope', () => {
    const plain = project()
    expect(isEncryptedEnvelope(plain)).toBe(false)
    expect(isEncryptedEnvelope(null)).toBe(false)
    expect(isEncryptedEnvelope([])).toBe(false)
    expect(isEncryptedEnvelope({ codificando: { v: 2 } })).toBe(false)
    expect(isEncryptedBytes(new TextEncoder().encode(JSON.stringify(plain)))).toBe(false)
    expect(isEncryptedBytes('{"schema":1}')).toBe(false)
    expect(isEncryptedBytes(null)).toBe(false)
  })

  it('recusa decifrar um projeto simples em vez de tratá-lo como envelope', async () => {
    await expect(decryptJson(project(), 'qualquer')).rejects.toMatchObject({
      code: 'INVALID_ENVELOPE'
    })
  })

  it('aceita envelope como texto ou bytes', async () => {
    const envelope = await encryptJson(project(), 'senha')
    const asText = JSON.stringify(envelope)
    await expect(decryptJson(asText, 'senha')).resolves.toEqual(project())
    await expect(decryptJson(new TextEncoder().encode(asText), 'senha')).resolves.toEqual(project())
  })
})
