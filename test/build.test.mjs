import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSite, fetchIncidents, fetchTimeline, getIncidentsUrl } from "../build.mjs";
import { normalizeTimeline, presentation, serializeData } from "../data.mjs";

const fixture = JSON.parse(await readFile(new URL("./fixtures/timeline.json", import.meta.url), "utf8"));
const incidents = JSON.parse(await readFile(new URL("./fixtures/incidents.json", import.meta.url), "utf8"));

test("shows yesterday's change, retaining explicit dates when the data is old", () => {
  const timeline = normalizeTimeline(fixture);
  assert.equal(presentation(timeline, new Date("2026-11-09T20:40:00Z")).comparison, "С 4 по-малко спрямо вчера.");
  const stale = presentation(timeline, new Date("2026-11-10T10:00:00Z"));
  assert.match(stale.observedLabel, /9 ноември/);
  assert.match(stale.comparison, /8 ноември/);
});

test("handles a real zero using the API's daily baseline", () => {
  const timeline = normalizeTimeline({ ...fixture, current: { ...fixture.current, count: 0 } });
  assert.equal(timeline.comparison.count, 103);
  assert.equal(timeline.comparison.change, -103);
  assert.equal(presentation(timeline).count, "0");
});

test("omits a comparison when yesterday is missing", () => {
  assert.equal(normalizeTimeline({ ...fixture, daily: [] }).comparison, null);
});

test("uses the new nightly closing count after the next Sofia day begins", () => {
  const daily = [
    ...fixture.daily,
    { date: "2026-11-10", count: 98, observedAt: "2026-11-10T20:30:00.000Z" },
  ];
  const timeline = normalizeTimeline({
    ...fixture,
    current: { count: 95, observedAt: "2026-11-11T05:00:00.000Z" },
    daily,
  });

  assert.deepEqual(timeline.daily, daily);
  assert.deepEqual(timeline.comparison, {
    date: "2026-11-10",
    count: 98,
    observedAt: "2026-11-10T20:30:00.000Z",
    change: -3,
  });
  assert.equal(presentation(timeline, new Date("2026-11-11T05:10:00Z")).comparison, "С 3 по-малко спрямо вчера.");
});

test("rejects malformed or mismatched source data", () => {
  assert.throws(() => normalizeTimeline({ ...fixture, current: { count: -1, observedAt: fixture.current.observedAt } }));
  assert.throws(() => normalizeTimeline({ ...fixture, daily: [{ date: "2026-11-08", count: 103, observedAt: "2026-11-09T12:00:00Z" }] }));
  assert.throws(() => normalizeTimeline({ ...fixture, sourceType: "another-source" }));
});

test("rejects observation times without an explicit timezone", () => {
  for (const observedAt of ["2026-11-09T20:30:00", "2026-11-09"]) {
    assert.throws(() => normalizeTimeline({
      ...fixture,
      current: { count: 99, observedAt },
    }), /observation time is invalid/);
  }
});

test("normalizes explicit timezone offsets before comparing calendar dates", () => {
  const timeline = normalizeTimeline({
    ...fixture,
    current: { count: 99, observedAt: "2026-11-09T22:30:00+02:00" },
  });

  assert.equal(timeline.current.observedAt, "2026-11-09T20:30:00.000Z");
  assert.equal(timeline.comparison.change, -4);
});

test("escapes JSON bootstrap values that could close its script element", () => {
  assert.equal(serializeData({ value: "</script>" }).includes("<"), false);
});

test("builds crawler-visible metadata and real landscape and square PNG cards", async () => {
  const outDirectory = await mkdtemp(join(tmpdir(), "nastud-build-"));
  try {
    const { html, imageName } = await buildSite({ data: fixture, outDirectory, now: new Date("2026-11-09T20:40:00Z") });
    assert.match(html, /99 аварии/);
    assert.match(html, /property="og:image"/);
    assert.match(html, new RegExp("https://nastud\\.site/" + imageName.replace(".", "\\.")));
    assert.match(html, /name="twitter:card" content="summary_large_image"/);
    assert.match(html, /rel="canonical"/);
    assert.equal(html.includes("{{"), false);
    assert.equal((await readFile(join(outDirectory, "CNAME"), "utf8")).trim(), "nastud.site");
    for (const [name, expectedHeight] of [[imageName, 630], ["share-square.png", 1200]]) {
      const png = await readFile(join(outDirectory, name));
      assert.equal(png.subarray(1, 4).toString(), "PNG");
      assert.equal(png.readUInt32BE(16), 1200);
      assert.equal(png.readUInt32BE(20), expectedHeight);
    }
    const published = JSON.parse(await readFile(join(outDirectory, "timeline.json"), "utf8"));
    assert.equal(published.current.count, 99);
    assert.equal(published.comparison.change, -4);
  } finally {
    await rm(outDirectory, { recursive: true, force: true });
  }
});

