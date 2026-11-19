import { describe, expect, it } from 'vitest'
import {
  detectDialogue,
  formatDate,
  initials,
  parseBlocks,
  projectStats,
  segmentsFor
} from '../transcript.js'

const DIALOGUE = [
  '00:00:01.500 Ana Silva: Bom dia a todos.',
  'Tudo bem?',
  '',
  '00:00:08 Bruno: Eu acho que sim.',
  '',
  'Ana: Ótimo, vamos começar.'
].join('\n')

describe('parseBlocks', () => {
  it('separa timecode, falante e conteúdo com offsets absolutos', () => {
    const blocks = parseBlocks(DIALOGUE)
    expect(blocks).toHaveLength(4)

    const [first, second, third, fourth] = blocks
    expect(first).toMatchObject({ start: 0, time: '00:00:01', speaker: 'Ana Silva' })
    expect(DIALOGUE.slice(first.contentStart, first.contentEnd)).toBe('Bom dia a todos.')
    expect(first.end).toBe('00:00:01.500 Ana Silva: Bom dia a todos.'.length)

    // Linha de continuação, sem timecode nem falante.
    expect(second.start).toBe(DIALOGUE.indexOf('Tudo bem?'))
    expect(second.time).toBeNull()
    expect(second.speaker).toBeNull()
    expect(DIALOGUE.slice(second.contentStart, second.contentEnd)).toBe('Tudo bem?')

    expect(third).toMatchObject({ time: '00:00:08', speaker: 'Bruno' })
    expect(DIALOGUE.slice(third.contentStart, third.contentEnd)).toBe('Eu acho que sim.')

    expect(fourth.time).toBeNull()
    expect(fourth.speaker).toBe('Ana')
    expect(DIALOGUE.slice(fourth.contentStart, fourth.contentEnd)).toBe('Ótimo, vamos começar.')
  })

  it('não interpreta timecode/falante no modo plain', () => {
    const blocks = parseBlocks(DIALOGUE, true)
    expect(blocks).toHaveLength(4)
    expect(blocks.every((b) => b.time === null && b.speaker === null)).toBe(true)
    expect(blocks[0].contentStart).toBe(0)
    expect(DIALOGUE.slice(blocks[0].contentStart, blocks[0].contentEnd))
      .toBe('00:00:01.500 Ana Silva: Bom dia a todos.')
  })

  it('ignora linhas vazias mas mantém offsets corretos', () => {
    const body = '\n\nPrimeira linha.\n\n\nSegunda linha.\n\n'
    const blocks = parseBlocks(body)
    expect(blocks.map((b) => body.slice(b.contentStart, b.contentEnd)))
      .toEqual(['Primeira linha.', 'Segunda linha.'])
    expect(blocks[1].start).toBe(body.indexOf('Segunda linha.'))
  })

  it('aceita falante com dois-pontos sem espaço final e nomes numéricos', () => {
    const body = 'João:\n20:30\nMaria: Cheguei.'
    const blocks = parseBlocks(body)
    expect(blocks[0].speaker).toBeNull()
    expect(blocks[1].speaker).toBeNull()
    expect(blocks[1].time).toBe('20:30')
    expect(blocks[2].speaker).toBe('Maria')
  })

  it('retorna lista vazia para corpo vazio', () => {
    expect(parseBlocks('')).toEqual([])
    expect(parseBlocks('\n \n\t\n')).toEqual([])
  })
})

describe('detectDialogue', () => {
  it('reconhece transcrição com falantes recorrentes', () => {
    const dialogue = 'Ana: Bom dia.\nBruno: Olá.\nAna: Vamos começar.'
    expect(detectDialogue(dialogue)).toBe(true)
  })

  it('não considera diálogo quando os timecodes dominam as linhas', () => {
    expect(detectDialogue(DIALOGUE)).toBe(false)
  })

  it('não confunde texto corrido com diálogo', () => {
    expect(detectDialogue('Um parágrafo qualquer.\nOutro parágrafo.')).toBe(false)
    expect(detectDialogue('Ana: única fala')).toBe(false)
    expect(detectDialogue('')).toBe(false)
  })
})

