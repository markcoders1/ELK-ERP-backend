const roundMoney = (value) => {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Math.round(value * 100) / 100;
};

/**
 * FACTORY operations calculator.
 * Cost = quantity × (unitCost | attributes.cost).
 * Extra manufacturing metadata is read from attributes Mixed (no schema change).
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
    const labour =
      attrs.labourCost != null ? Number(attrs.labourCost) : null;
    const machine =
      attrs.machineCost != null ? Number(attrs.machineCost) : null;
    const lineCost =
      unit != null && Number.isFinite(unit) ? roundMoney(unit * qty) : null;

    return {
      itemId: item.id || item._id,
      name: attrs.name || attrs.operationName || null,
      operationCode: attrs.operationCode || attrs.code || null,
      workCenter: attrs.workCenter || null,
      factory: attrs.factory || null,
      machine: attrs.machine || null,
      setupTime: attrs.setupTime ?? null,
      runTime: attrs.runTime ?? attrs.unit ?? null,
      labourCost: labour != null && Number.isFinite(labour) ? roundMoney(labour) : null,
      machineCost: machine != null && Number.isFinite(machine) ? roundMoney(machine) : null,
      unit: attrs.unit || null,
      quantity: qty,
      unitCost: unit != null && Number.isFinite(unit) ? roundMoney(unit) : null,
      lineCost,
      notes: item.notes || attrs.notes || '',
      pricingSource: attrs.name
        ? {
            type: 'Factory Operation',
            code: attrs.operationCode || attrs.code || null,
            name: attrs.name || attrs.operationName || null,
            workCenter: attrs.workCenter || null,
          }
        : null,
    };
  });

  const sectionCost = roundMoney(
    breakdown.reduce((sum, row) => sum + (row.lineCost ?? 0), 0)
  );

  return { sectionCost, breakdown, contributesToTotal: true };
};

module.exports = { calculateFactorySection };
