const path = require('path');
const fs = require('fs');
const multer = require('multer');
const prisma = require('../prisma/prisma-client');
const { parseCsv, detectAnomalies } = require('../import/import.service');
const { calculateSplits } = require('./expense.controller');
const { BadRequestError, NotFoundError } = require('../utils/errors');

// Multer config for file uploads
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({ storage });

async function uploadCsvHandler(req, res, next) {
  try {
    const groupId = parseInt(req.body.groupId);
    if (isNaN(groupId)) {
      throw new BadRequestError('Group ID is required');
    }

    if (!req.file) {
      throw new BadRequestError('No CSV file uploaded');
    }

    const filePath = req.file.path;
    let rows;
    
    try {
      rows = await parseCsv(filePath);
    } catch (err) {
      throw new BadRequestError(`Failed to parse CSV: ${err.message}`);
    } finally {
      // Clean up uploaded file
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.error('Error deleting temp file:', err);
      }
    }

    // Run anomaly detection
    const { issues, parsedRows } = await detectAnomalies(rows, groupId);

    // Save batch in database in PENDING status
    const batch = await prisma.importBatch.create({
      data: {
        status: 'PENDING',
        rawData: JSON.stringify(parsedRows),
        issues: {
          create: issues.map((iss) => ({
            rowNumber: iss.rowNumber,
            severity: iss.severity,
            issueType: iss.issueType,
            description: iss.description,
            proposedAction: iss.proposedAction,
            userApproved: false,
          })),
        },
      },
      include: {
        issues: true,
      },
    });

    return res.json({
      message: 'CSV file parsed. Anomalies detected. Awaiting approval.',
      batchId: batch.id,
      issues: batch.issues,
      parsedRows,
    });
  } catch (error) {
    next(error);
  }
}