describe('segmentsFor', () => {
  const excerpt = (id, start, end, createdAt) => ({ id, start, end, createdAt })

  it('devolve um único segmento sem código quando não há trechos', () => {
    expect(segmentsFor([], 10, 40)).toEqual([{ from: 10, to: 40, excerpt: null }])
  })

  it('divide o intervalo nas bordas de um trecho', () => {
    const e = excerpt('e1', 10, 30, '2024-01-01T10:00:00Z')
    const segments = segmentsFor([e], 0, 50)
    expect(segments).toEqual([
      { from: 0, to: 10, excerpt: null },
      { from: 10, to: 30, excerpt: e },
      { from: 30, to: 50, excerpt: null }
    ])
  })

  it('resolve sobreposição: o trecho mais recente vence', () => {
    const older = excerpt('mais-antigo', 10, 50, '2024-01-01T10:00:00Z')
    const newer = excerpt('mais-novo', 30, 70, '2024-02-01T10:00:00Z')
    const segments = segmentsFor([older, newer], 0, 100)
    const byRange = Object.fromEntries(segments.map((s) => [`${s.from}-${s.to}`, s.excerpt?.id || null]))
    expect(byRange).toEqual({
      '0-10': null,
      '10-30': 'mais-antigo',
      '30-50': 'mais-novo',
      '50-70': 'mais-novo',
      '70-100': null
    })
  })

  it('inclui trecho que começa antes do intervalo', () => {
    const e = excerpt('e1', 0, 20, '2024-01-01T10:00:00Z')
    expect(segmentsFor([e], 10, 15)).toEqual([{ from: 10, to: 15, excerpt: e }])
  })

  it('ignora trechos completamente fora do intervalo', () => {
    const e = excerpt('e1', 0, 10, '2024-01-01T10:00:00Z')
    expect(segmentsFor([e], 10, 20)).toEqual([{ from: 10, to: 20, excerpt: null }])
  })
})

describe('initials', () => {
  it('usa a primeira letra do primeiro e do último nome', () => {
    expect(initials('Ana')).toBe('A')
    expect(initials('Ana Silva')).toBe('AS')
    expect(initials('  ana maria silva  ')).toBe('AS')
  })

  it('retorna vazio para nome vazio ou ausente', () => {
    expect(initials('')).toBe('')
    expect(initials('   ')).toBe('')
    expect(initials(null)).toBe('')
    expect(initials(undefined)).toBe('')
  })
})

describe('projectStats', () => {
  it('conta documentos, códigos, trechos, parágrafos e documentos codificados', () => {
    const data = {
      transcripts: [
        { id: 't1', body: 'Ana: Olá.\n\nBruno: Oi.\nTudo bem?' },
        { id: 't2', body: 'Somente um parágrafo.' },
        { id: 't3', body: '' }
      ],
      codes: [{ id: 'c1' }, { id: 'c2' }],
      excerpts: [
        { transcriptId: 't1' },
        { transcriptId: 't1' },
        { transcriptId: 't2' }
      ]
    }
    expect(projectStats(data)).toEqual({
      transcripts: 3,
      codes: 2,
      excerpts: 3,
      paragraphs: 4,
      codedTranscripts: 2
    })
  })

  it('zera em projeto vazio', () => {
    expect(projectStats({ transcripts: [], codes: [], excerpts: [] })).toEqual({
      transcripts: 0,
      codes: 0,
      excerpts: 0,
      paragraphs: 0,
      codedTranscripts: 0
    })
  })
})

describe('formatDate', () => {
  it('formata ISO em pt-BR com dia, mês abreviado e ano', () => {
    expect(formatDate('2024-03-05T12:00:00Z')).toMatch(/05.*mar.*2024/i)
  })

  it('retorna vazio para data ausente', () => {
    expect(formatDate('')).toBe('')
    expect(formatDate(null)).toBe('')
    expect(formatDate(undefined)).toBe('')
  })
})
