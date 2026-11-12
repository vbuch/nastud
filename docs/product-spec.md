# Product specification

This is the canonical product specification for [nastud.site](https://nastud.site/).
The website helps people see how many Toplofikatsia Sofia incidents are listed,
how that count changes and which current records are oldest or have the largest
deadline extensions.

## Counter and observation time

- Count all listed accidents and repairs, including records with unusable map geometry or a completion estimate that has passed.
- Make “Аварии и ремонти” in the heading open the full incident dialog. Style it as the existing underlined text and keep the observation time beside it.
- Show a prominent count and the source-check time in `Europe/Sofia`.
- Always include the calendar date, including today: “към 00:07 на 10 ноември”. Include the year when needed to distinguish an older observation.
- A verified count of zero displays `0`. With no current observation, display an unavailable state instead of a false zero.
- The count and incident list in each publication use the same incident snapshot's count and `observedAt`.
- Preserve the full observation date and time when data is old or a refresh fails. Omit the generic old-data message below the count. Keep an unavailable-data notice when there is no observation.

## Daily history and comparison

- Display a full-width daily timeline beneath the counter.
- Plot daily observations in calendar order with proportional spacing. Keep missing dates as gaps.
- Include the latest observation for its Sofia calendar day. When a stored daily point shares that date, use the newer observation for the plotted point.
- Let pointer, touch and keyboard interaction select a point and show its date, source-check time and count.
- Compare the current count with the previous Sofia calendar day's closing count. Derive the baseline from the API's daily records.
- Show the comparison directly below the big count. Use “С 2 повече от вчера.” or “С 2 по-малко от вчера.” only when the displayed observation is from today in Sofia and the baseline is yesterday. Use the explicit baseline date for an older observation or another comparison day. Omit the comparison if that day's baseline is unavailable.
- A missing historical date remains unknown. The website does not maintain or backfill its own source history.
- Use the legend labels “Аварии и ремонти” and “Температура”, with the selected day's date and values. Omit the extra chart heading, scale-direction wording and repeated date-range caption. The date axis shows the period.
- Give the graph most of the timeline space. Use a compact readout with the incident count at the left, temperature at the right and date between them. On phones and short landscape screens, center the date above the values and show the count's “бр.” unit with the line swatches. Keep full metric labels accessible. Use modest value sizes, matching the line colors, and only the arrow and amount for daily change. Keep the readout height stable when values are missing.
- Beside the selected incident count, show the change from the previous calendar day as `↑ 2`, `↓ 2` or `→ 0`. Compare against that day's closing count using the plotted observations. Omit the change when the preceding calendar day is missing. Describe the direction and amount in the chart's accessible label.

### Outside temperature

- Overlay Sofia's daily mean outside temperature on the same dates, with a separate right-hand axis in °C. Label the incident count and temperature series clearly, using different colors and a dashed temperature line.
- Use Open-Meteo's ECMWF IFS historical model at Sofia city coordinates `42.6977, 23.3219`. Explain the calculated daily model averages in the footer's weather details.
- Calculate averages from hourly temperatures at two metres above ground, grouped into `Europe/Sofia` calendar days. Require every hour in the local day, including 23-hour and 25-hour days at daylight saving changes.
- Fetch temperature history during publication for up to the latest 366 calendar days of the incident timeline, ending at yesterday in Sofia. Keep today's unfinished daily mean unknown, even if the provider returns populated forecast hours. Leave missing and incomplete days unknown, and break the temperature line at gaps. Never move a temperature onto another date.
- Keep the incident date range and incident gaps unchanged. Selecting a day shows its incident count and temperature, or a clear missing-temperature label. Support the same pointer, touch and keyboard controls for both series.
- Add Open-Meteo and a CC BY 4.0 licence link to the bottom credit alongside OboApp. Selecting Open-Meteo opens a small disclosure about daily averages, the ECMWF IFS model and a provider link. A hover hint points to these details. Support touch and keyboard activation; Escape closes the details and keeps focus on the label.
- A weather request failure leaves the incident chart available. Explain unavailability in the footer details and keep missing values explicit when selecting a chart day. Browser refreshes read only the site's bundled public timeline JSON.
- The overlay supports visual comparison of listed accidents and repairs with temperature. The count includes active listed records, so this view does not establish the number of new incidents or a causal relationship.

## Full incident list

- Keep the compact main view and open the full list from “Аварии и ремонти” in the heading. Keep the heading text stable after data refreshes. Include the Toplo source link in the dialog and the no-JavaScript fallback.
- Use a native dialog with its own scrolling content, a visible close button and a source-check timestamp.
- Include every record from the validated incident snapshot. Show the total and visible count.
- Offer filters for all entries, accidents only and repairs only.
- Offer four sorts: oldest reported start, largest net deadline extension, newest reported start and earliest current estimate. Default to oldest reported start.
- Sort missing comparison values after known values. Retain negative deadline changes as earlier corrections.
- Use stable secondary ordering for records with equal sort values.
- Each record shows its name, affected addresses, accident or repair type, reported age, reported start, current estimate, first recorded estimate and first capture date when available.
- Label missing dates and baselines clearly. Do not manufacture estimates.
- Calculate age in calendar days relative to the snapshot's Sofia date. Display “От посоченото начало: 1 ден” or the plural day count. Use “Началото е в деня на проверката.” for the same calendar day and “Посоченото начало е след датата на проверката.” for a future start. Keep the underlying future age at zero, and omit the age when the start is unknown. Explain the reference date once in the dialog.
- Display source incident dates as source calendar dates. Their displayed clock values and `Z` suffix have unresolved timezone semantics, so the interface does not promise precise elapsed hours.
- Describe a deadline extension as the current estimate minus the first estimate OboApp captured. That first capture can be later than the original announcement.
- Use “Текущият срок е с 1 ден по-ранен от първия запазен срок.” or “по-късен” to identify both the direction and comparison. Use “около” only for rounded fractional days, and “по-малко от 1 ден” for smaller differences. Equal estimates “съвпадат”; do not imply that no intermediate changes happened. Distinguish a missing current completion estimate from a missing first saved estimate.
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
- On phone landscape screens, hide the road, manholes, steam and playful hint to give the chart more room. Keep the counter and chart side by side, and retain the source credits in a small footer. Restore the road in portrait.
- Tapping or clicking a cover releases steam and sends the lid into the air. Cycle playful text sounds such as “ПСССТ!”, “ФШШШШ!” and “БУМ!”.
- The road interaction does not change real counts or records. Keep the removed pause button absent.
- Respect reduced-motion preferences and pause background motion when the page is hidden or keyboard interaction needs a stable target.
- Read the focused manhole's current `:focus-visible` state when animating, so a change between keyboard and pointer input cannot leave the road paused from a cached focus state.
- Keep “с данни от OboApp и Open-Meteo” faint at the bottom right, with links to `https://oboapp.online` and `https://open-meteo.com/`, plus a small CC BY 4.0 licence link. Keep the credit readable on narrow phones without competing with the counter or overlapping the road hint.
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

Temperature checks cover date alignment, daylight saving changes, negative and
zero values, incomplete days, provider failures and the independent °C axis.
