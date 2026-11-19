import React, { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadData, saveData, uid, emptyData, loadSettings, saveSettings, setProjectPath, getProjectPath, onSaveStatus, retrySave } from './data/store.js'
import { deleteBinary } from './lib/files.js'
import { moveCode as moveCodeFn, nextColor, mergeCodeList } from './lib/codes.js'
import { bridge } from './lib/bridge.js'
import Sidebar from './components/Sidebar.jsx'
import AddTranscript from './pages/AddTranscript.jsx'
import Transcripts from './pages/Transcripts.jsx'
import Editor from './pages/Editor.jsx'
import Codebook from './pages/Codebook.jsx'
import Snippets from './pages/Snippets.jsx'
import Reports from './pages/Reports.jsx'
import Search from './pages/Search.jsx'
import Comments from './pages/Comments.jsx'
import Settings from './pages/Settings.jsx'
import Home from './pages/Home.jsx'
import SaveStatus from './components/SaveStatus.jsx'
import Consultas from './pages/Consultas.jsx'
import Print from './pages/Print.jsx'

const DataContext = createContext(null)
export const useData = () => useContext(DataContext)

const ROUTES = ['transcripts', 'new', 'codes', 'snippets', 'comments', 'consultas', 'reports', 'search', 'settings', 'home', 'print']

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
  const [data, setData] = useState(null)
  const [ready, setReady] = useState(false)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('investigando.sidebar') === 'collapsed')
  const [settings, setSettings] = useState(() => loadSettings())
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
    const st = loadSettings()
    if (st.projectPath) setProjectPath(st.projectPath)
    loadData().then((d) => {
      if (!Array.isArray(d.memos)) d.memos = []
      if (!Array.isArray(d.queries)) d.queries = []
      if (!Array.isArray(d.quoteLinks)) d.quoteLinks = []
      if (!Array.isArray(d.codeLinks)) d.codeLinks = []
      setData(d)
      dataRef.current = d
      setReady(true)
    }).catch((err) => {
      console.error('Falha ao carregar dados:', err)
      const d = emptyData()
      setData(d)
      dataRef.current = d
      setReady(true)
    })
    const onHash = () => setRoute(parseHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
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

  useEffect(() => {
    const onKey = (e) => {
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
    update,
    undo,
    redo,
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
        return { ...d, excerpts, memos: cleanMemos(d.memos, excerpts) }
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
    addQuoteLink: (fromQuoteId, toQuoteId, type) => {
      if (!fromQuoteId || !toQuoteId || fromQuoteId === toQuoteId) return
      update((d) => {
        const exists = (d.quoteLinks || []).some(
          (l) => (l.from === fromQuoteId && l.to === toQuoteId) || (l.from === toQuoteId && l.to === fromQuoteId)
        )
        if (exists) return d
        return {
          ...d,
          quoteLinks: [...(d.quoteLinks || []), {
            id: uid(), from: fromQuoteId, to: toQuoteId, type, createdAt: new Date().toISOString()
          }]
        }
      })
    },
    removeQuoteLink: (id) => {
      update((d) => ({ ...d, quoteLinks: (d.quoteLinks || []).filter((l) => l.id !== id) }))
    },
    addCodeLink: (fromCodeId, toCodeId, type) => {
      if (!fromCodeId || !toCodeId || fromCodeId === toCodeId) return
      update((d) => {
        const exists = (d.codeLinks || []).some(
          (l) => (l.from === fromCodeId && l.to === toCodeId) || (l.from === toCodeId && l.to === fromCodeId)
        )
        if (exists) return d
        return {
          ...d,
          codeLinks: [...(d.codeLinks || []), {
            id: uid(), from: fromCodeId, to: toCodeId, type, createdAt: new Date().toISOString()
          }]
        }
      })
    },
    removeCodeLink: (id) => {
      update((d) => ({ ...d, codeLinks: (d.codeLinks || []).filter((l) => l.id !== id) }))
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
      const d = emptyData()
      d.project.name = (name || '').trim() || 'Projeto sem título'
      d.project.description = (description || '').trim()
      canSave.current = true
      setData(d)
      dataRef.current = d
      saveData(d)
      navigate('/home')
    },
    saveProjectAs: async () => {
      const suggestion = ((dataRef.current?.project.name || 'Projeto').replace(/[\/:*?"<>|]/g, '-')) + '.investigando'
      const path = await bridge.savePanel(suggestion)
      if (!path) return null
      setProjectPath(path)
      setSettings(saveSettings({ projectPath: path }))
      saveData(dataRef.current)
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
      setProjectPath(path)
      setSettings(saveSettings({ projectPath: path }))
      const d = await loadData()
      if (!Array.isArray(d.memos)) d.memos = []
      if (!Array.isArray(d.queries)) d.queries = []
      if (!Array.isArray(d.quoteLinks)) d.quoteLinks = []
      if (!Array.isArray(d.codeLinks)) d.codeLinks = []
      canSave.current = true
      setData(d)
      dataRef.current = d
      navigate('/home')
      return path
    },
    setAvatarRef: (ref) => {
      setSettings(saveSettings({ avatarRef: ref || null }))
    },
    pickAvatars: async () => {
      const picked = await bridge.pickImages()
      if (!picked || !picked.length) return []
      const list = []
      for (const p of picked) {
        const b64 = await bridge.readPath(p.path)
        if (!b64) continue
        const ext = (p.name.split('.').pop() || 'png').toLowerCase()
        const key = await bridge.saveBinary(p.name, b64, 'avatar-' + uid() + '.' + ext)
        if (!key) continue
        list.push({ name: p.name, key })
      }
      if (list.length) {
        const current = loadSettings().avatars || []
        setSettings(saveSettings({ avatars: [...current, ...list] }))
      }
      return list
    },
    pickAvatar: async () => {
      const path = await bridge.pickImage()
      if (!path) return null
      const b64 = await bridge.readPath(path)
      if (!b64) return null
      const ext = (path.split('.').pop() || 'png').toLowerCase()
      const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png'
      const dataUrl = `data:${mime};base64,${b64}`
      setSettings(saveSettings({ avatarData: dataUrl }))
      return dataUrl
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
  }), [data, settings, update])

  if (!ready || !data) {
    return <div style={{ padding: 40, fontFamily: 'Helvetica Neue, sans-serif' }}>Carregando…</div>
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
      <div className={'app' + (collapsed ? ' sidebar-collapsed' : '')}>
        <div className="drag-strip" />
        {collapsed && (
          <button className="sidebar-reopen" title="Mostrar menu (⌘B)" onClick={() => setCollapsed(false)}>
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
            <button className="app-project" onClick={() => navigate('/home')} title="Visão geral do projeto">
              {data.project.name}
            </button>
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
          {route.name === 'search' && <Search />}
          {route.name === 'print' && transcript && <Print transcript={transcript} />}
        </div>
      </div>
    </DataContext.Provider>
  )
}

/** Remove memos de citações que não existem mais. */
function cleanMemos (memos, excerpts) {
  const ids = new Set(excerpts.map((e) => e.quoteId || e.id))
  return (memos || []).filter((m) => ids.has(m.quoteId))
}
