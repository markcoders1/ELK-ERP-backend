# FC Components List (Backend)

Excel-faithful **FC Components List** lines (factory BOM by product).

For formulas → `fcFormulas.js`  
For catalogue rollup → `server/features/catalogue-pricing/`

**Status:** Backend foundation COMPLETE

---

## Purpose

Mirrors NCL sheet **FC Components List**:

- `BOARD` (m²) = `LENGTH × WIDTH / 1e6 × QTY`
- `EDGING LINEAR METER` = Excel IF chain (`1L`, `1L1S`, `2L1S`, `1L2S`, `1S`, `2L`, `2S`, `EAR`)

---

## API

**Base path:** `/api/fc-components`  
**Collection:** `fccomponentlines`

| Method | Endpoint | Roles | Notes |
|--------|----------|-------|-------|
| GET | `/` | Auth | List; filter `productCode`, `component` |
| GET | `/by-product/:productCode` | Auth | All lines for a product |
| GET | `/:id` | Auth | Detail |
| POST | `/` | Write roles | Create (derived fields recalculated) |
| PATCH | `/:id` | Write roles | Update |
| DELETE | `/:id` | Admin | Soft delete |

Client-supplied `boardM2` / `edgingLinearMeter` are ignored; server always recalculates.
