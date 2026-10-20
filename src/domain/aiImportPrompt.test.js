import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const prompt = readFileSync(new URL('../../AI_IMPORT_INSTRUCTIONS.md', import.meta.url), 'utf8')

describe('AI intake prompt contract', () => {
  it('is self-contained and requires a downloadable manifest file', () => {
    expect(prompt).toContain('# Just Start AI intake instructions')
    expect(prompt).toContain('Copy this entire document into a ChatGPT conversation')
    expect(prompt).toContain('or a plain-text folder structure')
    expect(prompt).toContain('create a downloadable file')
    expect(prompt).toContain('manifest.json')
    expect(prompt).toContain('Attach the created `manifest.json` as a downloadable file')
    expect(prompt).toContain('Do not paste the full JSON into the chat')
    expect(prompt).toContain('"schemaVersion": "1.0"')
    expect(prompt).toContain('The **contents of the created file** must be JSON only')
    expect(prompt).not.toContain('Return **JSON only**')
  })

  it.each([
    'PDFs',
    'Slide decks',
    'Documents',
    'Problem links',
    'YouTube URLs',
    'Papers',
    'Uncertain classifications',
  ])('documents handling for %s', (sourceType) => {
    expect(prompt).toContain(`**${sourceType}:**`)
  })

  it('documents the safety and relationship rules the importer validates', () => {
    expect(prompt).toMatch(/Never use an\s+absolute path/)
    expect(prompt).toMatch(/`\.\.` path\s+segments/)
    expect(prompt).toContain('only `http` or `https`')
    expect(prompt).toMatch(/must not contain a\s+username, password, API key, token/)
    expect(prompt).toContain('must not form a cycle')
    expect(prompt).toContain('Do not add fields outside the contract')
  })
})
