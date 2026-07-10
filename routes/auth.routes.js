const express = require('express');
const authController = require('../controllers/auth.controller');
const authenticate = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const { loginRules, registerRules } = require('../validators/auth.validator');

const router = express.Router();

router.post('/login', validate(loginRules), authController.login);
router.post('/register', validate(registerRules), authController.register);
router.post('/logout', authenticate, authController.logout);
router.get('/me', authenticate, authController.getMe);

module.exports = router;
