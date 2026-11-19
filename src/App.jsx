import React, { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadData, saveData, uid, emptyData, loadSettings, saveSettings, setProjectPath, getProjectPath, onSaveStatus, retrySave, touchRecentProject, flushNow, isProjectProtected, rememberPassword, setProjectPassword, forgetProjectPassword, checkProjectPassword } from './data/store.js'
import { deleteBinary } from './lib/files.js'
import { moveCode as moveCodeFn, nextColor, mergeCodeList } from './lib/codes.js'
import { bridge } from './lib/bridge.js'
import { modKey } from './lib/platform.js'
import Sidebar from './components/Sidebar.jsx'
import AddTranscript from './pages/AddTranscript.jsx'
import Transcripts from './pages/Transcripts.jsx'
import Editor from './pages/Editor.jsx'
import Codebook from './pages/Codebook.jsx'
import Snippets from './pages/Snippets.jsx'
import Reports from './pages/Reports.jsx'
import Networks from './pages/Networks.jsx'
import Search from './pages/Search.jsx'
import Comments from './pages/Comments.jsx'
import Settings from './pages/Settings.jsx'
import Home from './pages/Home.jsx'
import SaveStatus from './components/SaveStatus.jsx'
import Consultas from './pages/Consultas.jsx'
import Print from './pages/Print.jsx'
import PasswordModal from './components/PasswordModal.jsx'

const DataContext = createContext(null)
export const useData = () => useContext(DataContext)

const ROUTES = ['transcripts', 'new', 'codes', 'snippets', 'comments', 'consultas', 'reports', 'networks', 'search', 'settings', 'home', 'print']

