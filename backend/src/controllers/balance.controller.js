const {
  calculateGroupBalances,
  generateSettlementPlan,
  getTraceabilityReport,
} = require('../balances/balance.engine');
const { BadRequestError } = require('../utils/errors');

async function getGroupBalancesHandler(req, res, next) {
  try {
    const groupId = parseInt(req.params.groupId);
    if (isNaN(groupId)) {
      throw new BadRequestError('Invalid group ID');
    }

    const balancesMap = await calculateGroupBalances(groupId);
    return res.json(Object.values(balancesMap));
  } catch (error) {
    next(error);
  }
}

async function getUserBalanceHandler(req, res, next) {
  try {
    const userId = parseInt(req.params.userId);
    const groupId = parseInt(req.query.groupId);

    if (isNaN(userId)) {
      throw new BadRequestError('Invalid user ID');
    }

    if (isNaN(groupId)) {
      throw new BadRequestError('groupId must be provided in the query string');
    }

    const balancesMap = await calculateGroupBalances(groupId);
    const userBalance = balancesMap[userId];

    if (!userBalance) {
      return res.json({
        userId,
        netBalance: 0,
        paidAmount: 0,
        shareAmount: 0,
        settledPaid: 0,
        settledReceived: 0,
      });
    }

    return res.json(userBalance);
  } catch (error) {
    next(error);
  }
}

async function getSettlementPlanHandler(req, res, next) {
  try {
    const groupId = parseInt(req.params.groupId);
    if (isNaN(groupId)) {
      throw new BadRequestError('Invalid group ID');
    }

    const plan = await generateSettlementPlan(groupId);
    return res.json(plan);
  } catch (error) {
    next(error);
  }
}

async function explainBalanceHandler(req, res, next) {
  try {
    const userId = parseInt(req.params.userId);
    const groupId = parseInt(req.query.groupId);

    if (isNaN(userId)) {
      throw new BadRequestError('Invalid user ID');
    }

    // Call balance report generator
    const report = await getTraceabilityReport(userId, isNaN(groupId) ? null : groupId);
    return res.json(report);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getGroupBalancesHandler,
  getUserBalanceHandler,
  getSettlementPlanHandler,
  explainBalanceHandler,
};
