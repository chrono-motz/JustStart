import { describe, expect, it } from 'vitest'
import {
  looksLikeQuestionPack,
  parseQuestionPack,
  questionPackSummary,
} from './questionPacks.js'

describe('question pack imports', () => {
  it('parses JSON packs with answers and solutions', () => {
    const pack = parseQuestionPack(JSON.stringify({
      title: 'Compiler Design',
      subject: 'Computer Science',
      questions: [{
        id: 'cfg-1',
        prompt: 'What is a control-flow graph?',
        answer: 'A graph of possible control transfers.',
        solution: 'Represent each basic block as a node.',
        tags: ['graphs', 'fundamentals'],
      }],
    }), 'compiler.json')

    expect(pack).toEqual({
      title: 'Compiler Design',
      subject: 'Computer Science',
      questions: [{
        id: 'cfg-1',
        prompt: 'What is a control-flow graph?',
        answer: 'A graph of possible control transfers.',
        solution: 'Represent each basic block as a node.',
        tags: ['graphs', 'fundamentals'],
      }],
    })
  })

  it('parses JSON questions without optional answers', () => {
    const pack = parseQuestionPack('{"title":"Review","questions":[{"prompt":"Define parsing."}]}', 'review.json')

    expect(pack).toEqual({
      title: 'Review',
      questions: [{ prompt: 'Define parsing.' }],
    })
  })

  it('parses Markdown sections and preserves optional fields', () => {
    const markdown = `# Operating Systems
Subject: Computer Science

## Q1
Prompt: What is virtual memory?
Answer: An abstraction of physical memory.
Tags: memory, fundamentals

## Question 2
Prompt: Why use paging?
Solution: It separates virtual addresses from physical frames.
`

    expect(parseQuestionPack(markdown, 'memory.md')).toEqual({
      title: 'Operating Systems',
      subject: 'Computer Science',
      questions: [
        {
          id: 'q1',
          prompt: 'What is virtual memory?',
          answer: 'An abstraction of physical memory.',
          tags: ['memory', 'fundamentals'],
        },
        {
          id: 'q2',
          prompt: 'Why use paging?',
          solution: 'It separates virtual addresses from physical frames.',
        },
      ],
    })
  })

  it('returns non-throwing invalid results and does not expose input', () => {
    const malformed = '{"title":"Broken","questions":[{"prompt":}]}'
    expect(() => parseQuestionPack(malformed, 'broken.json')).not.toThrow()
    expect(parseQuestionPack(malformed, 'broken.json')).toBeNull()
    expect(parseQuestionPack('# Missing questions\n\n## Q1\nAnswer: no prompt', 'broken.md')).toBeNull()
    expect(looksLikeQuestionPack(malformed, 'broken.json')).toBe(false)
  })

  it('summarizes a valid pack without exposing question contents', () => {
    const pack = {
      title: 'Review',
      subject: 'Parsing',
      questions: [
        { prompt: 'First?' },
        { prompt: 'Second?', solution: 'A solution.' },
      ],
    }

    expect(questionPackSummary(pack)).toEqual({
      title: 'Review',
      subject: 'Parsing',
      questionCount: 2,
      answeredCount: 1,
    })
    expect(questionPackSummary({ questions: [] })).toBeNull()
  })
})
