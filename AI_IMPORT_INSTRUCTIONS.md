# Just Start AI intake instructions

This document is the `AGENTS.md` input for a Just Start intake. The AI receives
**exactly three inputs**:

1. `AGENTS.md` (this instruction file).
2. `JUSTSTART_CONTEXT.json` (the existing-workspace catalog described below).
3. The user's source ZIP or source folder.

The user uploads only those three inputs to the AI. Do not expect, request, or
use extra chat instructions, loose files, pasted folder listings, links, paper
citations, or other attachments. Inspect only the supplied source ZIP/folder
and the metadata in `JUSTSTART_CONTEXT.json`; do not claim to have opened a
file, visited a link, or read a paper that is not available in those inputs.

## Existing Just Start context (input catalog only)

If a file named exactly `JUSTSTART_CONTEXT.json` is supplied, read it as an
input catalog exported from an existing Just Start workspace. It lists existing
focus areas, topics, and resource identities so you can avoid duplicating work
or propose useful additions. It is context for this intake, **not the output**:
do not overwrite it, treat it as a completed manifest, or return it in place of
the required `manifest.json` below. The output contract remains the manifest
described in this document, and any new items should still be supported by the
files and metadata actually supplied in the source ZIP/folder.

## Required result: create a file

The user does not upload `manifest.json` to the AI. You create it from the
three inputs, return it as a downloadable attachment, and the user then uploads
that `manifest.json` back to Just Start with the matching source ZIP/folder.
Just Start handles importing later; do not import anything yourself.

Your primary job is to **create a downloadable file**, not to print the JSON in
the chat response.

1. Analyze the supplied `AGENTS.md`, `JUSTSTART_CONTEXT.json`, and source
   ZIP/folder.
2. Create a file named exactly `manifest.json` containing the completed Just
   Start manifest described below. If the chat supports a workspace or output
   folder, save it as `just-start-import/manifest.json`.
3. Validate the file before returning: it must be valid JSON and follow every
   rule in this document.
4. Return **only** the created `manifest.json` as a downloadable attachment.
5. Do not paste any JSON into the chat, do not wrap it in Markdown fences, do
   not replace the attachment with a prose summary, and do not return another
   output file. The app handles importing after the user uploads the attachment
   back to Just Start.

If file creation or attachment is unavailable in the current AI conversation,
say that a downloadable file could not be created and ask the user to enable a
file/output tool. Do not dump the full manifest into the chat as a fallback.

Your task is to prepare a small, reviewable study or research collection for
Just Start. Group related sources into broad topics based on the user's actual
top-level folders and subject areas, and turn each usable source into one item.
Preserve useful source names and exact relative paths so the person can match
the manifest to the files selected in Just Start.

## Topic grouping: broad folders and subjects only

The `topics` array is a set of broad user-facing buckets. It is **not** a list
of every lecture, subtopic, file series, chapter, week, or inferred concept.

- Inspect the actual top-level folders in the supplied source ZIP/folder and the
  broad subject labels they establish. Use those folders/subjects as the
  authoritative grouping.
- Create **one manifest topic per broad top-level folder or broad subject**.
  If a folder name and its contents describe the same subject, create one topic
  for that subject rather than topics for its nested folders or filenames.
- In the expected example, when the source contains the four broad areas
  **Operating Systems**, **Compiler Design**, **Operations Research**, and
  **Research Papers**, the manifest must contain exactly those four topics and
  no topic for individual lectures or subtopics. A folder named `OS` should be
  represented by the broad topic title `Operating Systems` when the contents
  clearly establish that meaning.
- Do not create topics such as `Virtual Memory`, `Parsing`, `Simplex`,
  `Week 01`, `Lecture 05`, `Paper 1`, or a separate topic for each numbered
  file. Those are item titles, descriptions, or source paths under their one
  broad subject topic.
- Assign **every eligible source item to exactly one** of the broad topics via
  `topicId`. Do not leave an item unassigned, assign it to multiple topics, or
  split one broad subject across filename series. A root-level item must be
  assigned to the single broad subject supported by its path/content; do not
  invent a miscellaneous topic merely to avoid making that decision.
- Do not invent extra topics. Add another topic only when the source contains a
  genuinely separate top-level folder or broad subject area that is distinct
  from the others. Existing topics in `JUSTSTART_CONTEXT.json` may help match
  identities, but they must not cause more granular topics than the source
  folders/subjects require.
- Preserve the source folder structure. For every file resource, use the exact
  original path relative to the supplied ZIP/folder root, with forward slashes;
  never flatten, rename, or replace a path with an inferred path.

## Source handling

- Apply the following rules only to files and metadata found inside the
  supplied source ZIP/folder. A URL mentioned in a source file may be used as a
  URL resource; an unavailable external URL is not an additional input.
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
- **Uncertain classifications:** Do not guess silently. Keep the item in the
  broad source-folder/subject topic, keep the original source as the resource,
  and add a specific warning such as `Classification inferred from filename;
  review before use.`
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

Save the completed Just Start manifest as `manifest.json` and return only that
file as a downloadable attachment. Never paste the manifest into the
conversation; the user uploads the attachment back to Just Start, where the
app handles importing.
