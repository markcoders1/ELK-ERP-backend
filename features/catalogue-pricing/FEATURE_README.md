# Catalogue Pricing (Backend)

Excel-faithful Carcasses & BIC Catalogue rollup service.

**Status:** Backend foundation COMPLETE (calc-only; selective persist via cascade)

---

## Purpose

Computes catalogue HW / FC / finish figures from:

1. `HwComponentLine` totals → `hwCost` / `hwRetail`
2. `FcComponentLine` board & edging aggregates → masonite / board / edging usage
3. Finish (Super White style): `(masonite + board + edging) × fcMarkup × wastage + hwRetail`

Does **not** persist by default. Cascade writes `catalogueMetrics.hwCost` / `hwRetail` onto live Components when Hardware changes.

---

## API

```js
const { calculateCataloguePricing } = require('./cataloguePricing.service');

const result = await calculateCataloguePricing({
  productCode: '1000DH',
  metrics: {
    hwMarkup: 2.1,
    fcMarkup: 1.35,
    wastage: 1.05,
    edgingCostPerM: 12,
    masonitePricePerM2: 80,
    boardPricePerM2: 120,
  },
});
```

No public HTTP routes in this foundation pass — callers are cascade / future Pricing Engine.
