/**
 * Excel-faithful Carcasses & BIC Catalogue pricing rollup.
 *
 * Does NOT persist by default — callers decide whether to write
 * Component.catalogueMetrics (cascade updates hwCost / hwRetail).
 *
 * hwCost     = SUMIF HW Components TOTAL COST for product
 * hwRetail   = hwCost × hwMarkup (default 2.1)
 * fcMasonite = SUMIFS boardM2 where component == "Masonite"
 * fcBoard    = SUMIFS boardM2 where component != "Masonite"
 * edgingM    = SUM(edgingLinearMeter) / 1000
 *
 * Finish (Super White style):
 *   (masoniteCost + boardCost + edgingCost) × fcMarkup × wastage + hwRetail
 */

const hwComponentsService = require('../hw-components/hwComponents.service');
const fcComponentsService = require('../fc-components/fcComponents.service');

const DEFAULT_HW_MARKUP = 2.1;
const DEFAULT_FC_MARKUP = 1;
const DEFAULT_WASTAGE = 1;

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
 * @param {string} options.productCode — Catalogue / PRODUCT CODE
 * @param {object} [options.metrics]
 * @param {number} [options.metrics.hwMarkup=2.1]
 * @param {number} [options.metrics.fcMarkup=1]
 * @param {number} [options.metrics.wastage=1]
 * @param {number} [options.metrics.edgingCostPerM]
 * @param {number} [options.metrics.masonitePricePerM2]
 * @param {number} [options.metrics.boardPricePerM2]
 * @param {boolean} [options.persist=false] — reserved; cascade writes selectively
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
  const edgingCostPerM = toNumber(metrics.edgingCostPerM, 0) ?? 0;
  const masonitePricePerM2 = toNumber(metrics.masonitePricePerM2, 0) ?? 0;
  const boardPricePerM2 = toNumber(metrics.boardPricePerM2, 0) ?? 0;

  const hwCostRaw = await hwComponentsService.sumTotalCostForProduct(code);
  const fcUsage = await fcComponentsService.aggregateUsageForProduct(code);

  const hwCost = roundMoney(hwCostRaw);
  const hwRetail = roundMoney((hwCost ?? 0) * hwMarkup);

  const masoniteCost = roundMoney(fcUsage.fcMasoniteUsage * masonitePricePerM2);
  const boardCost = roundMoney(fcUsage.fcBoardUsage * boardPricePerM2);
  const edgingCost = roundMoney(fcUsage.edgingM * edgingCostPerM);

  const materialSubtotal =
    (masoniteCost ?? 0) + (boardCost ?? 0) + (edgingCost ?? 0);
  const finishPriceSuperWhite = roundMoney(
    materialSubtotal * fcMarkup * wastage + (hwRetail ?? 0)
  );

  const result = {
    productCode: code,
    hwCost,
    hwMarkup,
    hwRetail,
    fcMasoniteUsage: roundMoney(fcUsage.fcMasoniteUsage),
    fcBoardUsage: roundMoney(fcUsage.fcBoardUsage),
    edgingLinearMeterSum: roundMoney(fcUsage.edgingLinearMeterSum),
    edgingM: roundMoney(fcUsage.edgingM),
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

  return result;
};

module.exports = {
  DEFAULT_HW_MARKUP,
  DEFAULT_FC_MARKUP,
  DEFAULT_WASTAGE,
  calculateCataloguePricing,
};
