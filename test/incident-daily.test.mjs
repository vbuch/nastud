import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  DAILY_HISTORY_DAYS,
  getDailyHistoryDates,
  getIncidentDailyChangeRows,
  getIncidentDailyComparison,
  getIncidentDailyRows,
  normalizeIncidentDailyHistory,
} from "../src/incident-daily.js";

const fixture = JSON.parse(await readFile(new URL("./fixtures/incidents.json", import.meta.url), "utf8"));

function capture(date, incidents = fixture.incidents) {
  return {
    ...fixture,
    observedAt: date + "T18:00:00Z",
    count: incidents.length,
    incidents,
  };
}

function history(daily) {
  return normalizeIncidentDailyHistory({
    sourceType: "toplo-bg",
    locality: "bg.sofia",
    startDate: daily[0].date,
    endDate: daily.at(-1).date,
    daily,
  });
}

test("bounds the history to fourteen Sofia calendar dates across month ends and daylight saving", () => {
  assert.equal(DAILY_HISTORY_DAYS, 14);
  for (const [instant, start, end] of [
    ["2026-11-13T21:59:59Z", "2026-10-31", "2026-11-13"],
    ["2026-11-13T22:00:00Z", "2026-11-01", "2026-11-14"],
    ["2026-03-29T21:00:00Z", "2026-03-17", "2026-03-30"],
    ["2026-10-25T22:00:00Z", "2026-10-13", "2026-10-26"],
    ["2024-03-01T12:00:00Z", "2024-02-17", "2024-03-01"],
  ]) {
    const dates = getDailyHistoryDates(instant);
    assert.equal(dates.length, 14);
    assert.equal(dates[0], start);
    assert.equal(dates.at(-1), end);
    assert.equal(new Set(dates).size, 14);
  }
  for (const instant of [null, "bad", "2026-02-30T00:00:00Z", "2026-11-13T12:00:00", "0000-01-01T12:00:00Z"]) {
    assert.throws(() => {
      getDailyHistoryDates(instant);
    });
  }
});

test("preserves published gaps and verified emptiness while omitting rows before first appearance", () => {
  const present = { ...capture("2026-11-11"), observedAt: "2026-11-10T22:30:00+00:00" };
  const normalized = history([
    { date: "2026-11-09", snapshot: null },
    { date: "2026-11-10", snapshot: capture("2026-11-10", []) },
    { date: "2026-11-11", snapshot: present },
  ]);
  assert.equal(normalized.daily[0].snapshot, null);
  assert.equal(normalized.daily[1].snapshot.count, 0);
  assert.deepEqual(normalized.daily[1].snapshot.incidents, []);
  assert.equal(normalized.daily[2].snapshot.observedAt, present.observedAt);
  const rows = getIncidentDailyRows(normalized, present, "oldest");
  assert.deepEqual(rows.map((row) => {
    return [row.state, row.total, row.observedAt];
  }), [
    ["present", 3, present.observedAt],
  ]);
  assert.equal(getIncidentDailyComparison(normalized, present, "oldest"), null);
  assert.deepEqual(getIncidentDailyRows(normalized, present, "unknown-id"), []);
});

test("rejects malformed or incomplete date periods instead of manufacturing gaps", () => {
  const valid = history([
    { date: "2026-11-10", snapshot: null },
    { date: "2026-11-11", snapshot: capture("2026-11-11") },
  ]);
  for (const change of [
    null,
    [],
    { ...valid, sourceType: "other" },
    { ...valid, locality: "other" },
    { ...valid, startDate: "2026-02-30" },
    { ...valid, startDate: "0000-01-01" },
    { ...valid, startDate: "2026-11-12" },
    { ...valid, startDate: "2026-10-01" },
    { ...valid, daily: valid.daily.slice(1) },
    { ...valid, daily: [...valid.daily].reverse() },
    { ...valid, daily: [valid.daily[0], valid.daily[0]] },
    { ...valid, daily: [null, valid.daily[1]] },
    { ...valid, daily: [{ date: "2026-11-10" }, valid.daily[1]] },
  ]) {
    assert.throws(() => {
      normalizeIncidentDailyHistory(change);
    });
  }
});

test("validates every capture's source, Sofia date, count and unique stable identity", () => {
  const valid = capture("2026-11-11");
  for (const snapshot of [
    { ...valid, sourceType: "other" },
    { ...valid, locality: "other" },
    { ...valid, observedAt: "2026-11-11T22:00:00Z" },
    { ...valid, observedAt: "2026-11-09T22:00:00Z" },
    { ...valid, observedAt: "bad" },
    { ...valid, count: 0 },
    { ...valid, count: 2, incidents: [valid.incidents[0], valid.incidents[0]] },
    { ...valid, incidents: [{ ...valid.incidents[0], estimatedEnd: "bad" }, ...valid.incidents.slice(1)] },
  ]) {
    assert.throws(() => {
      history([{ date: "2026-11-11", snapshot }]);
    });
  }
});

