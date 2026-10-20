import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const prompt = readFileSync(new URL('../../AI_IMPORT_INSTRUCTIONS.md', import.meta.url), 'utf8')

describe('AI intake prompt contract', () => {
  it('defines the three-input workflow and requires only a downloadable manifest file', () => {
    expect(prompt).toContain('# Just Start AI intake instructions')
    expect(prompt).toContain('**exactly three inputs**')
    expect(prompt).toContain('`AGENTS.md` (this instruction file)')
    expect(prompt).toContain('`JUSTSTART_CONTEXT.json` (the existing-workspace catalog described below)')
    expect(prompt).toContain("The user's source ZIP or source folder.")
    expect(prompt).toContain('The user uploads only those three inputs to the AI.')
    expect(prompt).toContain('create a downloadable file')
    expect(prompt).toContain('manifest.json')
    expect(prompt).toContain('Return **only** the created `manifest.json` as a downloadable attachment')
    expect(prompt).toContain('Do not paste any JSON into the chat')
    expect(prompt).toMatch(/the user then uploads\s+that `manifest\.json` back to Just Start/)
    expect(prompt).toContain('Just Start handles importing later')
    expect(prompt).toContain('"schemaVersion": "1.0"')
    expect(prompt).toContain('The **contents of the created file** must be JSON only')
  })

  it('requires broad topics based on the source folders and the expected four-subject example', () => {
    expect(prompt).toMatch(/actual\s+top-level folders and subject areas/)
    expect(prompt).toContain('one manifest topic per broad top-level folder or broad subject')
    expect(prompt).toContain('**Operating Systems**, **Compiler Design**, **Operations Research**, and')
    expect(prompt).toContain('**Research Papers**')
    expect(prompt).toContain('the manifest must contain exactly those four topics')
    expect(prompt).toContain('Assign **every eligible source item to exactly one**')
    expect(prompt).toContain('Every item has a non-empty `title`, a `topicId` that names a topic')
    expect(prompt).toContain('Do not invent extra topics')
    expect(prompt).toContain('Preserve the source folder structure')
    expect(prompt).not.toContain('plain-text folder structure')
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
