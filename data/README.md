# Historical daily counts

`historical-daily-counts.json` contains recovered closing counts for
`toplo-bg` in `bg.sofia`. It is an import array with `sourceType`, `locality`,
`date`, `count`, and `observedAt` on every record.

## Coverage

Recovered on 10 November 2026 from 1,049 retained crawler completion summaries:

- First daily record: 11 October 2026.
- Last daily record: 9 November 2026.
- Daily records: 30.
- Missing dates inside this period: none.

The source Cloud Logging `_Default` bucket has a 30-day retention period.
This coverage describes the available logs. Earlier crawler activity can have
expired from retention. Missing historical dates must remain unknown rather
than being filled with zero.

## Record selection

Each date is a calendar day in `Europe/Sofia`, including its daylight-saving
offset. The count is taken from the last successful `Crawl complete` summary
on that date. Runs with `failed: 0` take priority; all-failed runs are excluded.
Every recovered day had a summary with `failed: 0`, so no fallback to a
partially failed run was needed.

`observedAt` is the original completion-log time in UTC, at millisecond
precision. It remains separate from the Sofia calendar date. It records when
the crawler reported the count, rather than the time of this recovery.

## Provenance

These historical totals come from the previous crawler's parsed incident
listing. That parser validated geometry before reporting its total. The new
snapshot collector counts the complete verified source listing independently
of map geometry. Historical HTML was not retained for a separate recheck.

## Import and ongoing updates

These 30 records have already been imported into the production database.
The file remains an archive for a one-time import into a new database.
The counter build reads the API response and never loads this file.

Future nightly records use the latest successful source snapshot for each
completed Sofia day. The API returns those stored records alongside the
imported history. The scheduled Pages build publishes the API data, so future
dates require no changes to this archive.
