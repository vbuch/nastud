import { formatComparisonText, formatObservedLabel, getSofiaDateKey } from "./src/app.js";

export const SOURCE_URL = "https://toplo.bg/accidents-and-maintenance";

export function sofiaDate(value) {
  return getSofiaDateKey(value);
}

export function previousDate(date) {
  const value = new Date(date + "T12:00:00Z");
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
  });
}

export function serializeData(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

function validateCount(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("Timeline count must be a nonnegative integer");
  }
  return value;
}

function validateObservation(value) {
  if (!value || typeof value !== "object") {
    throw new Error("Timeline observation must be an object");
  }
  if (
    typeof value.observedAt !== "string"
    || !/(?:Z|[+-]\d{2}:\d{2})$/.test(value.observedAt)
    || !Number.isFinite(Date.parse(value.observedAt))
  ) {
    throw new Error("Timeline observation time is invalid");
  }
  return { count: validateCount(value.count), observedAt: new Date(value.observedAt).toISOString() };
}

function validateDaily(value) {
  const observation = validateObservation(value);
  if (typeof value.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.date) || sofiaDate(observation.observedAt) !== value.date) {
    throw new Error("Daily count date must match its source check date in Sofia");
  }
  return { date: value.date, ...observation };
}

export function normalizeTimeline(input) {
  if (!input || input.sourceType !== "toplo-bg" || input.locality !== "bg.sofia" || !Array.isArray(input.daily)) {
    throw new Error("Unexpected Toplo timeline response");
  }
  const current = input.current === null ? null : validateObservation(input.current);
  const points = new Map();
  for (const value of input.daily) {
    const point = validateDaily(value);
    points.set(point.date, point);
  }
  const daily = [...points.values()].sort((left, right) => {
    return left.date.localeCompare(right.date);
  });
  const baseline = current ? points.get(previousDate(sofiaDate(current.observedAt))) : null;
  const comparison = baseline ? { ...baseline, change: current.count - baseline.count } : null;
  return { sourceType: "toplo-bg", locality: "bg.sofia", sourceUrl: SOURCE_URL, current, daily, comparison };
}

export function presentation(timeline, now = new Date()) {
  const current = timeline.current;
  if (!current) {
    return {
      count: "?", observedLabel: "", currentDatetime: "", comparison: "",
      notice: "Очакваме актуални данни.", title: "Аварии и ремонти на Топлофикация | На студ",
      description: "Броят на авариите и ремонтите на Топлофикация София и как се променя през дните.",
    };
  }
  const observedLabel = formatObservedLabel(current.observedAt, now);
  const comparison = formatComparisonText(timeline.comparison, current, now);
  const age = now.getTime() - Date.parse(current.observedAt);
  const notice = age > 90 * 60 * 1000 ? "Показваме последните налични данни." : "";
  return {
    count: String(current.count), observedLabel, currentDatetime: current.observedAt, comparison, notice,
    title: current.count + " аварии и ремонти на Топлофикация | На студ",
    description: ["Топлофикация София: " + current.count + " аварии и ремонти " + observedLabel + ".", comparison, "Виж дневната история."].filter(Boolean).join(" "),
  };
}
