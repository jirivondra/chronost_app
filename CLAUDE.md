# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Language

All code, comments, commit messages, PR descriptions, and documentation must be written in English, regardless of the language used in the conversation.

## Commands

```bash
# Start the FastAPI backend + SOAP Calculator (http://localhost:8000, http://localhost:8001)
task be-up

# Stop the backend + SOAP Calculator
task be-down

# Serve the frontend (http://localhost:3000)
task fe-up

# Stop the frontend server
task fe-down

# Restart the backend (clean + be-up)
task restart

# Lint (ESLint)
task lint
task lint-fix

# Format check / fix (Prettier)
task format-check

# Run API tests (Jest, in this repo's package.json)
task run-test
```

## Before pushing

Always run `task lint` and `task format-check` (or `task fix` to auto-fix both) before pushing commits.

## Architecture

- `api/main.py` — FastAPI TODO REST API. Changing it can trigger the `postman-sync` workflow — see the `api-change-checklist` skill (`.claude/skills/api-change-checklist/SKILL.md`). Whenever an `api/main.py` change is pushed/merged to `main`, always give the user the URL where the resulting Postman sync PR is opened — <https://github.com/jirivondra/chronos_postman_colection/pulls> — plus the specific PR link once it exists.
- `api/soap_calculator.py` — SOAP 1.1 calculator service (spyne).
- `frontend/` — static HTML/Tailwind CSS screens (login, dashboard, edit-task, task-detail, calculator).
- `schemas/schemas.ts` — shared Joi schemas used by the test suites.

## UI conventions

The frontend has no shared component system — each screen is a standalone HTML file, so a recurring UI block (e.g. a "component") is duplicated markup/JS across files rather than an actual shared include.

When a block appears on more than one screen, treat it as one component with multiple copies: it must look and behave identically everywhere it appears (same data/filtering logic, same visuals, same empty state, same interactions). When you change one occurrence, find and update the others in the same change — don't let copies drift.

Example: the "Upcoming" box (next 7 days of non-completed tasks, date badge + relative day label, click-through) appears on both `dashboard.html` and `calendar.html`. Their `renderUpcoming` implementations are intentionally near-identical; if the behavior changes on one, mirror it on the other.

## Task list pagination & sorting

`GET /todos` takes four optional query params: `order` (`asc`/`desc`, default `desc`, sorts by id), `completed` (bool, filters before pagination), `page` (1-indexed, default 1) and `limit` (page size; omit it to get every matching item with no slicing — this is what `dashboard.html`/`calendar.html` still do). The total count _after filtering but before slicing_ is returned in the `X-Total-Count` response header (exposed via CORS `expose_headers`, otherwise browser JS can't read it) so a paginated caller knows how many pages exist without fetching everything.

`open-tasks.html` (`completed=false`) and `finished-tasks.html` (`completed=true`) are the only paginated callers — same duplicated-component rule as above: their "Sort by" / "Items per page" controls and the JS driving them (`readStateFromUrl`, `navigateWithParams`, `replaceUrlParams`, `loadTodos`, `renderPage`) are intentionally near-identical, mirror changes on both. Sort order, page size and page number live in the URL query string (`?order=&limit=&page=`), not in-memory-only state: changing a control navigates to the updated URL (a full reload, not an AJAX-only update) so the view is bookmarkable/shareable. A syntactically invalid value (`order` not `asc`/`desc`, `limit` not one of `10`/`30`/`50`, `page` not a positive integer) is corrected to its default and the URL is fixed up via `history.replaceState` on load. A `page` that's in range syntactically but beyond the real last page (e.g. `?page=1000` when there are only 2) can only be caught after the fetch reveals the true count; `loadTodos` clamps it to the last valid page and corrects the URL the same way, then re-fetches.

## Theming (light/dark mode)

Every color is a Material 3 token resolved through a CSS custom property, never a hardcoded hex or `rgba(...)`. Each screen's `tailwind-config` script maps every token (`primary`, `surface`, `on-surface`, etc.) to `rgb(var(--color-<token>) / <alpha-value>)`; the actual RGB triplets are defined once in that screen's `<style>` block as `:root { --color-<token>: r g b; ... }` and again under `.dark { ... }`. Toggling the `dark` class on `<html>` switches every `bg-surface-*`/`text-on-*`/etc. utility already in use at once — no per-element `dark:` classes needed. If a rule needs a color outside a Tailwind utility (e.g. a `background` in a `<style>` block), use `rgb(var(--color-<token>) / <alpha>)` the same way — a hardcoded value there is exactly the kind of bug that shows up as a stray wrong-theme patch once `.dark` is toggled (it happened twice: a task-description fade gradient and the login page's glass-panel background).

The `dark` class is set by an inline `<script>` in `<head>`, before the Tailwind CDN `<script>` tag, so it applies before first paint (no flash of the wrong theme): it reads `localStorage.theme` (`'dark'` / `'light'` / absent = follow `prefers-color-scheme`). Any new screen with a header must copy this script plus the `colors`/`:root`/`.dark` blocks from an existing one — same duplicated-component rule as above. `login.html` and `logout.html` intentionally have no visible toggle (no in-app context to change it from), but still carry the same blocks so they inherit the current/system preference instead of forcing light mode.

### `error` vs `warning`

`error` is reserved for things that actually went wrong or are actively destructive: a failed request, a SOAP fault, "cannot connect to API", the delete-confirmation dialog. `warning` is for informative, actionable states that aren't a failure — most notably overdue tasks (the Overdue box, its date badge, the calendar legend dot and day-grid dots): the app didn't fail, it's just telling you something needs attention. Don't reuse `error` for these just because a red/error palette already exists — it muddies the one color that should mean "something broke." `warning` is a custom role (not part of the base Material 3 token set) added the same way as every other token: `warning` / `on-warning` / `warning-container` / `on-warning-container` in the `tailwind-config` colors map and both `:root`/`.dark` blocks.

## Testing

- API integration tests (REST + SOAP, Mocha) live in a separate repo: [mocha_rest_soap_testing](https://github.com/jirivondra/mocha_rest_soap_testing) (the workflows still check it out under its old name `mocha_api_soap_testing`, which GitHub redirects).
- E2E/UI tests live in a separate repo: [Chronos_Playwright_testing](https://github.com/jirivondra/Chronos_Playwright_testing).
- CI (`.github/workflows/`) checks out these external repos to run tests and upload coverage/reports.
- `regression.yml` (workflow name "Regression" — not named after either tool, since it chains both) runs two jobs: the Mocha REST regression suite (`api-regression`), then the full Playwright suite (`e2e-regression`, all browsers, visual tests included) — only if the API job passed. Each job writes a results summary to the run page and uploads its output as an artifact (`mocha-output`, `playwright-report`; 30 days).
- `api-regression` also runs `task check-schema-drift` in the Mocha repo: it regenerates `Todo`'s schema from this API's own `/openapi.json` and fails if it no longer matches the committed `schemas/todo.schema.ts` there. This exists because schema validation alone won't catch an API change that only _adds_ a field to a response — ajv accepts unknown extra properties by default, so nothing else in that suite would fail.
- Visual tests compare screenshots of the login/logout pages against Linux baseline PNGs stored in the Playwright repo. A change to how those pages look fails `e2e-regression` until the baselines are updated: run the **Update Playwright Snapshots** workflow (`update-snapshots.yml`, `workflow_dispatch`) on the PR branch, merge the baseline PR it opens in the Playwright repo, then re-run the job. It needs the `PLAYWRIGHT_REPO_TOKEN` secret.
