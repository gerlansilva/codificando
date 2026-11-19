import { describe, expect, it } from 'vitest'
import {
  buildDocxBlob,
  buildHtmlReport,
  buildReportModel,
  reportSlug
} from '../exports.js'

const NOW = new Date('2024-05-20T14:30:00Z')

function project () {
  return {
    project: {
      name: 'Vivências do cuidado',
      description: 'Estudo com <famílias> & cuidadores'
    },
    transcripts: [
      { id: 't1', name: 'Entrevista — Ana', createdAt: '2024-03-05T12:00:00Z', body: 'Ana: Olá.\n\nBruno: Oi.\nTudo bem?' },
      { id: 't2', name: 'Grupo focal', createdAt: '2024-04-10T12:00:00Z', body: 'Primeira fala.\nSegunda fala.' },
      { id: 't3', name: 'Notas de campo', createdAt: 'data-invalida', body: 'Uma observação.' }
    ],
    codes: [
      { id: 'c1', name: 'Expectativas', color: '#4A90E2', description: 'O que se espera do tratamento' },
      { id: 'c2', name: 'Medos', color: '#D96B5B' },
      { id: 'c3', name: 'Sem uso', color: '#7BB661' }
    ],
    excerpts: [
      {
        id: 'e1',
        codeId: 'c1',
        transcriptId: 't1',
        text: '  Eu esperava   melhorar.\n',
        quoteId: 'q1',
        page: 2
      },
      { id: 'e2', codeId: 'c1', transcriptId: 't2', text: 'Acho que sim.', quoteId: 'q2' },
      { id: 'e3', codeId: 'c2', transcriptId: 't1', text: 'Tinha medo.', page: 1 },
      { id: 'e4', codeId: 'c1', transcriptId: 't9', text: 'Trecho órfão.' }
    ],
    memos: [
      { kind: 'comment', quoteId: 'q1', text: '  Tom positivo.  ' },
      { kind: 'comment', quoteId: 'e3', text: 'Recorrente nos relatos.' },
      { kind: 'memo', quoteId: 'q2', text: 'não é comentário' },
      { kind: 'comment', quoteId: 'q2', text: '   ' }
    ]
  }
}

describe('reportSlug', () => {
  it('normaliza o nome do projeto para o nome do arquivo', () => {
    expect(reportSlug({ project: { name: 'Vivências do cuidado' } })).toBe('vivencias-do-cuidado')
    expect(reportSlug({ project: { name: '  Projeto / 2024!  ' } })).toBe('projeto-2024')
  })

  it('usa "projeto" quando o nome está ausente ou vazio', () => {
    expect(reportSlug({})).toBe('projeto')
    expect(reportSlug({ project: { name: '   ' } })).toBe('projeto')
    expect(reportSlug(null)).toBe('projeto')
  })
})

describe('buildReportModel', () => {
  it('monta título, descrição, estatísticas e data de geração', () => {
    const model = buildReportModel(project(), NOW)
    expect(model.title).toBe('Vivências do cuidado')
    expect(model.description).toBe('Estudo com <famílias> & cuidadores')
    expect(model.generatedAt).toBe(NOW)
    expect(model.generatedAtLabel).toMatch(/20.*mai.*2024/i)
    expect(model.stats).toEqual({
      transcripts: 3,
      codes: 3,
      excerpts: 4,
      paragraphs: 6,
      codedTranscripts: 3
    })
  })

  it('ordena códigos por quantidade de trechos e marca os não usados', () => {
    const model = buildReportModel(project(), NOW)
    expect(model.codes.map((c) => [c.id, c.count])).toEqual([
      ['c1', 3],
      ['c2', 1],
      ['c3', 0]
    ])
    expect(model.unusedCodeCount).toBe(1)
  })

  it('normaliza textos, resolve documento, página e comentário', () => {
    const model = buildReportModel(project(), NOW)
    const expectativas = model.codes[0]
    expect(expectativas.description).toBe('O que se espera do tratamento')
    expect(expectativas.items.map((i) => i.document)).toEqual([
      'Documento removido',
      'Entrevista — Ana',
      'Grupo focal'
    ])
    expect(expectativas.items[1]).toMatchObject({
      text: 'Eu esperava melhorar.',
      page: 2,
      document: 'Entrevista — Ana',
      comment: 'Tom positivo.'
    })
    expect(expectativas.items[2].page).toBeNull()
    expect(expectativas.items.some((i) => i.comment === 'não é comentário')).toBe(false)

    const medos = model.codes[1]
    expect(medos.items).toEqual([
      {
        id: 'e3',
        text: 'Tinha medo.',
        page: 1,
        document: 'Entrevista — Ana',
        comment: 'Recorrente nos relatos.'
      }
    ])
  })

  it('lista documentos com a contagem de trechos', () => {
    const model = buildReportModel(project(), NOW)
    expect(model.documents.map((d) => [d.name, d.count])).toEqual([
      ['Entrevista — Ana', 2],
      ['Grupo focal', 1],
      ['Notas de campo', 0]
    ])
  })

  it('funciona com projeto vazio e usa os textos padrão', () => {
    const model = buildReportModel({}, NOW)
    expect(model.title).toBe('Projeto sem título')
    expect(model.description).toBe('')
    expect(model.codes).toEqual([])
    expect(model.documents).toEqual([])
    expect(model.unusedCodeCount).toBe(0)
    expect(model.stats).toEqual({
      transcripts: 0,
      codes: 0,
      excerpts: 0,
      paragraphs: 0,
      codedTranscripts: 0
    })
  })
})

describe('buildHtmlReport', () => {
  it('gera documento completo em pt-BR com resumo, códigos e documentos', () => {
    const html = buildHtmlReport(project())
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(html).toContain('<html lang="pt-BR">')
    expect(html).toContain('<title>Relatório — Vivências do cuidado</title>')
    expect(html).toContain('Gerado pelo Codificando')
    expect(html).toContain('Códigos ainda sem trechos')
    expect(html).toContain('<td class="num">4</td>')
    expect(html).toContain('Expectativas')
    expect(html).toContain('3 trechos')
    expect(html).toContain('· página 2')
    expect(html).toContain('Comentário: Tom positivo.')
    expect(html).toContain('05/03/2024')
    expect(html).toContain('<td>—</td>')
  })

  it('escapa HTML vindo do projeto e dos trechos', () => {
    const data = project()
    data.excerpts[1].text = '<script>alert("x")</script>'
    const html = buildHtmlReport(data)
    expect(html).toContain('&lt;famílias&gt; &amp; cuidadores')
    expect(html).not.toContain('Estudo com <famílias>')
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;')
    expect(html).not.toContain('<script>alert')
  })

  it('mostra mensagens de vazio quando não há dados', () => {
    const html = buildHtmlReport({})
    expect(html).toContain('Projeto sem título')
    expect(html).toContain('Nenhum código criado neste projeto.')
    expect(html).toContain('Nenhum trecho codificado ainda.')
    expect(html).toContain('Nenhum documento no projeto.')
    expect(html).not.toContain('Códigos ainda sem trechos')
  })
})

describe('buildDocxBlob', () => {
  it('gera um DOCX não vazio', async () => {
    const blob = await buildDocxBlob(project())
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.size).toBeGreaterThan(1000)
    expect(blob.type).toContain('wordprocessingml.document')
  })

  it('gera um DOCX válido mesmo sem dados', async () => {
    const blob = await buildDocxBlob({})
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.size).toBeGreaterThan(0)
  })
})
