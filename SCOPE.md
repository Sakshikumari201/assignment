# Scope & Data Specification — SplitShare

This document covers the database schema design and the 15-check CSV anomaly detection pipeline.

---

## 💾 Database Schema

### Entity-Relationship Overview

```
User ──────┬──── GroupMember ────┬──── Group
           │      (joinedAt)     │
           │      (leftAt?)      │
           │                     │
           ├──── Expense ────────┤ (paidBy → User)
           │       │             │
           │    ExpenseSplit     │ (userId → User, expenseId → Expense)
           │                     │
           └──── Settlement ─────┘ (payerId → User, receiverId → User)

ImportBatch ──── ImportIssue
```

### Full Prisma Schema

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id                  Int               @id @default(autoincrement())
  name                String
  email               String            @unique
  passwordHash        String
  createdAt           DateTime          @default(now())
  memberships         GroupMember[]
  paidExpenses        Expense[]         @relation("ExpensePaidBy")
  splits              ExpenseSplit[]
  paidSettlements     Settlement[]      @relation("SettlementPayer")
  receivedSettlements Settlement[]      @relation("SettlementReceiver")
}

model Group {
  id          Int           @id @default(autoincrement())
  name        String
  createdAt   DateTime      @default(now())
  members     GroupMember[]
  expenses    Expense[]
  settlements Settlement[]
}

model GroupMember {
  id        Int       @id @default(autoincrement())
  groupId   Int
  userId    Int
  joinedAt  DateTime
  leftAt    DateTime?                         // null = still active
  group     Group     @relation(fields: [groupId], references: [id], onDelete: Cascade)
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([groupId, userId])
}

model Expense {
  id              Int            @id @default(autoincrement())
  groupId         Int
  title           String
  description     String
  amount          Float          // original amount in source currency
  currency        String         // e.g. INR, USD, EUR
  exchangeRate    Float          // rate to base currency (INR)
  convertedAmount Float          // amount * exchangeRate → INR
  paidBy          Int
  expenseDate     DateTime
  splitType       String         // EQUAL | EXACT | PERCENTAGE | SHARE
  createdAt       DateTime       @default(now())
  group           Group          @relation(fields: [groupId], references: [id], onDelete: Cascade)
  payer           User           @relation("ExpensePaidBy", fields: [paidBy], references: [id], onDelete: Cascade)
  splits          ExpenseSplit[]
}

model ExpenseSplit {
  id          Int     @id @default(autoincrement())
  expenseId   Int
  userId      Int
  shareAmount Float   // resolved INR amount owed by this user
  percentage  Float?  // set when splitType = PERCENTAGE
  shares      Float?  // set when splitType = SHARE
  expense     Expense @relation(fields: [expenseId], references: [id], onDelete: Cascade)
  user        User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([expenseId, userId])
}

model Settlement {
  id             Int      @id @default(autoincrement())
  groupId        Int
  payerId        Int
  receiverId     Int
  amount         Float
  settlementDate DateTime
  group          Group    @relation(fields: [groupId], references: [id], onDelete: Cascade)
  payer          User     @relation("SettlementPayer",   fields: [payerId],   references: [id], onDelete: Cascade)
  receiver       User     @relation("SettlementReceiver", fields: [receiverId], references: [id], onDelete: Cascade)
}

model ImportBatch {
  id         Int           @id @default(autoincrement())
  uploadedAt DateTime      @default(now())
  status     String        // PENDING | IMPORTED | FAILED
  rawData    String        @default("[]")   // JSON stringified parsed rows
  issues     ImportIssue[]
}

