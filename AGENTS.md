# AGENTS.md

## Cursor Cloud specific instructions

### Product overview
G1.ART Chief of Staff (COS) — Slack Socket Mode bot (Node.js/ESM). Single-process `node app.js`.

**vNext.13.16:** 런타임은 창업자 면 전용이다. `CONSTITUTION.md`를 단일 거버넌스로 읽고, `registerFounderHandlers` → `handleFounderSlackTurn` → `runFounderDirectConversation` → `sendFounderResponse` 스파인만 사용한다. 레거시 명령 라우터·AI 라우터·`handleUserText`는 `app.js`에 연결되지 않는다.

### Required environment variables
`SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `SLACK_APP_TOKEN`, `OPENAI_API_KEY`.
Optional: `OPENAI_MODEL` (default `gpt-5.4`).
See `.env.example` for full list.

### Running the app
```
npm start          # node app.js — connects to Slack via Socket Mode
```
The app requires valid Slack tokens. On startup it validates env, logs `CONSTITUTION.md` SHA-256, then starts the Slack WebSocket connection.

### Running tests
```
npm test           # seven scripts: scripts/test-vnext16-*.mjs (constitution, spine, outbound, package)
```
Tests are self-contained `.mjs` scripts in `scripts/` — they do NOT require Slack or OpenAI credentials.

Legacy harness scripts under `scripts/` remain on disk but are not run by default `npm test`.

### Key caveats
- **No build step** — pure ESM JavaScript, no TypeScript, no bundler.
- **No Docker / docker-compose** — single `node app.js` process.
- **No lint configured** — the repo has no ESLint, Prettier, or other linter config.
- **Outbound:** founder 면 `partner_natural_surface` 응답은 `CONSTITUTION.md` §4.3에서 파싱한 금지 구절이 포함되면 Slack으로 보내지 않고 `founder_constitution_egress_blocked`로 실패한다.
