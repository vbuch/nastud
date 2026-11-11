import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  formatExtension,
  formatIncidentDate,
  getEstimateExtensionDays,
  getIncidentAgeDays,
  getIncidentsNotice,
  hasChangedStart,
  normalizeIncidents,
  sortIncidents,
} from "../src/incidents.js";

const fixture = JSON.parse(await readFile(new URL("./fixtures/incidents.json", import.meta.url), "utf8"));

test("accepts the full list and a verified empty list while rejecting incomplete listings", () => {
  assert.equal(normalizeIncidents(fixture).incidents.length, 3);
  assert.equal(normalizeIncidents({ ...fixture, count: 0, incidents: [] }).count, 0);
  assert.throws(() => normalizeIncidents({ ...fixture, count: 4 }), /Invalid Toplo incident listing/);
  assert.throws(() => normalizeIncidents(null), /Invalid Toplo incident listing/);
  assert.throws(() => normalizeIncidents({ ...fixture, incidents: [fixture.incidents[0], fixture.incidents[0], fixture.incidents[2]] }), /Duplicate/);
  assert.throws(() => normalizeIncidents({ ...fixture, sourceType: "other-source" }), /Invalid/);
});

test("rejects invalid dates and unzoned timestamps while preserving missing date values", () => {
  for (const value of ["2026-11-11T15:00:00", "2026-02-30T12:00:00Z", "bad-date"]) {
    const incidents = [{ ...fixture.incidents[0], reportedStart: value }];
    assert.throws(() => normalizeIncidents({ ...fixture, count: 1, incidents }), /Invalid incident date/);
  }
  const incidents = [{ ...fixture.incidents[0], reportedStart: null, estimatedEnd: null, firstEstimatedEnd: null }];
  const normalized = normalizeIncidents({ ...fixture, count: 1, incidents });
  assert.equal(normalized.incidents[0].estimatedEnd, null);
  assert.equal(getIncidentAgeDays(normalized.incidents[0], normalized.observedAt), null);
  assert.equal(getEstimateExtensionDays(normalized.incidents[0]), null);
});

test("sorts current records by reported age, latest start, estimate and net extension", () => {
  const { incidents } = normalizeIncidents(fixture);
  assert.deepEqual(sortIncidents(incidents, "oldest").map((incident) => { return incident.id; }), ["oldest", "repair", "newer"]);
  assert.deepEqual(sortIncidents(incidents, "newest").map((incident) => { return incident.id; }), ["newer", "repair", "oldest"]);
  assert.deepEqual(sortIncidents(incidents, "earliest-estimate").map((incident) => { return incident.id; }), ["newer", "oldest", "repair"]);
  assert.deepEqual(sortIncidents(incidents, "longest-extension").map((incident) => { return incident.id; }), ["oldest", "repair", "newer"]);
  assert.equal(incidents[0].id, "oldest");
});

test("places missing baselines after known extensions and preserves earlier corrections", () => {
  const original = fixture.incidents[0];
  const incidents = [
    { ...original, id: "unknown", firstEstimatedEnd: null },
    { ...original, id: "earlier", firstEstimatedEnd: "2026-11-17T20:00:00Z" },
    { ...original, id: "same", firstEstimatedEnd: original.estimatedEnd },
    { ...original, id: "later", firstEstimatedEnd: "2026-11-13T20:00:00Z" },
  ];
  assert.deepEqual(sortIncidents(incidents, "longest-extension").map((incident) => { return incident.id; }), ["later", "same", "earlier", "unknown"]);
  assert.equal(getEstimateExtensionDays(incidents[1]), -2);
  assert.match(formatExtension(incidents[1]), /по-рано/);
  assert.match(formatExtension(incidents[0]), /Няма запазен/);
});

test("bases age on the source capture calendar day and keeps source dates unchanged", () => {
  const { incidents, observedAt } = normalizeIncidents(fixture);
  assert.equal(getIncidentAgeDays(incidents[0], observedAt), 372);
  assert.equal(getIncidentAgeDays(incidents[1], observedAt), 0);
  assert.equal(getIncidentAgeDays({ ...incidents[0], reportedStart: "2026-11-12T10:00:00Z" }, observedAt), 0);
  assert.match(formatIncidentDate("2026-11-11T23:59:00Z"), /11 ноември 2026/);
  assert.equal(formatIncidentDate(null), "Няма обявена дата");
  assert.equal(hasChangedStart(incidents[0]), false);
  assert.equal(hasChangedStart(incidents[2]), true);
});

test("marks stale or failed reads while retaining a snapshot's original observation time", () => {
  const snapshot = normalizeIncidents(fixture);
  assert.equal(getIncidentsNotice(snapshot, new Date("2026-11-11T15:10:00Z")), "");
  assert.match(getIncidentsNotice(snapshot, new Date("2026-11-11T17:00:00Z")), /последния запазен/);
  assert.match(getIncidentsNotice(snapshot, new Date("2026-11-11T15:10:00Z"), true), /последния запазен/);
  assert.equal(snapshot.observedAt, fixture.observedAt);
});

test("keeps upstream names as text and replaces an untrusted source link with the known listing", () => {
  const malicious = "<img src=x onerror=alert(1)>";
  const input = {
    ...fixture,
    sourceUrl: "javascript:alert(1)",
    incidents: fixture.incidents.map((incident) => {
      return { ...incident, name: malicious, addresses: "</script><script>alert(1)</script>" };
    }),
  };
  const normalized = normalizeIncidents(input);
  assert.equal(normalized.incidents[0].name, malicious);
  assert.equal(normalized.sourceUrl, "https://toplo.bg/accidents-and-maintenance");
});
