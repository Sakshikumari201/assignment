const prisma = require('../prisma/prisma-client');
const { BadRequestError } = require('../utils/errors');
const { validateMemberActive } = require('./expense.controller');

async function createSettlement(req, res, next) {
  try {
    const { groupId, payerId, receiverId, amount, settlementDate } = req.body;

    if (!groupId || !payerId || !receiverId || !amount || !settlementDate) {
      throw new BadRequestError('Missing required fields');
    }

    const numericGroupId = parseInt(groupId);
    const numericPayerId = parseInt(payerId);
    const numericReceiverId = parseInt(receiverId);
    const numericAmount = parseFloat(amount);
    const date = new Date(settlementDate);

    if (isNaN(numericGroupId) || isNaN(numericPayerId) || isNaN(numericReceiverId) || isNaN(numericAmount) || isNaN(date.getTime())) {
      throw new BadRequestError('Invalid input types');
    }

    if (numericPayerId === numericReceiverId) {
      throw new BadRequestError('Payer and receiver cannot be the same person');
    }

    if (numericAmount <= 0) {
      throw new BadRequestError('Settlement amount must be positive');
    }

    // Validate active members on date
    const payerValidation = await validateMemberActive(numericGroupId, numericPayerId, date);
    if (!payerValidation.active) {
      throw new BadRequestError(`Payer (${payerValidation.name}) was inactive on the settlement date (${settlementDate})`);
    }

    const receiverValidation = await validateMemberActive(numericGroupId, numericReceiverId, date);
    if (!receiverValidation.active) {
      throw new BadRequestError(`Receiver (${receiverValidation.name}) was inactive on the settlement date (${settlementDate})`);
    }

    const settlement = await prisma.settlement.create({
      data: {
        groupId: numericGroupId,
        payerId: numericPayerId,
        receiverId: numericReceiverId,
        amount: numericAmount,
        settlementDate: date,
      },
      include: {
        payer: { select: { id: true, name: true, email: true } },
        receiver: { select: { id: true, name: true, email: true } },
      },
    });

    return res.status(201).json(settlement);
  } catch (error) {
    next(error);
  }
}

async function getSettlements(req, res, next) {
  try {
    const groupId = parseInt(req.query.groupId);
    if (isNaN(groupId)) {
      throw new BadRequestError('Group ID must be specified');
    }

    const settlements = await prisma.settlement.findMany({
      where: { groupId },
      include: {
        payer: { select: { id: true, name: true, email: true } },
        receiver: { select: { id: true, name: true, email: true } },
      },
      orderBy: { settlementDate: 'desc' },
    });

    return res.json(settlements);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createSettlement,
  getSettlements,
};
