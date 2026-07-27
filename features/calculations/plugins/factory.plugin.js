const roundMoney = (value) => {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Math.round(value * 100) / 100;
};

/**
 * FACTORY operations calculator.
 * Cost = quantity × (unitCost | attributes.cost).
 */
const calculateFactorySection = (items = []) => {
  const breakdown = items.map((item) => {
    const qty = Number(item.quantity) || 0;
    const attrs = item.attributes || {};
    const unit =
      item.unitCost != null
        ? Number(item.unitCost)
        : attrs.cost != null
          ? Number(attrs.cost)
          : null;
    const lineCost =
      unit != null && Number.isFinite(unit) ? roundMoney(unit * qty) : null;

    return {
      itemId: item.id || item._id,
      name: attrs.name || null,
      unit: attrs.unit || null,
      quantity: qty,
      unitCost: unit != null && Number.isFinite(unit) ? roundMoney(unit) : null,
      lineCost,
      notes: item.notes || attrs.notes || '',
    };
  });

  const sectionCost = roundMoney(
    breakdown.reduce((sum, row) => sum + (row.lineCost ?? 0), 0)
  );

  return { sectionCost, breakdown, contributesToTotal: true };
};

module.exports = { calculateFactorySection };
