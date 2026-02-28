export const initialJson = `{
  "settings": {
    "pageWidth": 760,
    "pageHeight": 980,
    "margins": {
      "top": 72,
      "right": 64,
      "bottom": 72,
      "left": 64
    },
    "defaultTextStyle": {
      "fontFamily": "Georgia",
      "fontSize": 18,
      "fontWeight": 400,
      "fontStyle": "normal",
      "letterSpacing": 0
    },
    "defaultParagraphStyle": {
      "textAlign": "left",
      "lineHeight": 1.55,
      "spacingBefore": 0,
      "spacingAfter": 18
    }
  },
  "paragraphs": [
    {
      "id": "intro",
      "text": "Knova is testing a layout-first architecture. The demo on the right is rendered from paginated line boxes, not from raw paragraphs. Those slices are now painted through a Konva stage instead of a stack of DOM text nodes. The point is not visual polish yet. The point is to make every layout decision inspectable while the engine is still small enough to reason about."
    },
    {
      "id": "engine",
      "text": "The pipeline is intentionally narrow: tokenize, measure, line break, paragraph layout, and pagination. Because the engine is pure and page-aware, the DOM layer can stay thin and only map the computed result onto paper-like blocks. That separation matters because later the same snapshot can be painted into Konva, exported to PDF, or used for selection overlays without teaching each renderer how to paginate text from scratch."
    },
    {
      "id": "incremental",
      "text": "This JSON panel is editable. As long as the payload stays valid, the layout snapshot refreshes immediately. That gives you a fast way to inspect page slices, line ranges, spacing decisions, and raw source data while watching the Konva renderer redraw in real time. It also makes regressions easier to catch. If one edit changes only a single paragraph, you can compare the resulting page slices and quickly see whether the reuse strategy still behaves the way the engine design intended."
    },
    {
      "id": "model",
      "text": "At the document level the system stays deliberately plain. A document owns blocks. Paragraphs own inline text content. The layout engine does not store DOM nodes, canvas objects, or visual decorations. It only produces measurable structure: words, lines, paragraph skeletons, slices, and pages. That boundary keeps editing concerns from leaking into layout and keeps layout concerns from leaking into rendering."
    },
    {
      "id": "measure",
      "text": "Measurement is the first place where performance and correctness start pushing against each other. The engine needs widths quickly enough to keep typing responsive, but it also needs to stay honest about line breaks, especially when a paragraph is near the end of a page. That is why glyph metrics are cached by font bucket. Repeated letters, punctuation, and spaces become cheap, while full paragraph relayout still remains deterministic."
    },
    {
      "id": "pagination",
      "text": "Pagination is greedy in the current design. A page accepts as many lines as fit within the content box. When the next line does not fit, the current page is flushed and the paragraph continues on a new page as another slice. This behavior is intentionally simple. It avoids speculative balancing, makes the resulting structure easy to debug, and gives the renderer an explicit record of where a paragraph was split."
    },
    {
      "id": "editing",
      "text": "The later editing layer will care about more than text display. It will need stable source offsets, caret mapping, and line geometry that remains coherent after partial updates. That is why the current snapshot already carries ranges and line metrics instead of collapsing everything back into flat strings. A cheap demo can get away with less. An editor cannot."
    },
    {
      "id": "long",
      "text": "A longer paragraph helps force pagination. Repeatable structure is useful here because it makes it obvious when a paragraph is split into slices across pages. A longer paragraph helps force pagination. Repeatable structure is useful here because it makes it obvious when a paragraph is split into slices across pages. A longer paragraph helps force pagination. Repeatable structure is useful here because it makes it obvious when a paragraph is split into slices across pages. A longer paragraph helps force pagination. Repeatable structure is useful here because it makes it obvious when a paragraph is split into slices across pages. A longer paragraph helps force pagination. Repeatable structure is useful here because it makes it obvious when a paragraph is split into slices across pages. A longer paragraph helps force pagination. Repeatable structure is useful here because it makes it obvious when a paragraph is split into slices across pages."
    },
    {
      "id": "wrap-stress",
      "text": "This final paragraph exists mostly as a wrap stress case. It mixes short clauses with longer ones so the right column shows a more varied rhythm of lines instead of a uniform block. If the page breaks feel stable while this paragraph moves between pages, the Konva layer is doing its job: it is reflecting the layout snapshot rather than inventing a second pagination system on its own."
    }
  ]
}`;
