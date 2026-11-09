# Na Stud counter

The standalone page for `nastud.site` shows the current number of accidents and
repairs on Toplo's website, the change from the previous daily closing count,
and an interactive daily timeline. The road animation is independent of the
source counts.

The frontend is plain HTML, CSS and JavaScript. GitHub Pages hosts only the
generated `dist/` directory. The API key is used during the build and stays in
GitHub Actions secrets.

## Data flow

1. The existing Toplo crawler records a complete listing snapshot on each run.
2. `source-daily-counts` records the latest successful observation for a Sofia
   calendar day. The scheduled job runs at 23:00 in `Europe/Sofia`.
3. `GET /v1/sources/toplo-bg/timeline?days=366` returns the current snapshot,
   daily counts and comparison. It uses normal API key authentication.
4. The Pages workflow fetches the API at minutes 7 and 37, then publishes the
   HTML, `timeline.json` and social images together. The page refreshes the JSON
   while open.

The Toplo crawl keeps its existing daytime schedule: every 30 minutes from
07:00 through 22:30 in `Europe/Sofia`. Overnight, the page preserves the last
successful source-check time. The nightly 23:00 job records that day's latest
observation for the daily timeline.

Daily records have no automatic expiry. The API accepts 1 through 366 days per
request. Historical dates without observations remain gaps.

`data/historical-daily-counts.json` contains recovered closing counts from
11 October through 9 November 2026. These 30 records have already been imported
into the production database. The file remains a one-time import archive.
Every production build uses only the API response for the current count and
daily history, then derives the comparison from those daily records. See
`data/README.md` for the source and selection rules.

Each night adds that day's closing count to the database. On the following
day, the API includes it in the timeline and uses it as the comparison
baseline. The next Pages build publishes the updated data automatically.
No JSON file needs editing.

The current source check time is always preserved. Older data shows an explicit
date and a stale-data notice. A missing baseline omits the comparison. A failed
fetch or invalid response fails publication, keeping the previous site live.

## Local development

```sh
pnpm --dir counter --ignore-workspace install --frozen-lockfile
pnpm --dir counter test
node counter/build.mjs --data counter/test/fixtures/timeline.json
pnpm --dir counter dev
```

The fixture is for local testing. To build from the real API, set
`COUNTER_TIMELINE_URL` and `COUNTER_API_KEY`, then run:

```sh
node counter/build.mjs --fetch --require-current
```

The default public URL is `https://nastud.site/`. The build supports
`--site-url <https-url>` and `--out <directory>` for other deployments.

## Deployment

Deploy the new backend, database indexes and Terraform nightly job first.
The production database already contains the recovered history. For a new
database, import it once through the database abstraction:

```sh
cd ingest
pnpm exec tsx source-daily-counts.ts --import ../counter/data/historical-daily-counts.json
```

This validates every imported record before writing. Repeat imports update the
same source/date records. Run it with the production locality and database
configuration loaded from `ingest/.env.local`.

In the `vbuch/oboapp` repository, configure:

- Variable `COUNTER_TIMELINE_URL`: the deployed API's full timeline endpoint,
  for example `https://<api-host>/v1/sources/toplo-bg/timeline?days=366`.
- Secret `COUNTER_API_KEY`: a dedicated valid OboApp API key.
- Settings > Pages > Build and deployment: GitHub Actions.
- Settings > Pages > Custom domain: `nastud.site`.

The Pages custom-domain setting is required for an Actions deployment. The
generated `CNAME` file alone does not configure the repository's domain.
The workflow runs only in `vbuch/oboapp`; pull requests build test artifacts and
do not deploy. Production publishing requires a valid current observation.

For the apex domain, add four A records at `@` with GitHub's addresses:
`185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`.
An optional `www` CNAME points to `vbuch.github.io`. Configure the custom domain
in GitHub before pointing DNS there. Enable Enforce HTTPS after the certificate
is ready. See
[GitHub's custom-domain instructions](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site).

## Sharing

The build places Open Graph and Twitter metadata in the initial HTML and
renders PNG cards at 1200 by 630 and 1200 by 1200. Cards use the bundled,
OFL-licensed Sofia Sans font for consistent Bulgarian glyphs. The source check
time appears on the card.

Share-image URLs use the stable `share.png` path with a version query. Previously
published URLs remain valid after the next build. Social titles stay descriptive
while the image contains the observed count. Social platforms can retain their
own cached previews; public crawler validation requires the domain and HTTPS to
be active.
