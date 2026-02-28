# Layout Engine Design

## Goal

Define the MVP layout engine for the Knova editor.

Current target pipeline:

1. tokenization
2. measurement
3. line breaking
4. paragraph layout
5. pagination

Current scope is intentionally narrow:

- English-first text layout
- fixed page size
- single column
- greedy line breaking
- paragraph text only
- layout result reusable by Konva renderer later

Current non-goals:

- justification
- hyphenation dictionary
- bidirectional text
- CJK layout correctness
- advanced inline widgets
- table or multi-column layout

## Architectural Boundary

This document introduces a distinction that matters for the rest of the system.

There are two different models involved:

- canonical document model
  The editor-facing tree described in [document-model.md](/Users/zw/zw/knova-task/packages/core/docs/document-model.md)
- layout document view
  A normalized text-oriented view derived from the canonical document model and optimized for layout and incremental editing

The layout engine should consume the layout document view, not the editor tree directly.

Reason:

- the editor tree should stay expressive and extensible
- the layout engine should stay linear, cache-friendly, and easy to invalidate

## MVP Pipeline

The full pipeline is:

1. normalize editor document into layout document view
2. tokenize paragraph text into words
3. measure words and glyphs through the font cache
4. break words into lines
5. assemble paragraph skeletons
6. paginate paragraph skeletons into pages

The output of each stage should be reusable by the next stage without depending on Konva.

## Input and Output Contract

### Layout Input

The layout engine should take:

- layout document view
- document settings
- page content box size
- font environment
- layout options

The critical constraint is that layout depends on more than text alone.

A reusable layout entry must be considered invalid if any of the following changes:

- paragraph text
- paragraph style
- text style
- page width
- page height
- font metrics epoch

Because of that, cache validation cannot rely on a single global `docVersion` only.

### Layout Output

The engine should produce a layout snapshot:

- paragraph skeleton cache
- paginated pages
- metadata required for incremental reuse
- overall layout version

This snapshot is the only thing the renderer should need in order to draw pages and text.

## Skeleton Hierarchy

The intended hierarchy is:

Page
 └─ ParagraphSlice[]
      └─ Line[]
           └─ Word[]
                └─ Glyph[]

This is a good shape for the MVP because:

- pagination operates on paragraph fragments
- line layout operates on words
- measurement can still drill down to glyph level when needed

## Recommended Data Shapes

### Page

Suggested fields:

- `pageIndex`
- `top`
- `height`
- `contentTop`
- `contentHeight`
- `slices`

Responsibilities:

- groups all visible content for a page
- owns only positioned paragraph slices, not source text

### ParagraphSkeleton

Suggested fields:

- `paraIndex`
- `sourceStart`
- `sourceEnd`
- `lines`
- `contentHeight`
- `spacingBefore`
- `spacingAfter`
- `totalHeight`
- `layoutKey`

Important note:

`docVersion` alone is not enough for dirty detection. A paragraph cache entry should instead carry a `layoutKey` or equivalent revision bundle derived from:

- paragraph content revision
- paragraph style revision
- width constraint
- font metrics epoch

Responsibilities:

- stores the fully laid out result for one logical paragraph
- acts as the main cache boundary for incremental layout

### ParagraphSlice

Suggested fields:

- `paraIndex`
- `lineStart`
- `lineEnd`
- `top`
- `height`
- `includesSpacingBefore`
- `includesSpacingAfter`

Responsibilities:

- represents the visible portion of one paragraph on one page
- allows cross-page paragraphs without duplicating paragraph layout

Rule:

- `spacingBefore` only applies to the first slice
- `spacingAfter` only applies to the last slice

### Line

Suggested fields:

- `words`
- `width`
- `contentWidth`
- `trailingWhitespaceWidth`
- `height`
- `ascent`
- `descent`
- `baseline`

Responsibilities:

- stores the result of greedy line fitting
- provides enough metrics for vertical stacking and later caret mapping

### Word

Suggested fields:

- `glyphs`
- `width`
- `contentWidth`
- `trailingWhitespaceWidth`
- `breakAfter`
- `sourceStart`
- `sourceEnd`

One field should be renamed from the initial proposal:

- prefer `breakAfter` over `breakable`

Reason:

- line breaking in this model happens after a word-like unit
- the flag is about the break opportunity after the unit, not about the unit itself

### Glyph

Suggested fields:

- `text`
- `width`
- `sourceOffset`

For MVP, `Glyph` may correspond to a single character.

However, one design caution matters:

