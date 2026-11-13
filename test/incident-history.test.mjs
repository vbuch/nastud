import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  formatRemainingDays,
  getIncidentPath,
  getIncidentPosition,
  getIncidentProgress,
  getRemainingDays,
} from "../src/incident-history.js";
import { normalizeIncidents, sortIncidents } from "../src/incidents.js";

const fixture = JSON.parse(await readFile(new URL("./fixtures/incidents.json", import.meta.url), "utf8"));

test("builds a stable URL path from the content identity with safe UTF-8 encoding", () => {
  assert.equal(getIncidentPath("oldest"), "incident/b2xkZXN0/");
  const identity = "Оборище / №106?&=+#🚧";
  const path = getIncidentPath(identity);
  assert.match(path, /^incident\/[A-Za-z0-9_-]+\/$/);
  const encoded = path.split("/")[1];
  assert.equal(Buffer.from(encoded, "base64url").toString("utf8"), identity);
  const original = fixture.incidents[0];
  const recaptured = { ...original, accidentId: "changed-listing-identity" };
  assert.equal(getIncidentPath(original.id), getIncidentPath(recaptured.id));
});

test("positions records across every type in the canonical oldest-start order", () => {
  const snapshot = normalizeIncidents(fixture);
  const inputOrder = snapshot.incidents.map((incident) => {
    return incident.id;
  });
  assert.deepEqual(getIncidentPosition(snapshot, "oldest"), { position: 1, total: 3 });
  assert.deepEqual(getIncidentPosition(snapshot, "repair"), { position: 2, total: 3 });
  assert.deepEqual(getIncidentPosition(snapshot, "newer"), { position: 3, total: 3 });
  sortIncidents(snapshot.incidents, "newest");
  assert.deepEqual(getIncidentPosition(snapshot, "newer"), { position: 3, total: 3 });
  assert.deepEqual(snapshot.incidents.map((incident) => {
    return incident.id;
  }), inputOrder);
  assert.equal(getIncidentPosition(snapshot, "absent"), null);
  assert.equal(getIncidentPosition(null, "oldest"), null);
  assert.equal(getIncidentPosition({ incidents: [] }, "oldest"), null);
});

test("keeps tied ranks stable by name and stable ID and puts unknown starts last", () => {
  const original = fixture.incidents[0];
  const snapshot = {
    incidents: [
      { ...original, id: "unknown", name: "А", reportedStart: null },
      { ...original, id: "b", name: "Б" },
      { ...original, id: "a2", name: "А" },
      { ...original, id: "a1", name: "А" },
    ],
  };
  assert.deepEqual(getIncidentPosition(snapshot, "a1"), { position: 1, total: 4 });
  assert.deepEqual(getIncidentPosition(snapshot, "a2"), { position: 2, total: 4 });
  assert.deepEqual(getIncidentPosition(snapshot, "b"), { position: 3, total: 4 });
  assert.deepEqual(getIncidentPosition(snapshot, "unknown"), { position: 4, total: 4 });
});

test("uses source deadline dates and Sofia observation dates for signed calendar days", () => {
  assert.equal(getRemainingDays("2026-11-15T00:01:00Z", "2026-11-13T15:00:00Z"), 2);
  assert.equal(getRemainingDays("2026-11-12T23:59:00Z", "2026-11-13T15:00:00Z"), -1);
  assert.equal(getRemainingDays("2026-11-14T23:59:00Z", "2026-11-13T22:30:00Z"), 0);
  assert.equal(getRemainingDays("2026-11-13T23:59:00Z", "2026-11-13T22:30:00Z"), -1);
  assert.equal(getRemainingDays("2026-11-15T23:59:00-05:00", "2026-11-13T15:00:00Z"), 2);
});

test("counts calendar days across short and long daylight-saving days", () => {
  assert.equal(getRemainingDays("2026-03-30T00:00:00Z", "2026-03-28T22:30:00Z"), 1);
  assert.equal(getRemainingDays("2026-10-26T00:00:00Z", "2026-10-24T21:30:00Z"), 1);
});

test("keeps missing and invalid deadlines or observations unknown", () => {
  for (const value of [null, undefined, "bad", "2026-02-30T12:00:00Z", "2026-11-15T12:00:00"]) {
    assert.equal(getRemainingDays(value, fixture.observedAt), null);
    assert.equal(getRemainingDays(fixture.incidents[0].estimatedEnd, value), null);
  }
});

test("describes remaining, same-day, passed and unknown deadlines in Bulgarian", () => {
  const observedAt = "2026-11-13T15:00:00Z";
  assert.equal(formatRemainingDays("2026-11-15T12:00:00Z", observedAt), "Остават 2 дни до текущия срок.");
  assert.equal(formatRemainingDays("2026-11-14T12:00:00Z", observedAt), "Остава 1 ден до текущия срок.");
  assert.equal(formatRemainingDays("2026-11-13T12:00:00Z", observedAt), "Текущият срок е в деня на проверката.");
  assert.equal(formatRemainingDays("2026-11-12T12:00:00Z", observedAt), "Текущият срок е минал с 1 ден.");
  assert.equal(formatRemainingDays("2026-11-11T12:00:00Z", observedAt), "Текущият срок е минал с 2 дни.");
  assert.equal(formatRemainingDays(null, observedAt), "Няма обявен текущ срок за приключване.");
});

test("returns only first and current observations without creating intermediate history", () => {
  const incident = {
    ...fixture.incidents[0],
    firstObservedAt: "2026-10-22T21:30:00Z",
    firstEstimatedEnd: "2026-10-24T12:00:00Z",
    estimatedEnd: "2026-11-15T12:00:00Z",
  };
  assert.deepEqual(getIncidentProgress(incident, "2026-11-13T15:00:00Z"), [
    {
      observedAt: "2026-10-22T21:30:00Z",
      date: "2026-10-23",
      estimatedEnd: "2026-10-24T12:00:00Z",
      remainingDays: 1,
      kind: "first",
    },
    {
      observedAt: "2026-11-13T15:00:00Z",
      date: "2026-11-13",
      estimatedEnd: "2026-11-15T12:00:00Z",
      remainingDays: 2,
      kind: "current",
    },
  ]);
});

test("preserves unknown first and current estimates without turning them into zero", () => {
  const incident = { ...fixture.incidents[0], firstEstimatedEnd: null, estimatedEnd: null };
  const points = getIncidentProgress(incident, fixture.observedAt);
  assert.equal(points.length, 2);
  for (const point of points) {
    assert.equal(point.estimatedEnd, null);
    assert.equal(point.remainingDays, null);
  }
  const withoutFirst = getIncidentProgress({ ...incident, firstObservedAt: null }, fixture.observedAt);
  assert.equal(withoutFirst.length, 1);
  assert.equal(withoutFirst[0].kind, "current");
});

test("prefers current data at a duplicate instant and excludes a future first observation", () => {
  for (const firstObservedAt of [fixture.observedAt, "2026-11-11T17:00:00+02:00", "2026-11-12T15:00:00Z"]) {
    const points = getIncidentProgress({ ...fixture.incidents[0], firstObservedAt }, fixture.observedAt);
    assert.equal(points.length, 1);
    assert.equal(points[0].kind, "current");
    assert.equal(points[0].estimatedEnd, fixture.incidents[0].estimatedEnd);
  }
  assert.deepEqual(getIncidentProgress(fixture.incidents[0], null), []);
});
