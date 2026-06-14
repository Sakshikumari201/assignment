const express = require('express');
const {
  createGroup,
  getGroups,
  getGroupById,
  addMember,
  updateMember,
} = require('../controllers/group.controller');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router();

router.use(authMiddleware);

router.post('/', createGroup);
router.get('/', getGroups);
router.get('/:id', getGroupById);
router.post('/:id/members', addMember);
router.put('/:id/members/:memberId', updateMember);

module.exports = router;
