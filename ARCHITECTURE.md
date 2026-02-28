# Architecture

## Scope

This prototype is a local-first document editor focused on one hard problem: deterministic live pagination during editing. The codebase is split into three layers:

- `packages/core`: canonical document model, incremental editing, text measurement, line breaking, and pagination
- `packages/react`: React + Konva renderer, caret mapping, pointer/keyboard wiring
- `apps/web`: demo shell, bootstrap, and local persistence

The key design choice is to keep layout as a pure data pipeline. Rendering consumes a layout snapshot; it does not decide line breaks or page breaks on its own.

## Editor State Model

`@knova/core` owns the authoritative editor state in the `Editor` class. Its public `EditorState` contains:

- `version`: monotonically increasing document revision
- `text`: flattened document text with `\n` paragraph separators
- `caretIndex`: caret position in source text coordinates
- `document`: materialized block model used by the UI
- `layoutSnapshot`: derived pagination result

There are two document representations on purpose:

1. `EditorDocument`
   A block-oriented model used as the canonical external shape. In the current prototype, it contains only paragraph blocks plus document-level `LayoutSettings`.
2. `LayoutDocumentView`
   A normalized internal view optimized for edits and layout. It stores one flat text buffer, paragraph break offsets, and per-paragraph style/revision metadata.

This split keeps editing simple without forcing the layout engine to walk a richer editor tree on every keystroke.

## Pagination Algorithm

The layout pipeline is:

1. Normalize `EditorDocument` into `LayoutDocumentView`
2. Tokenize each paragraph into word-like units
3. Measure glyphs through `FontMeasureCache`
4. Greedily break tokens into lines within the content width
5. Assemble a `ParagraphSkeleton` for each paragraph
6. Paginate paragraph lines into page slices

### Measurement and line breaking

Glyph widths are measured through a canvas-based measurer and cached by font bucket. Each paragraph layout is keyed by:

- paragraph revision
- content width
- font epoch
- paragraph style
- text style

If that key is unchanged, the engine reuses the cached paragraph skeleton. If source offsets moved but text/layout inputs did not, the skeleton is rebased instead of recomputed.

Line breaking is greedy. Tokens are added until the next token would overflow the page content width. Oversized tokens can be split at glyph boundaries so very long words still lay out deterministically.

### Pagination and reflow

Pagination operates on paragraph skeletons, not raw text. Each page stores `ParagraphSlice[]`, where a slice points to a line range within a paragraph. This gives three useful properties:

- a paragraph can span multiple pages without duplicating paragraph layout work
- source offsets remain stable for caret mapping and debugging
- repagination can restart from the first dirty page instead of rebuilding the entire document

When an edit occurs, `LayoutDocumentView.applyEdit()` returns `dirtyFromParagraph`. The layout engine recomputes only paragraphs from that boundary forward, then repaginates from the earliest affected page.

## Persistence Flow

Current implementation status: persistence is client-only. There is no backend API in this repository yet.

The current flow is:

1. `apps/web` loads either:
   - the last saved JSON payload from `localStorage`, or
   - bundled demo content from `apps/web/src/demo-data.ts`
2. The app creates one long-lived `CoreEditor` instance from that payload
3. On every editor state change, the app serializes:
   - `settings`
   - paragraph array
   - `caretIndex`
4. The serialized snapshot is written to `localStorage`
5. On refresh, the same payload is parsed and used to reconstruct the editor, which then recomputes the same layout snapshot

This keeps persistence at the application boundary. The core editor is intentionally unaware of browser storage.

If this prototype is extended to meet the case-study backend requirement, the intended change is narrow: replace the `localStorage` adapter in `apps/web` with `POST /documents` and `GET /documents/:id`, while leaving `@knova/core` and `@knova/react` unchanged.

## Rendering Flow

`@knova/react` subscribes to the core editor through `useSyncExternalStore`. The Konva renderer draws:

- fixed page rectangles
- paragraph slices on each page
- live caret placement derived from source offsets and line metrics

The renderer uses `layoutSnapshot.pages` and `layoutSnapshot.paragraphs` as input. It does not re-measure text or infer pagination from the DOM. That separation is what makes reloads and debugging predictable.

## Tradeoffs and Current Limits

- Text-only paragraphs are supported; rich inline content and non-text blocks are not.
- Determinism depends on stable font metrics. The font epoch is part of the cache key for that reason.
- Persistence is local-only today; a backend save/load API remains future work.
- The current page size is configured through `LayoutSettings` in demo data rather than hard-coded in the renderer.