- if future scope expands beyond simple English, one rendered unit may no longer equal one JavaScript character

Because of that, this node should be understood as a layout atom, not a strict UTF-16 code unit.

Optimization note:

- ascent and descent should preferably be shared at the font or line level instead of duplicated on every glyph

## Layout Document View

For layout and editing performance, the engine should use a normalized text-oriented view.

Suggested shape:

- `text`
  Full plain-text buffer
- `paragraphBreakOffsets`
  Sorted offsets of `\n`
- `version`
  Global content version

This is the structure referred to below when discussing `applyEdit`.

The name `paragraphBreakOffsets` is clearer than `paragraphOffsets`, because the stored values are newline positions rather than paragraph starts.

## Paragraph Indexing

### Find Paragraph By Character Position

Lookup should be `O(log n)` using binary search over `paragraphBreakOffsets`.

Result:

- paragraph index
- start offset
- end offset

This is sufficient to mark the first affected paragraph after an edit.

### Apply Edit

For a text edit:

1. update the underlying text buffer
2. update existing break offsets
3. insert offsets for any new `\n` in inserted text
4. bump version
5. return the first affected paragraph index

Expected complexity:

- `O(n)` in paragraph count for offset maintenance

This is acceptable for the current scope.

### Structural vs Local Edit

Not every edit should trigger the same invalidation behavior.

Use two categories:

- local edit
  no newline inserted or removed
- structural edit
  paragraph boundaries changed because a newline was inserted or removed

Recommended invalidation rule:

- local edit: dirty only the edited paragraph
- structural edit: dirty from the first affected paragraph onward

This gives substantially better reuse than always using `dirtyFromPara = editedPara`.

## Font Measurement Cache

Use a two-level cache:

- Level 1
  `Map<FontKey, GlyphCache>`
- Level 2
  `LRUMap<char, GlyphMetrics>`

Recommended Level 2 limit:

- 1024 entries per font bucket

### FontKey

`FontKey` should include only fields that affect glyph metrics:

- font family
- font size
- font weight
- font style

It should not include:

- page size
- paragraph spacing
- page margins

Recommended caution:

- do not include `letterSpacing` in `FontKey` if spacing is applied between glyphs during word assembly

If `letterSpacing` is folded into the font cache key, cache cardinality grows much faster than necessary.

### Metric Source Priority

Priority order:

1. Level 2 cache hit
2. `CanvasRenderingContext2D.measureText`
3. fallback estimate when advanced font box fields are unavailable

Fallback can use DOM measurement for emergency approximation, but this should be treated as a compatibility path, not the default.

### Invalidation

Use explicit cache invalidation hooks:

- `evictFont(fontKey)`
  when a font style bucket becomes invalid
- `clear()`
  when a global relayout or environment reset is needed
- font epoch bump
  when web fonts finish loading and previous measurements may be stale

## Tokenization

The current MVP says English-first, so the tokenizer should be designed around English text.

Recommended token classes for MVP:

- word
  continuous letters and digits
- punctuation
  attached to the previous word when possible
- space
  attached to the previous word as trailing whitespace
- tab
  standalone token with width equal to four spaces

Recommended behavior:

- `"hello"` becomes one word
- `"hello "` becomes one word with trailing whitespace
- `"hello,"` stays attached to the same word
- break opportunity is usually represented after whitespace-bearing words

For the current scope, defer:

- CJK segmentation
- emoji-aware grapheme segmentation
- hyphenation dictionaries

If such characters appear before explicit support lands, they may be treated as standalone word units.

## Measurement

Measurement runs after tokenization.

The measurement stage should:

- measure glyph widths through the font cache
- aggregate glyph widths into word widths
- track trailing whitespace width separately
- expose line height inputs to the line breaker

One practical rule should be locked now:

- overflow checks use `contentWidth`
- trailing spaces do not trigger line overflow by themselves

This avoids layout instability caused by a space at the end of a wrapped line.

## Line Breaking

Use greedy first-fit line breaking for the MVP.

Algorithm:

1. iterate words in order
2. keep appending while `currentContentWidth + nextWord.contentWidth <= maxWidth`
3. if overflow happens and the line is non-empty, flush the line
4. if a single non-whitespace token itself exceeds `maxWidth`, split it into continuation fragments on glyph boundaries
5. flush the final line

This is the correct MVP choice because it is:

- predictable
- fast
- easy to cache
- easy to debug during editing

Required line rules:

