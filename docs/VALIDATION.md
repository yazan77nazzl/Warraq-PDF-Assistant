# Verification — 14 October 2026

## Automated checks

23 Node.js tests passed on the Gemini/Vercel version:

- Arabic normalization and retrieval ranking.
- Chunk overlap and page-number preservation.
- Unsupported questions return no answer.
- Summary sampling and oversized/invalid page validation.
- Rejection of invented source identifiers.
- Structured Gemini request contract, header-only credentials, source validation and provider error handling.
- Vercel API handlers, no key exposure in config, session-key support, and rejection of OpenAI keys.
- HTTP UI/config serving, document QA, malformed JSON handling and origin restrictions.

## Browser checks

- Uploaded a synthetic three-page PDF through the in-app browser file chooser and confirmed all three pages were extracted.
- Tested Arabic return-policy retrieval and checked the first source was page 2.
- Tested a question unrelated to the document and confirmed the no-answer response.
- Tested English retrieval on the actual PDF.
- Opened page 2 and verified the original PDF canvas was displayed.
- Checked a 390px mobile viewport; no horizontal page overflow.
- Checked the desktop layout, deployed dark palette, and loaded SVG logo. Temporary screenshots and demonstration PDFs are excluded from the deliverable.

## Live provider check

A live Gemini 3.5 Flash-Lite request succeeded with synthetic return-policy text. The Arabic answer correctly returned 14 days and cited page 1. No real CV or private document was used. Account billing tier was not verified; the owner must keep the Google project on Free Tier. The deployed Vercel interface and configured-provider badge were verified. The production provider quota and billing tier are owner-controlled. OCR is not implemented.