test("uses stable IDs across changed listing IDs and orders all types by start, name and binary ID", () => {
  const original = fixture.incidents[0];
  const incidents = [
    { ...original, id: "unknown", accidentId: "u", name: "А", reportedStart: null },
    { ...original, id: "name", accidentId: "n", name: "Б" },
    { ...original, id: "a", accidentId: "a", name: "А" },
    { ...original, id: "Z", accidentId: "z", name: "А", type: "repair" },
  ];
  const old = capture("2026-11-10", incidents);
  const current = capture("2026-11-11", incidents.map((incident) => {
    return { ...incident, accidentId: "new-" + incident.accidentId };
  }));
  const input = history([{ date: "2026-11-10", snapshot: old }, { date: "2026-11-11", snapshot: null }]);
  assert.deepEqual(getIncidentDailyRows(input, current, "Z").map((row) => {
    return [row.position, row.total];
  }), [[1, 4], [1, 4]]);
  assert.equal(getIncidentDailyRows(input, current, "a")[0].position, 2);
  assert.equal(getIncidentDailyRows(input, current, "name")[0].position, 3);
  assert.equal(getIncidentDailyRows(input, current, "unknown")[0].position, 4);
});

test("keeps unknown estimates, absence and unavailable days distinct through removal and reappearance", () => {
  const unknown = { ...fixture.incidents[0], estimatedEnd: null };
  const input = history([
    { date: "2026-11-04", snapshot: null },
    { date: "2026-11-05", snapshot: capture("2026-11-05", []) },
    { date: "2026-11-06", snapshot: capture("2026-11-06", [fixture.incidents[1]]) },
    { date: "2026-11-07", snapshot: capture("2026-11-07", [unknown]) },
    { date: "2026-11-08", snapshot: capture("2026-11-08", [fixture.incidents[1]]) },
    { date: "2026-11-09", snapshot: null },
    { date: "2026-11-10", snapshot: capture("2026-11-10", []) },
    { date: "2026-11-11", snapshot: capture("2026-11-11", [unknown]) },
  ]);
  const rows = getIncidentDailyRows(input, capture("2026-11-11", [unknown]), unknown.id);
  assert.equal(rows[0].date, "2026-11-07");
  assert.deepEqual(rows.map((row) => {
    return [row.state, row.position, row.total, row.estimatedEnd, row.remainingDays];
  }), [
    ["present", 1, 1, null, null],
    ["absent", null, 1, null, null],
    ["unavailable", null, null, null, null],
    ["absent", null, 0, null, null],
    ["present", 1, 1, null, null],
  ]);
  assert.equal(getIncidentDailyComparison(input, capture("2026-11-11", [unknown]), unknown.id), null);
});

test("compares only the preceding Sofia day and preserves earlier, later and unknown deadlines", () => {
  const original = fixture.incidents[1];
  const previous = capture("2026-11-10", [{ ...original, estimatedEnd: "2026-11-13T10:25:00Z" }]);
  const input = history([
    { date: "2026-11-10", snapshot: previous },
    { date: "2026-11-11", snapshot: null },
  ]);
  for (const [estimatedEnd, change] of [
    ["2026-11-15T10:25:00Z", 2],
    ["2026-11-12T10:25:00Z", -1],
    ["2026-11-13T10:25:00Z", 0],
    [null, null],
  ]) {
    const current = capture("2026-11-11", [...fixture.incidents.filter((incident) => {
      return incident.id !== original.id;
    }), { ...original, estimatedEnd }]);
    assert.deepEqual(getIncidentDailyComparison(input, current, original.id), {
      previousDate: "2026-11-10",
      currentDate: "2026-11-11",
      positionChange: 2,
      deadlineChangeDays: change,
    });
  }
  assert.equal(getIncidentDailyComparison(input, capture("2026-11-12"), original.id), null);
});

test("does not turn first-record baselines into historical captures or comparisons", () => {
  const input = history([
    { date: "2026-11-10", snapshot: null },
    { date: "2026-11-11", snapshot: fixture },
  ]);
  const rows = getIncidentDailyRows(input, fixture, "oldest");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].date, "2026-11-11");
  assert.equal(rows[0].state, "present");
  assert.equal(getIncidentDailyComparison(input, fixture, "oldest"), null);
  assert.deepEqual(getIncidentDailyRows(null, fixture, "oldest"), []);
});

test("uses actual observation Sofia dates for days remaining across daylight saving changes", () => {
  for (const [day, previousAt, currentAt, estimatedEnd] of [
    ["2026-03-29", "2026-03-28T21:59:59Z", "2026-03-28T22:00:00Z", "2026-03-30T00:00:00Z"],
    ["2026-10-25", "2026-10-24T20:59:59Z", "2026-10-24T21:00:00Z", "2026-10-26T00:00:00Z"],
  ]) {
    const incident = { ...fixture.incidents[0], estimatedEnd };
    const previous = { ...capture(day, [incident]), observedAt: previousAt };
    const current = { ...capture(day, [incident]), observedAt: currentAt };
    const previousDate = getDailyHistoryDates(previousAt).at(-1);
    const input = history([{ date: previousDate, snapshot: previous }, { date: day, snapshot: null }]);
    const rows = getIncidentDailyRows(input, current, incident.id);
    assert.equal(rows[0].remainingDays, 2);
    assert.equal(rows[1].remainingDays, 1);
    assert.equal(getIncidentDailyComparison(input, current, incident.id).deadlineChangeDays, 0);
  }
});

