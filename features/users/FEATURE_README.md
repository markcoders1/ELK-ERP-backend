# User Management (Backend + Frontend)

Administrator-only module for managing platform users, roles, and account status.

For project-wide rules → `AI_CONTEXT.md`  
For implementation status → `PROJECT_PROGRESS.md`  
For module roadmap → `MODULES.md`

**Status: COMPLETE**

---

## Purpose

Internal administration for ELK ERP users. Soft deactivation preserves audit history. User changes apply immediately (no approval workflow).

---

## API

**Base path:** `/api/users`  
**Collection:** `users` (shared with Auth)

| Method | Endpoint | Roles | Notes |
|--------|----------|-------|-------|
| GET | `/summary` | Administrator | Dashboard stats |
| GET | `/` | Administrator | List with pagination, search, filter, sort |
| GET | `/:id` | Administrator | User detail |
| POST | `/` | Administrator | Create user (hashed password) |
| PATCH | `/:id` | Administrator | Update profile / role / status |
| PATCH | `/:id/reset-password` | Administrator | Temporary password placeholder |

**No DELETE** — deactivate via `PATCH` with `isActive: false`.

---

## Fields

| Field | Required | Notes |
|-------|----------|-------|
| `firstName` / `lastName` | yes (create) | Drive display `name` |
| `email` | yes | Unique; immutable on update |
| `phone` | no | |
| `password` | yes (create) | Min 8 chars; hashed |
| `role` | yes | Existing RBAC roles only |
| `isActive` | no | Default `true`; soft deactivation |
| `lastLogin` | system | Updated on successful login |
| `createdBy` | system | Creating administrator |

---

## Safeguards

- Cannot deactivate yourself
- Cannot change your own role
- Cannot deactivate or demote the last active Administrator
- Inactive users cannot login
- Inactive users hidden by default (`isActive=true` unless Status=All / `showInactive=true`)

---

## Audit Trail

Writes immutable records to the existing `audits` collection (`entityType: USER`):

- `USER_CREATED`
- `USER_UPDATED`
- `ROLE_CHANGED`
- `USER_DEACTIVATED` / `USER_ACTIVATED`
- `PASSWORD_RESET`

Hardware Audit Log UI continues to filter `entityType: HARDWARE` only.

---

## Frontend

- Route: `/admin/users` (Administrator only via `RoleRoute`)
- Sidebar: Administration → Users (Administrator only)
- Overview summary on the Users page (counts, recent users, latest login)
- Dialogs for Create / Edit / Deactivate / Reset Password

---

## Conventions

Mirrors Hardware Master File: feature-first module, shared auth/RBAC/validation/pagination, soft deactivation, standard API response envelope.
