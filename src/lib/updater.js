/**
 * Atualizações do app (tauri-plugin-updater).
 *
 * O app é 100% local: nada é verificado em segundo plano. Só há uma consulta
 * quando o usuário clica em "Verificar atualizações" nas Configurações, e o
 * download só começa depois de uma confirmação explícita. Sem internet, a
 * verificação apenas falha com uma mensagem amigável e o app segue funcionando.
 */

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

/** Tempo máximo da consulta ao servidor de releases (ms). */
export const UPDATE_TIMEOUT_MS = 15000

/** Só faz sentido no app nativo; no navegador (dev) não há updater. */
export function updaterAvailable () {
  return isTauri
}

/** Traduz erros do plugin/rede em uma mensagem curta em português. */
export function friendlyUpdateError (err, action = 'check') {
  const raw = String(err?.message || err || '').toLowerCase()
  const suffix = action === 'install'
    ? 'Não foi possível baixar a atualização. Verifique a conexão com a internet e tente de novo.'
    : 'Não foi possível consultar as atualizações. Verifique a conexão com a internet e tente de novo.'
  if (/network|dns|connect|offline|timed? ?out|timeout|request|failed to fetch|unreachable/.test(raw)) {
    return suffix
  }
  if (/pubkey|public key|signature|decode|not configured/.test(raw)) {
    return 'O canal de atualizações ainda não está configurado nesta versão do app.'
  }
  if (/permission|not allowed|denied/.test(raw)) {
    return 'O app não tem permissão para verificar atualizações.'
  }
  return action === 'install'
    ? 'Não foi possível concluir a atualização. Tente de novo mais tarde.'
    : 'Não foi possível verificar atualizações agora.'
}

/**
 * Consulta o endpoint configurado. Nunca lança: devolve sempre um estado.
 * @returns {Promise<
 *   { status: 'unsupported' } |
 *   { status: 'latest', version: string } |
 *   { status: 'available', update: object, version: string, currentVersion: string, notes: string, date: string } |
 *   { status: 'error', message: string }
 * >}
 */
export async function checkForUpdates () {
  if (!updaterAvailable()) return { status: 'unsupported' }
  try {
    const { check } = await import('@tauri-apps/plugin-updater')
    const update = await check({ timeout: UPDATE_TIMEOUT_MS })
    if (!update) return { status: 'latest', version: '' }
    return {
      status: 'available',
      update,
      version: update.version,
      currentVersion: update.currentVersion,
      notes: update.body || '',
      date: update.date || ''
    }
  } catch (err) {
    return { status: 'error', message: friendlyUpdateError(err) }
  }
}

/**
 * Baixa e instala a atualização já consultada. Quem chama deve confirmar antes.
 * @param {object} update instância devolvida por checkForUpdates()
 * @param {(progress:{downloaded:number,total:number,percent:number|null})=>void} [onProgress]
 */
export function installerPercent (downloaded, total) {
  const done = Number(downloaded) || 0
  const size = Number(total) || 0
  if (size <= 0) return null
  return Math.min(100, Math.round((done / size) * 100))
}

export async function installUpdate (update, onProgress) {
  if (!update) throw new Error('Nenhuma atualização para instalar.')
  let downloaded = 0
  let total = 0
  await update.downloadAndInstall((event) => {
    if (event?.event === 'Started') {
      total = Number(event.data?.contentLength) || 0
    } else if (event?.event === 'Progress') {
      downloaded += Number(event.data?.chunkLength) || 0
      onProgress?.({
        downloaded,
        total,
        percent: installerPercent(downloaded, total)
      })
    } else if (event?.event === 'Finished') {
      onProgress?.({ downloaded, total, percent: 100 })
    }
  })
}

/** Reinicia o app para rodar a versão recém-instalada (macOS/Linux). */
export async function relaunchApp () {
  const { relaunch } = await import('@tauri-apps/plugin-process')
  await relaunch()
}

/** Descarta a atualização consultada sem instalar. */
export async function dismissUpdate (update) {
  try {
    await update?.close?.()
  } catch {
    /* recurso já liberado */
  }
}

/** Versão em execução, quando disponível. */
export async function currentVersion () {
  if (!isTauri) return ''
  try {
    const { getVersion } = await import('@tauri-apps/api/app')
    return await getVersion()
  } catch {
    return ''
  }
}
