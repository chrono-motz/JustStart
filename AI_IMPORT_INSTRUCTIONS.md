# AI import manifest instructions

Use this template when asking an AI system to prepare a Phase 1 intake manifest for Just Start. Return **JSON only**: no Markdown fences, comments, or extra prose.

```json
{
  "schemaVersion": "1.0",
  "topics": [
    {
      "id": "topic-unique-id",
      "title": "A useful topic title",
      "description": "Optional context for this topic."
    }
  ],
  "items": [
    {
      "id": "item-unique-id",
      "topicId": "topic-unique-id",
      "title": "A resource or learning step",
      "description": "Optional description of what this item covers.",
      "resource": {
        "type": "file",
        "path": "relative/path/to/resource.pdf",
        "label": "Optional display label",
        "mimeType": "application/pdf"
      },
      "parents": ["another-item-id"],
      "estimatedMinutes": 25,
      "difficulty": "intermediate",
      "research": {
        "title": "Optional source title",
        "authors": ["Optional author"],
        "year": 2024,
        "doi": "10.1234/example",
        "venue": "Optional venue",
        "sourceUrl": "https://example.com/source"
      },
      "warnings": ["Optional data-quality note"]
    }
  ],
  "warnings": ["Optional manifest-level data-quality note"]
}
```

## Contract

- `schemaVersion` is exactly the string `"1.0"`.
- `topics` and `items` are non-empty arrays. Every topic and item has an explicit, stable, unique string `id`; IDs are shared across both arrays and may contain letters, numbers, `.`, `_`, `:`, or `-`.
- Every item has a non-empty `title`, a `topicId` pointing to a topic, and one `resource` object.
- A file resource is `{ "type": "file", "path": "..." }`. Its path is relative to the workspace: do not use a leading slash, a Windows drive/UNC prefix, `..` path segments, or `file:` URLs.
- A URL resource is `{ "type": "url", "url": "https://..." }`. Only `http` and `https` URLs are accepted; do not include credentials in a URL.
- `parents`, when present, is an array of item IDs. Parents must exist, cannot be the item itself, and cannot form a cycle.
- `estimatedMinutes`, when present, is a positive integer. `difficulty` is one of `beginner`, `intermediate`, `advanced`, or `expert` (the aliases `easy`, `medium`, and `hard` are accepted and normalized).
- `description`, `research`, and `warnings` are optional. Warnings are strings; research metadata must be JSON data and must not contain secrets.
- The importer rejects malformed data instead of guessing. Fix each reported field path and try again.

Keep paths workspace-relative, use stable IDs rather than array indexes, and include a warning when source metadata is inferred or incomplete.
