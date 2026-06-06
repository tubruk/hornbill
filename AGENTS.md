> [!NOTE]
> This file is strictly reserved for non-obvious project-scoped rules, architecture boundaries, and database quirks that cannot be easily inferred from code or configuration files alone.

# Hornbill Developer & Agent Guidelines

This document details the non-obvious rules for the Hornbill monorepo. All modifications must comply with these guidelines.

---

## 1. Git & Commit Guidelines

All code contributions must follow these strict commit message rules:

- **Conventional Commits**: Use prefix types (`feat`, `fix`, `refactor`, `style`, `docs`, `chore`).
- **Single Scope Maximum**: Commits must have a maximum of one scope (e.g., `feat(api): add route` or `fix(web): correct spacing`). Never use multiple scopes like `feat(api,web)`.
- **Short Subject**: Keep the subject line under 50 characters, starting with a lowercase verb in the imperative mood.
- **Brief Description Body**: If a description is needed, separate it from the subject line by a blank line and briefly explain the *why* and *what*, rather than *how*.
- **No External References**: Do not include Jira tickets, GitHub issue numbers (e.g., `Closes #123`), or other external issue tracking references.
- **Git Pre-commit Hook**: Always ensure git hooks are installed (run `make git-hooks` to set up). Never bypass pre-commit hooks (such as using `--no-verify` or bypassing during development) unless absolutely necessary.

*Example:*
```
feat(web): migrate dashboard to ember studio theme

Redesigns panels, sidebar buttons, inputs, and font pairings
to conform to the warm minimalist aesthetic.
```

---

## 2. Trailbase & SQLite STRICT Rules

Trailbase runs SQLite in `STRICT` mode. This introduces several critical quirks:

- **Binary UUIDs**: Primary keys and relations representing UUIDs cannot be plain `TEXT` strings. They must be binary `BLOB` columns explicitly guarded by checking constraints:
  ```sql
  id BLOB PRIMARY KEY DEFAULT (uuid_v4()) CHECK (is_uuid_v4(id)) NOT NULL
  ```
- **Inline Foreign Keys Only**: Table-level `FOREIGN KEY(...) REFERENCES...` constraints are rejected by the Trailbase schema parser. Foreign keys must be declared **inline** directly on the column definition:
  ```sql
  account_id BLOB NOT NULL REFERENCES accounts(id) ON DELETE CASCADE CHECK (is_uuid_v4(account_id))
  ```
- **Primary Key Nullability**: SQLite primary keys (except `INTEGER PRIMARY KEY`) allow `NULL` values unless declared `NOT NULL`. You must always append `NOT NULL` to primary keys to prevent Trailbase from exposing them as nullable `Text?` in API contracts.
- **Unix Epoch Seconds**: Store all timestamps as `INTEGER` representing epoch seconds using SQLite's built-in `DEFAULT (UNIXEPOCH())`. In JavaScript or TypeScript code, remember to multiply these seconds by `1000` before constructing `Date` instances.

---

## 3. Tech Stack & Monorepo Boundaries

- **No Local Docker**: Local development must run on host binary processes (e.g. running the local `trail` database engine and Bun app servers via `make dev`). Docker is strictly reserved for packaging and production distribution.
- **Bun Workspaces**: Dependencies and script runs should utilize Bun workspace filters (e.g., `bun --filter hornbill-web build` or `bun --filter hornbill-api dev`).
- **Single-Image Distribution**: In production, the Hono API server serves static assets directly from `apps/web/dist`. Avoid creating API dependencies that break this single-process serving strategy.

---

## 4. Design System & Styling Rules

All UI components, colors, typography, spacing, border radii, shadows, and layout rules must strictly follow the specifications detailed in [DESIGN.md](file:///home/akhy/Projects/github.com/chickenzord/hornbill/DESIGN.md). Always consult [DESIGN.md](file:///home/akhy/Projects/github.com/chickenzord/hornbill/DESIGN.md) before styling or creating new views and components.

---

## 5. CI & Lint Rules

- **No `any` in Source Files**: Avoid using the `any` type in source code files. This rule is strictly enforced by the ESLint configuration and the Git pre-commit hook.
- **Codecov Threshold**: Codecov is configured to fail if overall project coverage falls below `90%`, but individual status drops on patches are set to `off` (meaning patch coverage changes are allowed as long as the overall percentage remains at or above 90%).