test("replaces the current day from the latest listing and bounds stale history after refresh", () => {
  const input = history([
    { date: "2026-11-10", snapshot: capture("2026-11-10") },
    { date: "2026-11-11", snapshot: fixture },
  ]);
  const later = { ...fixture, observedAt: "2026-11-11T20:00:00Z", count: 0, incidents: [] };
  assert.equal(getIncidentDailyRows(input, later, "oldest").at(-1).state, "absent");
  const fresh = capture("2026-12-01");
  const rows = getIncidentDailyRows(input, fresh, "oldest");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].date, "2026-12-01");
  assert.equal(rows.at(-1).date, "2026-12-01");
  assert.equal(rows.at(-1).state, "present");
  const older = capture("2026-11-09");
  assert.deepEqual(getIncidentDailyRows(input, older, "oldest").map((row) => {
    return row.date;
  }), ["2026-11-09"]);
});

test("shows only changes in position, total, deadline date or availability", () => {
  const original = fixture.incidents[0];
  const input = history([
    { date: "2026-11-01", snapshot: capture("2026-11-01", [original]) },
    { date: "2026-11-02", snapshot: capture("2026-11-02", [original]) },
    { date: "2026-11-03", snapshot: capture("2026-11-03", [{ ...original, estimatedEnd: "2026-11-15T23:59:00Z" }]) },
    { date: "2026-11-04", snapshot: capture("2026-11-04", [{ ...original, estimatedEnd: "2026-11-16T20:00:00Z" }]) },
    { date: "2026-11-05", snapshot: capture("2026-11-05", [{ ...original, estimatedEnd: "2026-11-16T20:00:00Z" }, fixture.incidents[1]]) },
    { date: "2026-11-06", snapshot: capture("2026-11-06", [{ ...original, reportedStart: null, estimatedEnd: "2026-11-16T20:00:00Z" }, fixture.incidents[1]]) },
    { date: "2026-11-07", snapshot: capture("2026-11-07", [{ ...original, reportedStart: null, estimatedEnd: null }, fixture.incidents[1]]) },
    { date: "2026-11-08", snapshot: null },
    { date: "2026-11-09", snapshot: null },
    { date: "2026-11-10", snapshot: capture("2026-11-10", []) },
    { date: "2026-11-11", snapshot: capture("2026-11-11", []) },
    { date: "2026-11-12", snapshot: capture("2026-11-12", [original]) },
  ]);
  const rows = getIncidentDailyRows(input, capture("2026-11-12", [original]), original.id);
  const before = structuredClone(rows);
  const changes = getIncidentDailyChangeRows(rows);
  assert.deepEqual(changes.map((row) => {
    return [row.date, row.state, row.throughDate ?? null];
  }), [
    ["2026-11-01", "present", null],
    ["2026-11-04", "present", null],
    ["2026-11-05", "present", null],
    ["2026-11-06", "present", null],
    ["2026-11-07", "present", null],
    ["2026-11-08", "unavailable", "2026-11-09"],
    ["2026-11-10", "absent", "2026-11-11"],
    ["2026-11-12", "present", null],
  ]);
  assert.deepEqual(rows, before);
  assert.deepEqual(getIncidentDailyChangeRows([]), []);
});

test("retains changed absence totals and compares yesterday even when its row has no change", () => {
  const original = fixture.incidents[0];
  const input = history([
    { date: "2026-11-07", snapshot: capture("2026-11-07", [original]) },
    { date: "2026-11-08", snapshot: capture("2026-11-08", []) },
    { date: "2026-11-09", snapshot: capture("2026-11-09", [fixture.incidents[1]]) },
    { date: "2026-11-10", snapshot: capture("2026-11-10", [original]) },
    { date: "2026-11-11", snapshot: capture("2026-11-11", [original]) },
  ]);
  const current = capture("2026-11-11", [original]);
  const rows = getIncidentDailyRows(input, current, original.id);
  const changes = getIncidentDailyChangeRows(rows);
  assert.deepEqual(changes.map((row) => {
    return [row.date, row.state, row.total];
  }), [
    ["2026-11-07", "present", 1],
    ["2026-11-08", "absent", 0],
    ["2026-11-09", "absent", 1],
    ["2026-11-10", "present", 1],
  ]);
  assert.equal(changes[0].observedAt, rows[0].observedAt);
  assert.deepEqual(getIncidentDailyComparison(input, current, original.id), {
    previousDate: "2026-11-10",
    currentDate: "2026-11-11",
    positionChange: 0,
    deadlineChangeDays: 0,
  });
});
