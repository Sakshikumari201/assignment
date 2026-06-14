const prisma = require('../prisma/prisma-client');
const { BadRequestError, NotFoundError, ForbiddenError } = require('../utils/errors');

// Helper to validate user active timeline
async function validateMemberActive(groupId, userId, dateInput) {
  const date = new Date(dateInput);
  
  const member = await prisma.groupMember.findUnique({
    where: {
      groupId_userId: {
        groupId,
        userId,
      },
    },
    include: {
      user: { select: { name: true } }
    }
  });

  if (!member) {
    return { active: false, name: `User ID ${userId}` };
  }

  const joined = new Date(member.joinedAt);
  const left = member.leftAt ? new Date(member.leftAt) : null;

  // Zero out times for date comparison if doing calendar-based validation
  const checkDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const joinDate = new Date(joined.getFullYear(), joined.getMonth(), joined.getDate());
  const leftDate = left ? new Date(left.getFullYear(), left.getMonth(), left.getDate()) : null;

  if (checkDate < joinDate) {
    return { active: false, name: member.user.name, reason: 'before joined date' };
  }

  if (leftDate && checkDate > leftDate) {
    return { active: false, name: member.user.name, reason: 'after left date' };
  }

  return { active: true, name: member.user.name };
}

// Split calculations
function calculateSplits(splitType, amount, exchangeRate, splitsData) {
  const convertedAmount = amount * exchangeRate;
  let computedSplits = [];
  const count = splitsData.length;

  if (count === 0) {
    throw new BadRequestError('Splits list cannot be empty');
  }

  if (splitType === 'EQUAL') {
    const shareAmountOriginal = Number((amount / count).toFixed(2));
    const shareAmountConverted = Number((convertedAmount / count).toFixed(2));

    let originalSum = 0;
    let convertedSum = 0;

    computedSplits = splitsData.map((s, index) => {
      const isLast = index === count - 1;
      let finalOriginal = shareAmountOriginal;
      let finalConverted = shareAmountConverted;

      if (isLast) {
        finalOriginal = Number((amount - originalSum).toFixed(2));
        finalConverted = Number((convertedAmount - convertedSum).toFixed(2));
      } else {
        originalSum += shareAmountOriginal;
        convertedSum += shareAmountConverted;
      }

      return {
        userId: s.userId,
        shareAmount: finalConverted, // Store base currency converted value
        percentage: Number((100 / count).toFixed(2)),
        shares: 1,
      };
    });
  } else if (splitType === 'EXACT') {
    const sumOriginal = splitsData.reduce((sum, s) => sum + (Number(s.shareAmount) || 0), 0);
    if (Math.abs(sumOriginal - amount) > 0.1) {
      throw new BadRequestError(`Sum of splits (${sumOriginal}) does not match total amount (${amount})`);
    }

    let convertedSum = 0;
    computedSplits = splitsData.map((s, index) => {
      const isLast = index === count - 1;
      const originalShare = Number(s.shareAmount);
      let convertedShare = Number((originalShare * exchangeRate).toFixed(2));

      if (isLast) {
        convertedShare = Number((convertedAmount - convertedSum).toFixed(2));
      } else {
        convertedSum += convertedShare;
      }

      return {
        userId: s.userId,
        shareAmount: convertedShare,
        percentage: Number(((originalShare / amount) * 100).toFixed(2)),
        shares: null,
      };
    });
  } else if (splitType === 'PERCENTAGE') {
    const sumPercentage = splitsData.reduce((sum, s) => sum + (Number(s.percentage) || 0), 0);
    if (Math.abs(sumPercentage - 100) > 0.1) {
      throw new BadRequestError(`Sum of percentages (${sumPercentage}%) must equal 100%`);
    }

    let convertedSum = 0;
    computedSplits = splitsData.map((s, index) => {
      const isLast = index === count - 1;
      const pct = Number(s.percentage);
      const originalShare = Number(((pct / 100) * amount).toFixed(2));
      let convertedShare = Number((originalShare * exchangeRate).toFixed(2));

      if (isLast) {
        convertedShare = Number((convertedAmount - convertedSum).toFixed(2));
      } else {
        convertedSum += convertedShare;
      }

      return {
        userId: s.userId,
        shareAmount: convertedShare,
        percentage: pct,
        shares: null,
      };
    });
  } else if (splitType === 'SHARE') {
    const totalShares = splitsData.reduce((sum, s) => sum + (Number(s.shares) || 0), 0);
    if (totalShares <= 0) {
      throw new BadRequestError('Total shares must be greater than zero');
    }

    let convertedSum = 0;
    computedSplits = splitsData.map((s, index) => {
      const isLast = index === count - 1;
      const sh = Number(s.shares);
      const originalShare = Number(((sh / totalShares) * amount).toFixed(2));
      let convertedShare = Number((originalShare * exchangeRate).toFixed(2));

      if (isLast) {
        convertedShare = Number((convertedAmount - convertedSum).toFixed(2));
      } else {
        convertedSum += convertedShare;
      }

      return {
        userId: s.userId,
        shareAmount: convertedShare,
        percentage: Number(((sh / totalShares) * 100).toFixed(2)),
        shares: sh,
      };
    });
  } else {
    throw new BadRequestError(`Unsupported split type: ${splitType}`);
  }

  return computedSplits;
}

