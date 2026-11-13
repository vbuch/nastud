# Operations

Source repository: [vbuch/nastud](https://github.com/vbuch/nastud).
Production URL: [https://nastud.site/](https://nastud.site/).
Publisher: [Pages workflow](https://github.com/vbuch/nastud/actions/workflows/pages.yml).

GitHub Pages serves production from this repository. The move from
`vbuch/oboapp` completed on 11 November 2026. The domain, publishing schedule,
API secret and Pages configuration belong to `vbuch/nastud`. OboApp supplies
the API and owns the source data.

## Runtime and repository configuration

- Node.js 22.
- pnpm 10.11.0 and the committed lockfile.
- Repository variable `COUNTER_TIMELINE_URL`: `https://api.oboapp.online/v1/sources/toplo-bg/timeline?days=366`.
- Repository secret `COUNTER_API_KEY`: a valid OboApp API key for this consumer.
- Repository variable `PUBLISH_ENABLED`: `true` to allow production publication. Set it to `false` to pause publication.
- Pages source: GitHub Actions.
- Pages deployment environment: `github-pages`.
- Custom domain: `nastud.site`.
- Enforce HTTPS after GitHub has issued a valid certificate.

Existing GitHub Actions secret values cannot be read back through GitHub. Supply
or replace the API secret securely when configuring current-data builds.
Never put it in source files, issue text, workflow output or published artifacts.
Fixture development and checks need no API key or OboApp checkout. Follow the
[README development steps](../README.md#development) in a fresh checkout or worktree.

## Publication flow

`.github/workflows/pages.yml` runs on main-branch pushes, manual dispatches and
the schedule at minutes 7 and 37 of every hour. Scheduled Actions can start late;
the source observation time remains the user-visible check time.

Production publication requires the `main` branch, including manual dispatches.
Dispatches on other branches run the fixture checks and save a preview artifact.

The check job installs locked dependencies, runs tests and builds a reviewable
fixture artifact. The production jobs run when `PUBLISH_ENABLED` is `true`.
They fetch both API responses, build the static output and publish `dist/`
through GitHub Pages.
It publishes the HTML, public JSON, sharing images and hosting files together.
Concurrency limits overlapping publications for the same Git reference.

Current-data builds also request Sofia temperature history from Open-Meteo's
archive API. This request uses no API key. Weather failure publishes the valid
incident data with a temperature-unavailable notice. OboApp endpoint failures
continue to stop publication.

Pull requests run tests and build fixture previews. They do not publish to the
production Pages environment. Use a preview artifact to review a pull request.

Production fetches require both OboApp endpoints to succeed and pass validation.
Missing incident data, invalid incident responses or build failures leave the
previous successful site in place. GitHub may cache public responses and social
platforms may cache their own sharing previews.

## Temperature history

The weather source is [Open-Meteo's Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api),
using ECMWF IFS at `42.6977, 23.3219`. The model covers history from 2017 and
updates every six hours. Each build requests at most the latest 366
incident-calendar days, ending no later than yesterday in Sofia. The provider
can return forecast-filled hours for today, so exclude today's unfinished mean
even when every hourly slot has a numeric value.

The build requests hourly Celsius values in UTC and calculates daily means in
`Europe/Sofia`. A complete local day requires all 23, 24 or 25 hours. Missing
hours or null values produce an unknown daily mean. The public `weather` field
inside `timeline.json` records the provider, model, coordinates, timezone and
daily `{ date, meanC }` values. It is also present in the initial HTML bootstrap.
The browser reads this same-origin file with the incident timeline.

`node build.mjs --fetch --require-current` fetches weather automatically after
validating the incident data. Failed, malformed or timed-out weather responses
produce `weather: null` and a build warning. The incident snapshot and its source
observation time remain intact. A supplied weather fixture must pass validation.

The standard fixture timeline includes sample temperature values and needs no
network. Use `--weather test/fixtures/weather.json` to supply a separate weather
fixture when building another timeline. These samples are for development.

Keep Open-Meteo beside OboApp in the bottom credit, with the
[CC BY 4.0 licence link](https://creativecommons.org/licenses/by/4.0/).
Keep the daily-average explanation and model source in the Open-Meteo footer
details, accessible by pointer, touch and keyboard. See the provider's
[attribution requirements](https://open-meteo.com/en/licence).
The [free API terms](https://open-meteo.com/en/terms) permit personal,
noncommercial sites without advertising and limit usage to fewer than 10,000
calls per day. Recheck the terms before changing the site's business model.

After publication, inspect the `weather` metadata and date range in
`timeline.json`. Select yesterday or an older chart day to check the °C value,
then today's incident point to check the missing-temperature label. Confirm that a weather failure
leaves the counter and incident list usable.

## Heating season milestone

The chart marks 29 October 2026, when Toplofikatsia Sofia began the phased
heating rollout for the 2026/2027 season. The [source announcement](https://toplo.bg/heating_season2627)
was published on 28 October 2026. It schedules schools and kindergartens first,
followed by residential and administrative buildings. Keep the marker on the
event date rather than the announcement's publication date.

This milestone is maintained in the website source. For a correction or another
season, verify the provider's announcement, record its link and distinguish the
announced event date from the publication date. Update the product specification
and relevant regression checks in the same change, then rebuild the site.

The displayed period starts at the earlier of 29 October 2026 and one calendar
month before today's date in `Europe/Sofia`. Clamp the day to the last day of
the previous month when needed. The right edge follows the latest observation.
Earlier supplied observations remain in the public data and can provide the
preceding calendar day's count for a comparison at the left edge. Missing dates
in the displayed period stay blank. The website does not backfill source history.

Check timelines with observations before and after the start of the displayed
period, including one whose first observation is after 29 October 2026. Confirm
the exact left-edge date, visible milestone, readable Bulgarian label and source
link. Check the month-end calculation and Sofia's calendar-day boundary. A missing
incident observation on the milestone date must remain a gap. Verify a daily
comparison against an available preceding day outside the displayed period.
Verify the source link with a keyboard and inspect the annotation at desktop
width, 320px phone width and phone landscape.

## Routine release

1. Update the relevant specification when intended behavior changes.
2. Run `pnpm test` and a fixture build from the repository root.
3. Check affected browser behavior and sharing output as described in `AGENTS.md`.
4. Open a pull request and wait for its required checks.
5. Merge the tested change to `main`.
6. Follow the Pages workflow to a successful build and deployment.
7. Check `https://nastud.site/`, `timeline.json` and `incidents.json`.
8. Confirm that the displayed count equals the incident count and that the counter and list use the same original observation timestamp.
9. Open the list from the “Аварии и ремонти” heading, change a sort and filter, and check the first result. Close with Escape and verify that focus returns to the heading. Check phone layout when the release changes layout.
10. For sharing changes, verify initial-HTML metadata and that the landscape and square image URLs return valid PNGs.

For incident wording changes, check a one-day age, an older record, a future
start and a record without a start date. Day counts refer to the source-check
date. Check earlier, later, equal and missing completion estimates; each
comparison must name the first saved estimate and distinguish which estimate
is missing.

For incident pages, open a record from the numbered list and use its browser URL.
Check that list numbering follows the selected sort and filter while the detail
position uses all current records ordered by oldest reported start. Refresh the
list with a focused record link and confirm that focus stays on its action.
Check the detail page at desktop width, 320px phone width and phone landscape.
Check that the address and current deadline lead the page, the position is
secondary, and no dedicated copy-link control is shown. Compare unknown and
passed estimates and a missing first capture. The first and latest checks use
readable cards with distinct check dates, deadlines and plain days-remaining
labels. Open “Още подробности” with a keyboard and check the extra dates and
changed-start warning. Intermediate deadline changes
and position history require a future provider history response; the current
build must not infer them from aggregate counts.

Each publication generates `incident/{encoded-id}/index.html`, `share.png` and
`share-square.png` for every current incident. The path uses URL-safe base64 of
the stable `id`, preserving the link when `accidentId` changes. Inspect initial
HTML metadata, the incident canonical URL, the source observation time and both
image sizes. Hosting under a path prefix must preserve asset and JSON reads.
The bundled font and its licence remain at the site root.

The generated `404.html` lets old incident links check the current listing after
their static page leaves a later publication. Its base URL uses the configured
site path prefix. The local development server serves the same fallback with
HTTP 404. Verify an old incident path and an ordinary unknown path. A record
absent from a newer complete capture must show no current position and must not
claim confirmed resolution. A network failure must retain the last valid
snapshot and its source-check time.

For graph or footer changes, check the simple series labels and select a day
with the arrow keys. Confirm that the compact values sit at the graph's sides
and leave most of the section for the plot. At narrow widths, check the centered
date, count unit and temperature unit. Values must not shift the graph when a daily
comparison or temperature is missing. Verify the selected count's change arrow and amount against
the preceding calendar day's count; a gap must omit the change. The chart has no
visible “от вчера” caption. The main comparison below the big count uses
“от вчера” only for a current-day Sofia observation and yesterday's baseline.
Older observations name the baseline date. Preserve the full source timestamp
and omit the generic old-data message for a valid observation.
Open the Open-Meteo details using pointer and keyboard,
then close with Escape. Check the details at 320px and in phone landscape.
In phone landscape, confirm that the road and its controls are hidden, the
chart uses the freed height and the source credits remain available. Rotate
back to portrait and confirm that the road returns.

For road changes, confirm that the covers drift while the page is visible and
release steam when activated. Keyboard focus on a cover pauses movement for a
stable target. Pointer input, leaving the cover, and returning to a visible
page must let movement resume. A system reduced-motion preference intentionally
keeps the road still. On macOS, check the accessibility motion preference when
investigating a still road; a Windows browser review cannot verify a reported
MacBook-specific failure.

Use a manual dispatch after configuration changes or after an API deployment
becomes ready. A production build can be run locally with the two environment
variables configured:

```sh
node build.mjs --fetch --require-current
```

## Initial repository cutover

The following procedure records the verified migration. The previous Pages
site and consumer-only Actions configuration have been removed from OboApp.

1. Extract `counter/` from OboApp using Git subtree history through commit `ead7ffc68fc1411582a85045c2bf15a96a1ca648`.
2. Place the standalone scripts, `src/`, assets and tests at this repository's root. Retain the font license and relevant source license.
3. Configure the standalone workflow, repository variable, secret, Pages source and deployment environment.
4. Keep `PUBLISH_ENABLED` false and verify the fixture artifact and tests from the new repository before transferring the live domain.
5. Configure the authorized API secret, set `PUBLISH_ENABLED` to true and publish a real-data build at `https://vbuch.github.io/nastud/` while this repository's custom domain remains unset. Confirm both API reads, the deployed list and matching observation timestamps before changing the current live site.
6. Disable OboApp's `counter-pages.yml` publisher and wait for any active publication to finish.
7. Clear the old custom-domain assignment, assign `nastud.site` to `vbuch/nastud` and verify the new Pages configuration and HTTPS. The new repository already has a successful production deployment at this point.
8. Preserve the existing valid DNS configuration. Moving between repositories under the same GitHub account does not by itself require changing the existing GitHub Pages address records. Verify the live counter, list, JSON and sharing URLs at the custom domain.
9. Merge the OboApp extraction cleanup, retain its provider-owned history archive and API documentation, and remove the retired Pages site and consumer-only Actions configuration.

GitHub's repository custom-domain setting is required. A generated `CNAME` file
alone does not transfer that setting. Follow
[GitHub's domain documentation](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)
for DNS or certificate changes.

## Recovery and rollback

If a workflow fails, inspect its first failing step and preserve the last
successful release. Check API authentication, endpoint availability and response
validation before changing the frontend. A provider rollout can temporarily
return `503` until the provider has a complete detailed capture.

If fresh JSON is published but the browser shows an older page, compare its
observation timestamp with the published JSON and reload after the deployment
finishes. Preserve the original capture time when reporting older data.

For a faulty code release, revert the focused change through a pull request,
run the normal checks and republish. Re-running a workflow uses the code for
that workflow run and fetches current API data. It does not restore an exact old
data snapshot. Use a retained known-good build artifact when an exact static
artifact restoration is required, and preserve its recorded observation time.

If the initial hosting cutover fails, restore the previous domain assignment
and publisher only after confirming the new publisher is disabled. Keep one
active production publisher throughout recovery.

## Provider boundary

OboApp operates crawling, snapshot persistence, daily recording, source-history
imports and the public API. The historical count import archive remains in
OboApp under `ingest/data/source-daily-counts/`. Escalate provider data or API
problems to that repository. Na Stud does not need Firebase, GCP or database
credentials.
