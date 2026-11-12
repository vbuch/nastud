import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatComparisonText,
  formatDailyChange,
  formatObservedLabel,
  formatTemperature,
  getDataNotice,
  getDailyChange,
  getTimelinePoints,
  getWeatherPoints,
  makeTemperatureAxis,
  makeTimelinePath,
} from "../src/app.js";

test("shows no generic stale notice for a known snapshot, including a real zero", () => {
  for (const count of [99, 0]) {
    const current = { count, observedAt: "2026-11-09T20:30:00Z" };
    assert.equal(getDataNotice(current), "");
  }
});

test("keeps an unavailable notice when the current snapshot is unknown", () => {
  assert.equal(getDataNotice(null), "В момента няма актуални данни.");
});

test("keeps source and comparison dates explicit for an old snapshot", () => {
  const current = { count: 99, observedAt: "2026-11-09T20:30:00Z" };
  const now = new Date("2026-11-10T10:00:00Z");
  assert.match(formatObservedLabel(current.observedAt, now), /9 ноември/);
  assert.equal(formatComparisonText({ date: "2026-11-08", count: 103 }, current, now), "С 4 по-малко от 8 ноември.");
});

test("uses yesterday for today's increases, decreases and unchanged counts in Sofia", () => {
  for (const [observedAt, now, baselineDate] of [
    ["2026-11-12T11:00:00Z", "2026-11-12T12:00:00Z", "2026-11-11"],
    ["2026-11-09T22:07:00Z", "2026-11-09T22:20:00Z", "2026-11-09"],
  ]) {
    const comparison = { date: baselineDate, count: 10 };
    for (const [count, expected] of [
      [12, "С 2 повече от вчера."],
      [8, "С 2 по-малко от вчера."],
      [10, "Без промяна от вчера."],
    ]) {
      assert.equal(formatComparisonText(comparison, { count, observedAt }, new Date(now)), expected);
    }
  }
});

test("does not call a baseline yesterday when the current snapshot is from an older Sofia day", () => {
  const comparison = { date: "2026-11-09", count: 10 };
  const current = { count: 12, observedAt: "2026-11-09T20:30:00Z" };
  const text = formatComparisonText(comparison, current, new Date("2026-11-09T22:05:00Z"));
  assert.equal(text, "С 2 повече от 9 ноември.");
});

test("names an explicit baseline date when it is not the preceding snapshot day", () => {
  const current = { count: 12, observedAt: "2026-11-09T20:30:00Z" };
  const comparison = { date: "2026-11-07", count: 10 };
  const text = formatComparisonText(comparison, current, new Date("2026-11-09T21:00:00Z"));
  assert.match(text, /7 ноември/);
  assert.doesNotMatch(text, /вчера/);
  assert.equal(formatComparisonText(null, current), "");
  assert.equal(formatComparisonText(comparison, null), "");
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

test("calculates selected-day changes from the exact preceding calendar day", () => {
  const points = [
    { date: "2026-11-07", count: 0 },
    { date: "2026-11-08", count: 2 },
    { date: "2026-11-09", count: 0 },
    { date: "2026-11-10", count: 0 },
  ];
  assert.equal(getDailyChange(points, "2026-11-08"), 2);
  assert.equal(getDailyChange(points, "2026-11-09"), -2);
  assert.equal(getDailyChange(points, "2026-11-10"), 0);
});

test("keeps chart changes unknown for a first day, missing calendar day or unknown selection", () => {
  const points = [
    { date: "2026-11-07", count: 10 },
    { date: "2026-11-09", count: 12 },
  ];
  assert.equal(getDailyChange(points, "2026-11-07"), null);
  assert.equal(getDailyChange(points, "2026-11-09"), null);
  assert.equal(getDailyChange(points, "2026-11-10"), null);
  assert.equal(getDailyChange([], "2026-11-07"), null);
});

test("uses the newest plotted observation for the current day's chart change", () => {
  const points = getTimelinePoints({
    daily: [
      { date: "2026-11-08", count: 103, observedAt: "2026-11-08T20:30:00Z" },
      { date: "2026-11-09", count: 99, observedAt: "2026-11-09T20:30:00Z" },
    ],
    current: { count: 105, observedAt: "2026-11-09T21:00:00Z" },
  });
  assert.equal(getDailyChange(points, "2026-11-09"), 2);
});

test("formats selected-day direction arrows without inventing a missing change", () => {
  assert.equal(formatDailyChange(2), "↑ 2");
  assert.equal(formatDailyChange(-4), "↓ 4");
  assert.equal(formatDailyChange(0), "→ 0");
  assert.equal(formatDailyChange(null), "");
});

test("limits temperatures to incident history while preserving missing and zero values", () => {
  const weather = {
    daily: [
      { date: "2026-11-06", meanC: 3 },
      { date: "2026-11-07", meanC: -2.4 },
      { date: "2026-11-08", meanC: null },
      { date: "2026-11-09", meanC: 0 },
      { date: "2026-11-10", meanC: 1 },
    ],
  };
  const points = [{ date: "2026-11-07" }, { date: "2026-11-09" }];
  assert.deepEqual(getWeatherPoints(weather, points), weather.daily.slice(1, 4));
  assert.deepEqual(getWeatherPoints(null, points), []);
  assert.deepEqual(getWeatherPoints(weather, []), []);
});

test("temperature labels distinguish freezing and negative temperatures from missing readings", () => {
  assert.equal(formatTemperature(0), "0,0 °C");
  assert.equal(formatTemperature(-2.4), "-2,4 °C");
  assert.equal(formatTemperature(null), "няма температура");
  assert.equal(formatTemperature(undefined), "няма температура");
});

test("temperature scale includes negative values and gives constant series a visible range", () => {
  const mixed = makeTemperatureAxis([{ meanC: -7.2 }, { meanC: null }, { meanC: 0 }, { meanC: 4.2 }]);
  assert.ok(mixed.low <= -7.2);
  assert.ok(mixed.high >= 4.2);
  assert.ok(mixed.ticks.includes(0));
  const constant = makeTemperatureAxis([{ meanC: -20 }, { meanC: -20 }]);
  assert.ok(constant.low < -20);
  assert.ok(constant.high > -20);
  assert.equal(makeTemperatureAxis([{ meanC: null }]), null);
});

test("graph lines break at null values and calendar gaps", () => {
  const day = 24 * 60 * 60 * 1000;
  const points = [
    { timestamp: 0, x: 0, y: 3 },
    { timestamp: day, x: 10, y: 0 },
    { timestamp: 2 * day, x: 20, y: null },
    { timestamp: 3 * day, x: 30, y: -2 },
    { timestamp: 5 * day, x: 50, y: 5 },
  ];
  assert.equal(makeTimelinePath(points), "M0,3 L10,0 M30,-2 M50,5");
});
