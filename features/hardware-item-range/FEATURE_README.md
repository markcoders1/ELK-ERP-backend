# Hardware Item Range (Backend)

Excel-faithful projection of Hardware Master File into a **real Mongo collection**.

For project-wide rules → `AI_CONTEXT.md`  
For cascade flow → `server/features/cascade/` + AD-024 in `DECISIONS.md`

**Status:** Backend foundation COMPLETE

---

## Purpose

Mirrors NCL sheet **Hardware Item Range**:

| Sheet column | Field | Source |
|--------------|-------|--------|
| Group | `groupCode` | Hardware Master |
| Item Code | `itemCode` | Hardware `stockCode` (unique) |
| Description | `description` | Hardware Master |
| Manufacturing Price | `manufacturingPrice` | Master File **MNF Price** |

HW Components List joins on `HARDWARE ITEM` → `itemCode` and uses `manufacturingPrice` as COST PRICE.

---

## API

**Base path:** `/api/hardware-item-range`  
**Collection:** `hardwareitemranges`

| Method | Endpoint | Roles | Notes |
|--------|----------|-------|-------|
| GET | `/` | Authenticated | Pagination, search, groupCode, isActive |
| GET | `/:itemCode` | Authenticated | Single row by item code |

Rows are maintained by cascade (`upsertFromHardware` / `deactivateByStockCode`), not by a public write API.

---

## Service API

- `upsertFromHardware(hardwareSafeOrLean)` — create/update from Hardware Master
- `findAll(query)` — paginated list
- `findByItemCode(itemCode)`
- `deactivateByStockCode(stockCode)` — soft deactivate on Hardware soft-delete
