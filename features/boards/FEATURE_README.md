# Boards (Backend)

Permanent documentation for the Boards backend feature module.

For project-wide rules → `AI_CONTEXT.md`  
For business context → `docs/ERP_BLUEPRINT.md`  
For Excel evidence → `ERP_DOMAIN_ANALYSIS.md`  
For implementation status → `PROJECT_PROGRESS.md`  
For module roadmap → `MODULES.md`

**Status: Backend COMPLETE** (frontend not started)

---

## Purpose

Catalogue API for panel / board materials used in factory costing. Stores **source data only**. Does not store calculated values (e.g. total m², concatenated descriptions, price variances) or pricing formulas.

---

## API

**Base path:** `/api/boards`  
**Collection:** `boards`

| Method | Endpoint | Roles | Notes |
|--------|----------|-------|-------|
| GET | `/` | All authenticated | List with pagination, search, filter, sort |
| GET | `/:id` | All authenticated | Full record including audit fields |
| POST | `/` | Admin, Manager, Data Entry | Create |
| PATCH | `/:id` | Admin, Manager, Data Entry | Update; `boardCode` immutable |
| DELETE | `/:id` | Administrator only | Soft delete |

---

## Fields

| Field | Required | Notes |
|-------|----------|-------|
| `boardCode` | yes | Unique forever; immutable on update; stored uppercase |
| `description` | yes | |
| `supplier` | no | |
| `range` | no | |
| `colour` | no | |
| `finish` | no | |
| `boardType` | no | |
| `height` / `width` / `thickness` | no | ≥ 0 when provided |
| `isActive` | no | Default `true` |
| `createdBy` / `updatedBy` / `deletedAt` | system | Audit / soft delete |

**List response** omits `createdBy`, `updatedBy`, `deletedAt`.  
**Detail response** includes full audit data.

---

## List query params

`page`, `limit`, `search`, `supplier`, `range`, `colour`, `finish`, `boardType`, `isActive`, `sortBy`, `sortOrder`

**Search** matches `boardCode` and `description`.  
**Default sort:** `boardCode` ascending.

---

## Known Limitations

- No Excel import/export
- No restore endpoint for soft-deleted boards
- No Pricing Engine / board price-per-m² logic
- No link to Edging, Products, or Factory BOM
- Frontend not implemented

---

## Conventions

Mirrors Hardware Master File: feature-first module, shared auth/RBAC/validation/pagination, soft delete, list/detail serializers, standard API response envelope.
