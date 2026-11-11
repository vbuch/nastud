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
