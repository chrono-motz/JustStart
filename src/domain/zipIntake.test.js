import { zipSync } from 'fflate/browser'
import { describe, expect, it } from 'vitest'
import {
  ZipPathError,
  enumerateZipFiles,
  readZipFile,
} from './zipIntake.js'

function zip(entries) {
  return new Blob([zipSync(Object.fromEntries(
    entries.map(([path, content]) => [path, new TextEncoder().encode(content)]),
  ))])
}

describe('ZIP intake', () => {
  it('reads a File-like ZIP input into relative-path files and a lookup map', async () => {
    const result = await readZipFile(zip([
      ['course/week-01/notes.pdf', 'pdf bytes'],
      ['course/week-01/README.md', 'notes'],
      ['__MACOSX/._notes.pdf', 'metadata'],
      ['course/week-01/.DS_Store', 'metadata'],
    ]))

    expect(result.entries.map(({ path, size, mimeType }) => ({ path, size, mimeType }))).toEqual([
      { path: 'course/week-01/notes.pdf', size: 9, mimeType: 'application/pdf' },
      { path: 'course/week-01/README.md', size: 5, mimeType: 'text/markdown' },
    ])
    expect(result.files).toHaveLength(2)
    expect(result.files[0].name).toBe('notes.pdf')
    expect(result.files[0].webkitRelativePath).toBe('course/week-01/notes.pdf')
    expect(result.fileMap.get('course/week-01/README.md').name).toBe('README.md')
  })

  it.each([
    '/etc/passwd',
    '\\server\\share\\secret.txt',
    'C:\\Users\\secret.txt',
    '../secret.txt',
    'course/../../secret.txt',
    'course/%2e%2e/secret.txt',
  ])('rejects unsafe ZIP entry path %s', (path) => {
    expect(() => enumerateZipFiles({ [path]: new Uint8Array([1]) })).toThrow(ZipPathError)
  })

  it('rejects unsafe paths when they arrive inside a ZIP archive', async () => {
    await expect(readZipFile(zip([['../outside.txt', 'secret']]))).rejects.toThrow(ZipPathError)
  })

  it('normalizes harmless dot and backslash segments without allowing traversal', () => {
    const result = enumerateZipFiles({
      'course\\week-01\\.\\notes.txt': new Uint8Array([1, 2]),
      'course/100% notes.txt': new Uint8Array([3]),
    })
    expect(result.map(({ path }) => path)).toEqual([
      'course/week-01/notes.txt',
      'course/100% notes.txt',
    ])
  })
})
