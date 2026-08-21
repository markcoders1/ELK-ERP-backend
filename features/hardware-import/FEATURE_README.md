# Hardware Excel Import (Backend)

Permanent documentation for the Hardware Import pipeline.

For project-wide rules → `AI_CONTEXT.md`  
For implementation status → `PROJECT_PROGRESS.md`  
For module roadmap → `MODULES.md`  
For frontend detail → `client/src/features/hardware-import/FEATURE_README.md`

---

## Purpose

Enterprise Excel import for the client Hardware Master workbook.

**Import is tolerant. Manual CRUD remains strict and still uses approvals.**

Imported rows are written **directly to the live Hardware catalogue** (Administrator migration path). They do **not** create pending change requests and do **not** appear in the Approval Queue.

**Master File mapping note:** there is no separate Pricing Basis column. Excel **FRC Base** (`Agreed` / `Retail`) maps to `pricingBasis`. Retail rows use **RET from Supplier**; **RET Markup** is often blank and must stay blank (not forced to 1).

Apply mode: `HARDWARE_IMPORT_APPLY_MODE = DIRECT` (future `APPROVAL` toggle reserved).

---

## Pipeline

```
Upload → Parse → Normalize → Validate → Preview → Confirm
  → Live HardwareItem + HARDWARE_IMPORTED audit
```

---

## API

**Base path:** `/api/hardware-import`  
**Roles:** **Administrator only** (403 for Manager / Data Entry / Consultant)

| Method | Endpoint | Notes |
|--------|----------|-------|
| POST | `/upload` | multipart `file` (+ optional `batchName`) |
| GET | `/:batchId/preview` | Paginated preview |
| POST | `/:batchId/confirm` | Writes live hardware |
| POST | `/:batchId/cancel` | Cancel preview / failed batch |
| GET | `/batches` | List import batches |
| GET | `/batches/:batchId` | Batch detail |
| GET | `/dashboard-summary` | Latest import metrics (all authenticated) |

---

- Uses the **first worksheet** in the workbook by default (`sheets[0]`), unless the client passes `sheetName` / `sheetIndex`
- Inserts **or updates** live `HardwareItem` rows with `importBatchId`, `importedBy`, `importedAt`
- Writes one `HARDWARE_IMPORTED` audit per row (entity `HARDWARE`)
- Does **not** create change requests
- Does **not** notify Managers
- After write, cascade: HIR Manufacturing Price (MNF) → HW Components costs → Catalogue `hwCost` / `hwRetail` / finish retail (FC material inputs stay; see AD-026)

Live writes reuse `hardware.service.createManyFromImport` / `updateManyFromImport`.

---

## Chunking

`IMPORT_CHUNK_SIZE = 500`

---

## Known Limitations

- SheetJS loads the workbook into memory (acceptable for 20k rows / 20MB)
- Formula evaluation is intentionally not supported — displayed values only
- After a full hardware import, run `npm run cascade:repair` if NCL HW/FC lines were seeded earlier and costs are still blank
- Boards / Products / BOM import adapters not started
