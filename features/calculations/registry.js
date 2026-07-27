const { SECTION_TYPES } = require('../../config/constants');
const { calculateBoardSection } = require('./plugins/board.plugin');
const { calculateHardwareSection } = require('./plugins/hardware.plugin');
const { calculateFactorySection } = require('./plugins/factory.plugin');
const { calculateVariantSection } = require('./plugins/variant.plugin');

/**
 * Open calculator registry keyed by sectionType.
 * Register future types (DOORS, PANELS, PACKAGING, …) here without schema changes.
 */
const registry = new Map([
  [SECTION_TYPES.BOARD, calculateBoardSection],
  [SECTION_TYPES.HARDWARE, calculateHardwareSection],
  [SECTION_TYPES.FACTORY, calculateFactorySection],
  [SECTION_TYPES.VARIANT, calculateVariantSection],
]);

const registerSectionCalculator = (sectionType, calculator) => {
  if (!sectionType || typeof calculator !== 'function') {
    throw new Error('registerSectionCalculator requires sectionType and calculator fn');
  }
  registry.set(String(sectionType).toUpperCase(), calculator);
};

const getSectionCalculator = (sectionType) => {
  const key = String(sectionType || '').toUpperCase();
  return registry.get(key) || null;
};

/**
 * Default passthrough for unknown future section types that store unitCost × qty.
 */
const defaultCostCalculator = (items = []) => {
  const roundMoney = (value) => {
    if (value === null || value === undefined || Number.isNaN(value)) return null;
    return Math.round(value * 100) / 100;
  };

  const breakdown = items.map((item) => {
    const qty = Number(item.quantity) || 0;
    const unit = item.unitCost != null ? Number(item.unitCost) : null;
    const lineCost =
      unit != null && Number.isFinite(unit) ? roundMoney(unit * qty) : null;
    return {
      itemId: item.id || item._id,
      quantity: qty,
      unitCost: unit != null ? roundMoney(unit) : null,
      lineCost,
    };
  });

  return {
    sectionCost: roundMoney(
      breakdown.reduce((sum, row) => sum + (row.lineCost ?? 0), 0)
    ),
    breakdown,
    contributesToTotal: true,
  };
};

module.exports = {
  registerSectionCalculator,
  getSectionCalculator,
  defaultCostCalculator,
  registry,
};
