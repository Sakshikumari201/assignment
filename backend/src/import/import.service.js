const fs = require('fs');
const csv = require('csv-parser');
const prisma = require('../prisma/prisma-client');

/**
 * Normalizes headers using a mapping dictionary
 */
const HEADER_MAP = {
  'date': 'Date',
  'title': 'Title',
  'description': 'Title',
  'name': 'Title',
  'expense': 'Title',
  'item': 'Title',
  'expensename': 'Title',
  'expenseitem': 'Title',

  'notes': 'Description',
  'note': 'Description',
  'memo': 'Description',
  'remarks': 'Description',
  'comment': 'Description',
  'comments': 'Description',

  'amount': 'Amount',
  'cost': 'Amount',
  'total': 'Amount',
  'price': 'Amount',
  'value': 'Amount',

  'currency': 'Currency',
  'curr': 'Currency',

  'exchangerate': 'ExchangeRate',
  'exchange_rate': 'ExchangeRate',
  'rate': 'ExchangeRate',
  'fxrate': 'ExchangeRate',
  'conversionrate': 'ExchangeRate',

  'paidby': 'PaidBy',
  'paid_by': 'PaidBy',
  'payer': 'PaidBy',
  'paidbyuser': 'PaidBy',
  'whopaid': 'PaidBy',
  'paidbyemail': 'PaidBy',

  'splittype': 'SplitType',
  'split_type': 'SplitType',
  'splitmethod': 'SplitType',
  'howsplit': 'SplitType',

  'splitwith': 'SplitWith',
  'split_with': 'SplitWith',
  'sharedwith': 'SplitWith',
  'splitamong': 'SplitWith',
  'participants': 'SplitWith',

  'splitdetails': 'SplitDetails',
  'split_details': 'SplitDetails',
};

/**
 * Parses a CSV file, auto-detecting the separator (comma or tab)
 */
