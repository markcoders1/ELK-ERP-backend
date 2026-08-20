/**
 * Excel-faithful cascade: Hardware Master → HIR → HW Components → Catalogue.
 *
 * propagateHardwareChange(stockCode):
 * 1. Load HardwareItem, compute pricing, upsert HIR manufacturingPrice = mnfPrice
 * 2. Recalc all HwComponentLine where hardwareItem === stockCode
 * 3. For each distinct productCode, if a live Component exists with
 *    componentCode === productCode, update catalogueMetrics.hwCost / hwRetail
 * 4. Return summary
 */

const HardwareItem = require('../hardware/hardwareItem.model');
const Component = require('../components/component.model');
const {
  calculateHardwarePricing,
} = require('../hardware/hardwarePricing.service');
const hardwareItemRangeService = require('../hardware-item-range/hardwareItemRange.service');
const hwComponentsService = require('../hw-components/hwComponents.service');
const {
  calculateCataloguePricing,
  DEFAULT_HW_MARKUP,
} = require('../catalogue-pricing/cataloguePricing.service');
const {
  COMPONENT_VERSION_STATUS,
} = require('../../config/constants');

const normalizeStockCode = (stockCode) =>
  String(stockCode || '').trim().toUpperCase();

const liveComponentFilter = {
  deletedAt: null,
  versionStatus: COMPONENT_VERSION_STATUS.APPROVED,
};

/**
 * Update catalogueMetrics.hwCost / hwRetail on the live Component (if any).
 */
const updateCatalogueHwMetrics = async (productCode) => {
  const code = normalizeStockCode(productCode);
  const component = await Component.findOne({
    componentCode: code,
    ...liveComponentFilter,
  });

  if (!component) {
    return { productCode: code, updated: false };
  }

  const existingMetrics =
    (component.catalogueMetrics &&
      (component.catalogueMetrics.toObject
        ? component.catalogueMetrics.toObject()
        : component.catalogueMetrics)) ||
    {};

  const pricing = await calculateCataloguePricing({
    productCode: code,
    metrics: {
      hwMarkup: existingMetrics.hwMarkup ?? DEFAULT_HW_MARKUP,
      fcMarkup: existingMetrics.fcMarkup,
      wastage: existingMetrics.wastage,
      edgingCostPerM: existingMetrics.edgingCostPerM2,
      masonitePricePerM2: existingMetrics.fcMasoniteCostPerM2,
      boardPricePerM2: existingMetrics.fcWhiteMelamineCostPerM2,
    },
  });

  component.catalogueMetrics = {
    ...existingMetrics,
    hwCost: pricing.hwCost,
    hwRetail: pricing.hwRetail,
    hwMarkup: pricing.hwMarkup,
  };

  await component.save();

  return {
    productCode: code,
    updated: true,
    hwCost: pricing.hwCost,
    hwRetail: pricing.hwRetail,
  };
};

/**
 * Propagate a single Hardware Master stock-code change through the cascade.
 */
const propagateHardwareChange = async (stockCode) => {
  const code = normalizeStockCode(stockCode);

  const hardware = await HardwareItem.findOne({
    stockCode: code,
    deletedAt: null,
  }).lean();

  let hirUpdated = false;
  let hwLinesUpdated = 0;
  const productsTouched = [];

  if (hardware) {
    const pricing = calculateHardwarePricing(hardware);
    const safeSource = {
      ...hardware,
      id: hardware._id,
      pricingDetails: pricing,
    };

    await hardwareItemRangeService.upsertFromHardware(safeSource);
    hirUpdated = true;
  }

  const recalc = await hwComponentsService.recalculateCostsForHardwareItem(code);
  hwLinesUpdated = recalc.linesUpdated;

  const productCodes =
    await hwComponentsService.distinctProductCodesForHardwareItem(code);

  // eslint-disable-next-line no-restricted-syntax
  for (const productCode of productCodes) {
    // eslint-disable-next-line no-await-in-loop
    const touch = await updateCatalogueHwMetrics(productCode);
    if (touch.updated) {
      productsTouched.push(touch.productCode);
    }
  }

  return {
    stockCode: code,
    hirUpdated,
    hwLinesUpdated,
    productsTouched,
  };
};

/**
 * Batch cascade for Excel import chunks.
 */
const propagateHardwareChanges = async (stockCodes = []) => {
  const unique = [
    ...new Set(
      (stockCodes || [])
        .map(normalizeStockCode)
        .filter(Boolean)
    ),
  ];

  const results = [];
  // eslint-disable-next-line no-restricted-syntax
  for (const code of unique) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await propagateHardwareChange(code));
  }

  return {
    count: results.length,
    results,
  };
};

module.exports = {
  propagateHardwareChange,
  propagateHardwareChanges,
  updateCatalogueHwMetrics,
};
