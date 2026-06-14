const express = require('express');
const {
  getGroupBalancesHandler,
  getUserBalanceHandler,
  getSettlementPlanHandler,
  explainBalanceHandler,
} = require('../controllers/balance.controller');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router();

router.use(authMiddleware);

router.get('/group/:groupId', getGroupBalancesHandler);
router.get('/user/:userId', getUserBalanceHandler);
router.get('/settlement-plan/:groupId', getSettlementPlanHandler);
router.get('/explain/:userId', explainBalanceHandler);

module.exports = router;
