# AGENTS.md

## Cursor Cloud specific instructions

### Product overview
G1.ART Chief of Staff (COS) — Slack Socket Mode bot (Node.js/ESM). Single-process `node app.js`.

### Required environment variables
`SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `SLACK_APP_TOKEN`, `OPENAI_API_KEY`.
Optional: `OPENAI_MODEL`, `RUNTIME_MODE`, `STORAGE_MODE`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
See `.env.example` for full list.

### Running the app
```
npm start          # node app.js — connects to Slack via Socket Mode
```
The app requires valid Slack tokens. On startup it runs env validation, creates `data/` JSON files, prints a health snapshot, then starts the Slack WebSocket connection.

### Running tests
```
npm test           # runs all test scripts sequentially (no framework, pure ESM scripts); excludes legacy launch gate — see below
npm run test:router    # router lockdown + fixture replay only
npm run test:fixtures  # fixture replay only
npm run test:legacy-launch-regression  # `test-founder-launch-gate.mjs` (raw-text intent + artifact launch smoke)
```
Tests are self-contained `.mjs` scripts in `scripts/` — they do NOT require Slack or OpenAI credentials.

### Key caveats
- **No build step** — pure ESM JavaScript, no TypeScript, no bundler.
- **No Docker / docker-compose** — single `node app.js` process.
- **No lint configured** — the repo has no ESLint, Prettier, or other linter config.
- **Local storage default** — in `RUNTIME_MODE=local` (default when `NODE_ENV != production`), all state goes to `data/*.json` files; Supabase is optional.
- All Slack commands are in Korean (한국어).
- Tests exit 0 on success and non-zero on failure; final summary line: `passed: N  failed: N  skipped: N`.
