import { getSofiaDateKey } from "./app.js";
import { getIncidentPosition, getRemainingDays } from "./incident-history.js";
import { normalizeIncidents } from "./incidents.js";

export const DAILY_HISTORY_DAYS = 14;

const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000-")) {
    return false;
  }
  const instant = Date.parse(value + "T12:00:00Z");
  return Number.isFinite(instant) && new Date(instant).toISOString().slice(0, 10) === value;
}

function shiftDate(date, offset) {
  return new Date(Date.parse(date + "T12:00:00Z") + offset * DAY_MILLISECONDS).toISOString().slice(0, 10);
}

function datesBetween(startDate, endDate) {
  const dates = [];
  for (let date = startDate; date <= endDate; date = shiftDate(date, 1)) {
    dates.push(date);
  }
  return dates;
}

export function getDailyHistoryDates(observedAt) {
  if (
    typeof observedAt !== "string"
    || !/^\d{4}-\d{2}-\d{2}T/.test(observedAt)
    || !/(?:Z|[+-]\d{2}:\d{2})$/.test(observedAt)
    || !Number.isFinite(Date.parse(observedAt))
    || !isDate(observedAt.slice(0, 10))
  ) {
    throw new Error("Invalid daily history observation time");
  }
  const endDate = getSofiaDateKey(observedAt);
  const startDate = shiftDate(endDate, 1 - DAILY_HISTORY_DAYS);
  if (!isDate(startDate) || !isDate(endDate)) {
    throw new Error("Invalid daily history period");
  }
  return datesBetween(startDate, endDate);
}

export function normalizeIncidentDailyHistory(input) {
  if (
    !isRecord(input)
    || input.sourceType !== "toplo-bg"
    || input.locality !== "bg.sofia"
    || !isDate(input.startDate)
    || !isDate(input.endDate)
    || input.startDate > input.endDate
    || !Array.isArray(input.daily)
  ) {
    throw new Error("Invalid incident daily history");
  }
  const days = (Date.parse(input.endDate + "T12:00:00Z") - Date.parse(input.startDate + "T12:00:00Z")) / DAY_MILLISECONDS + 1;
  if (days > DAILY_HISTORY_DAYS || input.daily.length !== days) {
    throw new Error("Invalid incident daily history period");
  }
  const captureIds = new Set();
  const daily = input.daily.map((entry, index) => {
    if (!isRecord(entry) || entry.date !== shiftDate(input.startDate, index)) {
      throw new Error("Daily incident dates must cover the complete period in order");
    }
    if (entry.snapshot === null) {
      return { date: entry.date, snapshot: null };
    }
    const snapshot = normalizeIncidents(entry.snapshot);
    if (getSofiaDateKey(snapshot.observedAt) !== entry.date) {
      throw new Error("Daily incident capture does not match its Sofia date");
    }
    const identity = snapshot.sourceType + "/" + snapshot.locality + "/" + Date.parse(snapshot.observedAt);
    if (captureIds.has(identity)) {
      throw new Error("Duplicate daily incident capture");
    }
    captureIds.add(identity);
    return { date: entry.date, snapshot };
  });
  return {
    sourceType: "toplo-bg",
    locality: "bg.sofia",
    startDate: input.startDate,
    endDate: input.endDate,
    daily,
  };
}

function dailyRow(date, snapshot, id) {
  const row = {
    date,
    observedAt: snapshot?.observedAt ?? null,
    state: "unavailable",
    position: null,
    total: snapshot?.count ?? null,
    estimatedEnd: null,
    remainingDays: null,
  };
  if (!snapshot) {
    return row;
  }
  const incident = snapshot.incidents.find((entry) => {
    return entry.id === id;
  });
  if (!incident) {
    return { ...row, state: "absent" };
  }
  return {
    ...row,
    state: "present",
    position: getIncidentPosition(snapshot, id).position,
    estimatedEnd: incident.estimatedEnd,
    remainingDays: getRemainingDays(incident.estimatedEnd, snapshot.observedAt),
  };
}

export function getIncidentDailyRows(history, snapshot, id) {
  if (!history || !snapshot) {
    return [];
  }
  const endDate = getSofiaDateKey(snapshot.observedAt);
  const windowStart = shiftDate(endDate, 1 - DAILY_HISTORY_DAYS);
  let startDate = history.startDate > windowStart ? history.startDate : windowStart;
  if (startDate > endDate) {
    startDate = endDate;
  }
  const captures = new Map(history.daily.map((entry) => {
    return [entry.date, entry.snapshot];
  }));
  captures.set(endDate, snapshot);
  const rows = datesBetween(startDate, endDate).map((date) => {
    return dailyRow(date, captures.get(date) ?? null, id);
  });
  const firstAppearance = rows.findIndex((row) => {
    return row.state === "present";
  });
  return firstAppearance === -1 ? [] : rows.slice(firstAppearance);
}

export function getIncidentDailyChangeRows(rows) {
  const changes = [];
  for (const row of rows) {
    const previous = changes.at(-1);
    const unchanged = previous
      && previous.state === row.state
      && previous.total === row.total
      && previous.position === row.position
      && (previous.estimatedEnd?.slice(0, 10) ?? null) === (row.estimatedEnd?.slice(0, 10) ?? null);
    if (unchanged) {
      if (previous.state !== "present") {
        previous.throughDate = row.date;
      }
      continue;
    }
    const change = { ...row };
    if (change.state !== "present") {
      change.throughDate = change.date;
    }
    changes.push(change);
  }
  return changes;
}

export function getIncidentDailyComparison(history, snapshot, id) {
  const rows = getIncidentDailyRows(history, snapshot, id);
  if (rows.length < 2) {
    return null;
  }
  const current = rows.at(-1);
  const previous = rows.at(-2);
  if (previous.state !== "present" || current.state !== "present") {
    return null;
  }
  let deadlineChangeDays = null;
  if (current.estimatedEnd !== null && previous.estimatedEnd !== null) {
    deadlineChangeDays = (Date.parse(current.estimatedEnd) - Date.parse(previous.estimatedEnd)) / DAY_MILLISECONDS;
  }
  return {
    previousDate: previous.date,
    currentDate: current.date,
    positionChange: current.position - previous.position,
    deadlineChangeDays,
  };
}
