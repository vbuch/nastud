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
```

Both requests require a successful response. Production requests use HTTPS,
do not follow redirects and have a 15-second timeout. URLs must not contain
credentials. Local HTTP endpoints on `localhost` or `127.0.0.1` are supported
for development. Responses larger than the build's expected size are rejected.

Keep the key in the build environment. The browser reads the site's public
`timeline.json` and `incidents.json` files without an API key.

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

## Current incident listing

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

The current API provides the latest complete incident listing, the first saved
incident fields and aggregate daily counts. It has no public per-incident
history endpoint. Aggregate counts do not identify which records were present
or where an individual record appeared in earlier lists.

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
unknown. A historical position cannot be derived from the first incident record
alone because the other records in that capture are unavailable.

### Provider requirements for full incident history

Full position history and a deadline countdown chart need a future OboApp API
capability. No additional endpoint is assumed by the current build. The provider
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
