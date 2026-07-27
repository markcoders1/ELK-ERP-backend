const express = require('express');
const authRoutes = require('../features/auth/auth.routes');
const hardwareRoutes = require('../features/hardware/hardware.routes');
const hardwareApprovalsRoutes = require('../features/hardware-approvals/hardwareApprovals.routes');
const hardwareImportRoutes = require('../features/hardware-import/import.routes');
const boardsRoutes = require('../features/boards/boards.routes');
const componentsRoutes = require('../features/components/component.routes');
const componentImportRoutes = require('../features/component-import/import.routes');
const usersRoutes = require('../features/users/users.routes');

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
router.use('/hardware-approvals', hardwareApprovalsRoutes);
router.use('/hardware-import', hardwareImportRoutes);
router.use('/boards', boardsRoutes);
router.use('/components', componentsRoutes);
router.use('/component-import', componentImportRoutes);
router.use('/users', usersRoutes);

module.exports = router;
