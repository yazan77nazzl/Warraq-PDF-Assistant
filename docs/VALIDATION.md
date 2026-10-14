# Verification — 14 October 2026

## Automated checks

34 Node.js tests passed, including Arabic normalization, BM25 ranking, synonym retrieval, cross-language semantic retrieval, rank fusion, cache isolation, malformed embeddings, quota fallback, bounded conversation history, grounded citation validation, English errors, complete static interface translations, and Vercel/HTTP handlers.

JavaScript syntax checks passed for the browser module. Secrets are excluded from Git and ZIP deliverables.

## Live Gemini checks

Gemini Embedding 2 returned 768-dimensional vectors with the configured Google key. A live hybrid search answered an Arabic colloquial installment question over English document text and cited page 1. An English follow-up correctly answered three monthly installments and cited page 1. A question about the capital of France returned notFound=true with no sources. Only synthetic document content was used. The deployed Vercel /api/config reported Arabic and English support and Gemini Embedding 2. A production /api/chat request returned HTTP 200, hybrid search, an English installment answer, and page 1 attribution. The published HTML contained the language switch.

## Interface verification

The prior dark interface and 390px mobile layout were browser-verified before this upgrade. The bilingual HTML and attributes are checked for translation coverage. The browser connection was unavailable during the bilingual upgrade, so live language switching, populated-chat rendering and responsive English layout have not yet been visually verified.

## Practical limits

Semantic indexing has a 12-second deadline and falls back to keyword search. The vector cache is bounded and temporary; Vercel cold starts may repeat indexing. OCR is not implemented. Account billing tier and quota are owner-controlled. Test results do not guarantee every document answer is correct; inspect cited source pages.
