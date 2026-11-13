import { getSofiaDateKey } from "./app.js";
import { sortIncidents } from "./incidents.js";

const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;

function isTimestamp(value) {
  if (
    typeof value !== "string"
    || !/^\d{4}-\d{2}-\d{2}T/.test(value)
    || !/(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    || !Number.isFinite(Date.parse(value))
  ) {
    return false;
  }
  const date = value.slice(0, 10);
  return new Date(date + "T12:00:00Z").toISOString().slice(0, 10) === date;
}

export function getIncidentPath(id) {
  const bytes = new TextEncoder().encode(id);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  const encoded = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return "incident/" + encoded + "/";
}

export function getIncidentPosition(snapshot, id) {
  if (!snapshot) {
    return null;
  }
  const incidents = sortIncidents(snapshot.incidents, "oldest");
  const index = incidents.findIndex((incident) => {
    return incident.id === id;
  });
  if (index === -1) {
    return null;
  }
  return { position: index + 1, total: incidents.length };
}

export function getRemainingDays(estimatedEnd, observedAt) {
  if (!isTimestamp(estimatedEnd) || !isTimestamp(observedAt)) {
    return null;
  }
  const deadlineDay = Date.parse(estimatedEnd.slice(0, 10) + "T12:00:00Z");
  const observedDay = Date.parse(getSofiaDateKey(observedAt) + "T12:00:00Z");
  return Math.round((deadlineDay - observedDay) / DAY_MILLISECONDS);
}

export function formatRemainingDays(estimatedEnd, observedAt) {
  const days = getRemainingDays(estimatedEnd, observedAt);
  if (days === null) {
    return "Няма обявен текущ срок за приключване.";
  }
  if (days === 0) {
    return "Текущият срок е в деня на проверката.";
  }
  if (days < 0) {
    const amount = Math.abs(days);
    return "Текущият срок е минал с " + amount + (amount === 1 ? " ден." : " дни.");
  }
  if (days === 1) {
    return "Остава 1 ден до текущия срок.";
  }
  return "Остават " + days + " дни до текущия срок.";
}

function progressPoint(observedAt, estimatedEnd, kind) {
  return {
    observedAt,
    date: getSofiaDateKey(observedAt),
    estimatedEnd: estimatedEnd ?? null,
    remainingDays: getRemainingDays(estimatedEnd, observedAt),
    kind,
  };
}

export function getIncidentProgress(incident, observedAt) {
  if (!isTimestamp(observedAt)) {
    return [];
  }
  const points = [];
  if (
    isTimestamp(incident.firstObservedAt)
    && Date.parse(incident.firstObservedAt) < Date.parse(observedAt)
  ) {
    points.push(progressPoint(incident.firstObservedAt, incident.firstEstimatedEnd, "first"));
  }
  points.push(progressPoint(observedAt, incident.estimatedEnd, "current"));
  return points;
}
