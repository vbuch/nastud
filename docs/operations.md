# Operations

Source repository: [vbuch/nastud](https://github.com/vbuch/nastud).
Production URL: [https://nastud.site/](https://nastud.site/).
Publisher: [Pages workflow](https://github.com/vbuch/nastud/actions/workflows/pages.yml).

The intended hosting target is GitHub Pages. Repository extraction alone does
not transfer the live custom domain, secrets or Pages configuration. Complete
and verify the cutover steps below before treating the new repository as the
production publisher.

## Runtime and repository configuration

- Node.js 22.
- pnpm 10.11.0 and the committed lockfile.
- Repository variable `COUNTER_TIMELINE_URL`: `https://api.oboapp.online/v1/sources/toplo-bg/timeline?days=366`.
- Repository secret `COUNTER_API_KEY`: a valid OboApp API key for this consumer.
- Repository variable `PUBLISH_ENABLED`: `true` after production configuration and the domain cutover are ready. Keep it `false` during migration.
- Pages source: GitHub Actions.
- Pages deployment environment: `github-pages`.
- Custom domain: `nastud.site`.
- Enforce HTTPS after GitHub has issued a valid certificate.

Existing GitHub Actions secret values cannot be read back through GitHub. Supply
the new repository's API secret securely before switching the live publisher.
Never put it in source files, issue text, workflow output or published artifacts.

## Publication flow

`.github/workflows/pages.yml` runs on main-branch pushes, manual dispatches and
the schedule at minutes 7 and 37 of every hour. Scheduled Actions can start late;
the source observation time remains the user-visible check time.

The check job installs locked dependencies, runs tests and builds a reviewable
fixture artifact. The production jobs run when `PUBLISH_ENABLED` is `true`.
They fetch both API responses, build the static output and publish `dist/`
through GitHub Pages.
It publishes the HTML, public JSON, sharing images and hosting files together.
Concurrency limits overlapping publications for the same Git reference.

Pull requests run tests and build fixture previews. They do not publish to the
production Pages environment. Use a preview artifact to review a pull request.

Production fetches require both endpoints to succeed and pass validation.
Missing data, invalid responses or build failures leave the previous successful
site in place. GitHub may cache public responses and social platforms may cache
their own sharing previews.

## Routine release

1. Update the relevant specification when intended behavior changes.
2. Run `pnpm test` and a fixture build from the repository root.
3. Check affected browser behavior and sharing output as described in `AGENTS.md`.
4. Open a pull request and wait for its required checks.
5. Merge the tested change to `main`.
6. Follow the Pages workflow to a successful build and deployment.
7. Check `https://nastud.site/`, `timeline.json` and `incidents.json`.
8. Confirm that the displayed count equals the incident count and that the counter and list use the same original observation timestamp.
9. Open the list, change a sort and filter, and check the first result. Check phone layout when the release changes layout.
10. For sharing changes, verify initial-HTML metadata and that the landscape and square image URLs return valid PNGs.

Use a manual dispatch after configuration changes or after an API deployment
becomes ready. A production build can be run locally with the two environment
variables configured:

```sh
node build.mjs --fetch --require-current
```

## Initial repository cutover

1. Extract `counter/` from OboApp using Git subtree history through commit `ead7ffc68fc1411582a85045c2bf15a96a1ca648`.
2. Place the standalone scripts, `src/`, assets and tests at this repository's root. Retain the font license and relevant source license.
3. Configure the standalone workflow, repository variable, secret, Pages source and deployment environment.
4. Keep `PUBLISH_ENABLED` false and verify the fixture artifact and tests from the new repository before transferring the live domain.
5. Disable or remove OboApp's `counter-pages.yml` publisher at cutover so only this repository publishes nastud.site.
6. Transfer the custom-domain assignment from `vbuch/oboapp` to `vbuch/nastud` and verify the new Pages configuration.
7. Preserve the existing valid DNS configuration. Moving between repositories under the same GitHub account does not by itself require changing the existing GitHub Pages address records.
8. Set `PUBLISH_ENABLED` to true, publish from this repository, check the live site and data, and verify HTTPS and sharing URLs.
9. Replace OboApp's consumer documentation with a link to this repository, while keeping its API documentation and provider-owned history records there.

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
