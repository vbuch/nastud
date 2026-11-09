import { test } from "node:test";
import assert from "node:assert/strict";
import { formatComparisonText, formatObservedLabel, getDataNotice, getTimelinePoints } from "../src/app.js";

test("preserves the age warning after successful reads of an old snapshot", () => {
  const current = { count: 99, observedAt: "2026-11-09T20:30:00Z" };
  assert.equal(getDataNotice(current, new Date("2026-11-09T21:00:00Z")), "");
  assert.equal(getDataNotice(current, new Date("2026-11-10T10:00:00Z")), "Показваме последните налични данни.");
});

test("uses explicit calendar dates for stale counts and comparisons", () => {
  const current = { count: 99, observedAt: "2026-11-09T20:30:00Z" };
  const now = new Date("2026-11-10T10:00:00Z");
  assert.match(formatObservedLabel(current.observedAt, now), /9 ноември/);
  assert.match(formatComparisonText({ date: "2026-11-08", count: 103 }, current, now), /8 ноември/);
});

test("always shows the full source check date, including today", () => {
  assert.equal(formatObservedLabel("2026-11-09T22:07:00Z", new Date("2026-11-09T22:20:00Z")), "към 00:07 на 10 ноември");
});

test("uses the newer observation when today's live count shares a daily date", () => {
  const daily = [{ date: "2026-11-09", count: 99, observedAt: "2026-11-09T20:30:00Z" }];
  const points = getTimelinePoints({ daily, current: { count: 100, observedAt: "2026-11-09T21:00:00Z" } });
  assert.equal(points.length, 1);
  assert.equal(points[0].count, 100);
  assert.equal(points[0].isCurrent, true);
});
