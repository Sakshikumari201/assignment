const express = require('express');
const { createSettlement, getSettlements } = require('../controllers/settlement.controller');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router();

router.use(authMiddleware);

router.post('/', createSettlement);
router.get('/', getSettlements);

module.exports = router;
