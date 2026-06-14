# CSV Anomalies Log — expenses_export.csv

This document lists all data anomalies included in the `expenses_export.csv` file (tab-separated) to test the import engine's validation and resolution pipeline.

---

## Anomaly Summary

| Row # | Anomaly Type | Description | Expected Detection |
|-------|-------------|-------------|-------------------|
| 5 | `NEAR_DUPLICATE_EXPENSE` | "dinner - marina bites" matches "Dinner at Marina Bites" on same day, same amount, same payer | WARNING - Merge with existing |
| 10 | `UNKNOWN_USER` | Payer is "Priya S" who is not registered in the system under that exact name | ERROR - Fuzzy match to Priya S -> Priya |
| 11 | `UNSUPPORTED_SPLIT_TYPE` | Split type is "unequal" (not in valid set) | ERROR - Change split type to EXACT |
| 12 | `MISSING_PAYER` | Payer (PaidBy) field is blank | ERROR - Assign current user as payer |
| 13 | `SETTLEMENT_RECORDED_AS_EXPENSE` | Title "Rohan paid Aisha back" suggests a peer-to-peer settlement | WARNING - Convert to Settlement |
| 14 | `SPLIT_MISMATCH` | Percentage splits for Pizza Friday sum to 110% | ERROR - Adjust last percentage to balance |
| 19, 20, 22, 25 | `EXCHANGE_RATE_MISSING` | Non-INR (USD) transaction with no exchange rate | WARNING - Default exchange rate to 1.0 |
| 22 | `UNKNOWN_USER` | Split details contain "Dev's friend Kabir" who is not a flatmate | ERROR - Exclude Kabir from the split |
| 25 | `NEGATIVE_AMOUNT` | Parasailing refund has negative amount (-30) | ERROR - Convert to positive absolute value |
| 27 | `CURRENCY_MISSING` | Currency field is left blank | WARNING - Default currency to INR |
| 30 | `NEGATIVE_AMOUNT` | Dinner order Swiggy has amount 0 | ERROR - Skip importing this row |
| 31 | `SPLIT_MISMATCH` | Percentage splits sum to 110% (30 + 30 + 30 + 20) | ERROR - Adjust last percentage to balance |
| 33 | `AMBIGUOUS_DATE` | Date is formatted "04-05-2026", which is ambiguous (May 4 vs April 5) | WARNING - Propose Interpret as April 5 |
| 35 | `INACTIVE_MEMBER_INVOLVED` | Split includes Meera on 02-04-2026, but she left on 31-03-2026 | ERROR - Exclude Meera from split |
| 37 | `INACTIVE_MEMBER_INVOLVED` | Payer is Sam on 08-04-2026, but he joined on 15-04-2026 | ERROR - Skip importing this row |
| 38 | `INACTIVE_MEMBER_INVOLVED` | Payer and participant is Sam on 10-04-2026, before his join date | ERROR - Skip row (payer inactive) and exclude Sam |
| 39 | `INACTIVE_MEMBER_INVOLVED` | Split includes Sam on 12-04-2026, before his join date | ERROR - Exclude Sam from split |
| 41 | `SPLIT_DETAILS_CONFLICT` | Split type is EQUAL but numeric shares (1:1:1:1) are provided | WARNING - Ignore details and split equally |
| 1, 2, 3, 5, 6, 7, 9, 10, 15, 16, 17, 20, 23, 26, 28, 29, 31, 36, 38, 39, 40, 42 | `EMPTY_DESCRIPTION` | Description/Notes column is blank | WARNING - Copy Title to Description |

---

## Detailed Anomaly Descriptions

### 1. NEAR_DUPLICATE_EXPENSE (Row 5)
- **Description**: Two dinner entries on the same date with the same payer and amount, but slightly different titles ("Dinner at Marina Bites" vs "dinner - marina bites").
- **Detection**: System checks if a transaction matches date, amount, and payer within 1.5 days.
- **Action**: Propose merging with the first entry or skipping.

### 2. UNKNOWN_USER (Row 10, 22)
- **Description**: The payer on Row 10 is "Priya S" (needs fuzzy matching to Priya) and the split list on Row 22 includes "Dev's friend Kabir" (needs exclusion).
- **Detection**: Checks names against group membership. Fuzzy matcher checks if length difference is <= 3.
- **Action**: Propose mapping "Priya S" to "Priya", and excluding "Kabir".

### 3. UNSUPPORTED_SPLIT_TYPE (Row 11)
- **Description**: Split type "unequal" is specified instead of the standard EQUAL, EXACT, PERCENTAGE, or SHARE.
- **Detection**: Checks if the value is in the supported split type list.
- **Action**: Propose converting to EXACT.

### 4. MISSING_PAYER (Row 12)
- **Description**: Payer field is blank.
- **Detection**: Payer name is null or blank.
- **Action**: Propose assigning the current user who is uploading.

### 5. SETTLEMENT_RECORDED_AS_EXPENSE (Row 13)
- **Description**: "Rohan paid Aisha back" is logged as an expense.
- **Detection**: Checks for keywords like "paid back", "settle", "payment to".
- **Action**: Propose creating a peer-to-peer Settlement instead of an Expense.

### 6. SPLIT_MISMATCH (Row 14, 31)
- **Description**: Percentages sum up to 110%.
- **Detection**: Sum of splits does not equal 100% or amount.
- **Action**: Propose balancing by adjusting the last participant's share.

### 7. EXCHANGE_RATE_MISSING (Row 19, 20, 22, 25)
- **Description**: Currency is USD but exchange rate is blank.
- **Detection**: Currency is non-INR but exchange rate is invalid/missing.
- **Action**: Propose defaulting exchange rate to 1.0.

### 8. NEGATIVE_AMOUNT (Row 25, 30)
- **Description**: Amount is negative (-30) or zero (0).
- **Detection**: Checks if amount <= 0.
- **Action**: Propose absolute conversion to positive (for refunds) or skipping (for zero amounts).

### 9. CURRENCY_MISSING (Row 27)
- **Description**: Currency is blank.
- **Detection**: Currency field is empty.
- **Action**: Propose defaulting to INR.

### 10. AMBIGUOUS_DATE (Row 33)
- **Description**: Date "04-05-2026" is out of order and ambiguous (May 4 or April 5).
- **Detection**: Date is ambiguous and chronologically inconsistent.
- **Action**: Propose interpreting as April 5, 2026.

### 11. INACTIVE_MEMBER_INVOLVED (Row 35, 37, 38, 39)
- **Description**: Meera is in split list after leaving (March 31). Sam is payer/participant before joining (April 15).
- **Detection**: Compares expense date against group membership `joinedAt` and `leftAt`.
- **Action**: Propose excluding the inactive member from splits or skipping the row if the payer is inactive.

### 12. SPLIT_DETAILS_CONFLICT (Row 41)
- **Description**: Split type says equal but shares are explicitly listed.
- **Detection**: EQUAL split type but split details has values.
- **Action**: Propose ignoring shares and splitting equally.
