# Components (server)

Manufacturing component catalogue + generic BOM sections.

## Structure

- `component.model.js` — header (code, description, category, finish, dimensions, retail, hybrid versioning)
- `component.service.js` — list/detail, section/item orchestration, SUPERSEDED clone on update, import create
- `component.controller.js` / `component.routes.js` / `component.validator.js`

Related features:

- `component-sections/` — generic section documents (`sectionType` open string)
- `section-items/` — generic line items (`attributes` Mixed; HARDWARE stores `hardwareId` only)
- `calculations/` — isolated section calculator registry + component rollup
- `component-approvals/` — submit create/update; approve clones prior live → SUPERSEDED
- `component-import/` — Admin DIRECT Excel migration (AD-021 pattern)

## API

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/components` | Paginated list + section counts + pricing summary |
| GET | `/api/components/:id` | Detail + role-aware pricing |
| GET | `/api/components/:id/sections` | Section meta + counts |
| GET | `/api/components/:id/sections/:sectionId/items` | Lazy items + line costs |
| GET | `/api/components/:id/versions` | APPROVED + SUPERSEDED history |
| POST | `/api/components` | Submit create (pending approval) |
| PATCH | `/api/components/:id` | Submit update (pending approval) |
| PATCH | `/api/components/:id/sections/:sectionType` | Section-scoped submit |
| DELETE | `/api/components/:id` | Soft delete (Admin) |

## Rules

- Never store rolled-up totals (AD-005 / AD-022)
- Hardware prices always resolve from Hardware Master at read time (DB-03)
- Consultants never receive cost / margin fields
- Manual CRUD → approvals; Admin import → live DIRECT write
