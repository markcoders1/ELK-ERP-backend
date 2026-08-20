# HW Components List (Backend)

Excel-faithful **HW Components List** lines: product ↔ hardware stock code + qty.

For cascade → `server/features/cascade/` + AD-024  
For HIR cost source → `server/features/hardware-item-range/`

**Status:** Backend foundation COMPLETE

---

## Purpose

Mirrors NCL sheet **HW Components List**:

- `HARDWARE ITEM` → stock code (indexed) → Hardware Item Range `itemCode`
- `COST PRICE` = HIR `manufacturingPrice` (MNF)
- `TOTAL COST` = `QTY × COST PRICE`

---

## API

**Base path:** `/api/hw-components`  
**Collection:** `hwcomponentlines`

| Method | Endpoint | Roles | Notes |
|--------|----------|-------|-------|
| GET | `/` | Auth | List; filter `productCode`, `hardwareItem` |
| GET | `/by-product/:productCode` | Auth | All lines for a product |
| GET | `/:id` | Auth | Detail |
| POST | `/` | Write roles | Create |
| PATCH | `/:id` | Write roles | Update |
| DELETE | `/:id` | Admin | Soft delete |
| POST | `/recalculate/:itemCode` | Write roles | Recalc costs from HIR |

---

## Cascade

`recalculateCostsForHardwareItem(itemCode)` is invoked by `cascade.service.propagateHardwareChange`.
