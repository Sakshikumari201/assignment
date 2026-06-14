# CSV Anomalies Log — expenses_export.csv

This document lists all 15 data anomalies deliberately included in the `expenses_export.csv` file to test the import engine's anomaly detection capabilities.

---

## Anomaly Summary

| Row # | Anomaly Type | Description | Expected Detection |
|-------|-------------|-------------|-------------------|
| 2-3 | DUPLICATE_EXPENSE | Exact duplicate entries for "Grocery run" on same date, same amount, same payer | WARNING - Skip importing duplicate |
| 22-23 | DUPLICATE_EXPENSE | Exact duplicate entries for "Trip to Goa - Hotel" | WARNING - Skip importing duplicate |
| 16 | NEGATIVE_AMOUNT | "Meera settlement" has amount -1500 | ERROR - Convert to positive |
| 24-25 | EXCHANGE_RATE_MISSING | Second "Trip to Goa - Food" entry missing exchange rate for USD | WARNING - Default to 1.0 or 83.5 |
| 121 | INVALID_DATE | Missing date field entirely | ERROR - Set to today's date |
| 122 | INACTIVE_MEMBER_INVOLVED | "Meera after leaving" - Meera is payer on 2025-04-10 (left 2025-03-31) | ERROR - Skip importing this row |
| 123 | INACTIVE_MEMBER_INVOLVED | "Sam before joining" - Sam is payer on 2025-04-10 (joined 2025-04-15) | ERROR - Skip importing this row |
| 124 | MISSING_AMOUNT | "Invalid amount" has "abc" instead of number | ERROR - Set to 0 or skip |
| 125 | MISSING_PAYER | "Missing payer" has empty PaidBy field | ERROR - Assign current user as payer |
| 126 | UNKNOWN_USER | "Unknown user" has stranger@example.com who doesn't exist in database | ERROR - Skip row or exclude unknown user |
| 127 | EMPTY_DESCRIPTION | "Empty description" has blank description field | WARNING - Copy title to description |
| 128 | UNSUPPORTED_SPLIT_TYPE | "Unsupported split" uses RANDOM split type (not supported) | ERROR - Default to EQUAL |
| 129 | SPLIT_MISMATCH | "Split mismatch" - EXACT split sums to 1200 but amount is 1200 (actually matches, but demonstrates check) | ERROR - Adjust last share |
| 130 | SPLIT_MISMATCH | "Percentage mismatch" - PERCENTAGE split sums to 90% not 100% | ERROR - Adjust last percentage |
| 131 | CURRENCY_MISSING | "Missing currency" has empty currency field | WARNING - Default to INR |
| 132 | NEAR_DUPLICATE_EXPENSE | "Near duplicate" - Similar to existing dinner expense within 1.5 days | WARNING - Merge with existing |
| 133 | NEGATIVE_AMOUNT | "Zero amount" has amount 0 | ERROR - Convert to positive or skip |
| 134 | INACTIVE_MEMBER_INVOLVED | "Inactive participant" - Split includes Meera who left on 2025-03-31 | ERROR - Exclude inactive participant |
| 12, 36, 50, 64, 75, 86, 97, 108, 119 | SETTLEMENT_RECORDED_AS_EXPENSE | Multiple entries with "settlement" or "payment" in title | WARNING - Convert to Settlement |
| 120 | FUTURE_DATE | "Future expense" dated 2026-01-15 (in future) | WARNING - Shift to today's date |

---

## Detailed Anomaly Descriptions

### 1. DUPLICATE_EXPENSE (Rows 2-3, 22-23)
**Description**: Exact duplicate expense entries with matching date, title, amount, and payer.
**Detection**: System checks for exact match on date, title, amount, and payer against existing expenses.
**Action**: Skip importing the duplicate row.

### 2. NEGATIVE_AMOUNT (Row 16, 133)
**Description**: Transaction amount is negative (-1500) or zero (0).
**Detection**: Amount field validation checks for values <= 0.
**Action**: Convert negative amount to absolute positive value.

### 3. EXCHANGE_RATE_MISSING (Row 25)
**Description**: Non-INR currency (USD) transaction missing exchange rate.
**Detection**: Currency is not INR but exchange rate field is empty or invalid.
**Action**: Default exchange rate to 1.0 or 83.5 for USD.

### 4. INVALID_DATE (Row 121)
**Description**: Date field is completely missing.
**Detection**: Date field is blank or null.
**Action**: Set date to today's calendar date.

### 5. INACTIVE_MEMBER_INVOLVED (Rows 122, 123, 134)
**Description**: Expense involves a member who was not active on the expense date.
**Detection**: 
- Row 122: Meera is payer on 2025-04-10, but she left on 2025-03-31
- Row 123: Sam is payer on 2025-04-10, but he joined on 2025-04-15
- Row 134: Split includes Meera who left on 2025-03-31
**Action**: Exclude inactive member from the split or skip row entirely.

### 6. MISSING_AMOUNT (Row 124)
**Description**: Amount field contains non-numeric value ("abc").
**Detection**: Amount cannot be parsed as a number.
**Action**: Set amount to 0 or skip row.

### 7. MISSING_PAYER (Row 125)
**Description**: PaidBy field is empty.
**Detection**: Payer field is blank or null.
**Action**: Assign current user as the payer.

### 8. UNKNOWN_USER (Row 126)
**Description**: Payer or participant not found in group members.
**Detection**: Email or name doesn't match any user in the database.
**Action**: Exclude the unknown user from splits or skip row.

### 9. EMPTY_DESCRIPTION (Row 127)
**Description**: Description field is blank.
**Detection**: Description field is empty or null.
**Action**: Copy Title to Description field.

### 10. UNSUPPORTED_SPLIT_TYPE (Row 128)
**Description**: Split type is not one of EQUAL, EXACT, PERCENTAGE, or SHARE.
**Detection**: Split type "RANDOM" is not in the valid split types list.
**Action**: Default split type to EQUAL.

### 11. SPLIT_MISMATCH (Rows 129, 130)
**Description**: Split values don't match total amount or 100%.
**Detection**:
- Row 129: EXACT split sums to 1200, matches amount (demonstrates check)
- Row 130: PERCENTAGE split sums to 90%, not 100%
**Action**: Auto-balance by adjusting the last share or percentage.

### 12. CURRENCY_MISSING (Row 131)
**Description**: Currency field is empty.
**Detection**: Currency field is blank or null.
**Action**: Default currency to INR (group's default currency).

### 13. NEAR_DUPLICATE_EXPENSE (Row 132)
**Description**: Expense matches existing expense within 1.5 days, same amount and payer.
**Detection**: Time difference <= 1.5 days, same amount and payer, different title.
**Action**: Merge with existing expense or import as new.

### 14. SETTLEMENT_RECORDED_AS_EXPENSE (Multiple rows)
**Description**: Title contains payment/settlement keywords.
**Detection**: Title includes "settle", "paid back", or "payment to".
**Action**: Convert expense row to a peer Settlement record.

### 15. FUTURE_DATE (Row 120)
**Description**: Date is in the future (2026-01-15).
**Detection**: Expense date is greater than current date.
**Action**: Shift date to today's date.

---

## Testing Instructions

1. Start the application (backend on port 5000, frontend on port 5173)
2. Login as any user (e.g., aisha@example.com / password123)
3. Navigate to the Import page (/import)
4. Upload the `expenses_export.csv` file
5. Review the detected anomalies in the import review panel
6. Approve or reject individual corrections
7. Complete the import and verify the import report

The import engine should detect all 15+ anomaly types and surface them for user approval before importing any data.
