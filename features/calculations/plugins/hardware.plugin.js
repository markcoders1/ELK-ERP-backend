const {
  calculateHardwarePricing,
} = require('../../hardware/hardwarePricing.service');

const roundMoney = (value) => {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Math.round(value * 100) / 100;
};

/**
 * Resolve a live unit cost from a Hardware Master lean/doc source object.
 * Prefer agreed cost; fall back to max(CPT, JHB) via pricing calculator.
 */
const resolveHardwareUnitCost = (hardwareSource) => {
  if (!hardwareSource) return null;

  const pricing = calculateHardwarePricing({
    cpt: hardwareSource.regionalCosts?.cpt,
    jhb: hardwareSource.regionalCosts?.jhb,
    pricingBasis: hardwareSource.pricingBasis,
    mnfMarkup: hardwareSource.mnfMarkup,
    frcMarkup: hardwareSource.frcMarkup,
    retailMarkup: hardwareSource.retailMarkup,
  });

  if (pricing.agreed != null) return pricing.agreed;
  if (hardwareSource.regionalCosts?.agreed != null) {
    return Number(hardwareSource.regionalCosts.agreed);
  }
  return null;
};

/**
 * HARDWARE section calculator.
 * Never uses stored prices on the BOM line — always resolves from Hardware Master map.
 *
 * @param {Array} items - section items with hardwareId
 * @param {{ hardwareById: Map<string, object> }} context
 */
const calculateHardwareSection = (items = [], context = {}) => {
  const hardwareById = context.hardwareById || new Map();

  const breakdown = items.map((item) => {
    const qty = Number(item.quantity) || 0;
    const hwId = (item.hardwareId || item.attributes?.hardwareId || '').toString();
    const hardware = hardwareById.get(hwId) || null;
    const unitCost = resolveHardwareUnitCost(hardware);
    const lineCost =
      unitCost != null && Number.isFinite(unitCost)
        ? roundMoney(unitCost * qty)
        : null;

    return {
      itemId: item.id || item._id,
      hardwareId: hwId || null,
      stockCode: hardware?.stockCode || item.attributes?.stockCode || null,
      description: hardware?.description || item.attributes?.description || null,
      groupCode: hardware?.groupCode || item.attributes?.groupCode || null,
      supplierName: hardware?.supplierName || item.attributes?.supplierName || null,
      supplierCode: hardware?.supplierCode || item.attributes?.supplierCode || null,
      brand: hardware?.brand || item.attributes?.brand || null,
      unit: hardware?.unit || item.attributes?.unit || 'ea',
      pricingBasis: hardware?.pricingBasis || null,
      importBatchId: hardware?.importBatchId || null,
      importedAt: hardware?.importedAt || null,
      quantity: qty,
      unitCost: unitCost != null ? roundMoney(unitCost) : null,
      lineCost,
      notes: item.notes || '',
      missingHardware: Boolean(hwId) && !hardware,
      pricingSource: hardware
        ? {
            type: 'Hardware Master',
            code: hardware.stockCode,
            supplier: hardware.supplierName || null,
            group: hardware.groupCode || null,
            importBatchId: hardware.importBatchId || null,
            importedAt: hardware.importedAt || null,
          }
        : null,
    };
  });

  const sectionCost = roundMoney(
    breakdown.reduce((sum, row) => sum + (row.lineCost ?? 0), 0)
  );

  return { sectionCost, breakdown, contributesToTotal: true };
};

module.exports = {
  calculateHardwareSection,
  resolveHardwareUnitCost,
};
