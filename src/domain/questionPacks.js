const MARKDOWN_SECTION = /^##\s+(?:Q|Question)\s*(\d+)\s*$/i
const MARKDOWN_FIELD = /^(Prompt|Answer|Solution|Tags):\s*(.*)$/i

function textValue(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function fileExtension(fileName) {
  if (typeof fileName !== 'string') return ''
  const name = fileName.split(/[?#]/, 1)[0]
  const dot = name.lastIndexOf('.')
  return dot > -1 ? name.slice(dot + 1).toLowerCase() : ''
}

function addOptional(target, key, value) {
  const text = textValue(value)
  if (text) target[key] = text
}

function normaliseTags(value) {
  if (value == null) return []
  if (typeof value === 'string') return value.split(',').map(textValue).filter(Boolean)
  if (!Array.isArray(value) || value.some((tag) => typeof tag !== 'string')) return null
  return value.map(textValue).filter(Boolean)
}

function normaliseQuestion(value, index, fallbackId) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const prompt = textValue(value.prompt)
  if (!prompt) return null

  const question = {}
  if (value.id != null) {
    if (typeof value.id !== 'string' && typeof value.id !== 'number') return null
    const id = String(value.id).trim()
    if (id) question.id = id
  } else if (fallbackId) {
    question.id = fallbackId
  }
  question.prompt = prompt

  for (const key of ['answer', 'solution']) {
    if (value[key] != null && typeof value[key] !== 'string') return null
    addOptional(question, key, value[key])
  }

  if (value.tags != null) {
    const tags = normaliseTags(value.tags)
    if (!tags) return null
    if (tags.length > 0) question.tags = tags
  }

  return question
}

function normalisePack(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const title = textValue(value.title)
  if (!title || !Array.isArray(value.questions) || value.questions.length === 0) return null

  const questions = value.questions.map((question, index) => normaliseQuestion(question, index))
  if (questions.some((question) => question == null)) return null

  const pack = { title, questions }
  const subject = textValue(value.subject)
  if (subject) pack.subject = subject
  return pack
}

function parseJson(text) {
  try {
    return normalisePack(JSON.parse(text))
  } catch {
    return null
  }
}

function parseMarkdown(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/)
  let lineIndex = 0
  while (lineIndex < lines.length && !lines[lineIndex].trim()) lineIndex += 1

  const titleMatch = lines[lineIndex]?.match(/^#\s+(.+?)\s*$/)
  if (!titleMatch) return null
  const title = textValue(titleMatch[1])
  if (!title) return null
  lineIndex += 1

  let subject
  while (lineIndex < lines.length && !lines[lineIndex].trim()) lineIndex += 1
  const subjectMatch = lines[lineIndex]?.match(/^Subject:\s*(.+?)\s*$/i)
  if (subjectMatch) {
    subject = textValue(subjectMatch[1])
    if (!subject) return null
    lineIndex += 1
  }

  const sections = []
  let section = null
  let activeField = null
  let invalid = false

  for (; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex].trim()
    if (!line) continue

    const sectionMatch = line.match(MARKDOWN_SECTION)
    if (sectionMatch) {
      if (section) sections.push(section)
      section = { id: `q${sectionMatch[1]}` }
      activeField = null
      continue
    }

    if (!section) {
      invalid = true
      break
    }

    const fieldMatch = line.match(MARKDOWN_FIELD)
    if (fieldMatch) {
      const field = fieldMatch[1].toLowerCase()
      if (section[field] !== undefined) {
        invalid = true
        break
      }
      section[field] = fieldMatch[2].trim()
      activeField = field
      continue
    }

    if (activeField) {
      section[activeField] = `${section[activeField]} ${line}`.trim()
    } else {
      invalid = true
      break
    }
  }
  if (section) sections.push(section)
  if (invalid || sections.length === 0) return null

  const questions = sections.map((raw, index) => {
    const tags = raw.tags == null ? undefined : normaliseTags(raw.tags)
    if (tags === null) return null
    return normaliseQuestion({ ...raw, ...(tags === undefined ? {} : { tags }) }, index, `q${index + 1}`)
  })
  if (questions.some((question) => question == null)) return null

  const pack = { title, questions }
  if (subject) pack.subject = subject
  return pack
}

/** Parse a JSON or supported Markdown question pack without throwing. */
export function parseQuestionPack(text, fileName = '') {
  if (typeof text !== 'string' || !text.trim()) return null
  const source = text.replace(/^\uFEFF/, '').trim()
  const extension = fileExtension(fileName)
  const looksJson = extension === 'json' || source.startsWith('{')
  if (looksJson) return parseJson(source)
  return parseMarkdown(source)
}

/** Return whether text is a valid question pack in a supported format. */
export function looksLikeQuestionPack(text, fileName = '') {
  return parseQuestionPack(text, fileName) !== null
}

/** Return concise metadata suitable for displaying an imported pack. */
export function questionPackSummary(pack) {
  const normalised = normalisePack(pack)
  if (!normalised) return null

  return {
    title: normalised.title,
    ...(normalised.subject ? { subject: normalised.subject } : {}),
    questionCount: normalised.questions.length,
    answeredCount: normalised.questions.filter((question) => question.answer || question.solution).length,
  }
}
