/**
 * Component BOM calculation engine — isolated from controllers.
 * Aggregates section totals; never hardcodes hardware-only rollups.
 */

const {
  COST_BEARING_SECTION_TYPES,
  SECTION_TYPES,
  ROLES,
} = require('../../config/constants');
const {
  getSectionCalculator,
  defaultCostCalculator,
} = require('./registry');

const roundMoney = (value) => {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Math.round(value * 100) / 100;
};

const roundPercent = (value) => {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Math.round(value * 10000) / 100;
};

/**
 * Calculate a single section.
 */
const calculateSection = (sectionType, items, context = {}) => {
  const calculator = getSectionCalculator(sectionType) || defaultCostCalculator;
  const result = calculator(items, context);
  return {
    sectionType: String(sectionType).toUpperCase(),
    sectionCost: result.sectionCost ?? null,
    breakdown: result.breakdown || [],
    contributesToTotal: result.contributesToTotal !== false,
  };
};

/**
 * Roll up all sections for a component.
 *
 * @param {object} params
 * @param {number|null} params.retailPrice
 * @param {Array<{ sectionType: string, items: Array }>} params.sections
 * @param {Map} [params.hardwareById]
 */
const calculateComponentPricing = ({
  retailPrice = null,
  sections = [],
  hardwareById = new Map(),
}) => {
  const context = { hardwareById };
  const sectionResults = sections.map((section) =>
    calculateSection(section.sectionType, section.items || [], context)
  );

  const costsByType = {};
  for (const row of sectionResults) {
    costsByType[row.sectionType] = row.contributesToTotal ? row.sectionCost : null;
  }

  const totalCost = roundMoney(
    sectionResults
      .filter((row) => row.contributesToTotal)
      .reduce((sum, row) => sum + (row.sectionCost ?? 0), 0)
  );

  const retail =
    retailPrice != null && Number.isFinite(Number(retailPrice))
      ? roundMoney(Number(retailPrice))
      : null;

  const margin =
    retail != null && totalCost != null ? roundMoney(retail - totalCost) : null;
  const marginPercent =
    retail != null && retail !== 0 && margin != null
      ? roundPercent(margin / retail)
      : null;

  return {
    sectionResults,
    costsByType,
    boardCost: costsByType[SECTION_TYPES.BOARD] ?? null,
    hardwareCost: costsByType[SECTION_TYPES.HARDWARE] ?? null,
    factoryCost: costsByType[SECTION_TYPES.FACTORY] ?? null,
    totalCost,
    retailPrice: retail,
    margin,
    marginPercent,
  };
};

/**
 * Strip cost / margin fields for Consultant role.
 */
const toRoleAwarePricing = (pricing, role) => {
  if (role !== ROLES.CONSULTANT) return pricing;

  return {
    retailPrice: pricing.retailPrice,
    sectionResults: (pricing.sectionResults || [])
      .filter((s) => s.sectionType === SECTION_TYPES.VARIANT)
      .map((s) => ({
        sectionType: s.sectionType,
        contributesToTotal: false,
        breakdown: (s.breakdown || []).map((row) => ({
          itemId: row.itemId,
          finishName: row.finishName,
          retailPrice: row.retailPrice,
          status: row.status,
        })),
      })),
    costsByType: {},
    boardCost: undefined,
    hardwareCost: undefined,
    factoryCost: undefined,
    totalCost: undefined,
    margin: undefined,
    marginPercent: undefined,
  };
};

/**
 * Build a compact pricing summary card payload.
 */
const buildPricingSummary = (pricing) => ({
  boardCost: pricing.boardCost,
  hardwareCost: pricing.hardwareCost,
  factoryCost: pricing.factoryCost,
  totalCost: pricing.totalCost,
  retailPrice: pricing.retailPrice,
  margin: pricing.margin,
  marginPercent: pricing.marginPercent,
  costsByType: pricing.costsByType || {},
});

module.exports = {
  calculateSection,
  calculateComponentPricing,
  toRoleAwarePricing,
  buildPricingSummary,
  COST_BEARING_SECTION_TYPES,
};
