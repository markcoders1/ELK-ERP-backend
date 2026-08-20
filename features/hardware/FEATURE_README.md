# Hardware Master File (Backend)

Permanent documentation for the Hardware backend feature module.

For project-wide rules → `AI_CONTEXT.md`  
For implementation status → `PROJECT_PROGRESS.md`  
For module roadmap → `MODULES.md`  
For frontend detail → `client/src/features/hardware/FEATURE_README.md`

---

## Purpose

Canonical hardware SKU master data API. Stores **source inputs** (regional costs, pricing basis, markups, RET from Supplier, weight, supplier mapping). Calculated prices and margins are computed dynamically via `hardwarePricing.service.js` (Excel-faithful Master File formulas) and attached to API responses.

---

## Pricing

All pricing math lives in `hardwarePricing.service.js` (`calculateHardwarePricing`). Controllers do not contain formulas.

Excel-faithful rules (Hardware Master File sheet):

| Field | Rule |
|-------|------|
| VAR | JHB − CPT |
| AGREED | MAX(CPT, JHB) |
| MNF Price | AGREED × MNF Markup |
| FRC Price | IF(basis=Agreed, AGREED×FRC Markup, RET Excl×FRC Markup) |
| RET Excl VAT | IF(basis=Agreed, FRC×RET Markup, RET from Supplier) |
| RET Incl VAT | RET Excl × 1.15 |
| Margins | (selling − cost) / selling × 100 |

`retFromSupplier` is a persisted source input required when `pricingBasis` is Retail.

Responses include `pricingSummary` (list columns) and `pricingDetails` (full breakdown + margins).

---

## API

**Base path:** `/api/hardware-items`  
**Collection:** `hardwareitems`

| Method | Endpoint | Roles | Notes |
|--------|----------|-------|-------|
| GET | `/` | All authenticated | List with pagination, search, filter, sort + pricing |
| GET | `/:id` | All authenticated | Full record including audit + pricing |
| POST | `/` | Admin, Manager, Data Entry | Create (via approvals) |
| PATCH | `/:id` | Admin, Manager, Data Entry | Update; `stockCode` immutable (via approvals) |
| DELETE | `/:id` | Administrator only | Soft delete |

### Source fields (persisted)

`groupCode`, `stockCode`, `description`, `supplierName`, `supplierCode`, `regionalCosts.cpt`, `regionalCosts.jhb`, `pricingBasis`, `mnfMarkup`, `frcMarkup`, `retailMarkup`, `retFromSupplier`, `weight`, `isImport`, `isActive`

`regionalCosts.agreed` may be persisted for compatibility but is always recalculated from the pricing service.

---

## Development seed

```bash
npm run seed:hardware
```

Idempotent insert-missing by `stockCode`. Optional markups/weight in seed JSON; schema defaults apply when omitted.

---

## Known Limitations

- Excel import available via `/api/hardware-import` (Administrator direct live write)
- No restore endpoint for soft-deleted items
