import { describe, expect, it } from 'vitest'
import {
  isResearchResource,
  normaliseResearchTopic,
  researchMetadataFromFile,
  researchNodeFields,
} from './research.js'

describe('research resources', () => {
  it('recognises PDFs and citation/text metadata formats', () => {
    expect(isResearchResource({ name: 'paper.pdf', type: 'application/pdf' })).toBe(true)
    expect(isResearchResource({ name: 'references.bib' })).toBe(true)
    expect(isResearchResource({ name: 'references.ris' })).toBe(true)
    expect(isResearchResource({ name: 'references.enw' })).toBe(true)
    expect(isResearchResource({ name: 'abstract.txt', type: 'text/plain' })).toBe(true)
    expect(isResearchResource({ name: 'photo.png', type: 'image/png' })).toBe(false)
  })
})

describe('research metadata', () => {
  it('derives a concise title and simple author from a PDF filename', () => {
    expect(researchMetadataFromFile({ name: 'Ada Lovelace - Analytical Engine Notes.pdf' })).toEqual({
      title: 'Analytical Engine Notes',
      authors: ['Ada Lovelace'],
      sourceType: 'pdf',
    })
  })

  it('infers a year and DOI token without reading file contents', () => {
    expect(researchMetadataFromFile({
      name: 'Attention_Is_All_You_Need_2017_doi_10.48550%2FarXiv.1706.03762.pdf',
    })).toMatchObject({
      title: 'Attention Is All You Need',
      year: 2017,
      doi: '10.48550/arXiv.1706.03762',
      sourceType: 'pdf',
    })
    expect(researchMetadataFromFile({ name: 'notes.pdf' })).not.toHaveProperty('year')
  })
})

describe('research node fields', () => {
  it('trims topics and falls back when the topic is blank', () => {
    expect(normaliseResearchTopic('  distributed systems  ', 'fallback')).toBe('distributed systems')
    expect(normaliseResearchTopic('   ', '  fallback topic  ')).toBe('fallback topic')
  })

  it('creates a non-gated research node field set', () => {
    const metadata = { title: 'A Paper', authors: [], sourceType: 'pdf' }
    const fields = researchNodeFields(metadata, '  Reading list  ')

    expect(fields).toEqual({
      kind: 'research-paper',
      topic: 'Reading list',
      research: metadata,
    })
    expect(fields).not.toHaveProperty('parents')
  })
})
