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

  // Super White BisonLam (first finish column in Excel):
  // (masonite + white melamine + edging) × FC Mark Up × Wastage + HW Retail
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

const isSuperWhiteFinishName = (name) =>
  /super\s*white/i.test(String(name || ''));

/**
 * Excel: every finish column = (finish-specific materials) + the SAME HW Retail.
 * Hardware CPT/MNF only changes HW Retail. Material terms stay.
 *
 * Super White is recomputed from FC material totals (explicit Excel formula).
 * Other finishes keep their own material term:
 *   material = storedFinish − HW currently baked into Super White VARIANT
 *   newFinish = material + newHwRetail
 * Blank / 0 Excel cells (GENESIS IF false, unused finishes) are left unchanged.
 *
 * @param {Array<{ id: string, name: string, price: number|null }>} finishes
 * @param {number|null} superWhiteNewPrice
 * @param {number|null} newHwRetail
 * @param {number|null} [fallbackPreviousHwRetail]
 */
const applySharedHwRetailToFinishes = ({
  finishes = [],
  superWhiteNewPrice,
  newHwRetail,
  fallbackPreviousHwRetail = null,
} = {}) => {
  const superWhiteMaterial =
    superWhiteNewPrice != null && newHwRetail != null
      ? roundMoney(superWhiteNewPrice - newHwRetail)
      : null;

  const storedSuperWhite = finishes.find((row) =>
    isSuperWhiteFinishName(row.name)
  );

  let bakedHwRetail = null;
  if (
    storedSuperWhite &&
    storedSuperWhite.price != null &&
    Number.isFinite(Number(storedSuperWhite.price)) &&
    superWhiteMaterial != null
  ) {
    bakedHwRetail = roundMoney(Number(storedSuperWhite.price) - superWhiteMaterial);
  } else if (
    fallbackPreviousHwRetail != null &&
    Number.isFinite(Number(fallbackPreviousHwRetail))
  ) {
    bakedHwRetail = roundMoney(Number(fallbackPreviousHwRetail));
  }

  return finishes.map((row) => {
    const current = toNumber(row.price, null);
    if (current == null) {
      return { ...row, skipped: true, nextPrice: null, materialPortion: null };
    }
    // Excel unused / IF-false finishes stay 0 — do not add HW Retail onto them.
    if (current === 0) {
      return { ...row, skipped: true, nextPrice: current, materialPortion: 0 };
    }

    if (isSuperWhiteFinishName(row.name) && superWhiteNewPrice != null) {
      return {
        ...row,
        skipped: false,
        nextPrice: superWhiteNewPrice,
        materialPortion: superWhiteMaterial,
      };
    }

    if (bakedHwRetail == null || newHwRetail == null) {
      return { ...row, skipped: true, nextPrice: current, materialPortion: null };
    }

    const materialPortion = roundMoney(current - bakedHwRetail);
    return {
      ...row,
      skipped: false,
      nextPrice: roundMoney(materialPortion + newHwRetail),
      materialPortion,
    };
  });
};

const ComponentSection = require('../component-sections/componentSection.model');
const SectionItem = require('../section-items/sectionItem.model');
const { SECTION_TYPES } = require('../../config/constants');

/**
 * Persist Excel HW-Retail term onto VARIANT finish rows for one catalogue product.
 * Does not rewrite FC / Board / HW BOM lines.
 */
const updateVariantFinishPricesForHwRetail = async ({
  componentId,
  superWhiteNewPrice,
  newHwRetail,
  fallbackPreviousHwRetail = null,
} = {}) => {
  if (!componentId || newHwRetail == null) {
    return { updated: 0 };
  }

  const section = await ComponentSection.findOne({
    componentId,
    sectionType: SECTION_TYPES.VARIANT,
  }).lean();

  if (!section) {
    return { updated: 0 };
  }

  const items = await SectionItem.find({
    sectionId: section._id,
    sectionType: SECTION_TYPES.VARIANT,
  }).lean();

  if (!items.length) {
    return { updated: 0 };
  }

  const applied = applySharedHwRetailToFinishes({
    finishes: items.map((item) => ({
      id: item._id,
      name: item.attributes?.finishName || item.attributes?.name || '',
      price: toNumber(item.attributes?.retailPrice, null),
      attributes: item.attributes || {},
    })),
    superWhiteNewPrice,
    newHwRetail,
    fallbackPreviousHwRetail,
  });

  const ops = applied
    .filter((row) => !row.skipped && row.nextPrice != null)
    .map((row) => ({
      updateOne: {
        filter: { _id: row.id },
        update: {
          $set: {
            'attributes.retailPrice': row.nextPrice,
            'attributes.materialPortionExHw': row.materialPortion,
          },
        },
      },
    }));

  if (!ops.length) {
    return { updated: 0 };
  }

  await SectionItem.bulkWrite(ops, { ordered: false });
  return { updated: ops.length };
};

module.exports = {
  DEFAULT_HW_MARKUP,
  DEFAULT_FC_MARKUP,
  DEFAULT_WASTAGE,
  calculateCataloguePricing,
  applySharedHwRetailToFinishes,
  updateVariantFinishPricesForHwRetail,
  isSuperWhiteFinishName,
};
