# Verification — 14 October 2026

49 Node.js tests cover retrieval, citations, bilingual UI strings, query planning, adaptive review, request accounting, isolated answer caching, context compaction, broader retry, compressed Word packages, TXT encodings, PDF table coordinates, app-manifest names and PNG icon dimensions.

Live Gemini checks: a direct factual answer used one generation request; its identical repeat used zero provider requests; a two-row table total was independently reviewed and returned 46 USD with two generation requests. Older regression checks covered experience overlaps, comparisons and unsupported questions.

Browser reader checks ran in a temporary local test page with the actual browser DOMParser and DecompressionStream. Word extracted the table cells in column order; PPTX extracted two slides in presentation order; TXT extracted the expected text. The normal Chrome file chooser could not be automated because the extension lacks file-URL access, so the fixture-based reader check was used. Temporary QA pages and fixtures are removed before commit.

The iPhone name and icon metadata are validated; no physical iPhone installation was performed. Modern text-based formats are supported. OCR, binary .doc/.ppt and full Office rendering are outside this release. Review remains model-based and can be unavailable after quota/time limits; the response never claims an independent review succeeded when it did not. Cache persistence depends on a warm server instance.
