# ASCII Design Quote (Backend)

Parse a Winner / 2020 kitchen **ASCII** export, **ignore every price in that file**, and quote matched product codes from ELK:

- Carcasses & BIC Catalogue (`retailPrice` = Super White)
- Hardware Master File (pricing engine)

**Does not** write Hardware, BOM, or catalogue data.

---

## Why

ASCII totals are Winner library prices for one design office/city. ELK prices come from Hardware Master (CPT/JHB → MNF) and National Components List. Design geometry and SKUs are kept; Winner money is discarded.

---

## API

`POST /api/ascii-quote/quote`  
Authenticated. Multipart field `file` (.txt / .asc / .ascii, max 8MB).

---

## Matching

| ASCII `500` code | Quote source |
|------------------|--------------|
| Exact live `componentCode` | Catalogue Super White `retailPrice` (if N/A, cascaded HW Retail) |
| Else exact `stockCode` | Hardware engine using **job city** CPT or JHB |
| `BOARD/E1L` | NCL Board List_arch / Board Range cost/m² × ASCII m² |
| `BOARD_EDGING` | NCL Edging Colour Range retail/m |
| Else | Unmatched — no invented price |

`535` cutting sizes like `177X597` are design-only (not priced) so doors are not double-counted on top of the parent unit. Winner city money is never used.
