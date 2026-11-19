import { describe, expect, it, vi, afterEach } from 'vitest'
import { checkForUpdates, friendlyUpdateError, installerPercent, updaterAvailable } from '../updater.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('updater fora do app nativo', () => {
  it('não considera o updater disponível no navegador', () => {
    expect(updaterAvailable()).toBe(false)
  })

  it('devolve status "unsupported" sem tocar na rede', async () => {
    const result = await checkForUpdates()
    expect(result).toEqual({ status: 'unsupported' })
  })
})

describe('friendlyUpdateError', () => {
  it('explica falta de conexão na verificação', () => {
    const msg = friendlyUpdateError(new Error('request failed: network error'))
    expect(msg).toContain('conexão com a internet')
    expect(msg).toContain('consultar')
  })

  it('explica falta de conexão no download', () => {
    const msg = friendlyUpdateError('timed out', 'install')
    expect(msg).toContain('baixar a atualização')
  })

  it('avisa quando o canal ainda não está configurado', () => {
    expect(friendlyUpdateError(new Error('failed to decode pubkey'))).toContain('não está configurado')
  })

  it('tem mensagem padrão para erros desconhecidos', () => {
    expect(friendlyUpdateError(new Error('boom'))).toContain('Não foi possível verificar')
    expect(friendlyUpdateError(new Error('boom'), 'install')).toContain('Tente de novo mais tarde')
  })
})

describe('installerPercent', () => {
  it('calcula a porcentagem inteira e limita a 100', () => {
    expect(installerPercent(0, 0)).toBeNull()
    expect(installerPercent(50, 200)).toBe(25)
    expect(installerPercent(300, 200)).toBe(100)
  })
})
