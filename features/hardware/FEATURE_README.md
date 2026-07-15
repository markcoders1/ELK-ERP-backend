# Hardware Master File (Backend)

Permanent documentation for the Hardware backend feature module.

For project-wide rules → `AI_CONTEXT.md`  
For implementation status → `PROJECT_PROGRESS.md`  
For module roadmap → `MODULES.md`  
For frontend detail → `client/src/features/hardware/FEATURE_README.md`

---

## Purpose

Canonical hardware SKU master data API. Stores **source inputs** (regional costs, pricing basis, markups, weight, supplier mapping). Calculated prices and margins are computed dynamically via `hardwarePricing.service.js` and attached to API responses.

---

## Pricing

All pricing math lives in `hardwarePricing.service.js` (`calculateHardwarePricing`). Controllers do not contain formulas.

Temporary assumptions (documented in code) until the client finalises rules:

| Field | Temporary rule |
|-------|----------------|
| VAR | JHB − CPT |
| AGREED (basis=Agreed) | max(CPT, JHB) |
| MNF / FRC / Retail prices | markup chain from Agreed |
| Retail basis | reverse from max(CPT, JHB) as stand-in retail |
| VAT | × 1.15 |
| Margins | (selling − cost) / selling × 100 |

Responses include `pricingSummary` (list columns) and `pricingDetails` (full breakdown + margins).

---

## API

**Base path:** `/api/hardware-items`  
**Collection:** `hardwareitems`

| Method | Endpoint | Roles | Notes |
|--------|----------|-------|-------|
| GET | `/` | All authenticated | List with pagination, search, filter, sort + pricing |
| GET | `/:id` | All authenticated | Full record including audit + pricing |
| POST | `/` | Admin, Manager, Data Entry | Create |
| PATCH | `/:id` | Admin, Manager, Data Entry | Update; `stockCode` immutable |
| DELETE | `/:id` | Administrator only | Soft delete |

### Source fields (persisted)

`groupCode`, `stockCode`, `description`, `supplierName`, `supplierCode`, `regionalCosts.cpt`, `regionalCosts.jhb`, `pricingBasis`, `mnfMarkup`, `frcMarkup`, `retailMarkup`, `weight`, `isImport`, `isActive`

`regionalCosts.agreed` may be persisted for compatibility but is always recalculated from the pricing service.

---

## Development seed

```bash
npm run seed:hardware
```

Idempotent insert-missing by `stockCode`. Optional markups/weight in seed JSON; schema defaults apply when omitted.

---

## Known Limitations

- Pricing formulas are temporary placeholders awaiting client confirmation
- No Excel import/export
- No restore endpoint for soft-deleted items
- `RET from Supplier` not stored yet
