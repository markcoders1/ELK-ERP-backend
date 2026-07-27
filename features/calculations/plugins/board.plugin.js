const roundMoney = (value) => {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Math.round(value * 100) / 100;
};

/**
 * BOARD section calculator.
 * Uses stored unitCost (or attributes.calculatedCost) × quantity.
 * Area / waste are source fields only — formula expansions register here later.
 */
const calculateBoardSection = (items = []) => {
  const breakdown = items.map((item) => {
    const qty = Number(item.quantity) || 0;
    const attrs = item.attributes || {};
    const unit =
      item.unitCost != null
        ? Number(item.unitCost)
        : attrs.calculatedCost != null
          ? Number(attrs.calculatedCost)
          : null;
    const lineCost =
      unit != null && Number.isFinite(unit) ? roundMoney(unit * qty) : null;

    return {
      itemId: item.id || item._id,
      quantity: qty,
      unitCost: unit != null && Number.isFinite(unit) ? roundMoney(unit) : null,
      lineCost,
      attributes: attrs,
    };
  });

  const sectionCost = roundMoney(
    breakdown.reduce((sum, row) => sum + (row.lineCost ?? 0), 0)
  );

  return { sectionCost, breakdown, contributesToTotal: true };
};

module.exports = { calculateBoardSection };
