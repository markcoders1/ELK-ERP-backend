/**
 * Excel-proven cascade for Hardware Master *unit price* changes:
 *
 *   Hardware Master (MNF)
 *     → Hardware Item Range (Manufacturing Price)
 *     → HW Components List (Cost Price / Total Cost)
 *     → Carcasses & BIC Catalogue (HW Cost, HW Retail, finish HW term)
 *
 * FC Components List remains in the overall BIC flow:
 *   - Integrity: HW CHECK-IN-FC / FC CHECK-IN-HW / Catalogue Match (product-code presence)
 *   - Pricing: FC board m² + edging → catalogue material costs → finish material term
 *
 * A hardware price change does not rewrite FC rows (FC has no Master/HIR price formulas).
 * Finish prices still move because HW Retail changes; FC material totals stay until
 * FC / Board Range / Edging change.
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
  updateVariantFinishPricesForHwRetail,
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
 * Recalc catalogue HW Cost / HW Retail / finish using:
 * - live HW line totals (always refreshed)
 * - existing FC-derived material cost totals on catalogueMetrics (Excel FC path)
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
      fcMasoniteUsage: existingMetrics.fcMasoniteUsage,
      fcBoardUsage: existingMetrics.fcBoardUsage,
      edgingUsage: existingMetrics.edgingUsage,
      // FC material $ from Board/Edging × FC usages (seeded / prior FC path)
      fcMasoniteCostPerM2: existingMetrics.fcMasoniteCostPerM2,
      fcWhiteMelamineCostPerM2: existingMetrics.fcWhiteMelamineCostPerM2,
      edgingCostPerM2: existingMetrics.edgingCostPerM2,
    },
  });

  component.catalogueMetrics = {
    ...existingMetrics,
    hwCost: pricing.hwCost,
    hwRetail: pricing.hwRetail,
    hwMarkup: pricing.hwMarkup,
    fcMasoniteUsage: pricing.fcMasoniteUsage ?? existingMetrics.fcMasoniteUsage,
    fcBoardUsage: pricing.fcBoardUsage ?? existingMetrics.fcBoardUsage,
    edgingUsage: pricing.edgingM ?? existingMetrics.edgingUsage,
  };

  // Super White (Excel first finish column) on the catalogue header
  if (pricing.finishPriceSuperWhite != null) {
    component.retailPrice = pricing.finishPriceSuperWhite;
  }

  const previousHwRetail =
    existingMetrics.hwRetail != null ? Number(existingMetrics.hwRetail) : null;

  await component.save();

  // Every Excel finish column = own materials + the same HW Retail.
  // Hardware changes only the HW term; VARIANT rows must all move by that delta.
  const finishes = await updateVariantFinishPricesForHwRetail({
    componentId: component._id,
    superWhiteNewPrice: pricing.finishPriceSuperWhite,
    newHwRetail: pricing.hwRetail,
    fallbackPreviousHwRetail: previousHwRetail,
  });

  return {
    productCode: code,
    updated: true,
    hwCost: pricing.hwCost,
    hwRetail: pricing.hwRetail,
    finishPriceSuperWhite: pricing.finishPriceSuperWhite,
    finishesUpdated: finishes.updated,
  };
};

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
    await hardwareItemRangeService.upsertFromHardware({
      ...hardware,
      id: hardware._id,
      pricingDetails: pricing,
    });
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

const propagateHardwareChanges = async (stockCodes = []) => {
  const unique = [
    ...new Set((stockCodes || []).map(normalizeStockCode).filter(Boolean)),
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