async function createExpense(req, res, next) {
  try {
    const {
      groupId,
      title,
      description = '',
      amount,
      currency,
      exchangeRate = 1.0,
      paidBy,
      expenseDate,
      splitType,
      splits,
    } = req.body;

    if (!groupId || !title || !amount || !currency || !paidBy || !expenseDate || !splitType || !splits) {
      throw new BadRequestError('Missing required fields');
    }

    const numericGroupId = parseInt(groupId);
    const numericPaidBy = parseInt(paidBy);
    const numericAmount = parseFloat(amount);
    const numericRate = parseFloat(exchangeRate);
    const date = new Date(expenseDate);

    if (isNaN(numericGroupId) || isNaN(numericPaidBy) || isNaN(numericAmount) || isNaN(numericRate) || isNaN(date.getTime())) {
      throw new BadRequestError('Invalid input types');
    }

    // 1. Validate Payer is active on date
    const payerValidation = await validateMemberActive(numericGroupId, numericPaidBy, date);
    if (!payerValidation.active) {
      throw new BadRequestError(`Payer (${payerValidation.name}) was inactive on the expense date (${expenseDate})`);
    }

    // 2. Validate Participants are active on date
    for (const split of splits) {
      const participantValidation = await validateMemberActive(numericGroupId, parseInt(split.userId), date);
      if (!participantValidation.active) {
        throw new BadRequestError(`Participant (${participantValidation.name}) was inactive on the expense date (${expenseDate})`);
      }
    }

    // 3. Compute Splits
    const computedSplits = calculateSplits(splitType, numericAmount, numericRate, splits);
    const convertedAmount = Number((numericAmount * numericRate).toFixed(2));

    // 4. Create in DB
    const expense = await prisma.expense.create({
      data: {
        groupId: numericGroupId,
        title,
        description,
        amount: numericAmount,
        currency,
        exchangeRate: numericRate,
        convertedAmount,
        paidBy: numericPaidBy,
        expenseDate: date,
        splitType,
        splits: {
          create: computedSplits.map((s) => ({
            userId: s.userId,
            shareAmount: s.shareAmount,
            percentage: s.percentage,
            shares: s.shares,
          })),
        },
      },
      include: {
        payer: { select: { id: true, name: true, email: true } },
        splits: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    return res.status(201).json(expense);
  } catch (error) {
    next(error);
  }
}

async function getExpenses(req, res, next) {
  try {
    const groupId = parseInt(req.query.groupId);
    if (isNaN(groupId)) {
      throw new BadRequestError('Group ID must be specified');
    }

    const expenses = await prisma.expense.findMany({
      where: { groupId },
      include: {
        payer: { select: { id: true, name: true, email: true } },
        splits: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
      orderBy: { expenseDate: 'desc' },
    });

    return res.json(expenses);
  } catch (error) {
    next(error);
  }
}

async function getExpenseById(req, res, next) {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      throw new BadRequestError('Invalid ID');
    }

    const expense = await prisma.expense.findUnique({
      where: { id },
      include: {
        payer: { select: { id: true, name: true, email: true } },
        splits: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    if (!expense) {
      throw new NotFoundError('Expense not found');
    }

    return res.json(expense);
  } catch (error) {
    next(error);
  }
}

async function updateExpense(req, res, next) {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      throw new BadRequestError('Invalid ID');
    }

    const {
      title,
      description = '',
      amount,
      currency,
      exchangeRate = 1.0,
      paidBy,
      expenseDate,
      splitType,
      splits,
    } = req.body;

    const existingExpense = await prisma.expense.findUnique({
      where: { id },
    });

    if (!existingExpense) {
      throw new NotFoundError('Expense not found');
    }

    const numericPaidBy = paidBy ? parseInt(paidBy) : existingExpense.paidBy;
    const numericAmount = amount ? parseFloat(amount) : existingExpense.amount;
    const numericRate = exchangeRate ? parseFloat(exchangeRate) : existingExpense.exchangeRate;
    const date = expenseDate ? new Date(expenseDate) : existingExpense.expenseDate;
    const finalSplitType = splitType || existingExpense.splitType;
    const finalSplits = splits || [];

    // Validate active members
    if (paidBy || expenseDate) {
      const payerValidation = await validateMemberActive(existingExpense.groupId, numericPaidBy, date);
      if (!payerValidation.active) {
        throw new BadRequestError(`Payer (${payerValidation.name}) was inactive on the expense date (${date.toISOString().split('T')[0]})`);
      }
    }

    if (splits && splits.length > 0) {
      for (const split of finalSplits) {
        const participantValidation = await validateMemberActive(existingExpense.groupId, parseInt(split.userId), date);
        if (!participantValidation.active) {
          throw new BadRequestError(`Participant (${participantValidation.name}) was inactive on the expense date (${date.toISOString().split('T')[0]})`);
        }
      }
    }

    // Recalculate splits if splits or amount or exchange rate changed
    let computedSplits = null;
    if (splits && splits.length > 0) {
      computedSplits = calculateSplits(finalSplitType, numericAmount, numericRate, finalSplits);
    }

    const convertedAmount = Number((numericAmount * numericRate).toFixed(2));

    // Update Transaction
    const updatedExpense = await prisma.$transaction(async (tx) => {
      if (computedSplits) {
        // Delete old splits first
        await tx.expenseSplit.deleteMany({
          where: { expenseId: id },
        });
      }

      return await tx.expense.update({
        where: { id },
        data: {
          title: title || existingExpense.title,
          description: description !== undefined ? description : existingExpense.description,
          amount: numericAmount,
          currency: currency || existingExpense.currency,
          exchangeRate: numericRate,
          convertedAmount,
          paidBy: numericPaidBy,
          expenseDate: date,
          splitType: finalSplitType,
          ...(computedSplits && {
            splits: {
              create: computedSplits.map((s) => ({
                userId: s.userId,
                shareAmount: s.shareAmount,
                percentage: s.percentage,
                shares: s.shares,
              })),
            },
          }),
        },
        include: {
          payer: { select: { id: true, name: true, email: true } },
          splits: {
            include: {
              user: { select: { id: true, name: true, email: true } },
            },
          },
        },
      });
    });

    return res.json(updatedExpense);
  } catch (error) {
    next(error);
  }
}

async function deleteExpense(req, res, next) {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      throw new BadRequestError('Invalid ID');
    }

    const expense = await prisma.expense.findUnique({
      where: { id },
    });

    if (!expense) {
      throw new NotFoundError('Expense not found');
    }

    await prisma.expense.delete({
      where: { id },
    });

    return res.json({ message: 'Expense deleted successfully' });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createExpense,
  getExpenses,
  getExpenseById,
  updateExpense,
  deleteExpense,
  validateMemberActive,
  calculateSplits, // Export for use in import resolution
};
