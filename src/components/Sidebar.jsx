import React, { useState } from 'react'
import { navigate, useData } from '../App.jsx'
import Logo from './Logo.jsx'
import Icon from './Icon.jsx'
import wordmark from '../assets/codificando-wordmark.png'

const NAV = [
  { key: 'search', label: 'Buscar', path: 'search', icon: 'search' },
  { key: 'codes', label: 'Códigos', path: 'codes', icon: 'codes' },
  { key: 'snippets', label: 'Trechos', path: 'snippets', icon: 'snippets' },
  { key: 'consultas', label: 'Consultas', path: 'consultas', icon: 'search' },
  { key: 'comments', label: 'Comentários', path: 'comments', icon: 'comments' },
  { key: 'reports', label: 'Relatórios', path: 'reports', icon: 'reports' }
]

export default function Sidebar ({ route, collapsed, onCollapse }) {
  const { data } = useData()
  const [docsOpen, setDocsOpen] = useState(() => localStorage.getItem('codificando.docsOpen') !== '0')
  const commentCount = (data.memos || []).filter((m) => m.kind === 'comment' && (m.text || '').trim()).length

  const toggleDocs = () => {
    setDocsOpen((v) => {
      localStorage.setItem('codificando.docsOpen', v ? '0' : '1')
      return !v
    })
  }

  return (
    <aside className="sidebar" aria-hidden={collapsed}>
      <div className="brand-row">
        <button className="brand-button" onClick={() => navigate('/settings')} title="Configurações gerais">
          <Logo size={34} />
          <img className="brand-wordmark" src={wordmark} alt="Codificando" />
        </button>
        <button className="collapse-btn" title="Recolher menu (⌘B)" onClick={onCollapse}>«</button>
      </div>

      <nav className="sidebar-nav">
        <button
          className={'nav-item' + (['documents', 'new'].includes(route.name) ? ' active' : '')}
          onClick={() => navigate('/documents')}
        >
          <Icon name="documents" size={18} />
          <span className="nav-label">Documentos</span>
          <span className="nav-side">{data.transcripts.length}</span>
          <span
            className={'nav-caret' + (docsOpen ? ' open' : '')}
            title={docsOpen ? 'Recolher documentos' : 'Expandir documentos'}
            onClick={(e) => { e.stopPropagation(); toggleDocs() }}
          >
            <Icon name="chevron" size={14} />
          </span>
        </button>

        {docsOpen && (
          <div className="doc-list">
            {data.transcripts.map((t) => (
              <button
                key={t.id}
                className={'doc-item' + (route.id === t.id ? ' active' : '')}
                onClick={() => navigate('/documents/' + t.id)}
                title={t.name}
              >
                <Icon name="documents" size={14} />
                <span>{t.name}</span>
              </button>
            ))}
            <button className="doc-item doc-add" onClick={() => navigate('/documents/new')}>
              <span aria-hidden="true">＋</span>
              <span>Novo documento</span>
            </button>
          </div>
        )}

        {NAV.map((item) => (
          <button
            key={item.key}
            className={'nav-item' + (route.name === item.key ? ' active' : '')}
            onClick={() => navigate('/' + item.path)}
          >
            <Icon name={item.icon} size={18} />
            <span className="nav-label">{item.label}</span>
            {item.key === 'comments' && commentCount > 0 && (
              <span className="nav-badge" title={`${commentCount} comentário${commentCount === 1 ? '' : 's'}`}>{commentCount}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="sidebar-spacer" />
    </aside>
  )
}
