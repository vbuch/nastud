# На студ

[nastud.site](https://nastud.site/) shows the accidents and repairs currently
listed by Toplofikatsia Sofia. It combines a large counter, daily history, a
sortable incident list and an interactive road with manhole covers. The timeline
also compares incident counts with Sofia's daily mean temperature from
Open-Meteo's ECMWF IFS history.

Each current incident has a shareable page with its position, announced deadline
and a table of daily changes from the latest 14 Sofia calendar days.

OboApp supplies the data through its public API. This repository owns the
website, product specification, tests and publication workflow.

## Documentation

- [Product specification](docs/product-spec.md): the website's behavior and design.
- [API expectations](docs/api-contract.md): the data the website consumes.
- [Operations](docs/operations.md): configuration, publication and recovery.
- [Agent instructions](AGENTS.md): development and review conventions.

## Development

Use Node.js 22 and pnpm 10.11.0.

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm check
pnpm dev
```

The development server serves `dist/` at `http://127.0.0.1:4173`. Fixture builds
contain sample observations. Rebuild after source changes and reload the page.

`pnpm check` runs the tests and builds the fixture preview. Use
`pnpm build:fixture` to rebuild the preview while working. These commands need
no API key or OboApp checkout. `pnpm build` without arguments generates the
unavailable-data state.

For a fresh Codex worktree, configure a local environment in the desktop app
with these setup commands:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm build:fixture
```

Use `pnpm check` as a check action and `pnpm dev` as a development-server
action. Commit the generated environment file under `.codex/` to share that
setup. Node.js 22 and pnpm 10.11.0 must be available on the host.

The frontend uses plain HTML, CSS and JavaScript. `build.mjs` generates the
initial page, public JSON files, social images and static hosting files.
`assets/` includes Sofia Sans and its OFL license.

For a build with current data, supply `COUNTER_TIMELINE_URL` and
`COUNTER_API_KEY` through the process environment, then run:

```sh
node build.mjs --fetch --require-current
```

Keep the key in a local secret store or GitHub Actions secret. Generated site
files contain public observations only. Never commit a real key.

Current-data builds also fetch temperature history for completed Sofia days
without an API key. A weather outage leaves the incident chart
available. Fixture builds include sample temperatures and need no network.
See [temperature operations](docs/operations.md#temperature-history) for the
source, daily averaging and attribution.

The same build fetches the previous 13 daily incident listings once for all
incident pages and reuses the current capture for the final day. Missing detailed
captures remain visible gaps. The public `incident-daily.json` file and the
initial incident HTML contain these observations without credentials. Use
`--incident-daily test/fixtures/incident-daily.json` to supply offline history
with a custom fixture build. See
[daily incident operations](docs/operations.md#daily-incident-history) for request
bounds and failure handling.

## Publication

[GitHub Actions](https://github.com/vbuch/nastud/actions/workflows/pages.yml)
builds and publishes the website through GitHub Pages. Main-branch changes,
manual dispatches and the schedule at minutes 7 and 37 can publish. Pull
requests test and build fixture previews.

Production publishing is enabled with the `PUBLISH_ENABLED` repository variable
after the API secret and hosting configuration are ready.

A failed API read or invalid response stops publication and leaves the previous
successful site available. The page preserves the source's observation time.
See [operations](docs/operations.md) for the full release procedure.

## Source history

The website was extracted from `counter/` in
[`vbuch/oboapp`](https://github.com/vbuch/oboapp) at commit
[`ead7ffc68fc1411582a85045c2bf15a96a1ca648`](https://github.com/vbuch/oboapp/commit/ead7ffc68fc1411582a85045c2bf15a96a1ca648).
The extraction uses Git subtree history. OboApp retains the crawlers, snapshots,
daily recording, historical import archive and API implementation.
