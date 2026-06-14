# Architectural & Design Decisions — SplitShare

This document logs every significant engineering decision made during the project: the problem faced, the options considered, and why we chose what we chose.

---

## Decision 1 — Base Currency for Ledger Calculations

**Problem**: Users record transactions in multiple currencies (INR, USD, EUR). How do we compute net balances and simplify debts across currencies?

**Options Considered**:

| Option | Description | Drawback |
|---|---|---|
| A | Multi-currency ledger — track balances per currency | "Aisha owes Rohan $10 AND ₹500" — impossible to simplify into one settlement |
| B | Single base currency (INR) — convert everything at import time using exchange rates | Small inaccuracy if exchange rates shift, but enables clean unified math |

**Chosen**: Option B — normalize all `amount × exchangeRate` to INR at write time.

**Reason**: The greedy debt-simplification algorithm requires a single balance vector per user. Without a unified currency, the algorithm cannot determine whether two debts can cancel each other. Storing `convertedAmount` on each `Expense` row means balance queries are a simple SUM with no runtime conversion needed.

---

## Decision 2 — CSV Anomaly Handling Strategy

**Problem**: The PM's rule is explicit: *"never automatically delete or modify rows without user approval."* But dirty CSVs will have invalid dates, negative amounts, and duplicate rows.

**Options Considered**:

| Option | Description | Drawback |
|---|---|---|
| A | Fail-fast: reject the entire upload if any anomaly is found | Unusable with real-world messy data |
| B | Silent auto-correct: fix errors automatically and import | Violates the PM's approval rule |
| C | Pending verification queue: classify anomalies, present each one to the user as an Approve/Reject card | Extra UI + database complexity |

**Chosen**: Option C — pending verification queue.

**Reason**: This is the only approach that satisfies Meera's constraint verbatim. The `ImportBatch` (PENDING → IMPORTED) + `ImportIssue` model pair creates a full audit trail. The UI shows exactly which row had which problem and what the system proposes to do. The user retains final say on every correction.

---

## Decision 3 — Developer Database Setup (SQLite Fallback)

**Problem**: Reviewers and graders may not have PostgreSQL configured locally. A hard Postgres dependency means the app crashes on first run for most people.

**Options Considered**:

| Option | Description | Drawback |
|---|---|---|
| A | Require manual Postgres setup | High setup friction, crashes for most evaluators |
| B | Maintain two separate schema files (postgres + sqlite) | Schema drift risk; double maintenance burden |
| C | Auto-probing setup script: try Postgres, fail gracefully, swap `schema.prisma` provider to SQLite, regenerate client, seed data | One-command setup for everyone |

**Chosen**: Option C — `setup-db.js` connection prober.

**Reason**: The script runs `prisma db push` against Postgres. If it fails (ECONNREFUSED), it patches the `schema.prisma` provider to `sqlite`, updates `.env` to `DATABASE_URL="file:./dev.db"`, re-runs `prisma generate` + `prisma db push`, and seeds. This gives zero-friction local development while keeping the production schema PostgreSQL.

---

## Decision 4 — Prisma Version (v6 vs v7)

**Problem**: Prisma 7 was installed by default. It deprecates `url = env("DATABASE_URL")` in `schema.prisma` and requires datasource config to move to `prisma.config.ts` — a TypeScript file — which conflicts with a pure JavaScript backend.

**Options Considered**:

| Option | Description | Drawback |
|---|---|---|
| A | Adopt Prisma 7 fully | Requires TypeScript loader (`tsx`/`ts-node`) just for Prisma config, adds compile step |
| B | Pin to Prisma 6 | Stable JS support, schema env vars work natively, no compile step |

**Chosen**: Option B — pin `prisma@6` and `@prisma/client@6` in `package.json`.

**Reason**: Prisma 6 supports JavaScript natively, handles `env()` in `schema.prisma` directly, and requires no build toolchain changes. Prisma 7 offered no feature we needed but would have forced a TypeScript toolchain into an otherwise pure-JS project.

---

## Decision 5 — Debt Simplification Algorithm (Greedy vs Min-Transactions)

**Problem**: With 6 members, raw expense splits produce up to 30 directional debt relationships. How do we compute the minimal set of settlements?

**Options Considered**:

| Option | Description | Time Complexity |
|---|---|---|
| A | Greedy two-pointer: sort creditors + debtors by net balance, match largest creditor to largest debtor | O(n log n) |
| B | Minimum transactions (optimal): find the global minimum number of transactions using graph flow or backtracking | O(2ⁿ) — exponential |

**Chosen**: Option A — greedy two-pointer.

**Reason**: The optimal algorithm is NP-hard for large groups. For 6 people, greedy produces near-optimal results (typically within 1 extra transaction of optimal). The implementation is simple, debuggable, and fast. The floating-point residue problem (very small remainders from subtraction leaving ghost debts) was fixed by adding a `< 0.01` epsilon threshold and rounding all output to 2 decimal places.

---

## Decision 6 — Frontend Stack (React + Vite vs Next.js)

**Problem**: Choose a frontend framework for the SPA.

**Options Considered**:

| Option | Description | Drawback |
|---|---|---|
| A | Next.js | Server-side rendering adds complexity we don't need; deployment requires a Node server |
| B | React + Vite | Pure client-side SPA; Vite gives near-instant HMR; deploys as static files to Vercel |
| C | Vanilla JS | No component reusability; no state management |

**Chosen**: Option B — React + Vite + Tailwind CSS.

**Reason**: The application is entirely data-driven from the API. SSR provides no SEO benefit (it's a logged-in dashboard). Vite's build speed massively accelerates development iteration. Tailwind CSS + component model gives consistent design tokens without heavy CSS architecture decisions.