test("publishes exactly the supplied API dates and counts without a historical-file input", async () => {
  const outDirectory = await mkdtemp(join(tmpdir(), "nastud-api-build-"));
  const daily = [
    { date: "2026-11-08", count: 104, observedAt: "2026-11-08T20:30:00.000Z" },
    { date: "2026-11-10", count: 98, observedAt: "2026-11-10T20:30:00.000Z" },
  ];
  const current = { count: 95, observedAt: "2026-11-11T05:00:00.000Z" };
  try {
    await buildSite({
      data: { ...fixture, current, daily },
      outDirectory,
      requireCurrent: true,
      now: new Date("2026-11-11T05:10:00Z"),
    });
    const published = JSON.parse(await readFile(join(outDirectory, "timeline.json"), "utf8"));

    assert.deepEqual(published.current, current);
    assert.deepEqual(published.daily, daily);
    assert.deepEqual(published.comparison, { ...daily[1], change: -3 });
  } finally {
    await rm(outDirectory, { recursive: true, force: true });
  }
});

test("refuses to publish an unavailable snapshot as a false count", async () => {
  await assert.rejects(buildSite({ data: { ...fixture, current: null }, requireCurrent: true }), /current snapshot is required/);
});

test("publishes the full listing and aligns the counter with its successful source check", async () => {
  const outDirectory = await mkdtemp(join(tmpdir(), "nastud-list-build-"));
  const input = structuredClone(incidents);
  input.incidents[0].name = "</script><img src=x onerror=alert(1)>";
  try {
    const { html, timeline } = await buildSite({ data: fixture, incidents: input, outDirectory });
    const published = JSON.parse(await readFile(join(outDirectory, "incidents.json"), "utf8"));
    const bootstrap = /<script id="initial-incidents" type="application\/json">([\s\S]*?)<\/script>/.exec(html);

    assert.equal(published.incidents.length, input.count);
    assert.equal(published.incidents[0].firstEstimatedEnd, input.incidents[0].firstEstimatedEnd);
    assert.deepEqual(timeline.current, { count: input.count, observedAt: input.observedAt });
    assert.ok(bootstrap);
    assert.equal(JSON.parse(bootstrap[1]).incidents[0].name, input.incidents[0].name);
    assert.equal(bootstrap[1].includes("<"), false);
  } finally {
    await rm(outDirectory, { recursive: true, force: true });
  }
});

test("derives the incident endpoint on the configured API origin without timeline query parameters", () => {
  assert.equal(
    getIncidentsUrl("https://api.example.com/v1/sources/toplo-bg/timeline?days=366#history"),
    "https://api.example.com/v1/sources/toplo-bg/incidents",
  );
  assert.throws(() => getIncidentsUrl("https://api.example.com/v1/messages"), /Toplo source timeline/);
});

test("fetches authenticated listing data and refuses unavailable or partial listings", async (context) => {
  const requests = [];
  context.mock.method(globalThis, "fetch", async (url, options) => {
    requests.push({ url: String(url), options });
    return Response.json(incidents);
  });
  const result = await fetchIncidents("https://api.example.com/v1/sources/toplo-bg/timeline?days=366", "test-key");
  assert.equal(result.count, 3);
  assert.equal(requests[0].url, "https://api.example.com/v1/sources/toplo-bg/incidents");
  assert.equal(requests[0].options.headers["X-Api-Key"], "test-key");
  assert.equal(requests[0].options.redirect, "error");

  globalThis.fetch = async () => {
    return new Response("Unavailable", { status: 503 });
  };
  await assert.rejects(fetchIncidents("https://api.example.com/v1/sources/toplo-bg/timeline", "test-key"), /HTTP 503/);
  globalThis.fetch = async () => {
    return Response.json({ ...incidents, count: 4 });
  };
  await assert.rejects(fetchIncidents("https://api.example.com/v1/sources/toplo-bg/timeline", "test-key"));
});

test("rejects insecure API URLs and credentials embedded in URLs before sending a key", async () => {
  await assert.rejects(fetchTimeline("http://api.example.com/v1/sources/toplo-bg/timeline", "test-key"), /HTTPS/);
  await assert.rejects(fetchTimeline("https://user:password@api.example.com/v1/sources/toplo-bg/timeline", "test-key"), /credentials/);
});