model ImportIssue {
  id             Int         @id @default(autoincrement())
  batchId        Int
  rowNumber      Int
  severity       String      // ERROR | WARNING
  issueType      String
  description    String
  proposedAction String
  userApproved   Boolean     @default(false)
  batch          ImportBatch @relation(fields: [batchId], references: [id], onDelete: Cascade)
}
```

### Model Responsibilities

| Model | Purpose |
|---|---|
| `User` | A flatmate. Stores name, email, bcrypt password hash. Central node connecting to all other models. |
| `Group` | A household container. Holds members, expenses, and settlements. |
| `GroupMember` | Junction table (User ↔ Group) with `joinedAt` and `leftAt` to model dynamic membership timelines. |
| `Expense` | A shared purchase. Stores both the original currency amount AND the converted INR amount for unified ledger math. |
| `ExpenseSplit` | Each user's share of a specific expense. Stores the resolved `shareAmount` in INR regardless of split type. |
| `Settlement` | A peer debt repayment (e.g., Rohan pays Aisha ₹500). Stored separately from expenses. |
| `ImportBatch` | Tracks a CSV upload lifecycle (PENDING → IMPORTED/FAILED). Stores raw parsed row data as JSON for the review UI. |
| `ImportIssue` | One row per anomaly detected in an import batch. Stores severity, type, description, proposed action, and whether the user approved or rejected the correction. |

---

## 🔍 CSV Anomaly Detection Engine — 15 Checks

When a CSV is uploaded, the import engine parses every row and runs it through 15 checks. **No data is silently modified** — every anomaly is presented to the user for explicit Approve/Reject.

| # | Anomaly Type | Severity | Detection Logic | Proposed Action | Reject Behavior |
|---|---|---|---|---|---|
| 1 | `DUPLICATE_EXPENSE` | WARNING | Exact match: date + title + amount + payer vs existing DB expenses | Skip importing duplicate | Import as new expense |
| 2 | `NEAR_DUPLICATE_EXPENSE` | WARNING | Within 1.5 days, same amount + payer, title differs | Merge with existing expense | Import as new |
| 3 | `NEGATIVE_AMOUNT` | ERROR | `amount <= 0` | Convert to absolute value | Skip row |
| 4 | `MISSING_PAYER` | ERROR | PaidBy field blank/null | Assign current user as payer | Skip row |
| 5 | `MISSING_AMOUNT` | ERROR | Amount blank or non-numeric | Set to 0 | Skip row |
| 6 | `UNKNOWN_USER` | ERROR | Payer/participant name or email not found in group | Exclude unknown user from splits | Skip row |
| 7 | `INVALID_DATE` | ERROR | Date field blank or unparseable | Set to today's date | Skip row |
| 8 | `FUTURE_DATE` | WARNING | `expenseDate > now()` | Shift to today's date | Keep future date |
| 9 | `SETTLEMENT_RECORDED_AS_EXPENSE` | WARNING | Title contains "settle", "paid back", or "payment to" | Convert row to Settlement record | Import as normal Expense |
| 10 | `CURRENCY_MISSING` | WARNING | Currency field blank | Default to INR | Default to INR |
| 11 | `EXCHANGE_RATE_MISSING` | WARNING | Currency ≠ INR but exchangeRate missing | Default rate to 1.0 | Default to 1.0 |
| 12 | `SPLIT_MISMATCH` | ERROR | EXACT splits don't sum to amount; PERCENTAGE splits don't sum to 100% | Auto-balance last share | Skip row |
| 13 | `INACTIVE_MEMBER_INVOLVED` | ERROR | Expense date falls outside a member's `joinedAt`–`leftAt` window | Exclude inactive member | Skip row |
| 14 | `EMPTY_DESCRIPTION` | WARNING | Description field blank | Copy Title to Description | Leave blank |
| 15 | `UNSUPPORTED_SPLIT_TYPE` | ERROR | SplitType not in {EQUAL, EXACT, PERCENTAGE, SHARE} | Default to EQUAL | Skip row |

---

## 📊 Membership Timelines (Seed Data)

| Member | Joined | Left | Active During |
|---|---|---|---|
| Aisha | 2026-01-01 | — | Always |
| Rohan | 2026-01-01 | — | Always |
| Priya | 2026-01-01 | — | Always |
| Meera | 2026-02-01 | 2026-03-31 | Feb–Mar 2026 only |
| Dev | 2026-01-01 | — | Always |
| Sam | 2026-04-15 | — | Apr 2026 onwards |

Meera's and Sam's windows are the source of `INACTIVE_MEMBER_INVOLVED` anomalies in the test CSV.
