# OboApp API expectations

The website consumes OboApp's public API. The provider's canonical contract is
[`docs/features/public-api.md`](https://github.com/vbuch/oboapp/blob/main/docs/features/public-api.md).
The [OpenAPI document](https://api.oboapp.online/v1/openapi) describes the live
provider interface. This document records the website's expectations and the
meaning of the values it displays.

## Ownership

OboApp owns source crawling, listing completeness checks, snapshots, source
history, daily counts, historical imports, authentication and API operation.
Na Stud owns presentation, consumer-side validation, its static build and
publication. It uses the public API and has no direct database access.

## Requests

Configure `COUNTER_TIMELINE_URL` as:

```text
https://api.oboapp.online/v1/sources/toplo-bg/timeline?days=366
```

The build sends `COUNTER_API_KEY` in the `X-Api-Key` header. It derives the
incident URL on the same origin by replacing the terminal `/timeline` path
with `/incidents` and removing the query:

```text
GET /v1/sources/toplo-bg/timeline?days=366
GET /v1/sources/toplo-bg/incidents
GET /v1/sources/toplo-bg/incidents?date=YYYY-MM-DD
```

The timeline and current incident requests require a successful response.
Production requests use HTTPS, do not follow redirects and have a 15-second
timeout. URLs must not contain credentials. Local HTTP endpoints on `localhost`
or `127.0.0.1` are supported for development. Each API response has the existing
1 MB size limit. The documented dated-history gap is handled separately below.

Keep the key in the build environment. The browser reads the site's public
`timeline.json`, `incidents.json` and `incident-daily.json` files without an API
key.

## Timeline

The response identifies `sourceType: "toplo-bg"` and `locality: "bg.sofia"` and
contains a nullable current observation, daily observations and a nullable
comparison. Each count is a nonnegative integer. Observation timestamps must
be valid ISO timestamps with an explicit timezone.

Daily dates are Sofia calendar dates in `YYYY-MM-DD` form. Missing days remain
gaps. Each point preserves the source's `observedAt`; it may precede the nightly
recording time. The provider supports a maximum 366-day query window.

The build derives the comparison from the daily record for the calendar day
before the current observation's Sofia date. It does not load a historical
backfill file. It uses the complete incident response's count and observation
time as the current observation, keeping the published list and counter aligned.

## Incident listings

The incident response supplies:

- `sourceType`, `locality` and `sourceUrl`.
- `observedAt`: UTC time of the successful complete source check.
- `count`: the number of all listed accidents and repairs.
- `incidents`: a complete array matching that count.

Each incident supplies:

| Field | Consumer meaning |
| --- | --- |
| `id` | Stable Toplo `ContentItemId`, used for record identity |
| `accidentId` | Visible listing identity, which can change between captures |
| `name`, `addresses` | Source text rendered safely as text |
| `type` | `accident` or `repair` |
| `status` | The source's numeric status |
| `reportedStart` | Reported source start, or null |
| `estimatedEnd` | Current estimated completion, or null |
| `createdAt` | Source creation date, or null |
| `firstObservedAt` | First observation OboApp saved, or null |
| `firstReportedStart` | Reported start in that first saved record, or null |
| `firstEstimatedEnd` | Estimated completion in that first saved record, or null |

The build rejects a count mismatch, duplicate within-capture identities,
unexpected types or invalid dates. A verified empty response is
`count: 0` with `incidents: []`.

First captured estimates may postdate the original announcement. Missing or
invalid estimates remain unknown. Historical normalized records that replaced
a missing estimate with the start time are exposed by the provider with a null
`firstEstimatedEnd`.

The source's incident timestamps can contain a `Z` suffix while its website
displays the same clock value directly. Until that convention is verified,
display source calendar dates and approximate day changes. Use the provider's
observation timestamp for the actual source-check time in `Europe/Sofia`.

## Interpretation and failures

Listing presence means that Toplo still publishes the record. It does not
establish uninterrupted loss of service. Reported starts and affected addresses
can change under one stable ID. An estimated completion time is not a resolution
confirmation and does not remove a listed record.

The extension shown by Na Stud is the current estimate minus the first recorded
estimate. Older intermediate revisions and the number of postponements may be
unknown. Do not infer either from count history.

An incident response without a complete detailed capture can return `503`,
including when the provider only has older count-only snapshots. Authentication,
rate-limit, unsupported-source and storage errors also stop publication. A
failed publication preserves the prior site. Browser failures preserve the last
valid local snapshot and its original timestamp.

## Incident position and deadline observations

The API provides the latest complete incident listing, first saved incident
fields, dated complete listing samples and aggregate daily counts. Aggregate
counts do not identify which records were present or where an individual record
appeared in earlier lists.

Na Stud calculates an incident's canonical position across all current accidents
and repairs. It sorts by `reportedStart`, oldest first, with unknown starts last.
Equal starts use the Bulgarian name ordering and then the stable `id` ordering
from `sortIncidents`. The total is the complete listing count. This position is
independent of the visitor's selected sort and type filter. It describes the
website's list order; the source supplies no repair priority.

The incident view uses actual first and current observation timestamps. The
first point pairs `firstObservedAt` with `firstEstimatedEnd`; the current point
pairs the listing's `observedAt` with `estimatedEnd`. A missing first observation
produces no first point. When both timestamps identify the same instant, use the
current point. Exclude a first observation later than the current capture.

For each known estimate, days remaining are the signed calendar-day difference
between its source deadline date and the observation's `Europe/Sofia` date.
Positive values mean days remaining, zero means the same calendar day and
negative values mean the deadline has passed. This calculation preserves source
calendar dates and does not depend on 23-hour or 25-hour daylight-saving days.
A missing estimate stays unknown. The first and current points do not establish
when a deadline changed between them, so the view keeps intermediate revisions
unknown. Historical positions use complete dated listings. The first saved
incident record alone cannot supply the other records needed for its position.

### Daily detailed captures

The optional `date` query selects the last successful complete capture from that
`Europe/Sofia` calendar day, including days with 23 or 25 hours. It accepts one
real date from `0001-01-01` through today's Sofia date. Invalid, repeated or future
dates return `400`. The response has the same fields as the current listing and
preserves the selected capture's actual `observedAt`, count and recorded incident
fields. First-record baseline fields remain separate from that capture.

Dated arrays are sorted by oldest `reportedStart` across both incident types,
missing starts last, then Bulgarian name using `Intl.Collator("bg")` with default
options, then stable `id` in binary lexicographic order. Na Stud applies these
same rules for current and daily positions. Unfiltered requests retain the
provider's recorded order.

The initial publication window is 14 consecutive Sofia calendar days ending on
the current listing's observation date. The build reuses that current listing
for the final day and requests the preceding 13 dates once each for all incident
pages. A stale current observation keeps its own date as the window's end. This
adds at most 13 requests to the timeline and current-listing reads, for at most
15 OboApp requests per publication. No request is retried automatically.

A dated `503` with exactly
`{"error":"No complete incident listing is available for the requested date"}`
means missing detailed history or a legacy count-only capture. Publish that day
with a null snapshot. Other unsuccessful responses, transport errors and invalid
responses stop publication. A verified empty capture remains a successful
`count: 0` with `incidents: []`; an incident absent from it has no position.

The build validates source and locality, complete counts, unique incident IDs,
valid source timestamps and the match between each capture's Sofia date and its
requested date. Capture identity is source, locality and original `observedAt`.
Daily dates are consecutive, ordered and unique within the declared window.
Unknown estimates stay null even when an earlier or later estimate is known.

The public `incident-daily.json` envelope contains `sourceType`, `locality`,
`startDate`, `endDate` and a `daily` array of `{ date, snapshot }` entries. A
snapshot contains the validated complete incident response or is null for an
unavailable day. Incident pages embed this same public data in their initial
HTML and refresh from the same-origin file. Credentials remain in the build
environment.

Each incident's daily table begins with the first available capture in the
bounded window that contains its stable ID. Earlier days remain in the public
history file. Retain that first appearance, then show a row when listing state,
position, complete-list total or the announced deadline's source calendar date
changes. Observation timestamps and the natural days-remaining countdown do not
create additional rows. Summarize repeated unchanged unavailable or absent days
as date ranges, keeping those states distinct. An earlier `firstObservedAt`
baseline adds no leading empty rows. The labelled coverage period ends on the
current observation date even when the final change row is earlier. The public
history file and embedded snapshots retain every daily sample in the window.

The table calculates one-based position and total from each complete listing.
Its signed days remaining use the recorded deadline and that
capture's Sofia date. The current comparison uses the complete daily samples,
including samples omitted from the change table. It uses only the preceding
calendar day, with both dates stated explicitly. If both captures contain the
stable ID,
position change is current minus previous position. Deadline change is the
current estimate minus the preceding day's estimate, using the existing source
date rules and only when both estimates are known. It stays separate from the
net change against the first saved estimate.

The deployed Sofia instance's earliest retained detailed capture is
`2026-11-11T15:55:42.543Z`, verified by OboApp on 13 November 2026. Earlier first
baselines and imported aggregate counts do not extend detailed coverage.
Detailed captures remain with the provider until explicitly deleted. Daily
samples can omit changes and short-lived records between selected captures.
The website publishes a rolling 14-day window and generates pages for current
records. Full capture charts and retained pages for removed records need the
provider's separate full-history capability.

### Provider requirements for full incident history

Full position history, intraday deadline revisions and retained pages for removed
records need a future OboApp API capability beyond daily samples. The provider
would need to expose:

- Actual `observedAt` timestamps for retained complete listing captures, with
  source, locality and the complete count for each capture.
- Each capture's stable incident identities and the recorded `reportedStart`,
  name and `estimatedEnd`, preserving null values. These fields allow the same
  canonical ordering and tie rules to be applied to every capture. Alternatively,
  the provider could return positions calculated with those exact rules together
  with each capture's count.
- A clear distinction between a record absent from a verified complete capture
  and unavailable capture data. Capture gaps remain unknown. Listing removal
  alone does not confirm restoration of service.
- A bounded history query with a documented period, ordering and completeness
  policy. Any pagination must allow the consumer to detect incomplete results.
  Data must remain scoped to the source and locality and use the normal API key
  protection during publication.

Deadline points must pair the estimate recorded at each check with that check's
original timestamp. A first saved baseline can be shown separately when it
predates retained complete captures. It cannot supply earlier positions or
missing revisions. OboApp owns capture retention and this API extension; Na Stud
would validate and publish the supplied public history.

## Published temperature data

Na Stud adds optional weather data to its own published timeline. This field is
independent of the OboApp API contract. The build obtains hourly Celsius
temperatures from Open-Meteo's ECMWF IFS archive and calculates complete Sofia
calendar-day means. OboApp continues to supply all incident observations.

`weather` is null when unavailable. Otherwise it contains `provider: "open-meteo"`,
`model: "ecmwf_ifs"`, `latitude: 42.6977`, `longitude: 23.3219`,
`timezone: "Europe/Sofia"` and a sorted `daily` array. Each entry has a valid
calendar `date` and a numeric `meanC`, or null for an incomplete day. Zero and
negative temperatures are valid. Duplicate dates, invalid metadata and invalid
temperatures are rejected. The browser and build use the same validation.

Daily means cover completed Sofia days only. The provider can supply forecast
hours for today, so requests stop at yesterday and require every local-day hour.
Never show a forecast-filled or partial mean for the unfinished current day.
The source and build failure behavior are described in
[operations](operations.md#temperature-history).
