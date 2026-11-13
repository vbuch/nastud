import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getIncidentDailyView, getIncidentDetailView } from "../src/incident-view.js";

const fixture = JSON.parse(await readFile(new URL("./fixtures/incidents.json", import.meta.url), "utf8"));

function detailFor(changes = {}, observedAt = "2026-11-13T15:00:00Z") {
  const incident = {
    ...fixture.incidents[2],
    firstObservedAt: "2026-10-22T15:00:00Z",
    firstEstimatedEnd: "2026-10-24T12:00:00Z",
    estimatedEnd: "2026-11-15T12:00:00Z",
    ...changes,
  };
  const snapshot = { ...fixture, observedAt, count: 1, incidents: [incident] };
  return getIncidentDetailView(incident, snapshot);
}

test("leads with a plain deadline summary and preserves the affected address and incident type", () => {
  const view = detailFor();
  assert.equal(view.type, "Ремонт");
  assert.equal(view.addresses, fixture.incidents[2].addresses);
  assert.equal(view.deadline, "15 ноември 2026 г.");
  assert.equal(view.remaining, "Остават 2 дни.");
  assert.equal(view.overdue, false);
  assert.deepEqual(view.position, { position: 1, total: 1 });
});

test("distinguishes a singular remaining day, a same-day deadline and an overdue deadline", () => {
  const cases = [
    ["2026-11-14T12:00:00Z", "Остава 1 ден.", false],
    ["2026-11-13T12:00:00Z", "Срокът е в деня на проверката.", false],
    ["2026-11-12T12:00:00Z", "Срокът е минал с 1 ден.", true],
    ["2026-11-11T12:00:00Z", "Срокът е минал с 2 дни.", true],
  ];
  for (const [estimatedEnd, remaining, overdue] of cases) {
    const view = detailFor({ estimatedEnd });
    assert.equal(view.remaining, remaining);
    assert.equal(view.overdue, overdue);
  }
});

test("keeps each observation's check date separate from its promised completion date", () => {
  const view = detailFor();
  assert.deepEqual(view.observations, [
    {
      label: "При първата ни проверка",
      checkedDate: "22 октомври 2026 г.",
      deadline: "24 октомври 2026 г.",
      remaining: "Тогава оставаха 2 дни.",
    },
    {
      label: "При последната проверка",
      checkedDate: "13 ноември 2026 г.",
      deadline: "15 ноември 2026 г.",
      remaining: "Остават 2 дни.",
    },
  ]);
  assert.equal(view.change, "22 дни по-късно");
  assert.equal(view.historyNote, "Показваме първата и последната проверка. Нямаме данни кога са направени промените между тях.");
});

test("a missing first check omits its dated card while retaining the current deadline", () => {
  const view = detailFor({ firstObservedAt: null });
  assert.equal(view.observations.length, 1);
  assert.equal(view.observations[0].label, "При последната проверка");
  assert.equal(view.observations[0].deadline, "15 ноември 2026 г.");
  assert.equal(view.firstObserved, "Нямаме по-стара проверка");
  assert.equal(view.historyNote, "Показваме последната проверка. Нямаме по-стара проверка с дата.");
  assert.doesNotMatch(view.historyNote, /първата и последната/);
});

test("a first check at the current capture does not imply two separate historical observations", () => {
  const view = detailFor({ firstObservedAt: "2026-11-13T15:00:00Z" });
  assert.equal(view.observations.length, 1);
  assert.equal(view.observations[0].label, "При последната проверка");
  assert.match(view.historyNote, /Нямаме по-стара проверка с дата/);
  assert.doesNotMatch(view.historyNote, /първата и последната/);
});

