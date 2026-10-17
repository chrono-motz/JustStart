import { describe, expect, it, vi } from 'vitest'
import {
  browserResourceUrl,
  createImportedNode,
  getResourceKind,
  resourceLabel,
} from './resources.js'

describe('resource classification', () => {
  it('classifies common extensions and MIME types', () => {
    expect(getResourceKind({ name: 'chapter.pdf', type: 'application/pdf' })).toBe('pdf')
    expect(getResourceKind({ name: 'notes.docx' })).toBe('document')
    expect(getResourceKind({ name: 'marks.csv', type: 'text/csv' })).toBe('spreadsheet')
    expect(getResourceKind({ name: 'slides.pptx' })).toBe('presentation')
    expect(getResourceKind({ name: 'diagram.png', type: 'image/png' })).toBe('image')
    expect(getResourceKind({ name: 'recording.mp4' })).toBe('video')
    expect(getResourceKind({ name: 'voice.mp3' })).toBe('audio')
    expect(getResourceKind({ name: 'bundle.zip' })).toBe('archive')
    expect(getResourceKind({ name: 'script.js', type: 'text/plain' })).toBe('code')
    expect(getResourceKind({ name: 'readme.md' })).toBe('text')
    expect(getResourceKind({ name: 'mystery.bin' })).toBe('other')
  })
})

describe('resource labels and imported nodes', () => {
  it('returns a concise label without resource directories', () => {
    expect(resourceLabel({ path: '/resources/course/lecture-notes.pdf' })).toBe('lecture-notes.pdf')
    expect(resourceLabel({ label: 'A friendly label', path: '/resources/ignored.pdf' })).toBe('A friendly label')
  })

  it('creates imported node metadata without a prerequisite', () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-resource')
    const file = {
      name: 'lecture_notes.pdf',
      type: 'application/pdf',
      size: 2048,
      lastModified: 123,
    }

    const node = createImportedNode(file, 'Compiler Design', 2)

    expect(node).toMatchObject({
      id: 'imported-2-lecture-notes',
      project: 'Compiler Design',
      title: 'Lecture notes',
      resource: {
         type: 'pdf',
         label: 'lecture_notes.pdf',
         source: 'imported',
         path: 'blob:test-resource',
         temporary: true,
        name: 'lecture_notes.pdf',
        mimeType: 'application/pdf',
        size: 2048,
        lastModified: 123,
      },
      question: expect.any(String),
      progress: 0,
      status: 'todo',
    })
    expect(node).not.toHaveProperty('parents')
    expect(node).not.toHaveProperty('prerequisites')
    expect(createObjectURL).toHaveBeenCalledWith(file)
    createObjectURL.mockRestore()
  })

  it('does not require object URL support', () => {
    const original = URL.createObjectURL
    URL.createObjectURL = undefined
    try {
      const node = createImportedNode({ name: 'notes.txt', type: 'text/plain' }, 'Reading', 0)
      expect(node.resource).not.toHaveProperty('path')
    } finally {
      URL.createObjectURL = original
    }
  })
})

describe('browser resource URLs', () => {
  it('normalizes app-relative sample paths under /resources/', () => {
    expect(browserResourceUrl({ path: 'resources/sample.pdf' })).toBe('/resources/sample.pdf')
    expect(browserResourceUrl({ path: '/resources/sample.pdf' })).toBe('/resources/sample.pdf')
    expect(browserResourceUrl({ path: '/SampleSlides/CompilerDesign/01_introduction.pdf' })).toBe('/resources/SampleSlides/CompilerDesign/01_introduction.pdf')
  })

  it('leaves object URLs unchanged', () => {
    expect(browserResourceUrl({ path: 'blob:http://localhost/resource-id' })).toBe('blob:http://localhost/resource-id')
  })
})
