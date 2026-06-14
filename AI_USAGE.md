# AI Usage Log — SplitShare

---

## 🤖 Tool Overview

| Tool | Role |
|---|---|
| **Antigravity** (Google DeepMind) | Primary pair-programming assistant — schema design, API controller generation, balance algorithm, CSV pipeline, React page scaffolding, documentation |

---

## 💬 Key Prompts Used

| Task | Prompt (paraphrased) |
|---|---|
| Database design | "Design a Prisma schema for a shared expense app. Users belong to groups via a junction table with `joinedAt` and `leftAt` dates. Expenses support EQUAL, EXACT, PERCENTAGE, and SHARE splits. Add models for settlements, CSV import batches, and per-row import issues." |
| Balance engine | "Write a greedy debt-simplification algorithm in JavaScript. Input: array of `{ userId, netBalance }`. Output: minimum payment instructions `{ from, to, amount }`. Handle floating-point precision residues." |
| CSV import | "Write a Node.js CSV parser using `csv-parser` that normalizes headers (trim + remove spaces). Then write an `async detectAnomalies(rows, groupId)` function that runs 15 checks including: duplicate detection, negative amounts, inactive member timeline validation, split mismatch, settlement keyword detection." |
| Import UI | "Build a React page for CSV import. It should: (1) show a file upload dropzone, (2) after upload display a list of ImportIssue cards grouped by row, each with Approve/Reject buttons, (3) show a summary after all issues are resolved." |
| Auth flow | "Build Express.js register and login endpoints using bcrypt and JWT. Include a middleware that extracts and verifies the token from the Authorization header and attaches `req.user`." |

---

## ⚠️ AI Mistakes & How They Were Caught and Fixed

### Mistake 1 — Prisma 7 Configuration Syntax Crash

**What the AI generated**:
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```
This is valid Prisma 6 syntax. But the AI initially suggested installing the latest `prisma` package (which resolved to Prisma 7), and also generated a `prisma.config.ts` template that referenced a TypeScript-only API.

**How it was caught**:
Running `npx prisma generate` immediately threw:
```
Error: P1012 — The datasource property url is no longer supported in schema.prisma.
Connection URLs must be defined in prisma.config.ts
```

**What was changed**:
- Downgraded `"prisma": "^7.x"` → `"prisma": "^6.0.0"` and `"@prisma/client": "^6.0.0"` in `package.json`
- Removed the generated `prisma.config.ts` file entirely
- The standard `schema.prisma` with `url = env("DATABASE_URL")` works correctly in Prisma 6

**Lesson**: Always check the major version of CLI tools before trusting generated config patterns. The AI assumed the latest version; Prisma 7 broke backward compatibility.

---

### Mistake 2 — Greedy Settlement Algorithm Infinite Loop

**What the AI generated**:
```javascript
while (dIdx < debtors.length && cIdx < creditors.length) {
  const debtor = debtors[dIdx];
  const creditor = creditors[cIdx];
  const amount = Math.min(-debtor.balance, creditor.balance);
  transactions.push({ from: debtor.userId, to: creditor.userId, amount });
  debtor.balance += amount;
  creditor.balance -= amount;
  if (debtor.balance === 0) dIdx++;
  if (creditor.balance === 0) cIdx++;
}
```

**The problem**:
Floating-point arithmetic means `1200 - 1200` can equal `2.842170943040401e-14` instead of exactly `0`. The `=== 0` comparison never triggers. Both pointers freeze. The `while` loop runs forever (infinite loop in production).

**How it was caught**:
Manual code review of the boundary condition — testing with two users whose debts should exactly cancel (₹1,200 each way) showed the server hanging without response.

**What was changed**:
```javascript
// Before
if (debtor.balance === 0) dIdx++;
if (creditor.balance === 0) cIdx++;

// After — added epsilon guard
const EPSILON = 0.01;
if (Math.abs(debtor.balance) < EPSILON) dIdx++;
if (Math.abs(creditor.balance) < EPSILON) cIdx++;

