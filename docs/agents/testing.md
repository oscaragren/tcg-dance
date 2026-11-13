# Testing

- `npm test` runs every file in `server/test/` and takes over 2 minutes. Run it with a Bash timeout of 600000 ms (the default 120000 ms kills it).
- Run one file with `node --test server/test/<name>.test.mjs`.
- `starter.test.mjs` "the checklist is hidden once every step is claimed" has timed out once under full-suite load (fetch HeadersTimeoutError). Re-run the file alone before treating it as a regression.
- Tests cover the server only (API seam via `server/test/harness.mjs`). UI changes are checked by `npm run build` (runs `tsc`).
