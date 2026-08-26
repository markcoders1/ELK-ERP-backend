const express = require('express');
const asciiQuoteController = require('./asciiQuote.controller');
const authenticate = require('../auth/auth.middleware');

const router = express.Router();

router.use(authenticate);

router.post(
  '/quote',
  asciiQuoteController.uploadMiddleware,
  asciiQuoteController.quoteAscii
);

module.exports = router;
