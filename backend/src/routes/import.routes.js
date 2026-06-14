const express = require('express');
const {
  upload,
  uploadCsvHandler,
  resolveImportHandler,
} = require('../controllers/import.controller');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router();

router.use(authMiddleware);

router.post('/', upload.single('file'), uploadCsvHandler);
router.post('/resolve', resolveImportHandler);

module.exports = router;
