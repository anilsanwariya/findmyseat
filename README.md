# LibraryBandhu

Seat, shift, student and fee management for self-study libraries, plus a public marketplace
where students find a library. Live at **https://librarybandhu.com** and on Android
(`com.librarybandhu.app`).

## Documentation
| File | What it answers |
|---|---|
| [docs/PRD.md](docs/PRD.md) | What we're building, for whom, and the business rules |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the app is built and where code goes |
| [docs/DESIGN.md](docs/DESIGN.md) | Colours, components and UX rules |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Decisions that must not be silently reversed |
| [docs/SECURITY.md](docs/SECURITY.md) | Roles and security rules |
| [docs/TEST_PLAN.md](docs/TEST_PLAN.md) | Automated and manual checks |
| [docs/MEMORY.md](docs/MEMORY.md) | Current state of the project |
| [roadmap.md](roadmap.md) | Task list |
| [AGENTS.md](AGENTS.md) | Rules for AI tools working on this repo |

## Run locally
Requires Node.js 22 (LTS).
```
cp .env.example .env      # fill in the values
npm install
npm run dev
```

## Checks
```
npm run typecheck
npm test
npm run build
npm run lint              # not clean yet; see docs/MEMORY.md
```
The same typecheck, tests and build run automatically on every pull request
(`.github/workflows/ci.yml`).

## How changes reach production
1. Lovable edits `main` directly, or Claude Code opens a pull request from a branch.
2. Pull requests must pass CI, then the owner merges them.
3. Lovable syncs `main`; check it in the Lovable preview.
4. Press **Publish** in Lovable to update librarybandhu.com (the Android app updates with it).

Database changes are written as SQL in `drizzle/migrations/` and applied by the owner in
Lovable — see [docs/DECISIONS.md](docs/DECISIONS.md) (ADR-002).
