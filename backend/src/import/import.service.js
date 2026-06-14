const fs = require('fs');
const csv = require('csv-parser');
const prisma = require('../prisma/prisma-client');

/**
 * Parses a CSV file and normalizes headers
 */
// Canonical header names expected by detectAnomalies
const HEADER_MAP = {
  'date': 'Date',
  'title': 'Title',
  'description': 'Description',
  'amount': 'Amount',
  'currency': 'Currency',
  'exchangerate': 'ExchangeRate',
  'paidby': 'PaidBy',
  'splittype': 'SplitType',
  'splitdetails': 'SplitDetails',
};

function parseCsv(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv({
        // Strip BOM (\uFEFF), zero-width spaces, whitespace, then normalize casing
        mapHeaders: ({ header }) => {
          const cleaned = header
            .replace(/^[\uFEFF\u200B\u00BB\u00BF]+/, '') // strip BOM variants
            .trim()
            .replace(/\s+/g, '');
          return HEADER_MAP[cleaned.toLowerCase()] || cleaned;
        }
      }))
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (err) => reject(err));
  });
}

/**
 * Detects 15 types of anomalies in parsed CSV rows
 */
async function detectAnomalies(rows, groupId) {
  const issues = [];
  const parsedRows = [];

  // Fetch all group members and mapping helpers
  const members = await prisma.groupMember.findMany({
    where: { groupId },
    include: { user: true },
  });

  const emailToMember = {};
  const nameToMember = {};

  members.forEach((m) => {
    emailToMember[m.user.email.toLowerCase()] = m;
    nameToMember[m.user.name.toLowerCase()] = m;
  });

  // Fetch existing expenses for duplicate checks
  const existingExpenses = await prisma.expense.findMany({
    where: { groupId },
  });

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    const rowNum = idx + 1;

    let {
      Date: rawDate,
      Title: rawTitle,
      Description: rawDescription = '',
      Amount: rawAmount,
      Currency: rawCurrency,
      ExchangeRate: rawRate,
      PaidBy: rawPaidBy,
      SplitType: rawSplitType,
      SplitDetails: rawSplitDetails,
    } = row;

    const rowIssues = [];

    // 1. Missing / Negative Amount checks
    const amount = rawAmount ? parseFloat(rawAmount.trim()) : NaN;
    if (!rawAmount || rawAmount.trim() === '' || isNaN(amount)) {
      rowIssues.push({
        issueType: 'MISSING_AMOUNT',
        severity: 'ERROR',
        description: `Row ${rowNum}: Amount is missing or invalid.`,
        proposedAction: 'Set default amount to 0',
      });
    } else if (amount <= 0) {
      rowIssues.push({
        issueType: 'NEGATIVE_AMOUNT',
        severity: 'ERROR',
        description: `Row ${rowNum}: Amount is negative or zero (${amount}).`,
        proposedAction: 'Convert amount to positive value',
      });
    }

    // 2. Date validations
    let date = null;
    let isDateInvalid = false;
    if (!rawDate || rawDate.trim() === '') {
      rowIssues.push({
        issueType: 'INVALID_DATE',
        severity: 'ERROR',
        description: `Row ${rowNum}: Date is missing.`,
        proposedAction: "Set date to today's date",
      });
      isDateInvalid = true;
    } else {
      date = new Date(rawDate.trim());
      if (isNaN(date.getTime())) {
        rowIssues.push({
          issueType: 'INVALID_DATE',
          severity: 'ERROR',
          description: `Row ${rowNum}: Date format is invalid (${rawDate}).`,
          proposedAction: "Set date to today's date",
        });
        isDateInvalid = true;
      } else if (date > new Date()) {
        rowIssues.push({
          issueType: 'FUTURE_DATE',
          severity: 'WARNING',
          description: `Row ${rowNum}: Date is in the future (${rawDate.trim()}).`,
          proposedAction: "Set date to today's date",
        });
      }
    }

    // 3. Payer validations
    let payerMember = null;
    if (!rawPaidBy || rawPaidBy.trim() === '') {
      rowIssues.push({
        issueType: 'MISSING_PAYER',
        severity: 'ERROR',
        description: `Row ${rowNum}: PaidBy is missing.`,
        proposedAction: 'Assign current user as payer',
      });
    } else {
      const cleanPayer = rawPaidBy.trim().toLowerCase();
      payerMember = emailToMember[cleanPayer] || nameToMember[cleanPayer];
      if (!payerMember) {
        rowIssues.push({
          issueType: 'UNKNOWN_USER',
          severity: 'ERROR',
          description: `Row ${rowNum}: Payer "${rawPaidBy}" not found in group members.`,
          proposedAction: 'Assign current user as payer',
        });
      } else if (date && !isDateInvalid) {
        // Timeline validation
        const joined = new Date(payerMember.joinedAt);
        const left = payerMember.leftAt ? new Date(payerMember.leftAt) : null;
        
        // Normalize times to check calendar date
        const cDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const jDate = new Date(joined.getFullYear(), joined.getMonth(), joined.getDate());
        const lDate = left ? new Date(left.getFullYear(), left.getMonth(), left.getDate()) : null;

        if (cDate < jDate || (lDate && cDate > lDate)) {
          rowIssues.push({
            issueType: 'INACTIVE_MEMBER_INVOLVED',
            severity: 'ERROR',
            description: `Row ${rowNum}: Payer "${payerMember.user.name}" was inactive on expense date (${rawDate.trim()}).`,
            proposedAction: 'Skip importing this row',
          });
        }
      }
    }

    // 4. Currency and Exchange Rate checks
    let currency = rawCurrency ? rawCurrency.trim().toUpperCase() : 'INR';
    if (!rawCurrency || rawCurrency.trim() === '') {
      rowIssues.push({
        issueType: 'CURRENCY_MISSING',
        severity: 'WARNING',
        description: `Row ${rowNum}: Currency is missing.`,
        proposedAction: 'Default currency to INR',
      });
    }

    let exchangeRate = rawRate ? parseFloat(rawRate.trim()) : 1.0;
    if (currency !== 'INR' && (!rawRate || rawRate.trim() === '' || isNaN(exchangeRate))) {
      rowIssues.push({
        issueType: 'EXCHANGE_RATE_MISSING',
        severity: 'WARNING',
        description: `Row ${rowNum}: Exchange rate missing for non-INR currency "${currency}".`,
        proposedAction: 'Default exchange rate to 1.0',
      });
      exchangeRate = 1.0;
    }

    // 5. Empty Description
    if (!rawDescription || rawDescription.trim() === '') {
      rowIssues.push({
        issueType: 'EMPTY_DESCRIPTION',
        severity: 'WARNING',
        description: `Row ${rowNum}: Description is empty.`,
        proposedAction: 'Set description to Title',
      });
    }

    // 6. Split Type checks
    let splitType = rawSplitType ? rawSplitType.trim().toUpperCase() : 'EQUAL';
    const validSplitTypes = ['EQUAL', 'EXACT', 'PERCENTAGE', 'SHARE'];
    if (!validSplitTypes.includes(splitType)) {
      rowIssues.push({
        issueType: 'UNSUPPORTED_SPLIT_TYPE',
        severity: 'ERROR',
        description: `Row ${rowNum}: Split type "${rawSplitType}" is not supported.`,
        proposedAction: 'Default split type to EQUAL',
      });
      splitType = 'EQUAL';
    }

    // 7. Parse split details & detect anomalies
    let parsedSplits = [];
    if (rawSplitDetails && rawSplitDetails.trim() !== '') {
      const parts = rawSplitDetails.split(';').map((p) => p.trim()).filter(Boolean);
      let sumSplitValues = 0;

      for (const part of parts) {
        let nameOrEmail = part;
        let val = null;

        if (part.includes(':')) {
          const subparts = part.split(':');
          nameOrEmail = subparts[0].trim();
          val = parseFloat(subparts[1].trim());
        }

        const cleanNameOrEmail = nameOrEmail.toLowerCase();
        const splitMember = emailToMember[cleanNameOrEmail] || nameToMember[cleanNameOrEmail];

        if (!splitMember) {
          rowIssues.push({
            issueType: 'UNKNOWN_USER',
            severity: 'ERROR',
            description: `Row ${rowNum}: Split participant "${nameOrEmail}" not found in group members.`,
            proposedAction: 'Exclude this participant',
          });
        } else {
          // Timeline validation for participant
          if (date && !isDateInvalid) {
            const joined = new Date(splitMember.joinedAt);
            const left = splitMember.leftAt ? new Date(splitMember.leftAt) : null;
            const cDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
            const jDate = new Date(joined.getFullYear(), joined.getMonth(), joined.getDate());
            const lDate = left ? new Date(left.getFullYear(), left.getMonth(), left.getDate()) : null;

            if (cDate < jDate || (lDate && cDate > lDate)) {
              rowIssues.push({
                issueType: 'INACTIVE_MEMBER_INVOLVED',
                severity: 'ERROR',
                description: `Row ${rowNum}: Participant "${splitMember.user.name}" was inactive on expense date (${rawDate.trim()}).`,
                proposedAction: 'Exclude inactive participant',
              });
            }
          }

          parsedSplits.push({
            userId: splitMember.userId,
            name: splitMember.user.name,
            value: isNaN(val) ? null : val,
          });

          if (val !== null && !isNaN(val)) {
            sumSplitValues += val;
          }
        }
      }

      // Check split sum match
      if (!isNaN(amount) && amount > 0) {
        if (splitType === 'EXACT' && Math.abs(sumSplitValues - amount) > 0.1) {
          rowIssues.push({
            issueType: 'SPLIT_MISMATCH',
            severity: 'ERROR',
            description: `Row ${rowNum}: Split shares sum (${sumSplitValues}) does not match amount (${amount}).`,
            proposedAction: 'Adjust last share to balance',
          });
        } else if (splitType === 'PERCENTAGE' && Math.abs(sumSplitValues - 100) > 0.1) {
          rowIssues.push({
            issueType: 'SPLIT_MISMATCH',
            severity: 'ERROR',
            description: `Row ${rowNum}: Percentages sum (${sumSplitValues}%) does not equal 100%.`,
            proposedAction: 'Adjust last percentage to balance',
          });
        }
      }
    } else {
      // EQUAL split for all members active on this date
      parsedSplits = members.map((m) => ({
        userId: m.userId,
        name: m.user.name,
        value: 1,
      }));
    }

    // 8. Settlement recorded as expense
    const titleLower = rawTitle ? rawTitle.trim().toLowerCase() : '';
    if (
      titleLower.includes('settle') ||
      titleLower.includes('paid back') ||
      titleLower.includes('payment to')
    ) {
      rowIssues.push({
        issueType: 'SETTLEMENT_RECORDED_AS_EXPENSE',
        severity: 'WARNING',
        description: `Row ${rowNum}: Title "${rawTitle}" suggests this might be a settlement transaction.`,
        proposedAction: 'Convert this row into a Settlement payment',
      });
    }

    // 9. Exact Duplicate & Near Duplicate checks
    if (!isNaN(amount) && date && !isDateInvalid && payerMember && rawTitle) {
      const exactDup = existingExpenses.find((e) => {
        return (
          e.title.toLowerCase() === rawTitle.trim().toLowerCase() &&
          e.amount === amount &&
          e.paidBy === payerMember.userId &&
          new Date(e.expenseDate).toDateString() === date.toDateString()
        );
      });

      if (exactDup) {
        rowIssues.push({
          issueType: 'DUPLICATE_EXPENSE',
          severity: 'WARNING',
          description: `Row ${rowNum}: Exact duplicate expense already exists in group (ID: ${exactDup.id}).`,
          proposedAction: 'Skip importing this duplicate row',
        });
      } else {
        const nearDup = existingExpenses.find((e) => {
          const timeDiff = Math.abs(new Date(e.expenseDate).getTime() - date.getTime());
          const daysDiff = timeDiff / (1000 * 3600 * 24);
          return daysDiff <= 1.5 && e.amount === amount && e.paidBy === payerMember.userId;
        });

        if (nearDup) {
          rowIssues.push({
            issueType: 'NEAR_DUPLICATE_EXPENSE',
            severity: 'WARNING',
            description: `Row ${rowNum}: Near-duplicate matching date/amount/payer found (existing: "${nearDup.title}").`,
            proposedAction: 'Merge with existing expense',
          });
        }
      }
    }

    issues.push(...rowIssues.map((iss) => ({ ...iss, rowNumber: rowNum })));

    parsedRows.push({
      rowNumber: rowNum,
      raw: row,
      parsed: {
        date: date ? date.toISOString().split('T')[0] : null,
        title: rawTitle ? rawTitle.trim() : '',
        description: rawDescription ? rawDescription.trim() : '',
        amount,
        currency,
        exchangeRate,
        paidBy: payerMember ? payerMember.userId : null,
        splitType,
        splits: parsedSplits,
      },
    });
  }

  return { issues, parsedRows };
}

module.exports = {
  parseCsv,
  detectAnomalies,
};
