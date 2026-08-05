const roundMoney = (value) => {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Math.round(value * 100) / 100;
};

/**
 * BOARD section calculator.
 * Uses stored unitCost (or attributes.calculatedCost) × quantity.
 * Area / waste are source fields only — formula expansions register here later.
 * Linked board master fields may be merged by the service layer into attributes.
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
          : attrs.sourcePrice != null
            ? Number(attrs.sourcePrice)
            : null;
    const lineCost =
      unit != null && Number.isFinite(unit) ? roundMoney(unit * qty) : null;

    return {
      itemId: item.id || item._id,
      quantity: qty,
      unitCost: unit != null && Number.isFinite(unit) ? roundMoney(unit) : null,
      lineCost,
      boardCode: attrs.boardCode || null,
      boardName: attrs.partName || attrs.boardName || attrs.description || null,
      thickness: attrs.thickness ?? null,
      length: attrs.length ?? null,
      width: attrs.width ?? null,
      area: attrs.area ?? null,
      grainDirection: attrs.grainDirection || attrs.grain || null,
      material: attrs.material || null,
      finish: attrs.finish || null,
      colour: attrs.colour || attrs.color || null,
      wastePercent: attrs.wastePercent ?? attrs.waste ?? null,
      yieldPercent: attrs.yieldPercent ?? attrs.yield ?? null,
      utilizationPercent: attrs.utilizationPercent ?? attrs.utilization ?? null,
      sourcePrice: attrs.sourcePrice ?? unit,
      supplier: attrs.supplier || null,
      attributes: attrs,
      pricingSource: attrs.boardCode
        ? {
            type: 'Boards Master',
            code: attrs.boardCode,
            name: attrs.partName || attrs.boardName || null,
            supplier: attrs.supplier || null,
          }
        : null,
    };
  });

  const sectionCost = roundMoney(
    breakdown.reduce((sum, row) => sum + (row.lineCost ?? 0), 0)
  );

  return { sectionCost, breakdown, contributesToTotal: true };
};

module.exports = { calculateBoardSection };
