# Hardware Cascade (Backend)

Propagates **Hardware Master unit-price** changes through the Excel-faithful HW path, then refreshes catalogue finish using **both** HW Retail and **FC material costs**.

```
Hardware Master (MNF)
  → Hardware Item Range
  → HW Components List
  → Catalogue HW Cost / HW Retail ──┐
                                    ├→ Finish price
FC Components List (board/edging) ──┘   (material term; not rewritten by HW price change)

Integrity (not money): HW ↔ FC ↔ Catalogue CHECK / MATCH on PRODUCT CODE
```

**Status:** Backend COMPLETE (AD-024, AD-026)

---

## Service API

```js
const {
  propagateHardwareChange,
  propagateHardwareChanges,
} = require('./cascade.service');

await propagateHardwareChange('HNG-001');
await propagateHardwareChanges(['HNG-001', 'HNG-002']);
```

### `propagateHardwareChange(stockCode)` steps

1. Load live `HardwareItem`; compute pricing; upsert HIR `manufacturingPrice = mnfPrice`
2. Recalculate all `HwComponentLine` where `hardwareItem === stockCode`
3. For each distinct `productCode`, update live `Component` `catalogueMetrics.hwCost` / `hwRetail` and finish retail = FC materials × markups + HW Retail
4. Return `{ stockCode, hirUpdated, hwLinesUpdated, productsTouched }`

FC rows are **not** rewritten here (Excel: FC has no Master/HIR price formulas). FC data remains required for finish material costs and product-code checks.

Wired from `hardware.service` create / update / import / softDelete (also covers approval-apply).
