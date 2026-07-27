const roundMoney = (value) => {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Math.round(value * 100) / 100;
};

/**
 * VARIANT (finish) calculator.
 * Does NOT roll into manufacturing total — exposed for finish pricing cards.
 */
const calculateVariantSection = (items = []) => {
  const breakdown = items.map((item) => {
    const attrs = item.attributes || {};
    const cost =
      item.unitCost != null
        ? Number(item.unitCost)
        : attrs.cost != null
          ? Number(attrs.cost)
          : null;
    const retail =
      attrs.retailPrice != null ? Number(attrs.retailPrice) : null;
    const markup = attrs.markup != null ? Number(attrs.markup) : null;

    return {
      itemId: item.id || item._id,
      finishName: attrs.finishName || attrs.name || null,
      retailPrice: retail != null && Number.isFinite(retail) ? roundMoney(retail) : null,
      cost: cost != null && Number.isFinite(cost) ? roundMoney(cost) : null,
      markup: markup != null && Number.isFinite(markup) ? markup : null,
      status: attrs.status || null,
      notes: item.notes || '',
    };
  });

  return {
    sectionCost: null,
    breakdown,
    contributesToTotal: false,
  };
};

module.exports = { calculateVariantSection };