test("unknown first and current deadlines remain distinct and never become zero days", () => {
  const firstMissing = detailFor({ firstEstimatedEnd: null });
  assert.equal(firstMissing.change, null);
  assert.equal(firstMissing.observations[0].deadline, "Няма запазен срок");
  assert.equal(firstMissing.observations[0].remaining, "Нямаме данни за срока при тази проверка.");
  assert.equal(firstMissing.observations[1].remaining, "Остават 2 дни.");

  const currentMissing = detailFor({ estimatedEnd: null });
  assert.equal(currentMissing.deadline, "Няма обявен срок");
  assert.equal(currentMissing.remaining, "Няма обявена дата за приключване.");
  assert.equal(currentMissing.overdue, false);
  assert.equal(currentMissing.change, null);
  assert.equal(currentMissing.observations[1].remaining, "Няма обявена дата за приключване.");
  assert.doesNotMatch(currentMissing.remaining, /0 дни|в деня на проверката/);
});

test("describes earlier, matching, later and fractional changes against the first saved deadline", () => {
  const cases = [
    ["2026-11-17T12:00:00Z", "2 дни по-рано"],
    ["2026-11-15T12:00:00Z", "Същият срок като при първата ни проверка"],
    ["2026-11-14T12:00:00Z", "1 ден по-късно"],
    ["2026-11-14T00:00:00Z", "Около 2 дни по-късно"],
    ["2026-11-15T00:00:00Z", "По-малко от 1 ден по-късно"],
    ["2026-11-16T00:00:00Z", "По-малко от 1 ден по-рано"],
  ];
  for (const [firstEstimatedEnd, expected] of cases) {
    assert.equal(detailFor({ firstEstimatedEnd }).change, expected);
  }
});

test("uses source calendar deadlines and the snapshot's Sofia date without changing timestamps", () => {
  const input = structuredClone(fixture);
  input.observedAt = "2026-11-13T22:30:00Z";
  input.incidents[2].estimatedEnd = "2026-11-15T23:59:00-05:00";
  input.incidents[2].firstObservedAt = "2026-10-22T21:30:00Z";
  input.incidents[2].firstEstimatedEnd = "2026-10-24T23:59:00Z";
  const original = structuredClone(input);

  const view = getIncidentDetailView(input.incidents[2], input);

  assert.equal(view.checkedDate, "14 ноември 2026 г.");
  assert.equal(view.deadline, "15 ноември 2026 г.");
  assert.equal(view.remaining, "Остава 1 ден.");
  assert.equal(view.observations[0].checkedDate, "23 октомври 2026 г.");
  assert.equal(view.observations[0].deadline, "24 октомври 2026 г.");
  assert.equal(view.observations[0].remaining, "Тогава оставаше 1 ден.");
  assert.deepEqual(input, original);
});

test("an invalid deadline cannot appear as a same-day or zero-day estimate", () => {
  const view = detailFor({ estimatedEnd: "not-a-date", firstEstimatedEnd: null });
  assert.equal(view.remaining, "Няма обявена дата за приключване.");
  assert.equal(view.overdue, false);
  assert.equal(view.change, null);
  assert.doesNotMatch(view.remaining, /0 дни|в деня на проверката/);
});

test("daily table distinguishes missing captures, listing absence and an unknown recorded deadline", () => {
  const first = { ...fixture, observedAt: "2026-11-07T20:00:00Z" };
  const absent = { ...fixture, observedAt: "2026-11-09T21:30:00Z", count: 0, incidents: [] };
  const unknown = structuredClone(fixture);
  unknown.observedAt = "2026-11-10T20:30:00Z";
  unknown.incidents[2].estimatedEnd = null;
  const history = {
    sourceType: "toplo-bg",
    locality: "bg.sofia",
    startDate: "2026-11-06",
    endDate: "2026-11-11",
    daily: [
      { date: "2026-11-06", snapshot: null },
      { date: "2026-11-07", snapshot: first },
      { date: "2026-11-08", snapshot: null },
      { date: "2026-11-09", snapshot: absent },
      { date: "2026-11-10", snapshot: unknown },
      { date: "2026-11-11", snapshot: fixture },
    ],
  };

  const view = getIncidentDailyView(history, fixture, "repair");

  assert.equal(view.period, "07.11.2026 г. до 11.11.2026 г.");
  assert.equal(view.rows.length, 5);
  assert.equal(view.rows[0].date, "2026-11-07");
  assert.equal(view.rows[1].checkedTime, "Няма дневна проверка");
  assert.equal(view.rows[1].dateLabel, "08.11.2026 г.");
  assert.equal(view.rows[1].positionLabel, "Няма данни");
  assert.equal(view.rows[2].positionLabel, "Не е в списъка (общо 0)");
  assert.equal(view.rows[2].dateLabel, "09.11.2026 г.");
  assert.equal(view.rows[2].deadlineLabel, "Не се прилага");
  assert.equal(view.rows[3].checkedTime, "22:30 ч.");
  assert.equal(view.rows[3].deadlineLabel, "Няма обявен срок");
  assert.equal(view.rows[4].positionLabel, "№ 2 от 3");
  assert.equal(view.rows[4].remainingLabel, "Тогава оставаха 12 дни.");
  assert.equal(view.comparison.deadline, null);
  assert.equal(view.comparison.position, "Мястото е без промяна.");
});

