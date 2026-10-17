const RESEARCH_EXTENSIONS = new Map([
  ['pdf', 'pdf'],
  ['bib', 'bibtex'],
  ['bibtex', 'bibtex'],
  ['ris', 'ris'],
  ['enw', 'endnote'],
  ['endnote', 'endnote'],
  ['nbib', 'pubmed'],
  ['csl', 'citation'],
  ['csljson', 'citation'],
  ['txt', 'text'],
  ['text', 'text'],
  ['md', 'text'],
  ['markdown', 'text'],
  ['tex', 'latex'],
  ['latex', 'latex'],
  ['sty', 'latex'],
  ['cls', 'latex'],
  ['xml', 'xml'],
  ['json', 'json'],
  ['doc', 'document'],
  ['docx', 'document'],
  ['rtf', 'document'],
  ['odt', 'document'],
  ['epub', 'epub'],
  ['djvu', 'djvu'],
  ['ps', 'postscript'],
])

const RESEARCH_MIME_TYPES = new Map([
  ['application/pdf', 'pdf'],
  ['application/x-bibtex', 'bibtex'],
  ['text/x-bibtex', 'bibtex'],
  ['application/x-research-info-systems', 'ris'],
  ['application/ris', 'ris'],
  ['application/x-endnote', 'endnote'],
  ['application/vnd.endnote', 'endnote'],
  ['application/x-endnote-refer', 'endnote'],
  ['text/plain', 'text'],
  ['text/markdown', 'text'],
  ['application/x-latex', 'latex'],
  ['text/x-tex', 'latex'],
  ['application/xml', 'xml'],
  ['text/xml', 'xml'],
  ['application/json', 'json'],
])

const RESEARCH_KINDS = new Set([
  'research',
  'research-paper',
  'pdf',
  'bib',
  'bibtex',
  'ris',
  'enw',
  'endnote',
  'text',
  'citation',
])

function stringValue(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function resourcePath(fileOrResource) {
  if (typeof fileOrResource === 'string') return fileOrResource
  if (!fileOrResource || typeof fileOrResource !== 'object') return ''

  return stringValue(fileOrResource.name)
    || stringValue(fileOrResource.path)
    || stringValue(fileOrResource.url)
    || stringValue(fileOrResource.label)
}

function resourceName(fileOrResource) {
  const path = resourcePath(fileOrResource).split(/[?#]/, 1)[0]
  const name = path.split(/[\\/]/).pop() || ''

  try {
    return decodeURIComponent(name)
  } catch {
    return name
  }
}

function extensionOf(fileOrResource) {
  const name = resourceName(fileOrResource)
  const match = name.match(/\.([^.]+)$/)
  return match ? match[1].toLowerCase() : ''
}

function mimeTypeOf(fileOrResource) {
  if (!fileOrResource || typeof fileOrResource !== 'object') return ''
  return stringValue(
    fileOrResource.type
      || fileOrResource.mimeType
      || fileOrResource.mime
      || fileOrResource.contentType,
  ).toLowerCase().split(';', 1)[0]
}

function declaredKindOf(fileOrResource) {
  if (!fileOrResource || typeof fileOrResource !== 'object') return ''
  return stringValue(
    fileOrResource.kind
      || fileOrResource.sourceType,
  ).toLowerCase()
}

function sourceTypeOf(fileOrResource) {
  const extension = extensionOf(fileOrResource)
  if (RESEARCH_EXTENSIONS.has(extension)) return RESEARCH_EXTENSIONS.get(extension)

  const mime = mimeTypeOf(fileOrResource)
  if (RESEARCH_MIME_TYPES.has(mime)) return RESEARCH_MIME_TYPES.get(mime)
  if (mime.startsWith('text/')) return 'text'

  const declaredKind = declaredKindOf(fileOrResource)
  return declaredKind || 'research'
}

/** Return whether a file-like value is a paper, citation export, or research text. */
export function isResearchResource(fileOrResource) {
  const extension = extensionOf(fileOrResource)
  if (RESEARCH_EXTENSIONS.has(extension)) return true

  const mime = mimeTypeOf(fileOrResource)
  if (RESEARCH_MIME_TYPES.has(mime) || mime === 'application/octet-stream') {
    return mime === 'application/octet-stream'
      ? extension === 'pdf'
      : true
  }

  return RESEARCH_KINDS.has(declaredKindOf(fileOrResource))
}

function stemOf(fileOrResource) {
  return resourceName(fileOrResource).replace(/\.[^.]+$/, '')
}

function cleanDoi(value) {
  const match = value.match(/(?<![0-9])10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i)
  if (!match) return ''
  return match[0].replace(/[),.;:!?\]}]+$/, '')
}

function cleanTitle(value) {
  return value
    .replace(/(?:^|[_\s-])doi(?:$|[_\s-])/gi, ' ')
    .replace(/[\[\](){}]/g, ' ')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.,;:]+|[\s.,;:]+$/g, '')
    .trim()
}

function yearFrom(value) {
  const match = value.match(/(?<!\d)(?:19|20)\d{2}(?!\d)/)
  return match ? Number(match[0]) : undefined
}

/** Derive stable, filename-only metadata without opening or parsing the file. */
export function researchMetadataFromFile(file) {
  const stem = stemOf(file)
  const doi = cleanDoi(stem)
  const withoutDoi = doi ? stem.replace(doi, ' ') : stem
  const year = yearFrom(withoutDoi)
  const withoutTokens = withoutDoi.replace(/(?<!\d)(?:19|20)\d{2}(?!\d)/g, ' ')
  const parts = withoutTokens.match(/^\s*(.*?)\s+-\s+(.+?)\s*$/)
  const hasAuthorPattern = Boolean(parts && parts[1].trim() && parts[2].trim())
  const authors = hasAuthorPattern ? [cleanTitle(parts[1])] : []
  const title = cleanTitle(hasAuthorPattern ? parts[2] : withoutTokens) || 'Untitled research paper'
  const metadata = {
    title,
    authors,
    sourceType: sourceTypeOf(file),
  }

  if (year !== undefined) metadata.year = year
  if (doi) metadata.doi = doi
  return metadata
}

/** Trim a topic and use the supplied trimmed fallback when it is blank. */
export function normaliseResearchTopic(value, fallback = '') {
  const topic = stringValue(value)
  return topic || stringValue(fallback)
}

/** Return the ungated fields shared by research-paper nodes. */
export function researchNodeFields(metadata, topic) {
  return {
    kind: 'research-paper',
    topic: normaliseResearchTopic(topic, 'Research'),
    research: metadata,
  }
}