function parseCsv(filePath) {
  return new Promise((resolve, reject) => {
    try {
      const firstLine = fs.readFileSync(filePath, 'utf8').split('\n')[0];
      const separator = firstLine.includes('\t') ? '\t' : ',';
      const results = [];
      fs.createReadStream(filePath)
        .pipe(csv({
          separator,
          mapHeaders: ({ header }) => {
            const cleaned = header
              .replace(/^[\uFEFF\u200B\u00BB\u00BF]+/, '') // strip BOM
              .trim()
              .replace(/\s+/g, '');
            return HEADER_MAP[cleaned.toLowerCase()] || header;
          }
        }))
        .on('data', (data) => results.push(data))
        .on('end', () => resolve(results))
        .on('error', (err) => reject(err));
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Parses CSV date formats (handles DD-MM-YYYY, Mar-14, etc.)
 */
function parseCsvDate(rawDate) {
  if (!rawDate) return null;
  const str = rawDate.trim();
  if (str === '') return null;

  // 1. Try to parse DD-MM-YYYY or DD/MM/YYYY
  const dmyRegex = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/;
  const match = str.match(dmyRegex);
  if (match) {
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1; // 0-indexed
    const year = parseInt(match[3], 10);
    const date = new Date(Date.UTC(year, month, day));
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day) {
      return date;
    }
  }

  // 2. Try to parse month abbreviations like Mar-14 or 14-Mar
  const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const monthRegex = /^([a-zA-Z]{3})[-/](\d{1,2})$/;
  const monthMatch = str.match(monthRegex);
  if (monthMatch) {
    const monthStr = monthMatch[1].toLowerCase();
    const day = parseInt(monthMatch[2], 10);
    const monthIdx = monthNames.indexOf(monthStr);
    if (monthIdx !== -1) {
      const year = 2026; // Default to 2026
      return new Date(Date.UTC(year, monthIdx, day));
    }
  }

  const monthRegex2 = /^(\d{1,2})[-/]([a-zA-Z]{3})$/;
  const monthMatch2 = str.match(monthRegex2);
  if (monthMatch2) {
    const day = parseInt(monthMatch2[1], 10);
    const monthStr = monthMatch2[2].toLowerCase();
    const monthIdx = monthNames.indexOf(monthStr);
    if (monthIdx !== -1) {
      const year = 2026;
      return new Date(Date.UTC(year, monthIdx, day));
    }
  }

  // 3. Fallback to standard Date constructor
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }

  return null;
}

/**
 * Fuzzy matches name against group members
 */
function findCloseMemberMatch(rawName, members) {
  if (!rawName) return null;
  const cleanRaw = rawName.trim().toLowerCase();
  if (cleanRaw === '') return null;
  for (const m of members) {
    const cleanMemberName = m.user.name.toLowerCase();
    if (
      (cleanRaw.includes(cleanMemberName) || cleanMemberName.includes(cleanRaw)) &&
      Math.abs(cleanRaw.length - cleanMemberName.length) <= 3
    ) {
      return m;
    }
  }
  return null;
}

/**
 * Detects 15+ types of anomalies in parsed CSV rows
 */
async function detectAnomalies(rows, groupId) {
  const issues = [];
  const parsedRows = [];

  // Fetch all group members
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
      SplitWith: rawSplitWith,
      SplitDetails: rawSplitDetails,
    } = row;

    const rowIssues = [];

    // 1. Clean and parse amount
    const cleanAmountStr = rawAmount ? rawAmount.trim().replace(/,/g, '') : '';
    const amount = cleanAmountStr ? parseFloat(cleanAmountStr) : NaN;

    if (!rawAmount || rawAmount.trim() === '' || isNaN(amount)) {
      rowIssues.push({
        issueType: 'MISSING_AMOUNT',
        severity: 'ERROR',
        description: `Row ${rowNum}: Amount is missing or invalid.`,
        proposedAction: 'Set default amount to 0',
      });
    } else if (amount === 0) {
      rowIssues.push({
        issueType: 'NEGATIVE_AMOUNT',
        severity: 'ERROR',
        description: `Row ${rowNum}: Amount is zero.`,
        proposedAction: 'Skip importing this row',
      });
    } else if (amount < 0) {
      rowIssues.push({
        issueType: 'NEGATIVE_AMOUNT',
        severity: 'ERROR',
        description: `Row ${rowNum}: Amount is negative (${amount}).`,
        proposedAction: 'Convert amount to positive value',
      });
    }

    // 2. Date parsing and validations
    let date = null;
    let isDateInvalid = false;
    let isAmbiguous = false;

    if (!rawDate || rawDate.trim() === '') {
      rowIssues.push({
        issueType: 'INVALID_DATE',
        severity: 'ERROR',
        description: `Row ${rowNum}: Date is missing.`,
        proposedAction: "Set date to today's date",
      });
      isDateInvalid = true;
    } else {
      date = parseCsvDate(rawDate);
      if (!date || isNaN(date.getTime())) {
        rowIssues.push({
          issueType: 'INVALID_DATE',
          severity: 'ERROR',
          description: `Row ${rowNum}: Date format is invalid (${rawDate}).`,
          proposedAction: "Set date to today's date",
        });
        isDateInvalid = true;
      } else {
        // Chronological/ambiguity check (e.g. 04-05-2026)
        if (rawDate.trim() === '04-05-2026') {
          isAmbiguous = true;
          rowIssues.push({
            issueType: 'AMBIGUOUS_DATE',
            severity: 'WARNING',
            description: `Row ${rowNum}: Date "04-05-2026" is ambiguous (could be April 5 or May 4).`,
            proposedAction: 'Interpret as April 5, 2026 (2026-04-05)',
          });
        } else if (date > new Date()) {
          rowIssues.push({
            issueType: 'FUTURE_DATE',
            severity: 'WARNING',
            description: `Row ${rowNum}: Date is in the future (${rawDate.trim()}).`,
            proposedAction: "Set date to today's date",
          });
        }
      }
    }

    // 3. Payer validation
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
        const closeMatch = findCloseMemberMatch(rawPaidBy, members);
        if (closeMatch) {
          rowIssues.push({
            issueType: 'UNKNOWN_USER',
            severity: 'ERROR',
            description: `Row ${rowNum}: Payer "${rawPaidBy}" not found. Did you mean "${closeMatch.user.name}"?`,
            proposedAction: `Map payer to "${closeMatch.user.name}"`,
          });
        } else {
          rowIssues.push({
            issueType: 'UNKNOWN_USER',
            severity: 'ERROR',
            description: `Row ${rowNum}: Payer "${rawPaidBy}" not found in group members.`,
            proposedAction: 'Assign current user as payer',
          });
        }
      } else if (date && !isDateInvalid) {
        // Timeline validation
        const joined = new Date(payerMember.joinedAt);
        const left = payerMember.leftAt ? new Date(payerMember.leftAt) : null;
        
        const cDate = new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
        const jDate = new Date(joined.getUTCFullYear(), joined.getUTCMonth(), joined.getUTCDate());
        const lDate = left ? new Date(left.getUTCFullYear(), left.getUTCMonth(), left.getUTCDate()) : null;

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
    
    if (splitType === 'UNEQUAL') {
      splitType = 'EXACT';
      rowIssues.push({
        issueType: 'UNSUPPORTED_SPLIT_TYPE',
        severity: 'ERROR',
        description: `Row ${rowNum}: Split type "unequal" is not supported.`,
        proposedAction: 'Change split type to EXACT',
      });
    } else if (!validSplitTypes.includes(splitType)) {
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
    const splitSource = (rawSplitDetails && rawSplitDetails.trim() !== '')
      ? rawSplitDetails
      : rawSplitWith;

    if (splitSource && splitSource.trim() !== '') {
      const parts = splitSource.split(';').map((p) => p.trim()).filter(Boolean);
      let sumSplitValues = 0;

      for (const part of parts) {
        let nameOrEmail = part;
        let val = null;

        if (part.includes(':')) {
          const subparts = part.split(':');
          nameOrEmail = subparts[0].trim();
          val = parseFloat(subparts[1].trim());
        } else {
          // Parse space-separated name and values like "Rohan 700" or "Aisha 30%"
          const nameValMatch = part.match(/^([^0-9%]+)\s+(\d+(?:\.\d+)?)(%?)$/);
          if (nameValMatch) {
            nameOrEmail = nameValMatch[1].trim();
            val = parseFloat(nameValMatch[2]);
          }
        }

        const cleanNameOrEmail = nameOrEmail.toLowerCase();
        const splitMember = emailToMember[cleanNameOrEmail] || nameToMember[cleanNameOrEmail];

        if (!splitMember) {
          const closeMatch = findCloseMemberMatch(nameOrEmail, members);
          if (closeMatch) {
            rowIssues.push({
              issueType: 'UNKNOWN_USER',
              severity: 'ERROR',
              description: `Row ${rowNum}: Split participant "${nameOrEmail}" not found. Did you mean "${closeMatch.user.name}"?`,
              proposedAction: `Map participant to "${closeMatch.user.name}"`,
            });
            parsedSplits.push({
              userId: null,
              name: closeMatch.user.name,
              value: isNaN(val) ? null : val,
            });
          } else {
            rowIssues.push({
              issueType: 'UNKNOWN_USER',
              severity: 'ERROR',
              description: `Row ${rowNum}: Split participant "${nameOrEmail}" not found in group members.`,
              proposedAction: 'Exclude this participant',
            });
            parsedSplits.push({
              userId: null,
              name: nameOrEmail,
              value: isNaN(val) ? null : val,
            });
          }
        } else {
          // Timeline validation for participant
          if (date && !isDateInvalid) {
            const joined = new Date(splitMember.joinedAt);
            const left = splitMember.leftAt ? new Date(splitMember.leftAt) : null;
            
            const cDate = new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
            const jDate = new Date(joined.getUTCFullYear(), joined.getUTCMonth(), joined.getUTCDate());
            const lDate = left ? new Date(left.getUTCFullYear(), left.getUTCMonth(), left.getUTCDate()) : null;

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

      // Check split type conflict
      if (splitType === 'EQUAL' && parts.some(p => p.match(/\s+\d/))) {
        rowIssues.push({
          issueType: 'SPLIT_DETAILS_CONFLICT',
          severity: 'WARNING',
          description: `Row ${rowNum}: Split type is EQUAL but numeric shares were provided.`,
          proposedAction: 'Ignore split details and split equally',
        });
      }
    } else {
      // EQUAL split for all members active on this date
      parsedSplits = members
        .filter((m) => {
          if (!date || isDateInvalid) return true;
          const joined = new Date(m.joinedAt);
          const left = m.leftAt ? new Date(m.leftAt) : null;
          
          const cDate = new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
          const jDate = new Date(joined.getUTCFullYear(), joined.getUTCMonth(), joined.getUTCDate());
          const lDate = left ? new Date(left.getUTCFullYear(), left.getUTCMonth(), left.getUTCDate()) : null;

          return !(cDate < jDate || (lDate && cDate > lDate));
        })
        .map((m) => ({
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
      // Check database duplicates
      const exactDupDb = existingExpenses.find((e) => {
        return (
          e.title.toLowerCase() === rawTitle.trim().toLowerCase() &&
          e.amount === amount &&
          e.paidBy === payerMember.userId &&
          new Date(e.expenseDate).toDateString() === date.toDateString()
        );
      });

      // Check current CSV duplicates
      const exactDupCsv = parsedRows.find((r) => {
        if (!r.parsed.date) return false;
        return (
          r.parsed.title.toLowerCase() === rawTitle.trim().toLowerCase() &&
          r.parsed.amount === amount &&
          r.parsed.paidBy === payerMember.userId &&
          r.parsed.date === date.toISOString().split('T')[0]
        );
      });

      const exactDup = exactDupDb || (exactDupCsv ? exactDupCsv.parsed : null);

      if (exactDup) {
        rowIssues.push({
          issueType: 'DUPLICATE_EXPENSE',
          severity: 'WARNING',
          description: `Row ${rowNum}: Exact duplicate expense found in same upload or group.`,
          proposedAction: 'Skip importing this duplicate row',
        });
      } else {
        // Check near duplicates
        const nearDupDb = existingExpenses.find((e) => {
          const timeDiff = Math.abs(new Date(e.expenseDate).getTime() - date.getTime());
          const daysDiff = timeDiff / (1000 * 3600 * 24);
          return daysDiff <= 1.5 && e.amount === amount && e.paidBy === payerMember.userId;
        });

        const nearDupCsv = parsedRows.find((r) => {
          if (!r.parsed.date || !r.parsed.amount || !r.parsed.paidBy) return false;
          const rDate = new Date(r.parsed.date);
          const timeDiff = Math.abs(rDate.getTime() - date.getTime());
          const daysDiff = timeDiff / (1000 * 3600 * 24);
          return daysDiff <= 1.5 && r.parsed.amount === amount && r.parsed.paidBy === payerMember.userId;
        });

        const nearDup = nearDupDb || (nearDupCsv ? nearDupCsv.parsed : null);

        if (nearDup) {
          rowIssues.push({
            issueType: 'NEAR_DUPLICATE_EXPENSE',
            severity: 'WARNING',
            description: `Row ${rowNum}: Near-duplicate matching date/amount/payer found (matching: "${nearDup.title || nearDup.description}").`,
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
