import React, { useMemo } from 'react'
import { useData, navigate } from '../App.jsx'
import { formatDate } from '../lib/transcript.js'
import Icon from '../components/Icon.jsx'

/** Tela inicial do projeto (visão geral), no espírito do Home do Atlas.ti. */
export default function Home () {
  const { data } = useData()

  const counts = useMemo(() => {
    const quotes = new Set(data.excerpts.map((e) => e.quoteId || e.id)).size
    const comments = (data.memos || []).filter((m) => m.kind === 'comment' && (m.text || '').trim()).length
    return { docs: data.transcripts.length, codes: data.codes.length, quotes, comments }
  }, [data])

  const modified = useMemo(() => {
    const stamps = [
      data.project.createdAt,
      ...data.transcripts.map((t) => t.updatedAt || t.createdAt),
      ...data.excerpts.map((e) => e.createdAt),
      ...(data.memos || []).map((m) => m.updatedAt)
    ].filter(Boolean).map((s) => new Date(s).getTime()).filter((n) => !Number.isNaN(n))
    return stamps.length ? new Date(Math.max(...stamps)).toISOString() : null
  }, [data])

  return (
    <div className="home">
      <h1 className="home-title">{data.project.name}</h1>
      <p className="home-desc">
        {data.project.description || 'Sem descrição. Abra as configurações pelo logo para descrever o projeto.'}
      </p>
      <p className="home-meta">
        {data.project.createdAt ? `Criado em ${formatDate(data.project.createdAt)}` : 'Projeto local'}
        {' · '}versão 0.1.0
      </p>

      <div className="home-actions">
        <button className="btn btn--blue" onClick={() => navigate('/documents/new')}>Adicionar documentos</button>
        {counts.docs > 0 && (
          <button className="btn" onClick={() => navigate('/documents')}>Ver documentos</button>
        )}
      </div>

      <h2 className="home-section">Visão geral do projeto</h2>
      <div className="home-overview">
        <button className="overview-row" onClick={() => navigate('/documents')}>
          <span className="overview-name"><Icon name="documents" size={18} /> Documentos</span>
          <strong>{counts.docs}</strong>
        </button>
        <button className="overview-row" onClick={() => navigate('/codes')}>
          <span className="overview-name"><Icon name="codes" size={18} /> Códigos</span>
          <strong>{counts.codes}</strong>
        </button>
        <button className="overview-row" onClick={() => navigate('/snippets')}>
          <span className="overview-name"><Icon name="snippets" size={18} /> Citações</span>
          <strong>{counts.quotes}</strong>
        </button>
        <button className="overview-row" onClick={() => navigate('/comments')}>
          <span className="overview-name"><Icon name="comments" size={18} /> Comentários</span>
          <strong>{counts.comments}</strong>
        </button>
      </div>

      <div className="home-foot">
        {modified && <span>Última alteração em {formatDate(modified)}</span>}
        <span>Dados salvos localmente — sem envio para a rede.</span>
      </div>
    </div>
  )
}
