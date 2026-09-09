const express = require('express');
const authRoutes = require('../features/auth/auth.routes');
const hardwareRoutes = require('../features/hardware/hardware.routes');
const hardwareApprovalsRoutes = require('../features/hardware-approvals/hardwareApprovals.routes');
const hardwareImportRoutes = require('../features/hardware-import/import.routes');
const hardwareItemRangeRoutes = require('../features/hardware-item-range/hardwareItemRange.routes');
const hwComponentsRoutes = require('../features/hw-components/hwComponents.routes');
const fcComponentsRoutes = require('../features/fc-components/fcComponents.routes');
const boardsRoutes = require('../features/boards/boards.routes');
const componentsRoutes = require('../features/components/component.routes');
const componentImportRoutes = require('../features/component-import/import.routes');
const usersRoutes = require('../features/users/users.routes');
const asciiQuoteRoutes = require('../features/ascii-quote/asciiQuote.routes');
const winnerConnectorRoutes = require('../features/winner-connector/winnerConnector.routes');
const winnerImportsRoutes = require('../features/winner-connector/winnerImports.routes');
const winnerConnectorsAdminRoutes = require('../features/winner-connector/winnerConnectors.admin.routes');

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
router.use('/hardware-item-range', hardwareItemRangeRoutes);
router.use('/hw-components', hwComponentsRoutes);
router.use('/fc-components', fcComponentsRoutes);
router.use('/boards', boardsRoutes);
router.use('/components', componentsRoutes);
router.use('/component-import', componentImportRoutes);
router.use('/users', usersRoutes);
router.use('/ascii-quote', asciiQuoteRoutes);
router.use('/integrations/winner', winnerConnectorRoutes);
router.use('/winner-imports', winnerImportsRoutes);
router.use('/winner-connectors', winnerConnectorsAdminRoutes);

module.exports = router;
