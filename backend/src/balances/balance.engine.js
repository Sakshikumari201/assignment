const prisma = require('../prisma/prisma-client');

/**
 * Calculates net balances for all members in a group.
 * Returns an object mapping userId (number) to:
 * {
 *   userId,
 *   name,
 *   email,
 *   paidAmount,
 *   shareAmount,
 *   settledPaid,
 *   settledReceived,
 *   netBalance
 * }
 */
async function calculateGroupBalances(groupId) {
  const members = await prisma.groupMember.findMany({
    where: { groupId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  const balances = {};
  for (const member of members) {
    balances[member.userId] = {
      userId: member.userId,
      name: member.user.name,
      email: member.user.email,
      paidAmount: 0,
      shareAmount: 0,
      settledPaid: 0,
      settledReceived: 0,
      netBalance: 0,
    };
  }

  // Fetch all group expenses and splits
  const expenses = await prisma.expense.findMany({
    where: { groupId },
    include: { splits: true },
  });

  for (const expense of expenses) {
    const payerId = expense.paidBy;
    if (balances[payerId]) {
      balances[payerId].paidAmount += expense.convertedAmount;
    }

    for (const split of expense.splits) {
      if (balances[split.userId]) {
        balances[split.userId].shareAmount += split.shareAmount;
      }
    }
  }

  // Fetch all group settlements
  const settlements = await prisma.settlement.findMany({
    where: { groupId },
  });

  for (const settlement of settlements) {
    const payerId = settlement.payerId;
    const receiverId = settlement.receiverId;

    if (balances[payerId]) {
      balances[payerId].settledPaid += settlement.amount;
    }
    if (balances[receiverId]) {
      balances[receiverId].settledReceived += settlement.amount;
    }
  }

  // Calculate Net Balances
  // For every expense: ledger[payer] += amount, ledger[participant] -= share
  // For settlements: ledger[payer] += amount, ledger[receiver] -= amount
  // Thus, Net = (paidAmount - shareAmount) + (settledPaid - settledReceived)
  for (const userId in balances) {
    const b = balances[userId];
    b.netBalance = Number(
      (b.paidAmount - b.shareAmount + b.settledPaid - b.settledReceived).toFixed(2)
    );
  }

  return balances;
}

/**
 * Generates the simplified settlement plan.
 * Matches debtors with creditors greedily.
 */
async function generateSettlementPlan(groupId) {
  const groupBalances = await calculateGroupBalances(groupId);

  const members = Object.values(groupBalances);
  
  // Separate debtors and creditors
  const debtors = [];
  const creditors = [];

  for (const member of members) {
    if (member.netBalance < -0.01) {
      debtors.push({ ...member });
    } else if (member.netBalance > 0.01) {
      creditors.push({ ...member });
    }
  }

  // Sort debtors ascending (most negative first)
  debtors.sort((a, b) => a.netBalance - b.netBalance);
  // Sort creditors descending (most positive first)
  creditors.sort((a, b) => b.netBalance - a.netBalance);

  const plan = [];

  let dIdx = 0;
  let cIdx = 0;

  while (dIdx < debtors.length && cIdx < creditors.length) {
    const debtor = debtors[dIdx];
    const creditor = creditors[cIdx];

    const debtAmount = Math.abs(debtor.netBalance);
    const creditAmount = creditor.netBalance;

    const settledAmount = Math.min(debtAmount, creditAmount);

    plan.push({
      from: debtor.name,
      fromId: debtor.userId,
      to: creditor.name,
      toId: creditor.userId,
      amount: Number(settledAmount.toFixed(2)),
    });

    debtor.netBalance += settledAmount;
    creditor.netBalance -= settledAmount;

    if (Math.abs(debtor.netBalance) < 0.01) {
      dIdx++;
    }
    if (Math.abs(creditor.netBalance) < 0.01) {
      cIdx++;
    }
  }

  return plan;
}

/**
 * Traces and explains a user's balance.
 */
async function getTraceabilityReport(userId, groupId = null) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true },
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Build query
  const expenseWhere = groupId ? { groupId } : {};
  const settlementWhere = groupId ? { groupId } : {};

  // Find all expenses where user paid or was a split participant
  const expenses = await prisma.expense.findMany({
    where: {
      ...expenseWhere,
      OR: [
        { paidBy: userId },
        { splits: { some: { userId } } },
      ],
    },
    include: {
      splits: { where: { userId } },
      payer: { select: { name: true } },
    },
    orderBy: { expenseDate: 'asc' },
  });

  // Find all settlements involving user
  const settlements = await prisma.settlement.findMany({
    where: {
      ...settlementWhere,
      OR: [
        { payerId: userId },
        { receiverId: userId },
      ],
    },
    include: {
      payer: { select: { name: true } },
      receiver: { select: { name: true } },
    },
    orderBy: { settlementDate: 'asc' },
  });

  const breakdown = [];
  let totalBalance = 0;

  // Add expenses to breakdown
  for (const exp of expenses) {
    // If user paid
    if (exp.paidBy === userId) {
      breakdown.push({
        type: 'expense_paid',
        id: exp.id,
        expense: `${exp.title} (Paid)`,
        date: exp.expenseDate.toISOString().split('T')[0],
        amount: exp.convertedAmount,
        details: `Paid ${exp.amount} ${exp.currency} (converted to ${exp.convertedAmount} base currency)`,
      });
      totalBalance += exp.convertedAmount;
    }

    // If user split (participated)
    const userSplit = exp.splits[0];
    if (userSplit) {
      breakdown.push({
        type: 'expense_share',
        id: exp.id,
        expense: `${exp.title} (Share)`,
        date: exp.expenseDate.toISOString().split('T')[0],
        amount: -userSplit.shareAmount,
        details: `Your share of ${exp.title} paid by ${exp.payer.name}`,
      });
      totalBalance -= userSplit.shareAmount;
    }
  }

  // Add settlements to breakdown
  for (const set of settlements) {
    if (set.payerId === userId) {
      // User paid someone
      breakdown.push({
        type: 'settlement_sent',
        id: set.id,
        expense: `Settlement to ${set.receiver.name}`,
        date: set.settlementDate.toISOString().split('T')[0],
        amount: set.amount,
        details: `Recorded settlement payment to ${set.receiver.name}`,
      });
      totalBalance += set.amount;
    } else if (set.receiverId === userId) {
      // User received from someone
      breakdown.push({
        type: 'settlement_received',
        id: set.id,
        expense: `Settlement from ${set.payer.name}`,
        date: set.settlementDate.toISOString().split('T')[0],
        amount: -set.amount,
        details: `Recorded settlement payment received from ${set.payer.name}`,
      });
      totalBalance -= set.amount;
    }
  }

  // Sort breakdown chronologically
  breakdown.sort((a, b) => new Date(a.date) - new Date(b.date));

  return {
    userName: user.name,
    balance: Number(totalBalance.toFixed(2)),
    breakdown,
  };
}

module.exports = {
  calculateGroupBalances,
  generateSettlementPlan,
  getTraceabilityReport,
};
