import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getIncidentDetailView } from "../src/incident-view.js";

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
