/**
 * Excel-faithful Carcasses & BIC Catalogue pricing rollup.
 *
 * Proven from National Components List → Carcasses & BIC Catalogue:
 *
 * HW Cost     = SUMIF(HW Components List TOTAL COST where PRODUCT CODE = Code)
 * HW Retail   = HW Cost × HW Mark Up
 * FC usages   = SUMIFS / SUMIF on FC Components List (board m², edging LM)
 * Material $  = usage × Board Range / Edging rates  OR stored Excel totals
 * Finish (e.g. Super White BisonLam) =
 *   (masoniteCost + boardCost + edgingCost) × FC Mark Up × Wastage + HW Retail
 *
 * Hardware price changes do NOT change FC rows. They change HW Cost → HW Retail
 * → finish prices (FC material portion stays constant unless Board/Edging change).
 */

const hwComponentsService = require('../hw-components/hwComponents.service');
const fcComponentsService = require('../fc-components/fcComponents.service');

const DEFAULT_HW_MARKUP = 2.1;
const DEFAULT_FC_MARKUP = 3.1;
const DEFAULT_WASTAGE = 1.2;

const toNumber = (value, fallback = null) => {
  if (value === '' || value === null || value === undefined) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const roundMoney = (value) => {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Math.round(value * 10000) / 10000;
};

/**
 * @param {object} options
 * @param {string} options.productCode
 * @param {object} [options.metrics] — catalogueMetrics / Excel constants
 * @param {boolean} [options.persist=false]
 */
const calculateCataloguePricing = async ({
  productCode,
  metrics = {},
  persist = false,
} = {}) => {
  const code = String(productCode || '').trim().toUpperCase();
  if (!code) {
    throw new Error('productCode is required for catalogue pricing');
  }

  const hwMarkup = toNumber(metrics.hwMarkup, DEFAULT_HW_MARKUP);
  const fcMarkup = toNumber(metrics.fcMarkup, DEFAULT_FC_MARKUP);
  const wastage = toNumber(metrics.wastage, DEFAULT_WASTAGE);

  const hwCostRaw = await hwComponentsService.sumTotalCostForProduct(code);
  const fcUsage = await fcComponentsService.aggregateUsageForProduct(code);

  // If no HW line has a resolved cost yet, keep Excel-seeded metrics (do not write 0).
  const HwComponentLine = require('../hw-components/hwComponentLine.model');
  const costProbe = await HwComponentLine.find({
    productCode: code,
    deletedAt: null,
    totalCost: { $ne: null },
  })
    .select('_id')
    .limit(1)
    .lean();

  const hasResolvedLineCosts = costProbe.length > 0;
  const seededHwCost = toNumber(metrics.seededHwCost ?? metrics.hwCost, null);
  const seededHwRetail = toNumber(metrics.seededHwRetail ?? metrics.hwRetail, null);

  const hwCost = hasResolvedLineCosts
    ? roundMoney(hwCostRaw)
    : seededHwCost != null
      ? roundMoney(seededHwCost)
      : roundMoney(hwCostRaw);

  const hwRetail = hasResolvedLineCosts
    ? roundMoney((hwCost ?? 0) * hwMarkup)
    : seededHwRetail != null
      ? roundMoney(seededHwRetail)
      : roundMoney((hwCost ?? 0) * hwMarkup);

  // Seed stores Excel *totals* under these names (not unit rates).
  // Prefer those so HW-price cascade keeps FC material $ stable (Excel behaviour).
  let masoniteCost = toNumber(metrics.fcMasoniteCostPerM2, null);
  let boardCost = toNumber(metrics.fcWhiteMelamineCostPerM2, null);
  let edgingCost = toNumber(metrics.edgingCostPerM2, null);

  const masonitePricePerM2 = toNumber(metrics.masonitePricePerM2, null);
  const boardPricePerM2 = toNumber(metrics.boardPricePerM2, null);
  const edgingCostPerM = toNumber(metrics.edgingCostPerM, null);

  if (masoniteCost == null && masonitePricePerM2 != null) {
    masoniteCost = roundMoney(fcUsage.fcMasoniteUsage * masonitePricePerM2);
  }
  if (boardCost == null && boardPricePerM2 != null) {
    boardCost = roundMoney(fcUsage.fcBoardUsage * boardPricePerM2);
  }
  if (edgingCost == null && edgingCostPerM != null) {
    edgingCost = roundMoney(fcUsage.edgingM * edgingCostPerM);
  }

  masoniteCost = roundMoney(masoniteCost ?? 0);
  boardCost = roundMoney(boardCost ?? 0);
  edgingCost = roundMoney(edgingCost ?? 0);

  const materialSubtotal =
    (masoniteCost ?? 0) + (boardCost ?? 0) + (edgingCost ?? 0);

  // Super White BisonLam formula (first finish column pattern in Excel)
  const finishPriceSuperWhite = roundMoney(
    materialSubtotal * fcMarkup * wastage + (hwRetail ?? 0)
  );

  return {
    productCode: code,
    hwCost,
    hwMarkup,
    hwRetail,
    fcMasoniteUsage: roundMoney(
      toNumber(metrics.fcMasoniteUsage, fcUsage.fcMasoniteUsage)
    ),
    fcBoardUsage: roundMoney(toNumber(metrics.fcBoardUsage, fcUsage.fcBoardUsage)),
    edgingLinearMeterSum: roundMoney(fcUsage.edgingLinearMeterSum),
    edgingM: roundMoney(toNumber(metrics.edgingUsage, fcUsage.edgingM)),
    masoniteCost,
    boardCost,
    edgingCost,
    masonitePricePerM2,
    boardPricePerM2,
    edgingCostPerM,
    fcMarkup,
    wastage,
    finishPriceSuperWhite,
    persisted: Boolean(persist),
  };
};

module.exports = {
  DEFAULT_HW_MARKUP,
  DEFAULT_FC_MARKUP,
  DEFAULT_WASTAGE,
  calculateCataloguePricing,
};
