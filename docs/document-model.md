# Document Model

## Goal

Design a document model that is:

- simple enough for the initial layout engine
- sufficient for word break, line break, and page calculation
- easy to extend later when editing and richer inline content are added

This model is intentionally logical, not visual. It describes content and formatting intent, but does not contain layout geometry or rendering details.

## Design Principles

1. Separate content from layout.
   The document model stores content, structure, and styles. It does not store line boxes, page numbers, x/y coordinates, or Konva nodes.
2. Prefer a shallow tree.
   The initial model should be easy to edit and easy to walk during layout.
3. Use block and inline boundaries explicitly.
   Pagination and paragraph flow work at the block level, while word and line breaking work inside inline content.
4. Keep extension points visible but inactive.
   The model should reserve room for inline atoms, richer blocks, and style references without forcing them into the MVP.

## Layer Boundaries

The editor should keep four separate layers:

- Document model
  Content, structure, styles, and document-level settings.
- Layout result
  Tokens, line boxes, block fragments, page fragments, and measured geometry.
- Render state
  Konva-specific draw objects and scene synchronization state.
- Editor state
  Selection, caret, IME composition, undo history, hover state, and active commands.

The document model must not absorb responsibility from the other three layers.

## Proposed MVP Shape

The initial shape is:

- Document
- Block[]
- Inline[]

This means:

- a document owns ordered block nodes
- a paragraph block owns ordered inline nodes
- inline nodes represent text or explicit breaks

This is the smallest shape that still supports text flow, pagination, and future editing.

## Node Types

### Document

Top-level container for the whole editor content.

Suggested fields:

- `id`
  Stable identifier for the document.
- `version`
  Schema version used for future migration.
- `meta`
  Lightweight metadata such as title, created time, or author if needed later.
- `settings`
  Document-level layout intent such as page size and default styles.
- `blocks`
  Ordered list of block nodes.

Responsibilities:

- defines the content order
- owns document-wide defaults
- acts as the single source of truth for layout input

### Paragraph

Primary block node for MVP text content.

Suggested fields:

- `id`
  Stable identifier.
- `type`
  Fixed block type marker for paragraphs.
- `style`
  Paragraph style object.
- `children`
  Ordered inline nodes.

Responsibilities:

- groups text that should be laid out as a paragraph
- provides paragraph-level formatting such as alignment and line height
- forms the primary unit for line layout

### TextRun

Basic inline node holding plain text and a text style.

Suggested fields:

- `id`
  Stable identifier.
- `type`
  Inline type marker for text.
- `text`
  Raw string content.
- `style`
  Text style object.

Responsibilities:

- stores actual text content
- defines style boundaries
- acts as the main source for word segmentation and measurement

### HardBreak

Explicit line break inside a paragraph.

Suggested fields:

- `id`
  Stable identifier.
- `type`
  Inline type marker for hard break.

Responsibilities:

- forces a new line within the current paragraph
- should be treated differently from automatic line wrapping

### PageBreak

Explicit manual page break between blocks.

Suggested fields:

- `id`
  Stable identifier.
- `type`
  Block type marker for page break.

Responsibilities:

- forces the next block flow onto a new page
- gives pagination a manual override point

This can remain dormant in early implementation, but it is worth reserving in the model now.

## Styles

Keep styles split into document defaults, paragraph styles, and text styles.

### DocumentSettings

Suggested content:

- page size
- page margins
- default paragraph style
- default text style

This stores layout intent, not computed layout output.

### ParagraphStyle

Keep MVP fields narrow:

- `textAlign`
- `lineHeight`
- `spaceBefore`
- `spaceAfter`

Optional later:

- first-line indent
- keep-with-next
- keep-together
- widow and orphan control

### TextStyle

Keep MVP fields narrow:

- `fontFamily`
- `fontSize`
- `fontWeight`
- `fontStyle`
- `color`
- `letterSpacing`

Optional later:

- text decoration
- background highlight
- baseline shift
- style reference tokens

## Normalization Rules

The model should keep a small set of invariants:

1. A document contains only block nodes.
2. A paragraph contains only inline nodes.
3. `HardBreak` is valid only inside a paragraph.
4. `PageBreak` is valid only at block level.
5. Empty paragraphs are valid.
6. Adjacent `TextRun` nodes with identical style should be mergeable.
7. Every node has a stable id.
8. The document remains valid even before layout has run.

These rules reduce edge cases in editing and layout.

## Why Runs Instead of Text With Style Ranges

For the MVP, paragraph content should be represented as ordered inline runs instead of a single text buffer with style ranges.

Reasons:

- easier to edit incrementally
- easier to split and merge around style changes
- explicit `HardBreak` nodes fit naturally
- future inline atoms can be added without redesigning the paragraph content model

A text-plus-range model is more compact, but mutation logic becomes harder earlier than it needs to.

## Extension Points

The model should remain simple now, but leave room for the following future additions.

### InlineAtom

A reserved inline concept for non-text inline content.

Potential future use:

- mention chip
- inline image
- formula token
- embedded widget

This should eventually behave like a measurable inline unit during layout.

### Additional Block Types

Potential future blocks:

- heading
- list item
- image block
- table block

For now, these should not affect the MVP model shape. Paragraph remains the primary content block.

### Style References

The MVP can store style objects directly. Later, the model can add style references or theme tokens without changing the block-inline structure.

## Explicit Non-Goals

The document model should not directly store:

- measured widths or heights
- tokenization results
- line boxes
- page indices
- x/y positions
- Konva node identifiers
- selection ranges
- caret state
- layout caches

All of those belong to layout, render, or editor layers.

## Fit With the Planned Roadmap

The roadmap is:

1. design and implement the layout engine
2. render on Konva
3. implement editing

This document model fits that order because:

- layout can consume the tree without knowing anything about Konva
- rendering can map layout output to Konva without mutating document structure
- editing can mutate a small number of predictable node types

## Recommended Next Design Step

After the document model, the next spec should define the layout input-output contract:

- what exact layout input is derived from the document
- what exact layout result is returned by the engine
- how word break, line break, and page calculation consume and produce data

That boundary is the most important one to lock down before implementation begins.
