# Just Start AI intake instructions

Copy this entire document into a ChatGPT conversation (or another AI
conversation) together with the files you want to import, a ZIP of the files,
or a plain-text folder structure. The conversation may also contain problem
links, YouTube URLs, paper citations, or a mixture of all of these. Inspect the
inputs that are actually attached or written in the conversation; do not claim
to have opened a file, visited a link, or read a paper that is not available.

## Required result: create a file

Your primary job is to **create a downloadable file**, not to print the JSON in
the chat response.

1. Analyze the supplied attachments, archive, folder structure, and links.
2. Create a file named exactly `manifest.json` containing the completed Just
   Start manifest described below. If the chat supports a workspace or output
   folder, save it as `just-start-import/manifest.json`.
3. Validate the file before returning: it must be valid JSON and follow every
   rule in this document.
4. Attach the created `manifest.json` as a downloadable file in your response.
   A short response such as `manifest.json is ready to download.` is enough.
5. Do **not** paste the full JSON into the chat, do not wrap it in Markdown
   fences, and do not replace the file with a prose summary.

If file creation or attachment is unavailable in the current AI conversation,
say that a downloadable file could not be created and ask the user to enable a
file/output tool. Do not dump the full manifest into the chat as a fallback.

Your task is to prepare a small, reviewable study or research collection for
Just Start. Group related sources into useful topics and turn each usable
source into one item. Preserve useful source names and URLs so the person can
match the manifest to the files selected in Just Start.

## Source handling

- **PDFs:** Read the title and available text when possible. Classify each PDF
  conservatively as lecture notes, a textbook/chapter, a problem set, a paper,
  or another useful document. Keep the original relative filename in a file
  resource. A PDF that is clearly a slide export may be treated as a slide
  deck.
- **Slide decks:** Treat `.ppt`, `.pptx`, and clearly identified slide-export
  PDFs as presentations. Make one concise item for a deck unless the input
  clearly contains useful independent sections. Keep the deck filename as the
  file path.
- **Documents:** Handle `.doc`, `.docx`, `.md`, `.txt`, HTML, and similar
  documents according to their actual content (notes, specifications,
  tutorials, assignments, or references). Keep the supplied relative path.
- **Problem links:** Use an `http` or `https` URL resource for an online
  programming, mathematics, interview, or other problem page. Do not invent a
  downloaded filename. Include the problem site and any known identifier in
  the title or description.
- **YouTube URLs:** Keep a YouTube URL as a URL resource. Use the visible title
  or surrounding context when available, and add a warning when the video
  title, transcript, or educational purpose could not be verified. Do not
  pretend to have watched the video.
- **Papers:** For a paper file, use its attached relative filename as the file
  resource and put known citation details in `research` (title, authors, year,
  DOI, venue, and/or `sourceUrl`). For a paper URL without an attached file,
  use the URL resource. Do not fabricate authors, dates, DOI values, venues, or
  findings; mark incomplete or inferred metadata with a warning.
- **Uncertain classifications:** Do not guess silently. Use a broad, useful
  topic or title, keep the original source as the resource, and add a specific
  warning such as `Classification inferred from filename; review before use.`
  If a source is clearly unrelated, duplicate, or only operating-system
  metadata (for example `.DS_Store`, `Thumbs.db`, or `__MACOSX` entries), omit
  it. If a source cannot be safely matched to an attached path or real URL,
  omit it or explain the uncertainty in the manifest-level `warnings` array.

## Output contract for `manifest.json`

The **contents of the created file** must be JSON only. Do not put Markdown
fences, headings, comments, prose, or a preamble in the file. The top-level
object must have exactly these supported fields:

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
      "parents": [
        {
          "id": "another-item-id",
          "threshold": 0.75,
          "confidence": 0.92,
          "reason": "This lecture introduces parsing after lexical analysis."
        }
      ],
      "parentRule": "ALL",
      "progressThreshold": 0.65,
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

The example is illustrative: omit optional fields that are not supported by
the inputs. Follow these rules exactly:

1. `schemaVersion` is the string `"1.0"`. `topics` and `items` are both
   non-empty arrays.
2. Every topic and item has a stable, unique string `id` shared across both
   arrays. IDs may contain only letters, numbers, `.`, `_`, `:`, and `-`.
   Do not use array indexes as IDs.
3. Every item has a non-empty `title`, a `topicId` that names a topic, and one
   `resource` object. A resource is either
   `{ "type": "file", "path": "..." }` or
   `{ "type": "url", "url": "https://..." }`.
4. File paths must be relative to the supplied folder structure or archive
   root. Use forward slashes, such as `lectures/week-01.pdf`. Never use an
   absolute path, Windows drive or UNC prefix, a leading slash, `..` path
   segments, `file:` URLs, or a path to a secret. Use the exact relative path
   shown with the attachment when one is available.
5. URL resources must use only `http` or `https` and must not contain a
   username, password, API key, token, or other credentials. This includes
   YouTube links.
6. `parents`, when present, contains existing item IDs or dependency objects.
   An object may include `id`, `threshold`, `confidence`, and `reason`.
   `threshold` and `confidence` use 0..1 (percent values from 0..100 are also
   accepted). `parentRule` is optional and must be `ALL` or `ANY`; the default
   is `ALL`. A parent cannot be the item itself, and prerequisite relationships
   must not form a cycle. Only add prerequisites supported by the source
   collection; otherwise omit `parents`.
7. `estimatedMinutes`, when present, is a positive integer. `difficulty`, when
   present, is one of `beginner`, `intermediate`, `advanced`, or `expert`.
8. `description`, `research`, and `warnings` are optional. Warnings must be
   strings. Research metadata must be JSON data, contain no secrets, and only
   include facts supported by the inputs. Put uncertainty, inferred metadata,
   inaccessible links, and incomplete citations in warnings.
9. Do not add fields outside the contract, do not embed file contents, and do
   not return credentials or private tokens. Check that every referenced file
   path exists in the supplied folder structure or attachments and that every
   URL is copied accurately before responding.

Save the completed Just Start manifest as `manifest.json` and attach that file.
In the chat message, provide only a short confirmation and the download. Never
paste the full manifest into the conversation.
