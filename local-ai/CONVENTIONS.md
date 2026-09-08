# CEA project rules

Stack: vanilla JS PWA (no framework, no build step, no npm at the frontend root).
Backend is a SEPARATE repo in `backend/` (Node + TypeScript + Prisma). Do not touch it.

Rules:
1. No frameworks, no imports, no bundler. Plain browser JS only.
2. `app.js` uses global functions and `var`/`function` style. Match it. Do not add `export`.
3. Keep every line ending as LF. Never rewrite a whole file just to change line endings.
4. UI strings are Arabic. Keep existing Arabic text exactly as-is unless asked to change it.
5. Never run git push, wrangler, or any deploy command.
6. `google-sheet/Code.gs` is Google Apps Script, not Node. No require/import, no async/await
   on UrlFetchApp. It is pasted into the Apps Script editor by hand.
7. If you bump the service worker cache, the format in `sw.js` is `cea-YYYYMMDDHHMM`.
8. Change only what was asked. Do not reformat, do not reorder, do not "clean up".
