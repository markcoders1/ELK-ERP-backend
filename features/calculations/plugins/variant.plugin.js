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
    const area = attrs.area != null ? Number(attrs.area) : null;
    const finishCost =
      cost != null && Number.isFinite(cost)
        ? roundMoney(area != null && Number.isFinite(area) ? cost * area : cost)
        : null;

    return {
      itemId: item.id || item._id,
      finishName: attrs.finishName || attrs.name || null,
      finishType: attrs.finishType || attrs.finishName || attrs.name || null,
      priceGroup: attrs.priceGroup || attrs.group || attrs.finishName || null,
      retailPrice: retail != null && Number.isFinite(retail) ? roundMoney(retail) : null,
      cost: cost != null && Number.isFinite(cost) ? roundMoney(cost) : null,
      area: area != null && Number.isFinite(area) ? area : null,
      totalFinishCost: finishCost,
      markup: markup != null && Number.isFinite(markup) ? markup : null,
      status: attrs.status || null,
      notes: item.notes || '',
      pricingSource: {
        type: 'Finish Pricing',
        priceGroup: attrs.priceGroup || attrs.finishName || null,
        finishType: attrs.finishType || attrs.finishName || null,
      },
    };
  });

  return {
    sectionCost: null,
    breakdown,
    contributesToTotal: false,
  };
};

module.exports = { calculateVariantSection };
