---
name: api-change-checklist
description: Use whenever a change touches api/main.py (the FastAPI REST API) in Chronost_App — checks whether it triggered the postman-sync workflow and hands over both PR links together, unprompted.
---

# API change checklist

`api/main.py` changes trigger `.github/workflows/postman-sync.yml` on push to `main` (it watches the paths `api/main.py` and `postman-sync/**`). That workflow opens a PR in the separate [chronos_postman_colection](https://github.com/jirivondra/chronos_postman_colection) repo to keep the Postman collection in sync with the OpenAPI spec.

Two things make this easy to miss:

- The workflow only watches `api/main.py` and `postman-sync/**` — a PR that bundles an API change together with unrelated frontend/CI work (e.g. a squashed multi-commit PR) still triggers it, even if the API change wasn't the PR's main focus.
- It **never merges automatically**. It opens the PR and stops — a human always reviews and merges. It also opens the PR **even when the live collection run against the API fails**; only the workflow run itself is then marked failed, so a green Chronost_App PR doesn't guarantee the sync PR is clean.

## What to do

Whenever a change that touches `api/main.py` is pushed or merged to `main`:

1. Check whether `postman-sync` fired for that commit:
   ```bash
   gh run list -R jirivondra/Chronost_App --workflow "Sync Postman Collection" --limit 5 --json databaseId,status,conclusion,headSha
   ```
2. Find the resulting PR:
   ```bash
   gh pr list -R jirivondra/chronos_postman_colection --state open --json number,title,url
   ```
3. Hand the user **both** links together, unprompted — the Chronost_App PR and the `chronos_postman_colection` sync PR. Don't wait to be asked; that defeats the point.
   - **Always** also print the URL where the sync PR lives, so the user knows where to look even if the specific PR can't be linked yet (the workflow is still running, or it hasn't opened the PR): <https://github.com/jirivondra/chronos_postman_colection/pulls>. Never end the hand-off with just "a sync PR will be opened" and no URL.
4. If the workflow run itself failed even though the PR opened, say so. The PR body's "Collection run" section names which requests failed and why — read that (or the workflow run's logs) before reporting it, don't just flag it as a black box.

A change that doesn't touch `api/main.py` (frontend HTML, `api/soap_calculator.py`, CI workflow files, test repos, etc.) never triggers this — no need to check.