- trailing spaces do not count toward overflow checks
- hard line breaks flush immediately
- oversized non-whitespace tokens must be split into valid continuation fragments
- pure whitespace tokens do not split internally
- only the last fragment retains the original trailing whitespace

## Paragraph Layout

Paragraph layout owns:

- tokenization
- measurement
- line breaking
- paragraph height calculation

Recommended output:

- one `ParagraphSkeleton` per paragraph
- `Line.words` may contain full measured tokens or synthetic continuation fragments

Height formula should distinguish:

- content height
- spacing before
- spacing after
- total height

This is necessary because pagination should not need to redo text layout.

## Pagination

Pagination consumes paragraph skeletons, not raw text.

Use greedy page filling:

1. iterate paragraphs in order
2. iterate each paragraph's lines
3. if the next line does not fit and the current page is non-empty, flush page and continue on a new one
4. append line to the current page slice
5. split a paragraph into multiple slices if needed

### Page Reuse

Pagination should support prefix reuse.

Recovery strategy:

1. locate the first dirty paragraph
2. find the first page containing that paragraph
3. keep every page before that page
4. repaginate from there onward

This is the right MVP tradeoff:

- simple
- deterministic
- enough for incremental typing

Future optimization can attempt suffix reuse, but it is not needed now.

### Edge Cases

Rules to lock:

- if one line is taller than the page content height, force it onto a page anyway
- paragraph slices may start from `lineStart > 0`
- only the first slice gets paragraph spacing before
- only the last slice gets paragraph spacing after

These rules prevent infinite pagination loops.

## Incremental Layout

### Dirty Marking

On edit:

1. map text position to paragraph index
2. classify the edit as local or structural
3. mark dirty paragraphs
4. schedule one layout pass with `requestAnimationFrame`

This means the engine should not immediately relayout synchronously on every keystroke.

### Important Correction To The Initial Draft

This check is not sufficient:

- `paragraphCache[i].docVersion == model.version`

Reason:

- one edit increments the global version
- then every cached paragraph appears stale, even if its content and constraints did not change

Recommended replacement:

- cache by paragraph revision and layout constraints

Practical options:

- `layoutKey = paraRevision + width + fontEpoch + styleRevision`
- or explicit field comparison with the same inputs

### Recommended Rebuild Strategy

Phase 1: paragraph layout

- local edit
  recompute only dirty paragraphs
- structural edit
  recompute from first affected paragraph onward

Phase 2: pagination

- reuse pages before the first page touched by dirty paragraphs
- repaginate from that page onward

This gives good reuse while keeping implementation manageable.

## Scheduling and Long Task Control

### Frequent Typing

Use `requestAnimationFrame` debouncing:

- at most one layout pass per frame

This is enough for ordinary typing.

### Large Paste

When pasting large text:

- break work into time slices
- yield every roughly 10ms

This prevents a long blocking task on the main thread.

Time slicing should apply first to:

- paragraph relayout
- pagination over many pages

## Performance Targets

Target budget for MVP:

- `applyEdit`
  `O(n)` in paragraph count
- `findParagraphIndex`
  `O(log n)`
- single paragraph relayout
  linear in paragraph text length
- font cache hit
  `O(1)`
- incremental pagination
  linear in affected line count

Target user-facing goal:

- ordinary single-keystroke edits should usually stay within a few milliseconds

The exact number matters less than keeping typing visually stable and avoiding frame drops.

## Module Split

Recommended modules:

- `LayoutDocumentView`
  normalized text buffer and paragraph offset maintenance
- `FontMeasureCache`
  two-level font and glyph cache
- `Tokenizer`
  English-first tokenization
- `LineBreaker`
  greedy line fitting
- `ParagraphLayout`
  tokenization plus measurement plus line assembly
- `Paginator`
  page slicing and prefix reuse
- `LayoutEngine`
  dirty tracking, scheduling, and the main two-phase pipeline

This is a good split because:

- each module has one dominant responsibility
- caching boundaries are clear
- later testing will be straightforward

## Decisions Locked By This Spec

The following choices should be treated as settled for the MVP:

- English-first tokenization
- greedy first-fit line breaking
- paragraph-level layout cache
- page prefix reuse
- two-level font metric cache
- normalized layout document view separate from the editor document tree

## Next Recommended Spec

The next document should define the exact interface contracts:

- `LayoutDocumentView` fields and methods
- `ParagraphSkeleton` invariants
- `LayoutSnapshot` shape
- dirty-marking API and scheduling flow

That will let implementation start without redesigning core boundaries in the middle.
