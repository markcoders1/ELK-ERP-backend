# Component Excel Import (server)

Administrator-only migration path for Component BOMs.

## Pipeline

Upload → Parse (shared SheetJS) → Normalize → Validate → Preview → Confirm → **live Components** (DIRECT)

- Reuses `ImportBatch` / `ImportPreviewRow` with `module: COMPONENT`
- One transaction per BOM (header + sections + items)
- Continues on row failures; duplicates skipped
- Tolerant number / blank / currency normalization
- Child section columns accept JSON or pipe-delimited lines

Apply mode: `COMPONENT_IMPORT_APPLY_MODE = DIRECT` (approval bypass for migration only).
