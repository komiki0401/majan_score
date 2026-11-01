# Development and automatic publication

- The user authorizes completing feature/fix requests through commit, push to `main`, and GitHub Pages deployment without asking for release approval each time. This supersedes the earlier manual-publication guidance in the Windows handoff document.
- Use Node.js 24 / npm 11. On this Windows PC, installed Node.js 26 must not be used for tests; use the cached Node.js 24 via `npm.cmd exec --yes --package=node@24 -- npm.cmd ...` when needed.
- Work on a `codex/` branch. Before committing run `npm run verify` (tests, explicit type check, build, release security check). Stop on any failure and report the cause; never bypass checks.
- Review and stage only files belonging to the requested change. Never commit `.env.local`, other real environment files, private keys, credentials, or unrelated user work. Never print credentials.
- After checks pass, commit the requested changes, fetch `origin/main`, ensure the release is a fast-forward, and push `HEAD:main` without force. If main changed, integrate it safely and repeat verification before pushing. Monitor the Actions run for that exact commit and verify the public URL before reporting publication success.
- Existing workflow deploys automatically on main pushes; do not add recurring automations or require per-release approval.
- Supabase production data must never be added, edited, deleted, reset, or migrated as part of verification. Do not execute setup.sql against production. Live release checks are GET-only; RLS/ACL write protection is exercised against temporary in-memory PGlite only.
- `release:check` verifies anonymous live read access boundaries, not privileged catalog state. Do not claim it inspects production RLS flags or all authenticated roles. Full production policy inspection requires a separate authorized read-only admin connection; do not add a privileged key to the frontend or CI for this purpose.
- If Actions/deployment fails, report the failing step and preserve the last successful site. Do not report a deployment as complete until it succeeds.
