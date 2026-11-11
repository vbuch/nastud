# Product specification

This is the canonical product specification for [nastud.site](https://nastud.site/).
The website helps people see how many Toplofikatsia Sofia incidents are listed,
how that count changes and which current records are oldest or have the largest
deadline extensions.

## Counter and observation time

- Count all listed accidents and repairs, including records with unusable map geometry or a completion estimate that has passed.
- Link the heading “Аварии и ремонти” to Toplo's [source listing](https://toplo.bg/accidents-and-maintenance).
- Show a prominent count and the source-check time in `Europe/Sofia`.
- Always include the calendar date, including today: “към 00:07 на 10 ноември”. Include the year when needed to distinguish an older observation.
- A verified count of zero displays `0`. With no current observation, display an unavailable state instead of a false zero.
- The count and incident list in each publication use the same incident snapshot's count and `observedAt`.
- Preserve observation time when data is old. Show a stale-data notice after 90 minutes and after a failed refresh that leaves older data visible.

## Daily history and comparison

- Display a full-width daily timeline beneath the counter.
- Plot daily observations in calendar order with proportional spacing. Keep missing dates as gaps.
- Include the latest observation for its Sofia calendar day. When a stored daily point shares that date, use the newer observation for the plotted point.
- Let pointer, touch and keyboard interaction select a point and show its date, source-check time and count.
- Compare the current count with the previous Sofia calendar day's closing count. Derive the baseline from the API's daily records.
- Omit the comparison if that day's baseline is unavailable. Use an explicit reference date when “вчера” would describe the wrong day.
- A missing historical date remains unknown. The website does not maintain or backfill its own source history.

## Full incident list

- Keep the compact main view and open the full list with “Виж всички аварии и ремонти”.
- Use a native dialog with its own scrolling content, a visible close button and a source-check timestamp.
- Include every record from the validated incident snapshot. Show the total and visible count.
- Offer filters for all entries, accidents only and repairs only.
- Offer four sorts: oldest reported start, largest net deadline extension, newest reported start and earliest current estimate. Default to oldest reported start.
- Sort missing comparison values after known values. Retain negative deadline changes as earlier corrections.
- Use stable secondary ordering for records with equal sort values.
- Each record shows its name, affected addresses, accident or repair type, reported age, reported start, current estimate, first recorded estimate and first capture date when available.
- Label missing dates and baselines clearly. Do not manufacture estimates.
- Calculate age in calendar days relative to the snapshot's Sofia date. A future reported start has age zero. Label age as “по обявеното начало”.
- Display source incident dates as source calendar dates. Their displayed clock values and `Z` suffix have unresolved timezone semantics, so the interface does not promise precise elapsed hours.
- Describe a deadline extension as the current estimate minus the first estimate OboApp captured. That first capture can be later than the original announcement.
- Flag records whose reported start changed from the first saved start. A stable website record does not establish uninterrupted loss of service.
- Flag a current estimate whose source calendar date has passed while its record remains listed.
- Keep records with passed estimates in the list until the provider's current listing removes them.
- Escape and the close button close the dialog. Return keyboard focus to the opener. Offer a source-list link when JavaScript is unavailable.

## Data and failure behavior

- OboApp is the data provider. This website fetches its API during publication and serves the resulting public JSON from its own origin.
- Read both the timeline and incident endpoints. Reject incomplete, malformed or mismatched responses.
- Require the declared incident count to match the complete list and require unique identities within a capture.
- Use `id`, derived from Toplo's `ContentItemId`, for stable record identity. `accidentId` is a within-capture listing identity and can change between reads.
- Keep unknown estimates and first observations as null values. Never convert missing data into a false zero.
- A failed API read or invalid build input stops publication, preserving the previous successful release.
- Browser refresh failures preserve the last valid records and their timestamp. Do not replace a newer incident observation with an older one.
- Refresh the counter data while the page is visible. Refresh incident data when the list opens and while it remains open.
- Treat source text as text. Upstream names or addresses cannot inject markup or executable code.

## Visual design and interaction

- Use a dark charcoal background, deep red details and warm ivory text. Keep the existing CSS color tokens consistent across the site and sharing images.
- Use the bundled Sofia Sans font with system fallbacks. Preserve its OFL license.
- The main counter, graph and road fit in one viewport. The incident dialog supplies the longer scrollable view.
- Support narrow 320px phones, common phone sizes, tablets, desktop widths and short landscape screens without clipping controls or text.
- Give the bottom part of the page a tilted road with depth, moving circular manhole covers and varied positions.
- Tapping or clicking a cover releases steam and sends the lid into the air. Cycle playful text sounds such as “ПСССТ!”, “ФШШШШ!” and “БУМ!”.
- The road interaction does not change real counts or records. Keep the removed pause button absent.
- Respect reduced-motion preferences and pause background motion when the page is hidden or keyboard interaction needs a stable target.
- Keep “с данни от OboApp” faint at the bottom right, with a link to `https://oboapp.online`. It should remain available to interested visitors without competing with the counter.
- Keep Bulgarian text neutral or use informal ти when addressing the visitor.

## Social sharing and public hosting

- Use `https://nastud.site/` as the production canonical URL and serve it over HTTPS.
- Put meaningful title, description, canonical, Open Graph and Twitter metadata in the initial HTML so social crawlers can read it without running JavaScript.
- Generate real PNG sharing images at 1200 by 630 and 1200 by 1200 using the bundled font.
- Include the observed count and original source-check time in sharing output.
- Keep `share.png` as a stable path. Version its URL with a content hash so new previews can update while previously published links remain usable.
- Generate the static hosting files, sitemap and robots file as part of the same publication.
- Keep the counter, list, JSON and sharing images in one coherent release.

## Acceptance checks

Automated tests cover observation dates, real zero values, missing baselines,
stale data, input validation, list completeness, sorting, missing and earlier
estimates, source-date handling, safe bootstrap data and sharing image output.

Browser review covers the main view, graph interaction, full-list opening,
sorting, filtering, scrolling, close and focus behavior at desktop and phone
widths. Release review verifies that the live list and counter share the same
count and observation timestamp.
