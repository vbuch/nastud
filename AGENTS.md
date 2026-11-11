# Working on На студ

Read [the product specification](docs/product-spec.md) before changing behavior
or layout. Update the relevant specification and operations notes in the same
change when the intended behavior changes.

## Repository scope

- This repository owns nastud.site, its static build, tests and GitHub Pages workflow.
- Consume OboApp's public API as described in [the API expectations](docs/api-contract.md).
- OboApp owns source crawling, database access, snapshot retention, daily recording and API implementation.
- Keep API keys in process configuration and GitHub Actions secrets. Browser code and published artifacts must contain public data only.
- Keep the frontend small and use the existing HTML, CSS and JavaScript structure.

## Code and writing

- Use descriptive branch names such as `feat/incident-search` or `fix/share-image`; do not add an agent or product prefix.
- Use pnpm. Add dependencies with `pnpm add` or `pnpm add -D`.
- Prefer named exports for shared functions and import from their concrete modules.
- Use readable multiline code. Always put control-flow statements inside braces, with their bodies on separate lines.
- Expand function bodies and callbacks when they contain statements.
- Fix underlying problems instead of adding lint suppression comments.
- Review files you change for stale comments, dead code, misleading documentation and maintainability problems. Keep cleanup focused.
- Keep independently deliverable changes in focused commits that leave the repository coherent.
- Use clear, familiar language. State what the feature does directly.
- Never use em dashes. Use emoji only when they serve a clear purpose.
- UI text is Bulgarian. Prefer neutral wording; address the user with informal ти when direct address is needed.

## Product rules

- Preserve source-check timestamps. Never substitute build time or browser refresh time for `observedAt`.
- Preserve unknown data as unknown. A failed request, missing baseline or missing estimate must not become zero.
- A verified empty listing can display zero.
- Treat `id`, derived from Toplo's `ContentItemId`, as the stable incident identity. `accidentId` can change between captures.
- Show deadline changes as the difference between the current and first recorded estimates. Do not invent intermediate revisions or postponement counts.
- Preserve the compact main view, full-width timeline, optional incident dialog, playful road and subtle OboApp credit.
- Keep branding, shared image metadata and responsive behavior consistent with the product specification.

## Required checks

Run these from the repository root before submitting or publishing a change:

```sh
pnpm test
node build.mjs --data test/fixtures/timeline.json --incidents test/fixtures/incidents.json
```

Add meaningful regression coverage for changed data interpretation, validation,
sorting or failure behavior. Use fixtures in tests and pull-request builds.
Production publication must use the authenticated API.

For UI changes, inspect the affected flow in a browser at desktop width and at
320px phone width. Check portrait and landscape layouts when the layout changes.
Verify that the main view fits, dialog contents scroll, controls work with a
keyboard, Escape closes the dialog and focus returns to its opener.

For sharing changes, verify initial-HTML metadata, canonical URLs, stable image
paths and the generated 1200 by 630 and 1200 by 1200 PNGs. Keep the bundled font
and its license.

Review available lint or static-analysis findings for changed files. State when
those results are unavailable; a successful scan alone does not establish that
a quality gate passed. Report the checks run and any relevant limitations.

## Releasing

Follow [the operations guide](docs/operations.md). Pull requests build previews
and never deploy. Publish tested main-branch code through the Pages workflow,
then verify the live counter, list and observation timestamp. Preserve the
existing public audience and custom domain.
