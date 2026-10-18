# Postman collection sync

Keeps the Postman collection in [chronos_postman_colection](https://github.com/jirivondra/chronos_postman_colection) in sync with the API's OpenAPI spec, without ever overwriting hand-written scripts or unrelated requests (e.g. the `Errors` folder).

The collection is for **manual calls only**: it holds no `pm.test` assertions, and its scripts only pass values between requests (e.g. `todo_id`). Status codes are checked by this pipeline instead — see `summarize-newman.js` below. API behaviour itself is tested separately by the Mocha suite (`playwright.yml`, job _API regression_).

## Flow

```mermaid
sequenceDiagram
    actor Dev as Developer
    participant App as Chronost_App (main)
    participant CI as postman-sync workflow
    participant Repo as chronos_postman_colection
    actor Rev as Reviewer

    Dev->>App: Merge PR touching api/main.py
    App->>CI: Trigger (push to main, paths: api/main.py)
    CI->>CI: export_openapi.py -> openapi.json
    CI->>CI: validate_examples.py (Pydantic model examples still valid)
    CI->>CI: generate.js -> one skeleton file per endpoint (+ success status code)
    CI->>Repo: Checkout (scripts/, sync-manifest.json, collections/*.json)
    CI->>CI: auto-wire.js -> new request + scripts/<key>.js + manifest entry for any brand-new endpoint
    CI->>CI: compose.js (skeletons + scripts + manifest -> new collection.json)
    CI->>CI: check-missing-scripts.js -> checklist
    CI->>CI: start API locally, run newman against the composed collection
    CI->>CI: summarize-newman.js -> check status codes vs. spec, collection run summary
    CI->>Repo: Open PR (branch sync/openapi-update, body = auto-wired list + checklist + run summary)
    Repo-->>Rev: PR with updated collection + auto-created requests + checklist + run results
    Rev->>Repo: Review & merge
```

If the live collection run fails — a script error, a request with no response, or a status code that doesn't match the expected one — the PR still opens (so the diff is visible), its title starts with `❌` and its "Collection run" heading says `❌ N failed`, and the workflow run itself is marked failed.

## Files

- `generate.js` — converts the exported OpenAPI spec into one skeleton request per endpoint (`<method>_<path>.json`), using the spec's `example` values (set via `model_config` on the Pydantic models in `api/main.py`) so a freshly wired-up request is directly usable, not full of `<string>` placeholders. Also reads each operation's declared success status code (e.g. `201` for Create, `204` for Delete) straight from the spec and attaches it as `_meta.successStatus`.
- `auto-wire.js` — for every endpoint `generate.js` produced that has **no** entry in the target repo's `sync-manifest.json` yet (a brand-new endpoint), automatically: inserts a new request into the `Todos` folder (built from the skeleton, so it already has a realistic example body), and adds the `key -> name` mapping to `sync-manifest.json`. It writes **no** script — its status code is checked by `summarize-newman.js`, and a `scripts/<key>.js` is only added by hand if the endpoint produces a value other requests should reuse. This only ever _creates_ — it never touches an existing manifest entry, request, or script, so the "never overwrite hand-written content" rule for existing endpoints still holds.
- `compose.js` — for each request name listed in `sync-manifest.json` (including ones `auto-wire.js` just added), syncs only `method` and the URL's path segments (translated into this collection's `{{param}}`-in-path convention) from the matching skeleton, and re-attaches the `prerequest`/`test` scripts from `scripts/<key>.js` (a request without a script file gets none). Everything else — `header`, `body`, and any request/folder not listed in the manifest — is left untouched.
- `check-missing-scripts.js` — flags endpoints with no manifest entry yet (a fallback, in case `auto-wire.js` couldn't wire one up), or whose example `body` fields have drifted from the spec's; the result becomes part of the PR body. It never changes `body` itself, since a field being "missing" can be intentional (e.g. a partial-update example) — a human always decides.
- `summarize-newman.js` — reads the JSON report from running the composed collection (via `newman`) against a live local instance of the API, checks each request — actual vs. expected status code, a JSON body whenever the response has one (every endpoint of this API answers in JSON), and no unresolved `{{variable}}` left in the sent request (i.e. the request chain is intact) — and writes a per-request table appended to the PR body. The expected code is the spec's declared success code (`_meta.successStatus`) for manifest-mapped requests, or the `(NNN)` suffix of the request name for hand-maintained ones (e.g. `Get Non-Existent Todo (404)`); requests matching neither are listed as "not checked". Script errors and requests with no response count as failures too, and any failure makes it exit non-zero. This is the one check that verifies the collection actually _behaves_ correctly, not just that its shape matches the spec — Mocha can't, since it never uses the collection.
- `build-url.js` / `canonical-key.js` — shared helpers (URL construction and `<method>_<path>` key derivation) used by `generate.js`, `compose.js`, and `auto-wire.js`.
- `../api/validate_examples.py` — validates that the `example` on `TodoCreate`/`TodoUpdate` still passes the model's own validation, so `generate.js`'s output can't silently drift into an invalid example.

## Adding a new endpoint

This is now automatic — the moment an endpoint appears in the spec with no request wired up, `auto-wire.js` creates one (without a script — its status code is checked by the collection run). There's nothing to do beforehand; the sync PR itself has the new request ready to review. All you need to do afterward:

1. Review the auto-created request in the sync PR — check the example body, move it to a different folder if `Todos` isn't right
2. Add a `scripts/<key>.js` only if the endpoint produces a value other requests should reuse (e.g. an ID) — never assertions
3. Everything from then on (method/URL) stays in sync automatically, exactly like the other endpoints
