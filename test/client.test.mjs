import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatComparisonText,
  formatDailyChange,
  formatObservedLabel,
  formatTemperature,
  getDataNotice,
  getDailyChange,
  getTimelineMilestones,
  getTimelinePoints,
  getTimelineRange,
  getWeatherPoints,
  makeTemperatureAxis,
  makeTimelinePath,
  startCounter,
} from "../src/app.js";

test("shared incident page styling does not start the main counter without its controls", (context) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
  context.after(() => {
    if (descriptor) {
      Object.defineProperty(globalThis, "document", descriptor);
    } else {
      delete globalThis.document;
    }
  });
  const document = {
    getElementById(id) {
      assert.equal(id, "counter-app");
      return {
        querySelector() {
          return null;
        },
      };
    },
  };
  Object.defineProperty(globalThis, "document", { configurable: true, value: document });
  assert.doesNotThrow(startCounter);
});

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

test("marks the phased heating rollout on its event date with the original announcement source", () => {
  const points = [{ date: "2026-10-28" }, { date: "2026-10-30" }];
  assert.deepEqual(getTimelineMilestones(points, new Date("2026-11-12T12:00:00Z")), [{
    date: "2026-10-29",
    label: "Поетапно пускане на отоплението",
    sourceUrl: "https://toplo.bg/heating_season2627",
    announcedOn: "2026-10-28",
  }]);
});

test("includes a heating milestone on either timeline boundary and on a single event day", () => {
  for (const dates of [
    ["2026-10-29", "2026-11-01"],
    ["2026-10-27", "2026-10-29"],
    ["2026-10-29"],
  ]) {
    const points = dates.map((date) => {
      return { date };
    });
    assert.deepEqual(getTimelineMilestones(points, new Date("2026-11-29T12:00:00Z")).map((milestone) => {
      return milestone.date;
    }), ["2026-10-29"]);
  }
});

test("omits the heating milestone for empty history and observations ending before the event", () => {
  for (const dates of [
    [],
    ["2026-10-27", "2026-10-28"],
    ["2025-10-29"],
  ]) {
    const points = dates.map((date) => {
      return { date };
    });
    assert.deepEqual(getTimelineMilestones(points, new Date("2026-10-28T12:00:00Z")), []);
  }
});

test("keeps the heating milestone visible when every observation starts after it", () => {
  const points = [{ date: "2026-11-07" }, { date: "2026-11-09" }];
  assert.equal(getTimelineMilestones(points, new Date("2026-12-12T12:00:00Z"))[0].date, "2026-10-29");
});

test("keeps missing incident days unknown when a milestone falls in a chart gap", () => {
  const points = getTimelinePoints({
    daily: [
      { date: "2026-10-28", count: 0, observedAt: "2026-10-28T20:30:00Z" },
      { date: "2026-10-30", count: 12, observedAt: "2026-10-30T20:30:00Z" },
    ],
    current: null,
  });
  const original = structuredClone(points);

  assert.equal(getTimelineMilestones(points, new Date("2026-11-12T12:00:00Z")).length, 1);
  assert.deepEqual(points, original);
  assert.equal(points.length, 2);
  assert.equal(getDailyChange(points, "2026-10-30"), null);
});

test("includes the heating milestone when the current observation reaches its Sofia calendar day", () => {
  const points = getTimelinePoints({
    daily: [{ date: "2026-10-28", count: 10, observedAt: "2026-10-28T20:30:00Z" }],
    current: { count: 11, observedAt: "2026-10-28T22:07:00Z" },
  });

  assert.equal(points[1].date, "2026-10-29");
  assert.equal(getTimelineMilestones(points, new Date("2026-10-28T22:20:00Z"))[0].date, points[1].date);
});

test("starts one calendar month ago until the heating milestone is farther away", () => {
  for (const [today, start] of [
    ["2026-11-12", "2026-10-12"],
    ["2026-11-28", "2026-10-28"],
    ["2026-11-29", "2026-10-29"],
    ["2026-12-12", "2026-10-29"],
    ["2027-01-12", "2026-10-29"],
  ]) {
    assert.deepEqual(getTimelineRange([{ date: today }], new Date(today + "T12:00:00Z")), {
      start,
      end: today,
    });
  }
});

test("clamps the previous calendar month at its final day, including leap years", () => {
  for (const [today, start] of [
    ["2026-03-31", "2026-02-28"],
    ["2024-03-31", "2024-02-29"],
    ["2026-05-31", "2026-04-30"],
    ["2026-01-31", "2025-12-31"],
  ]) {
    assert.equal(getTimelineRange([{ date: today }], new Date(today + "T12:00:00Z")).start, start);
  }
});

test("uses Sofia's calendar date at midnight and across daylight saving changes", () => {
  for (const [now, end, start] of [
    ["2026-11-11T22:07:00Z", "2026-11-12", "2026-10-12"],
    ["2026-03-30T21:07:00Z", "2026-03-31", "2026-02-28"],
    ["2026-10-24T21:07:00Z", "2026-10-25", "2026-09-25"],
    ["2026-10-25T22:07:00Z", "2026-10-26", "2026-09-26"],
  ]) {
    assert.deepEqual(getTimelineRange([{ date: end }], new Date(now)), { start, end });
  }
});

test("preserves supplied observations and prior-day comparisons outside the plotted range", () => {
  const points = getTimelinePoints({
    daily: [
      { date: "2026-10-11", count: 7, observedAt: "2026-10-11T20:30:00Z" },
      { date: "2026-10-12", count: 0, observedAt: "2026-10-12T20:30:00Z" },
    ],
    current: { count: 2, observedAt: "2026-11-11T20:30:00Z" },
  });
  const original = structuredClone(points);

  assert.deepEqual(getTimelineRange(points, new Date("2026-11-12T12:00:00Z")), {
    start: "2026-10-12",
    end: "2026-11-11",
  });
  assert.deepEqual(points, original);
  assert.equal(getDailyChange(points, "2026-10-12"), -7);
});

test("has no plotted range without observations in the requested window", () => {
  const now = new Date("2026-11-12T12:00:00Z");
  assert.equal(getTimelineRange([], now), null);
  assert.equal(getTimelineRange([{ date: "2026-10-11" }], now), null);
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

test("aligns temperatures with an explicit plot window before the first incident observation", () => {
  const weather = {
    daily: [
      { date: "2026-10-28", meanC: 8 },
      { date: "2026-10-29", meanC: 0 },
      { date: "2026-11-07", meanC: null },
      { date: "2026-11-09", meanC: -2 },
      { date: "2026-11-10", meanC: 1 },
    ],
  };
  const points = [{ date: "2026-11-07" }, { date: "2026-11-09" }];
  const range = { start: "2026-10-29", end: "2026-11-09" };

  assert.deepEqual(getWeatherPoints(weather, points, range), weather.daily.slice(1, 4));
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
