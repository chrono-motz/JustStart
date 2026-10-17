# Question-pack format

Question packs let you add hundreds of CP, probability, puzzle, or practice questions without turning every question into a separate card in the plan. Just Start imports one file as one concise question-collection node and keeps the optional answers and solutions with it.

## JSON (recommended for automation)

```json
{
  "title": "Quant Puzzles",
  "subject": "Quantitative Aptitude",
  "questions": [
    {
      "id": "q-001",
      "prompt": "What is the question?",
      "answer": "Optional short answer",
      "solution": "Optional worked solution",
      "tags": ["probability"]
    }
  ]
}
```

Only `title`, `questions`, and each question's `prompt` are required. `answer`, `solution`, `id`, `subject`, and `tags` are optional.

## Markdown (easy to write by hand)

```markdown
# Quant Puzzles
Subject: Quantitative Aptitude

## Q1
Prompt: What is the question?
Answer: Optional short answer
Solution: Optional worked solution
Tags: probability, counting

## Q2
Prompt: A question with no answer yet.
```

Upload either format using **Add files** or **Add folder**. A pack is shown as one node, so the plan remains readable even when the file contains hundreds of questions.
