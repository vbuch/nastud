import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  formatExtension,
  formatIncidentAge,
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
  assert.deepEqual(sortIncidents(incidents, "oldest").map((incident) => {
    return incident.id;
  }), ["oldest", "repair", "newer"]);
  assert.deepEqual(sortIncidents(incidents, "newest").map((incident) => {
    return incident.id;
  }), ["newer", "repair", "oldest"]);
  assert.deepEqual(sortIncidents(incidents, "earliest-estimate").map((incident) => {
    return incident.id;
  }), ["newer", "oldest", "repair"]);
  assert.deepEqual(sortIncidents(incidents, "longest-extension").map((incident) => {
    return incident.id;
  }), ["oldest", "repair", "newer"]);
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
  assert.deepEqual(sortIncidents(incidents, "longest-extension").map((incident) => {
    return incident.id;
  }), ["later", "same", "earlier", "unknown"]);
  assert.equal(getEstimateExtensionDays(incidents[1]), -2);
  assert.match(formatExtension(incidents[1]), /по-ранен/);
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

test("labels elapsed calendar days against the source check date with natural singular and plural forms", () => {
  const incident = fixture.incidents[0];
  const observedAt = "2026-11-10T22:30:00Z";

  assert.equal(formatIncidentAge({
    ...incident,
    reportedStart: "2026-11-10T23:59:00Z",
  }, observedAt), "От посоченото начало: 1 ден");
  assert.equal(formatIncidentAge({
    ...incident,
    reportedStart: "2026-11-07T10:00:00Z",
  }, observedAt), "От посоченото начало: 4 дни");
});

test("distinguishes starts on the check date from future or unknown starts", () => {
  const incident = fixture.incidents[0];
  const observedAt = "2026-11-10T22:30:00Z";
  const sameDay = { ...incident, reportedStart: "2026-11-11T23:59:00Z" };
  const future = { ...incident, reportedStart: "2026-11-12T10:00:00Z" };

  assert.equal(getIncidentAgeDays(sameDay, observedAt), 0);
  assert.equal(getIncidentAgeDays(future, observedAt), 0);
  assert.equal(formatIncidentAge(sameDay, observedAt), "Началото е в деня на проверката.");
  assert.equal(formatIncidentAge(future, observedAt), "Посоченото начало е след датата на проверката.");
  assert.equal(formatIncidentAge({ ...incident, reportedStart: null }, observedAt), null);
});

test("identifies earlier, later and matching deadlines relative to the first saved estimate", () => {
  const incident = { ...fixture.incidents[0], estimatedEnd: "2026-11-15T20:00:00Z" };
  const cases = [
    ["2026-11-16T20:00:00Z", "Текущият срок е с 1 ден по-ранен от първия запазен срок."],
    ["2026-11-17T20:00:00Z", "Текущият срок е с 2 дни по-ранен от първия запазен срок."],
    ["2026-11-14T20:00:00Z", "Текущият срок е с 1 ден по-късен от първия запазен срок."],
    ["2026-11-13T20:00:00Z", "Текущият срок е с 2 дни по-късен от първия запазен срок."],
    ["2026-11-15T20:00:00Z", "Текущият срок съвпада с първия запазен срок."],
  ];
  for (const [firstEstimatedEnd, expected] of cases) {
    assert.equal(formatExtension({ ...incident, firstEstimatedEnd }), expected);
  }
});

test("preserves approximate and sub-day deadline changes without rounding them to unchanged", () => {
  const incident = { ...fixture.incidents[0], estimatedEnd: "2026-11-15T20:00:00Z" };
  const cases = [
    ["2026-11-15T08:00:00Z", "Текущият срок е с по-малко от 1 ден по-късен от първия запазен срок."],
    ["2026-11-16T08:00:00Z", "Текущият срок е с по-малко от 1 ден по-ранен от първия запазен срок."],
    ["2026-11-14T08:00:00Z", "Текущият срок е с около 2 дни по-късен от първия запазен срок."],
    ["2026-11-17T08:00:00Z", "Текущият срок е с около 2 дни по-ранен от първия запазен срок."],
  ];
  for (const [firstEstimatedEnd, expected] of cases) {
    assert.equal(formatExtension({ ...incident, firstEstimatedEnd }), expected);
  }
});

test("distinguishes a missing current deadline from a missing first saved estimate", () => {
  const incident = fixture.incidents[0];

  assert.equal(formatExtension({
    ...incident,
    estimatedEnd: null,
  }), "Няма обявен текущ срок за приключване.");
  assert.equal(formatExtension({
    ...incident,
    firstEstimatedEnd: null,
  }), "Няма запазен първи срок за сравнение.");
  assert.equal(formatExtension({
    ...incident,
    estimatedEnd: null,
    firstEstimatedEnd: null,
  }), "Няма обявен текущ срок за приключване.");
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