async function resolveImportHandler(req, res, next) {
  try {
    const batchId = parseInt(req.body.batchId);
    const groupId = parseInt(req.body.groupId);
    const { resolutions = [] } = req.body; // Array of { issueId, userApproved: boolean }

    if (isNaN(batchId) || isNaN(groupId)) {
      throw new BadRequestError('batchId and groupId are required');
    }

    const batch = await prisma.importBatch.findUnique({
      where: { id: batchId },
      include: { issues: true },
    });

    if (!batch) {
      throw new NotFoundError('Import batch not found');
    }

    if (batch.status !== 'PENDING') {
      throw new BadRequestError('This batch has already been processed');
    }

    // 1. Update issue approval statuses based on user choice
    for (const resItem of resolutions) {
      await prisma.importIssue.update({
        where: { id: resItem.issueId },
        data: { userApproved: resItem.userApproved },
      });
    }

    // 2. Fetch updated batch issues
    const updatedBatch = await prisma.importBatch.findUnique({
      where: { id: batchId },
      include: { issues: true },
    });

    const parsedRows = JSON.parse(updatedBatch.rawData);

    // Map issues by row number
    const issuesByRow = {};
    updatedBatch.issues.forEach((iss) => {
      if (!issuesByRow[iss.rowNumber]) {
        issuesByRow[iss.rowNumber] = [];
      }
      issuesByRow[iss.rowNumber].push(iss);
    });

    // Report metrics
    const report = {
      rowsProcessed: parsedRows.length,
      imported: 0,
      warnings: 0,
      errors: 0,
      approvalRequired: updatedBatch.issues.length,
      issueList: [],
    };

    const expensesToInsert = [];
    const settlementsToInsert = [];

    // 3. Process and apply resolutions
    for (const parsedRow of parsedRows) {
      const rowNum = parsedRow.rowNumber;
      const rowIssues = issuesByRow[rowNum] || [];

      let skipRow = false;
      let convertToSettlement = false;
      let rowData = { ...parsedRow.parsed };

      let rowHasError = false;
      let rowHasWarning = false;

      for (const issue of rowIssues) {
        if (issue.severity === 'ERROR') rowHasError = true;
        if (issue.severity === 'WARNING') rowHasWarning = true;

        const actionTaken = issue.userApproved
          ? `Approved: ${issue.proposedAction}`
          : 'Rejected (No Action)';

        report.issueList.push({
          rowNumber: rowNum,
          issue: issue.description,
          actionTaken,
        });

        if (issue.userApproved) {
          switch (issue.issueType) {
            case 'DUPLICATE_EXPENSE':
            case 'NEAR_DUPLICATE_EXPENSE':
              skipRow = true;
              break;
            case 'NEGATIVE_AMOUNT':
              rowData.amount = Math.abs(rowData.amount);
              break;
            case 'MISSING_AMOUNT':
              rowData.amount = 0;
              break;
            case 'INVALID_DATE':
            case 'FUTURE_DATE':
              rowData.date = new Date().toISOString().split('T')[0];
              break;
            case 'MISSING_PAYER':
            case 'UNKNOWN_USER':
              if (issue.issueType === 'MISSING_PAYER' || rowData.paidBy === null) {
                rowData.paidBy = req.user.id;
              }
              // Filter out invalid/unknown/null split user IDs
              rowData.splits = rowData.splits.filter((s) => s.userId !== null && s.userId !== undefined);
              break;
            case 'CURRENCY_MISSING':
              rowData.currency = 'INR';
              break;
            case 'EXCHANGE_RATE_MISSING':
              rowData.exchangeRate = 1.0;
              break;
            case 'EMPTY_DESCRIPTION':
              rowData.description = rowData.title;
              break;
            case 'UNSUPPORTED_SPLIT_TYPE':
              rowData.splitType = 'EQUAL';
              break;
            case 'SPLIT_MISMATCH':
              if (rowData.splitType === 'EXACT') {
                const sumOfOthers = rowData.splits.slice(0, -1).reduce((sum, s) => sum + (s.value || 0), 0);
                if (rowData.splits.length > 0) {
                  rowData.splits[rowData.splits.length - 1].value = rowData.amount - sumOfOthers;
                }
              } else if (rowData.splitType === 'PERCENTAGE') {
                const sumSplits = rowData.splits.reduce((sum, s) => sum + (s.value || 0), 0);
                if (sumSplits > 0) {
                  rowData.splits.forEach((s) => {
                    s.value = (s.value / sumSplits) * 100;
                  });
                }
              }
              break;
            case 'INACTIVE_MEMBER_INVOLVED':
              // Filter out inactive members from splits
              rowData.splits = rowData.splits.filter((s) => s.userId !== null);
              break;
            case 'SETTLEMENT_RECORDED_AS_EXPENSE':
              convertToSettlement = true;
              break;
          }
        } else {
          // If a critical error is rejected by the user, we cannot import the row
          if (issue.severity === 'ERROR') {
            skipRow = true;
          }
        }
      }

      if (rowHasError) report.errors++;
      if (rowHasWarning) report.warnings++;

      if (skipRow) continue;

      if (convertToSettlement) {
        // Record as peer-to-peer settlement
        const receiverId = rowData.splits[0] ? rowData.splits[0].userId : req.user.id;
        settlementsToInsert.push({
          groupId,
          payerId: rowData.paidBy || req.user.id,
          receiverId,
          amount: rowData.amount,
          settlementDate: new Date(rowData.date || new Date()),
        });
      } else {
        // Save for expense bulk create
        expensesToInsert.push(rowData);
      }
    }

    // 4. Perform DB insertions in a transaction
    await prisma.$transaction(async (tx) => {
      // Create Settlements
      for (const set of settlementsToInsert) {
        await tx.settlement.create({
          data: set,
        });
        report.imported++;
      }

      // Create Expenses & Splits
      for (const exp of expensesToInsert) {
        const rate = parseFloat(exp.exchangeRate) || 1.0;
        const converted = Number((exp.amount * rate).toFixed(2));
        
        // Re-calculate splits based on updated/corrected values
        const splitsInput = exp.splits.map((s) => ({
          userId: s.userId,
          shareAmount: s.value, // maps to expected split input values
          percentage: s.value,
          shares: s.value,
        }));

        const computedSplits = calculateSplits(exp.splitType, exp.amount, rate, splitsInput);

        await tx.expense.create({
          data: {
            groupId,
            title: exp.title,
            description: exp.description || '',
            amount: exp.amount,
            currency: exp.currency,
            exchangeRate: rate,
            convertedAmount: converted,
            paidBy: exp.paidBy || req.user.id,
            expenseDate: new Date(exp.date),
            splitType: exp.splitType,
            splits: {
              create: computedSplits.map((s) => ({
                userId: s.userId,
                shareAmount: s.shareAmount,
                percentage: s.percentage,
                shares: s.shares,
              })),
            },
          },
        });
        report.imported++;
      }

      // Mark batch as IMPORTED
      await tx.importBatch.update({
        where: { id: batchId },
        data: { status: 'IMPORTED' },
      });
    });

    return res.json({
      message: 'Resolution applied. Data successfully imported.',
      report,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  upload,
  uploadCsvHandler,
  resolveImportHandler,
};