function parseHash () {
  const raw = window.location.hash.replace(/^#\/?/, '')
  const [pathPart, queryPart] = raw.split('?')
  const params = new URLSearchParams(queryPart || '')
  const page = Number(params.get('page')) || null
  const excerpt = params.get('excerpt') || null
  const find = params.get('find') || null
  const occ = params.get('occ') !== null ? Number(params.get('occ')) : null
  const inspect = params.get('inspect') || null
  const parts = pathPart.split('/').filter(Boolean)
  if (!parts.length) return { name: 'transcripts' }
  if (parts[0] === 'documents' && parts[1]) {
    if (parts[1] === 'new') return { name: 'new' }
    if (parts[2] === 'print') return { name: 'print', id: parts[1] }
    return { name: 'transcript', id: parts[1], page, excerpt, find, occ, inspect }
  }
  // compatibilidade com URLs antigas
  if (parts[0] === 'transcripts' && parts[1]) {
    if (parts[1] === 'new') return { name: 'new' }
    if (parts[2] === 'print') return { name: 'print', id: parts[1] }
    return { name: 'transcript', id: parts[1], page, excerpt, find, occ, inspect }
  }
  if (parts[0] === 'documents' || parts[0] === 'transcripts') return { name: 'documents' }
  if (ROUTES.includes(parts[0])) return { name: parts[0] }
  return { name: 'transcripts' }
}

export function navigate (path) {
  window.location.hash = path.startsWith('#') ? path : '#/' + path.replace(/^\//, '')
}

export default function App () {
  const [route, setRoute] = useState(parseHash)
  const [saveError, setSaveError] = useState(null)
  const [fileNotice, setFileNotice] = useState(null)
  const [data, setData] = useState(null)
  const [ready, setReady] = useState(false)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('investigando.sidebar') === 'collapsed')
  const [settings, setSettings] = useState(() => loadSettings())
  const [projectMenu, setProjectMenu] = useState(false)
  const [editingProject, setEditingProject] = useState(false)
  const [projectDraft, setProjectDraft] = useState('')
  const cancelProjectRef = useRef(false)
  const [protectedNow, setProtectedNow] = useState(false)
  const [pwModal, setPwModal] = useState(null)
  const [pwError, setPwError] = useState(null)
  const [pwBusy, setPwBusy] = useState(false)
  const dataRef = useRef(null)
  const historyRef = useRef({ past: [], future: [] })
  const autoOpenedRef = useRef(false)

  useEffect(() => onSaveStatus((s) => {
    if (s.ok === false) setSaveError(s.message || 'erro desconhecido')
    else if (s.ok === true) setSaveError(null)
  }), [])

  useEffect(() => {
    localStorage.setItem('investigando.sidebar', collapsed ? 'collapsed' : 'open')
  }, [collapsed])

  // aviso discreto quando o arquivo do projeto muda no disco (sem recarregar)
  useEffect(() => {
    if (!ready) return
    let off = () => {}
    let cancelled = false
    bridge.watchProject(getProjectPath(), () => {
      setFileNotice('O arquivo do projeto foi alterado no disco.')
    }).then((fn) => {
      if (cancelled) fn()
      else off = fn
    }).catch(() => {})
    return () => { cancelled = true; off() }
  }, [ready])

  // retoma no último documento: cai direto na área de codificação
  useEffect(() => {
    if (!ready || !data || autoOpenedRef.current) return
    autoOpenedRef.current = true
    if (route.name !== 'documents' && route.name !== 'transcripts') return
    const id = localStorage.getItem('codificando.lastDoc')
    if (!id || !data.transcripts.some((t) => t.id === id)) return
    navigate('/documents/' + id)
  }, [ready, data, route.name])

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === '\\' || e.key.toLowerCase() === 'b')) {
        e.preventDefault()
        setCollapsed((c) => !c)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!projectMenu) return
    const close = () => setProjectMenu(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [projectMenu])

  useEffect(() => {
    const st = loadSettings()
    if (st.projectPath) setProjectPath(st.projectPath)
    let cancelled = false

    const boot = async () => {
      const path = getProjectPath()
      try {
        const d = normalizeData(await loadData(path))
        if (cancelled) return
        if (path) touchRecentProject(path, d.project?.name)
        setProtectedNow(isProjectProtected(path))
        setData(d)
        dataRef.current = d
        setReady(true)
      } catch (err) {
        if (cancelled) return
        if (err?.code === 'PASSWORD_REQUIRED' || err?.code === 'PASSWORD_INVALID') {
          // não inicializa um projeto vazio por cima de um arquivo cifrado
          setPwError(err.code === 'PASSWORD_INVALID' ? 'Senha incorreta.' : null)
          setPwModal({ mode: 'unlock', path, boot: true })
          setReady(true)
          return
        }
        console.error('Falha ao carregar dados:', err)
        const d = emptyData()
        setData(d)
        dataRef.current = d
        setReady(true)
      }
    }

    boot()
    const onHash = () => setRoute(parseHash())
    window.addEventListener('hashchange', onHash)
    return () => {
      cancelled = true
      window.removeEventListener('hashchange', onHash)
    }
  }, [])

  const update = useCallback((fn, opts = {}) => {
    setData((prev) => {
      const next = typeof fn === 'function' ? fn(prev) : fn
      const touchesCoding = next.codes !== prev.codes || next.excerpts !== prev.excerpts
      if (opts.record !== false && touchesCoding) {
        historyRef.current.past.push({ codes: prev.codes, excerpts: prev.excerpts })
        if (historyRef.current.past.length > 100) historyRef.current.past.shift()
        historyRef.current.future = []
      }
      dataRef.current = next
      saveData(next)
      return next
    })
  }, [])

  const applySnapshot = useCallback((from, to) => {
    const stack = historyRef.current
    const snap = stack[from].pop()
    if (!snap) return
    stack[to].push({ codes: dataRef.current.codes, excerpts: dataRef.current.excerpts })
    setData((prev) => {
      const next = { ...prev, ...snap }
      dataRef.current = next
      saveData(next)
      return next
    })
  }, [])

  const undo = useCallback(() => applySnapshot('past', 'future'), [applySnapshot])
  const redo = useCallback(() => applySnapshot('future', 'past'), [applySnapshot])

  /** Recarrega o arquivo do projeto sem salvar por cima (usado após restaurar backup). */
  const reloadProject = useCallback(async () => {
    const d = normalizeData(await loadData())
    setData(d)
    dataRef.current = d
    setProtectedNow(isProjectProtected(getProjectPath()))
    return d
  }, [])

  /** Aplica um projeto já aberto (e lembrado) na tela. */
  const finishOpen = useCallback((path, d) => {
    setProjectPath(path)
    setSettings(saveSettings({ projectPath: path }))
    if (path) touchRecentProject(path, d.project?.name)
    setData(d)
    dataRef.current = d
    setProtectedNow(isProjectProtected(path))
    bridge.setWatchedProject(path)
    return path
  }, [])

  /** Abre um projeto já conhecido (recentes) sem passar pelo diálogo. */
  const openProjectAt = useCallback(async (path) => {
    if (!path) return null
    const previous = getProjectPath()
    try {
      // não troca o caminho atual antes de conseguir ler: evita que um
      // salvamento pendente do projeto aberto caia no arquivo novo
      const d = normalizeData(await loadData(path))
      finishOpen(path, d)
      navigate('/home')
      return path
    } catch (err) {
      if (err?.code === 'PASSWORD_REQUIRED' || err?.code === 'PASSWORD_INVALID') {
        setPwError(err.code === 'PASSWORD_INVALID' ? 'Senha incorreta.' : null)
        setPwModal({ mode: 'unlock', path, previousPath: previous })
        return null
      }
      throw err
    }
  }, [finishOpen])

  /** Fecha o modal de senha (cancelar / manter sem senha). */
  const closePasswordModal = useCallback(() => {
    const modal = pwModal
    setPwModal(null)
    setPwError(null)

    if (modal?.mode === 'saveAs') {
      modal.resolve?.({ protect: false })
      return
    }
    if (modal?.boot) {
      // arquivo protegido sem senha: começa sem projeto em vez de sobrescrevê-lo
      // (o caminho fica nas configurações para o próximo início pedir a senha)
      setProjectPath(null)
      const d = emptyData()
      setData(d)
      dataRef.current = d
      setProtectedNow(false)
      navigate('/home')
      return
    }
    if (modal && modal.previousPath !== undefined) {
      setProjectPath(modal.previousPath)
      setSettings(saveSettings({ projectPath: modal.previousPath || null }))
      setProtectedNow(isProjectProtected(modal.previousPath))
    }
  }, [pwModal])

  const askSaveProtection = useCallback(() => new Promise((resolve) => {
    setPwError(null)
    setPwModal({ mode: 'saveAs', resolve })
  }), [])

  const requestPasswordAction = useCallback((mode) => {
    if (!getProjectPath()) return false
    setPwError(null)
    setPwModal({ mode })
    return true
  }, [])

  /** Executa a ação do modal de senha. Senhas ficam só na memória do store. */
  const handlePasswordSubmit = useCallback(async (payload) => {
    const modal = pwModal
    if (!modal) return
    setPwBusy(true)
    setPwError(null)
    try {
      if (modal.mode === 'unlock') {
        const path = modal.path
        rememberPassword(path, payload)
        const d = normalizeData(await loadData(path))
        finishOpen(path, d)
        setPwModal(null)
        if (!modal.boot) navigate('/home')
      } else if (modal.mode === 'create') {
        setProjectPassword(getProjectPath(), payload.password)
        await flushNow(dataRef.current)
        setProtectedNow(true)
        setPwModal(null)
      } else if (modal.mode === 'change') {
        if (!checkProjectPassword(getProjectPath(), payload.current)) throw new Error('Senha atual incorreta.')
        setProjectPassword(getProjectPath(), payload.password)
        await flushNow(dataRef.current)
        setProtectedNow(true)
        setPwModal(null)
      } else if (modal.mode === 'remove') {
        if (!checkProjectPassword(getProjectPath(), payload.current)) throw new Error('Senha atual incorreta.')
        forgetProjectPassword(getProjectPath())
        await flushNow(dataRef.current)
        setProtectedNow(false)
        setPwModal(null)
      } else if (modal.mode === 'saveAs') {
        modal.resolve?.({ protect: true, password: payload.password })
        setPwModal(null)
      }
    } catch (err) {
      if (err?.code === 'PASSWORD_INVALID' || err?.code === 'PASSWORD_REQUIRED') setPwError('Senha incorreta.')
      else setPwError(String(err?.message || err))
    } finally {
      setPwBusy(false)
    }
  }, [pwModal, finishOpen])

  useEffect(() => {
    const SECTION_KEYS = {
      1: '/documents',
      2: '/codes',
      3: '/snippets',
      4: '/networks',
      5: '/comments',
      6: '/reports'
    }
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && SECTION_KEYS[e.key]) {
        e.preventDefault()
        navigate(SECTION_KEYS[e.key])
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        navigate('/search')
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo(); else undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  const api = useMemo(() => ({
    data,
    settings,
    protected: protectedNow,
    openPasswordAction: requestPasswordAction,
    update,
    undo,
    redo,
    openProjectAt,
    reloadProject,
    createTranscript: (name, body, extra = {}) => {
      const t = {
        id: uid(),
        name: name?.trim() || 'Sem título',
        body,
        rendererType: 'text',
        ...extra,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      update((d) => ({ ...d, transcripts: [t, ...d.transcripts] }))
      return t
    },
    addPdfExcerpt: (transcriptId, codeId, pages, quoteId) => {
      const now = new Date().toISOString()
      const qid = quoteId || uid()
      const items = pages.map((p) => ({
        id: uid(),
        quoteId: qid,
        transcriptId,
        codeId,
        page: p.page,
        rects: p.rects,
        text: p.text,
        layer: 1,
        createdAt: now
      }))
      update((d) => ({ ...d, excerpts: [...d.excerpts, ...items] }))
      return qid
    },
    updateTranscript: (id, patch) => {
      update((d) => ({
        ...d,
        transcripts: d.transcripts.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t))
      }))
    },
    deleteTranscript: (id) => {
      const t = data?.transcripts.find((x) => x.id === id)
      if (t?.fileKey) deleteBinary(t.fileKey)
      update((d) => {
        const excerpts = d.excerpts.filter((e) => e.transcriptId !== id)
        return {
          ...d,
          transcripts: d.transcripts.filter((t) => t.id !== id),
          excerpts,
          memos: cleanMemos(d.memos, excerpts),
          queries: (d.queries || []).map((q) => ({ ...q, docs: (q.docs || []).filter((x) => x !== id) }))
        }
      })
    },
    createCode: (name) => {
      const existing = (data?.codes || []).find((c) => c.name.toLowerCase() === name.trim().toLowerCase())
      if (existing) return existing
      const roots = (data?.codes || []).filter((c) => !c.parentId)
      const code = {
        id: uid(),
        name: name.trim(),
        color: nextColor(data?.codes || []),
        parentId: null,
        order: (roots.reduce((m, c) => Math.max(m, c.order ?? 0), 0) || 0) + 1,
        createdAt: new Date().toISOString()
      }
      update((d) => ({ ...d, codes: [...d.codes, code] }))
      return code
    },
    moveCode: (dragId, targetId, mode) => {
      update((d) => ({ ...d, codes: moveCodeFn(d.codes, dragId, targetId, mode) }))
    },
    updateCode: (id, patch) => {
      update((d) => ({ ...d, codes: d.codes.map((c) => (c.id === id ? { ...c, ...patch } : c)) }))
    },
    deleteCode: (id) => {
      update((d) => {
        const victim = d.codes.find((c) => c.id === id)
        const parent = victim?.parentId || null
        return {
          ...d,
          // filhos sobem um nível em vez de desaparecer
          codes: d.codes
            .filter((c) => c.id !== id)
            .map((c) => (c.parentId === id ? { ...c, parentId: parent } : c)),
          excerpts: d.excerpts.filter((e) => e.codeId !== id),
          codeLinks: (d.codeLinks || []).filter((l) => l.from !== id && l.to !== id),
          nodeLinks: (d.nodeLinks || []).filter((l) => l.from !== 'c:' + id && l.to !== 'c:' + id),
          memos: cleanMemos(d.memos, d.excerpts.filter((e) => e.codeId !== id)),
          queries: (d.queries || []).map((q) => ({ ...q, codes: (q.codes || []).filter((x) => x !== id) }))
        }
      })
    },
    mergeCodes: (fromId, intoId) => {
      if (!fromId || !intoId || fromId === intoId) return
      update((d) => {
        const codes = mergeCodeList(d.codes, fromId, intoId)
        if (codes === d.codes) return d
        const excerpts = d.excerpts.map((e) => (e.codeId === fromId ? { ...e, codeId: intoId } : e))
        return { ...d, codes, excerpts, memos: cleanMemos(d.memos, excerpts) }
      })
    },
    moveExcerpts: (ids, codeId) => {
      const set = new Set(ids)
      update((d) => ({
        ...d,
        excerpts: d.excerpts.map((e) => (set.has(e.id) ? { ...e, codeId } : e))
      }))
    },
    removeExcerpts: (ids) => {
      const set = new Set(ids)
      update((d) => {
        const excerpts = d.excerpts.filter((e) => !set.has(e.id))
        const alive = new Set(excerpts.map((e) => String(e.quoteId || e.id)))
        return {
          ...d,
          excerpts,
          memos: cleanMemos(d.memos, excerpts),
          quoteLinks: (d.quoteLinks || []).filter((l) => alive.has(l.from) && alive.has(l.to)),
          nodeLinks: (d.nodeLinks || []).filter((l) => (
            (!l.from.startsWith('q:') || alive.has(l.from.slice(2))) &&
            (!l.to.startsWith('q:') || alive.has(l.to.slice(2)))
          ))
        }
      })
    },
    moveExcerpt: (excerptId, codeId) => {
      update((d) => ({
        ...d,
        excerpts: d.excerpts.map((e) => (e.id === excerptId ? { ...e, codeId } : e))
      }))
    },
    reorderCode: (id, dir) => {
      update((d) => {
        const sorted = [...d.codes].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        const i = sorted.findIndex((c) => c.id === id)
        const j = i + dir
        if (i < 0 || j < 0 || j >= sorted.length) return d
        const tmp = sorted[i]
        sorted[i] = sorted[j]
        sorted[j] = tmp
        return { ...d, codes: sorted.map((c, idx) => ({ ...c, order: idx + 1 })) }
      })
    },
    addExcerpt: (transcriptId, codeId, start, end, quoteId) => {
      const t = data?.transcripts.find((x) => x.id === transcriptId)
      if (!t) return
      const text = t.body.slice(start, end)
      const qid = quoteId || uid()
      const ex = {
        id: uid(),
        quoteId: qid,
        transcriptId,
        codeId,
        start,
        end,
        text,
        createdAt: new Date().toISOString()
      }
      update((d) => ({ ...d, excerpts: [...d.excerpts, ex] }))
      return qid
    },
    addQuoteLink: (fromQuoteId, toQuoteId, type, label = '') => {
      if (!fromQuoteId || !toQuoteId || fromQuoteId === toQuoteId) return
      update((d) => {
        const exists = (d.quoteLinks || []).some(
          (l) => (l.from === fromQuoteId && l.to === toQuoteId) || (l.from === toQuoteId && l.to === fromQuoteId)
        )
        if (exists) return d
        return {
          ...d,
          quoteLinks: [...(d.quoteLinks || []), {
            id: uid(), from: fromQuoteId, to: toQuoteId, type, label, createdAt: new Date().toISOString()
          }]
        }
      })
    },
    updateQuoteLink: (id, patch) => {
      update((d) => ({
        ...d,
        quoteLinks: (d.quoteLinks || []).map((l) => (l.id === id ? { ...l, ...patch } : l))
      }))
    },
    removeQuoteLink: (id) => {
      update((d) => ({ ...d, quoteLinks: (d.quoteLinks || []).filter((l) => l.id !== id) }))
    },
    addCodeLink: (fromCodeId, toCodeId, type, label = '') => {
      if (!fromCodeId || !toCodeId || fromCodeId === toCodeId) return
      update((d) => {
        const exists = (d.codeLinks || []).some(
          (l) => (l.from === fromCodeId && l.to === toCodeId) || (l.from === toCodeId && l.to === fromCodeId)
        )
        if (exists) return d
        return {
          ...d,
          codeLinks: [...(d.codeLinks || []), {
            id: uid(), from: fromCodeId, to: toCodeId, type, label, createdAt: new Date().toISOString()
          }]
        }
      })
    },
    updateCodeLink: (id, patch) => {
      update((d) => ({
        ...d,
        codeLinks: (d.codeLinks || []).map((l) => (l.id === id ? { ...l, ...patch } : l))
      }))
    },
    removeCodeLink: (id) => {
      update((d) => ({ ...d, codeLinks: (d.codeLinks || []).filter((l) => l.id !== id) }))
    },
    addNodeLink: (fromNodeId, toNodeId, type, label = '') => {
      if (!fromNodeId || !toNodeId || fromNodeId === toNodeId) return
      update((d) => {
        const exists = (d.nodeLinks || []).some(
          (l) => (l.from === fromNodeId && l.to === toNodeId) || (l.from === toNodeId && l.to === fromNodeId)
        )
        if (exists) return d
        return {
          ...d,
          nodeLinks: [...(d.nodeLinks || []), {
            id: uid(), from: fromNodeId, to: toNodeId, type, label, createdAt: new Date().toISOString()
          }]
        }
      })
    },
    updateNodeLink: (id, patch) => {
      update((d) => ({
        ...d,
        nodeLinks: (d.nodeLinks || []).map((l) => (l.id === id ? { ...l, ...patch } : l))
      }))
    },
    removeNodeLink: (id) => {
      update((d) => ({ ...d, nodeLinks: (d.nodeLinks || []).filter((l) => l.id !== id) }))
    },
    setProjectMeta: (patch) => {
      update((d) => ({ ...d, project: { ...d.project, ...patch } }))
    },
    setProfile: (patch) => {
      setSettings(saveSettings({ profile: { ...(settings?.profile || {}), ...patch } }))
    },
    newProject: (name, description) => {
      setProjectPath(null)
      setSettings(saveSettings({ projectPath: null }))
      setProtectedNow(false)
      const d = emptyData()
      d.project.name = (name || '').trim() || 'Projeto sem título'
      d.project.description = (description || '').trim()
      setData(d)
      dataRef.current = d
      saveData(d)
      navigate('/home')
    },
    saveProjectAs: async () => {
      const suggestion = ((dataRef.current?.project.name || 'Projeto').replace(/[\/:*?"<>|]/g, '-')) + '.investigando'
      const path = await bridge.savePanel(suggestion)
      if (!path) return null
      const decision = await askSaveProtection()
      setProjectPath(path)
      setSettings(saveSettings({ projectPath: path }))
      if (decision?.protect && decision.password) setProjectPassword(path, decision.password)
      else forgetProjectPassword(path)
      setProtectedNow(!!decision?.protect)
      touchRecentProject(path, dataRef.current?.project?.name)
      bridge.setWatchedProject(path)
      await flushNow(dataRef.current)
      return path
    },
    saveNow () {
      const d = dataRef.current
      if (!d) return
      if (getProjectPath()) saveData(d)
      else this.saveProjectAs()
    },
    openProject: async () => {
      const path = await bridge.openPanel()
      if (!path) return null
      return openProjectAt(path)
    },
    repairExcerptTexts: (transcriptId, map) => {
      update((d) => ({
        ...d,
        excerpts: d.excerpts.map((e) => (
          e.transcriptId === transcriptId && map[e.id] ? { ...e, text: map[e.id] } : e
        ))
      }))
    },
    saveMemo: (quoteId, text, kind = 'memo') => {
      update((d) => {
        const memos = (d.memos || []).filter(
          (m) => !(m.quoteId === quoteId && (m.kind || 'memo') === kind)
        )
        if (text.trim()) {
          memos.push({ id: uid(), quoteId, kind, text: text.trim(), updatedAt: new Date().toISOString() })
        }
        return { ...d, memos }
      })
    },
    removeExcerpt: (id) => {
      update((d) => ({ ...d, excerpts: d.excerpts.filter((e) => e.id !== id) }))
    }
  }), [data, settings, protectedNow, requestPasswordAction, update, openProjectAt, reloadProject, askSaveProtection])

  if (!ready) {
    return <div style={{ padding: 40, fontFamily: 'Helvetica Neue, sans-serif' }}>Carregando…</div>
  }

  if (!data) {
    // arquivo protegido: nada do projeto é montado antes da senha correta
    return (
      <PasswordModal
        mode="unlock"
        error={pwError}
        busy={pwBusy}
        onSubmit={handlePasswordSubmit}
        onCancel={closePasswordModal}
      />
    )
  }

  const transcript = route.id ? data.transcripts.find((t) => t.id === route.id) : null

  return (
    <DataContext.Provider value={api}>
      {saveError && (
        <div className="save-error" role="alert">
          <strong>Não foi possível salvar o projeto.</strong>
          <span>{saveError}</span>
          <button onClick={retrySave}>Tentar de novo</button>
        </div>
      )}
      {fileNotice && (
        <div className="file-notice" role="status">
          <span>{fileNotice} Reabra o projeto para carregar as mudanças.</span>
          <button onClick={() => setFileNotice(null)}>Dispensar</button>
        </div>
      )}
      <div className={'app' + (collapsed ? ' sidebar-collapsed' : '')}>
        <div className="drag-strip" />
        {collapsed && (
          <button className="sidebar-reopen" title={`Mostrar menu (${modKey('B')})`} onClick={() => setCollapsed(false)}>
            <span aria-hidden="true">☰</span>
          </button>
        )}
        <Sidebar
          route={route}
          collapsed={collapsed}
          onCollapse={() => setCollapsed(true)}
        />
        <div className="content">
          <div className="app-top">
            <div className="app-project-wrap">
              {editingProject
                ? (
                  <input
                    className="app-project-input"
                    value={projectDraft}
                    autoFocus
                    aria-label="Nome do projeto"
                    onChange={(e) => setProjectDraft(e.target.value)}
                    onBlur={() => {
                      if (cancelProjectRef.current) {
                        cancelProjectRef.current = false
                        setEditingProject(false)
                        return
                      }
                      const name = projectDraft.trim()
                      if (name && name !== data.project.name) api.setProjectMeta({ name })
                      setEditingProject(false)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur()
                      if (e.key === 'Escape') {
                        cancelProjectRef.current = true
                        e.currentTarget.blur()
                      }
                    }}
                  />
                )
                : (
                  <button
                    className="app-project"
                    onClick={() => { setProjectDraft(data.project.name); setEditingProject(true) }}
                    title="Clique para renomear o projeto"
                  >
                    {data.project.name}
                  </button>
                )}
              <button
                className="app-project-more"
                title="Menu do projeto"
                aria-label="Menu do projeto"
                onClick={() => setProjectMenu((v) => !v)}
              >
                ⋯
              </button>
              {projectMenu && (
                <div className="dropdown-menu app-project-menu" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => { setProjectMenu(false); navigate('/home') }}>
                    Visão geral do projeto
                    <small>Documentos, códigos e números do estudo</small>
                  </button>
                  <button onClick={() => { setProjectMenu(false); setProjectDraft(data.project.name); setEditingProject(true) }}>
                    Renomear projeto
                    <small>O nome aparece no alto de todas as abas</small>
                  </button>
                  <button onClick={() => { setProjectMenu(false); api.openProject() }}>
                    Abrir projeto…
                    <small>Escolher um arquivo .investigando</small>
                  </button>
                  <button onClick={() => { setProjectMenu(false); api.saveProjectAs() }}>
                    Salvar como…
                    <small>Gravar o projeto em outro arquivo</small>
                  </button>
                  {protectedNow
                    ? (
                      <>
                        <button onClick={() => { setProjectMenu(false); api.openPasswordAction('change') }}>
                          Trocar senha…
                          <small>Alterar a senha do arquivo do projeto</small>
                        </button>
                        <button onClick={() => { setProjectMenu(false); api.openPasswordAction('remove') }}>
                          Remover senha…
                          <small>Voltar a gravar o projeto em JSON simples</small>
                        </button>
                      </>
                      )
                    : (
                      <button onClick={() => { setProjectMenu(false); if (getProjectPath()) api.openPasswordAction('create'); else api.saveProjectAs() }}>
                        Proteger com senha…
                        <small>Gravar o projeto cifrado (AES-GCM 256)</small>
                      </button>
                      )}
                  <button onClick={() => { setProjectMenu(false); bridge.dataPath().then((p) => p && bridge.revealPath(p)) }}>
                    Mostrar pasta de dados
                    <small>Arquivos locais do aplicativo</small>
                  </button>
                  <button onClick={() => { setProjectMenu(false); navigate('/settings') }}>
                    Backups do projeto
                    <small>Histórico de versões do arquivo atual</small>
                  </button>
                </div>
              )}
            </div>
            <SaveStatus />
          </div>
          {route.name === 'home' && <Home />}
          {route.name === 'transcripts' && <Transcripts />}
          {route.name === 'documents' && <Transcripts />}
          {route.name === 'new' && <AddTranscript />}
          {route.name === 'transcript' && transcript && <Editor transcript={transcript} focusPage={route.page} focusExcerpt={route.excerpt} findTerm={route.find} findOcc={route.occ} inspectQuote={route.inspect} />}
          {route.name === 'transcript' && !transcript && (
            <div className="empty">
              <h2>Documento não encontrado</h2>
              <p>Ele pode ter sido excluído ou o projeto mudou.</p>
              <div className="empty-actions">
                <button className="btn btn--blue" onClick={() => navigate('/home')}>Ir para o projeto</button>
                <button className="btn" onClick={() => navigate('/documents')}>Ver documentos</button>
              </div>
            </div>
          )}
          {route.name === 'codes' && <Codebook />}
          {route.name === 'snippets' && <Snippets />}
          {route.name === 'comments' && <Comments />}
          {route.name === 'settings' && <Settings />}
          {route.name === 'consultas' && <Consultas />}
          {route.name === 'reports' && <Reports />}
          {route.name === 'networks' && <Networks />}
          {route.name === 'search' && <Search />}
          {route.name === 'print' && transcript && <Print transcript={transcript} />}
        </div>
      </div>
      {pwModal && (
        <PasswordModal
          mode={pwModal.mode}
          projectName={data?.project?.name || ''}
          error={pwError}
          busy={pwBusy}
          onSubmit={handlePasswordSubmit}
          onCancel={closePasswordModal}
          onKeepOpen={() => {
            const m = pwModal
            setPwModal(null)
            setPwError(null)
            m.resolve?.({ protect: false })
          }}
        />
      )}
    </DataContext.Provider>
  )
}

/** Garante os arrays opcionais do schema. */
function normalizeData (d) {
  if (!d || typeof d !== 'object') return emptyData()
  if (!Array.isArray(d.memos)) d.memos = []
  if (!Array.isArray(d.queries)) d.queries = []
  if (!Array.isArray(d.quoteLinks)) d.quoteLinks = []
  if (!Array.isArray(d.codeLinks)) d.codeLinks = []
  if (!Array.isArray(d.nodeLinks)) d.nodeLinks = []
  return d
}

/** Remove memos de citações que não existem mais. */
function cleanMemos (memos, excerpts) {
  const ids = new Set(excerpts.map((e) => e.quoteId || e.id))
  return (memos || []).filter((m) => ids.has(m.quoteId))
}