// Also round all output amounts
amount: Number(Math.min(-debtor.balance, creditor.balance).toFixed(2))
```

**Lesson**: Never use `=== 0` for floating-point comparisons after arithmetic. Always use an epsilon threshold.

---

### Mistake 3 — CSV Header Parsing Returned `undefined`

**What the AI generated**:
```javascript
const { Date, Title, Amount, PaidBy } = row;
```
The AI assumed CSV headers would always match exactly. The actual CSV file had headers like `"Exchange Rate"` (with a space) and headers sometimes had leading/trailing whitespace from the export tool.

**How it was caught**:
Uploading the test CSV and inspecting the server-side log showed:
```
{ Date: undefined, Amount: undefined, PaidBy: undefined }
```
The field `"Exchange Rate"` became the key `"Exchange Rate"` (with space), so `row.ExchangeRate` was always `undefined`.

**What was changed**:
Added `mapHeaders` to the csv-parser configuration:
```javascript
// Before
fs.createReadStream(filePath).pipe(csv())

// After — normalize all headers
fs.createReadStream(filePath).pipe(
  csv({
    mapHeaders: ({ header }) => header.trim().replace(/\s+/g, '')
  })
)
```
This converts `" Exchange Rate "` → `"ExchangeRate"` and `" Paid By "` → `"PaidBy"` automatically, making destructuring reliable.

**Lesson**: Real-world CSV files from spreadsheet exports are messy. Header normalization must be applied before field extraction, never assumed.

---

### Mistake 4 — Delimiter Mismatch in csv-parser (Tab-separated values)

**What the AI generated**:
The AI generated `csv-parser` calls without setting the `separator` or `delimiter` option, assuming standard comma separation.

**How it was caught**:
When the updated assignment CSV file (`expenses_export.csv`) was uploaded, it was tab-separated (`\t`). The parser failed to extract columns, treating the entire line as a single field, resulting in `NaN` amounts and undefined fields.

**What was changed**:
Implemented auto-detection of the delimiter by reading the first line of the file and checking if it contains `\t`:
```javascript
const firstLine = fs.readFileSync(filePath, 'utf8').split('\n')[0];
const separator = firstLine.includes('\t') ? '\t' : ',';
// Pass separator dynamically to csv() options:
.pipe(csv({ separator, ... }))
```

**Lesson**: CSV files can be delimited by commas, semicolons, or tabs. Always verify the delimiter or build auto-detection logic.

---

### Mistake 5 — Overwriting Split Ratios due to Duplicate Key Mapping

**What the AI generated**:
Mapped both `split_with` and `split_details` to the same destination property `SplitDetails` in `HEADER_MAP`.

**How it was caught**:
During testing of the 2026 CSV import, the participants list (`split_with`) was completely lost for rows where `split_details` was empty, because the empty `split_details` column overwrote the populated `split_with` column. This prevented `INACTIVE_MEMBER_INVOLVED` checks from validating split participants correctly (e.g. Meera on Row 35).

**What was changed**:
Separated them into `SplitWith` and `SplitDetails` in the header map, and updated the parsing logic to fall back to `SplitWith` if `SplitDetails` is empty:
```javascript
const splitSource = (rawSplitDetails && rawSplitDetails.trim() !== '') ? rawSplitDetails : rawSplitWith;
```

**Lesson**: Do not map distinct columns containing different types of data to the same property key, even if they seem related.

---

### Mistake 6 — Overly Greedy Fuzzy Name Matcher mapping "Kabir" to "Dev"

**What the AI generated**:
A name matching helper that checked simple substring inclusion:
```javascript
if (cleanRaw.includes(cleanMemberName) || cleanMemberName.includes(cleanRaw)) {
  return m;
}
```

**How it was caught**:
An entry in the split details for `Dev's friend Kabir` was parsed as an unknown participant. The fuzzy matcher incorrectly mapped `"Dev's friend Kabir"` to `"Dev"`, proposing to assign his share to Dev.

**What was changed**:
Refined the fuzzy matcher to enforce a name length difference threshold of 3 characters or less:
```javascript
if (
  (cleanRaw.includes(cleanMemberName) || cleanMemberName.includes(cleanRaw)) &&
  Math.abs(cleanRaw.length - cleanMemberName.length) <= 3
) {
  return m;
}
```
This correctly fuzzy matches `"Priya S"` to `"Priya"`, but excludes `"Dev's friend Kabir"` from matching `"Dev"`.

**Lesson**: Fuzzy name mapping must have boundary controls (like Levenshtein distance or string length differences) to prevent irrelevant matches.
