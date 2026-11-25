import React, { useMemo, useState, useEffect } from 'react'
import { useData, navigate } from '../App.jsx'
import { formatDate } from '../lib/transcript.js'
import { loadRecentProjects, shortPath, getProjectPath } from '../data/store.js'
import Icon from '../components/Icon.jsx'

/** Tela inicial do projeto (visão geral), no espírito do Home do Atlas.ti. */
export default function Home () {
  const { data, settings, openProjectAt, openProject } = useData()
  const [recents, setRecents] = useState(() => loadRecentProjects())
  const [opening, setOpening] = useState(null)

  // atualiza ao voltar para o Home ou trocar de projeto
  useEffect(() => { setRecents(loadRecentProjects()) }, [data.project.name])

  const currentPath = getProjectPath() || settings?.projectPath || null
  const otherProjects = recents.filter((r) => r.path !== currentPath)

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
        {' · '}versão {__APP_VERSION__}
      </p>

      <NextStep counts={counts} firstDoc={data.transcripts[0]} />

      <div className="home-actions">
        <button className={'btn' + (counts.docs ? '' : ' btn--blue')} onClick={() => navigate('/documents/new')}>Adicionar documentos</button>
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

      <p className="home-foot">
        {modified && <span>Última alteração em {formatDate(modified)} · </span>}
        <span>tudo fica no seu computador; nada é enviado para a internet.</span>
        <span className="home-credit"> · Codificando, criado por Gerlan Silva da Silva</span>
      </p>

      <h2 className="home-section home-recent-title">Projetos recentes</h2>
      {otherProjects.length > 0
        ? (
          <div className="recent-list">
            {otherProjects.map((r) => (
              <button
                key={r.path}
                className="recent-item"
                disabled={opening === r.path}
                title={r.path}
                onClick={async () => {
                  setOpening(r.path)
                  await openProjectAt(r.path)
                  setOpening(null)
                }}
              >
                <span className="recent-icon"><Icon name="documents" size={18} /></span>
                <span className="recent-info">
                  <strong>{r.name}</strong>
                  <span className="recent-path">{shortPath(r.path)}</span>
                </span>
                <span className="recent-date">
                  {opening === r.path ? 'Abrindo…' : formatWhen(r.at)}
                </span>
              </button>
            ))}
          </div>
        )
        : (
          <p className="home-desc recent-empty">Nenhum outro projeto recente. Ao abrir ou salvar um projeto, ele aparece aqui.</p>
        )}
      <div className="home-actions home-recent-actions">
        <button className="btn" onClick={() => openProject()}>Abrir projeto…</button>
      </div>
    </div>
  )
}

/** Um passo de cada vez: diz ao pesquisador iniciante o que fazer agora. */
function NextStep ({ counts, firstDoc }) {
  const stage = !counts.docs ? 0 : counts.quotes < 15 ? 1 : 2
  const steps = ['Reunir os dados', 'Codificar', 'Analisar']
  const body = [
    {
      text: 'Comece trazendo entrevistas, artigos ou documentos (PDF, Word, texto). Eles ficam guardados neste projeto.',
      action: 'Adicionar documentos', go: '/documents/new'
    },
    {
      text: counts.quotes
        ? 'Continue lendo e marcando: selecione um trecho e clique num código — ou arraste o código até o trecho. Arraste um código sobre outro para criar subcódigos.'
        : 'Abra um documento, selecione um trecho e dê um nome ao código. Depois é só arrastar códigos até os trechos.',
      action: firstDoc ? 'Abrir “' + firstDoc.name.slice(0, 40) + '”' : 'Ver documentos',
      go: firstDoc ? '/documents/' + firstDoc.id : '/documents'
    },
    {
      text: 'Com os códigos em mãos: agrupe-os em temas na aba Códigos, cruze-os em Consultas e desenhe as relações em Redes (solte um código sobre outro para ligá-los).',
      action: 'Abrir Redes', go: '/networks'
    }
  ][stage]
  return (
    <section className="next-step" aria-label="Próximo passo">
      <ol className="next-step-track">
        {steps.map((s, i) => (
          <li key={s} className={i === stage ? 'is-current' : i < stage ? 'is-done' : ''}>{s}</li>
        ))}
      </ol>
      <p>{body.text}</p>
      <button className="btn btn--blue" onClick={() => navigate(body.go)}>{body.action}</button>
    </section>
  )
}

function formatWhen (iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}