test("daily comparison names exact dates and describes earlier and later recorded deadlines", () => {
  for (const [estimate, expected] of [
    ["2026-11-22T23:59:00Z", "Обявеният срок е с 1 ден по-късен."],
    ["2026-11-24T23:59:00Z", "Обявеният срок е с 1 ден по-ранен."],
    ["2026-11-23T23:59:00Z", "Обявеният срок е без промяна."],
  ]) {
    const previous = structuredClone(fixture);
    previous.observedAt = "2026-11-10T20:30:00Z";
    previous.incidents[2].estimatedEnd = estimate;
    const history = {
      startDate: "2026-11-10",
      endDate: "2026-11-11",
      daily: [
        { date: "2026-11-10", snapshot: previous },
        { date: "2026-11-11", snapshot: fixture },
      ],
    };
    const view = getIncidentDailyView(history, fixture, "repair");
    assert.equal(view.comparison.label, "От 10.11.2026 г. до 11.11.2026 г.");
    assert.equal(view.comparison.deadline, expected);
    assert.doesNotMatch(view.comparison.label, /вчера/);
  }
});

test("daily change rows omit unchanged checks while retaining the full period and previous-day comparison", () => {
  const history = {
    startDate: "2026-11-09",
    endDate: "2026-11-11",
    daily: ["2026-11-09", "2026-11-10", "2026-11-11"].map((date) => {
      return { date, snapshot: { ...fixture, observedAt: date + "T15:00:00Z" } };
    }),
  };

  const view = getIncidentDailyView(history, fixture, "repair");

  assert.equal(view.period, "09.11.2026 г. до 11.11.2026 г.");
  assert.equal(view.rows.length, 1);
  assert.equal(view.rows[0].dateLabel, "09.11.2026 г.");
  assert.equal(view.rows[0].observedAt, "2026-11-09T15:00:00Z");
  assert.equal(view.rows[0].remainingLabel, "Тогава оставаха 14 дни.");
  assert.equal(view.comparison.label, "От 10.11.2026 г. до 11.11.2026 г.");
  assert.equal(view.comparison.deadline, "Обявеният срок е без промяна.");
});

test("repeated unavailable checks have a visible date range before the next known change", () => {
  const history = {
    startDate: "2026-11-07",
    endDate: "2026-11-11",
    daily: [
      { date: "2026-11-07", snapshot: { ...fixture, observedAt: "2026-11-07T15:00:00Z" } },
      { date: "2026-11-08", snapshot: null },
      { date: "2026-11-09", snapshot: null },
      { date: "2026-11-10", snapshot: null },
      { date: "2026-11-11", snapshot: fixture },
    ],
  };

  const view = getIncidentDailyView(history, fixture, "repair");

  assert.equal(view.rows.length, 3);
  assert.equal(view.rows[1].dateLabel, "08.11.2026 г. до 10.11.2026 г.");
  assert.equal(view.rows[1].checkedTime, "Няма дневна проверка");
  assert.equal(view.rows[1].observedAt, null);
  assert.equal(view.rows[2].dateLabel, "11.11.2026 г.");
  assert.equal(view.comparison, null);
});
