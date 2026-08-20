# Hardware Cascade (Backend)

Propagates Hardware Master price changes through the Excel-faithful chain:

```
Hardware Master File
  → Hardware Item Range (MNF)
    → HW Components List (COST / TOTAL)
      → Carcasses & BIC Catalogue (hwCost / hwRetail)
```

**Status:** Backend foundation COMPLETE (AD-024)

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

1. Load live `HardwareItem` by `stockCode`; compute pricing; upsert HIR `manufacturingPrice = mnfPrice`
2. Recalculate all `HwComponentLine` where `hardwareItem === stockCode`
3. Collect distinct `productCode`s; for each live `Component` with matching `componentCode`, update `catalogueMetrics.hwCost` / `hwRetail`
4. Return `{ stockCode, hirUpdated, hwLinesUpdated, productsTouched }`

Wired from `hardware.service` create / update / createManyFromImport / softDelete (deactivate HIR), which also covers approval-apply paths.
