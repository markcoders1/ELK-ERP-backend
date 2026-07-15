const express = require('express');
const authRoutes = require('../features/auth/auth.routes');
const hardwareRoutes = require('../features/hardware/hardware.routes');
const boardsRoutes = require('../features/boards/boards.routes');

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'ELK ERP API is running',
    data: null,
    errors: null,
  });
});

router.use('/auth', authRoutes);
router.use('/hardware-items', hardwareRoutes);
router.use('/boards', boardsRoutes);

module.exports = router;
