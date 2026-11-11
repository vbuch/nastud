import { formatObservedLabel, getSofiaDateKey } from "./app.js";

const SOURCE_URL = "https://toplo.bg/accidents-and-maintenance";
const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;
const MAX_INCIDENTS = 10000;
const SORTS = new Set(["oldest", "longest-extension", "newest", "earliest-estimate"]);
const sourceDateFormatter = new Intl.DateTimeFormat("bg-BG", {
  timeZone: "UTC",
  day: "numeric",
  month: "long",
  year: "numeric",
});

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isTimestamp(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return false;
  }
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) {
    return false;
  }
  const date = value.slice(0, 10);
  return new Date(Date.parse(date + "T12:00:00Z")).toISOString().slice(0, 10) === date;
}

function nullableTimestamp(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (!isTimestamp(value)) {
    throw new Error("Invalid incident date");
  }
  return value;
}

function requiredText(value, field) {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 20000) {
    throw new Error("Invalid incident " + field);
  }
  return value;
}

export function normalizeIncidents(input) {
  if (
    !isRecord(input)
    || input.sourceType !== "toplo-bg"
    || input.locality !== "bg.sofia"
    || !isTimestamp(input.observedAt)
    || !Number.isSafeInteger(input.count)
    || input.count < 0
    || !Array.isArray(input.incidents)
    || input.incidents.length > MAX_INCIDENTS
    || input.incidents.length !== input.count
  ) {
    throw new Error("Invalid Toplo incident listing");
  }
  const ids = new Set();
  const accidentIds = new Set();
  const incidents = input.incidents.map((value) => {
    if (!isRecord(value) || !["accident", "repair"].includes(value.type) || !Number.isSafeInteger(value.status)) {
      throw new Error("Invalid Toplo incident");
    }
    const id = requiredText(value.id, "identity");
    const accidentId = requiredText(value.accidentId, "accident identity");
    if (ids.has(id) || accidentIds.has(accidentId)) {
      throw new Error("Duplicate Toplo incident identity");
    }
    ids.add(id);
    accidentIds.add(accidentId);
    if (typeof value.addresses !== "string" || value.addresses.length > 20000) {
      throw new Error("Invalid incident addresses");
    }
    return {
      id,
      accidentId,
      name: requiredText(value.name, "name"),
      addresses: value.addresses,
      type: value.type,
      status: value.status,
      reportedStart: nullableTimestamp(value.reportedStart),
      estimatedEnd: nullableTimestamp(value.estimatedEnd),
      createdAt: nullableTimestamp(value.createdAt),
      firstObservedAt: nullableTimestamp(value.firstObservedAt),
      firstReportedStart: nullableTimestamp(value.firstReportedStart),
      firstEstimatedEnd: nullableTimestamp(value.firstEstimatedEnd),
    };
  });
  return {
    sourceType: "toplo-bg",
    locality: "bg.sofia",
    sourceUrl: SOURCE_URL,
    observedAt: input.observedAt,
    count: input.count,
    incidents,
  };
}

function timestamp(value) {
  return value === null ? null : Date.parse(value);
}

export function getIncidentAgeDays(incident, observedAt) {
  if (!incident.reportedStart || !isTimestamp(observedAt)) {
    return null;
  }
  const startDay = Date.parse(incident.reportedStart.slice(0, 10) + "T12:00:00Z");
  const observedDay = Date.parse(getSofiaDateKey(observedAt) + "T12:00:00Z");
  return Math.max(0, Math.round((observedDay - startDay) / DAY_MILLISECONDS));
}

export function getEstimateExtensionDays(incident) {
  if (!incident.estimatedEnd || !incident.firstEstimatedEnd) {
    return null;
  }
  return (Date.parse(incident.estimatedEnd) - Date.parse(incident.firstEstimatedEnd)) / DAY_MILLISECONDS;
}

export function hasChangedStart(incident) {
  return incident.reportedStart !== null
    && incident.firstReportedStart !== null
    && Date.parse(incident.reportedStart) !== Date.parse(incident.firstReportedStart);
}

function compareNullable(left, right, descending) {
  if (left === null && right === null) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }
  return descending ? right - left : left - right;
}

export function sortIncidents(incidents, sort = "oldest") {
  if (!SORTS.has(sort)) {
    throw new Error("Unknown incident sort");
  }
  return [...incidents].sort((left, right) => {
    let comparison;
    if (sort === "longest-extension") {
      comparison = compareNullable(getEstimateExtensionDays(left), getEstimateExtensionDays(right), true);
    } else if (sort === "earliest-estimate") {
      comparison = compareNullable(timestamp(left.estimatedEnd), timestamp(right.estimatedEnd), false);
    } else {
      comparison = compareNullable(timestamp(left.reportedStart), timestamp(right.reportedStart), sort === "newest");
    }
    return comparison || left.name.localeCompare(right.name, "bg") || left.id.localeCompare(right.id);
  });
}

export function formatIncidentDate(value) {
  if (!value || !isTimestamp(value)) {
    return "Няма обявена дата";
  }
  return sourceDateFormatter.format(new Date(value.slice(0, 10) + "T12:00:00Z"));
}

export function formatExtension(incident) {
  const days = getEstimateExtensionDays(incident);
  if (days === null) {
    return "Няма запазен първи срок за сравнение";
  }
  if (days === 0) {
    return "Срокът е същият като при първия запис";
  }
  const rounded = Math.round(Math.abs(days));
  const amount = rounded === 0 ? "по-малко от ден" : rounded === 1 ? "около 1 ден" : "около " + rounded + " дни";
  return "Срокът е с " + amount + (days > 0 ? " по-късно" : " по-рано");
}

export function getIncidentsNotice(snapshot, now = new Date(), refreshFailed = false) {
  if (!snapshot) {
    return "Списъкът временно не е наличен.";
  }
  if (refreshFailed || new Date(now).getTime() - Date.parse(snapshot.observedAt) > 90 * 60 * 1000) {
    return "Показваме последния запазен списък и часа на проверката му.";
  }
  return "";
}

function element(tagName, className, text) {
  const node = document.createElement(tagName);
  if (className) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

function addDate(details, label, value) {
  details.append(element("dt", "", label));
  details.append(element("dd", "", formatIncidentDate(value)));
}

function renderIncident(incident, observedAt) {
  const item = element("li", "st-incident");
  const header = element("div", "st-incident-heading");
  header.append(element("h3", "", incident.name));
  header.append(element("span", "st-incident-type", incident.type === "accident" ? "Авария" : "Ремонт"));
  item.append(header);
  if (incident.addresses.trim()) {
    item.append(element("p", "st-incident-addresses", incident.addresses));
  }
  const age = getIncidentAgeDays(incident, observedAt);
  if (age !== null) {
    const ageText = age === 1 ? "1 ден" : age + " дни";
    item.append(element("p", "st-incident-age", ageText + " по обявеното начало"));
  }
  const details = element("dl", "st-incident-dates");
  addDate(details, "Обявено начало", incident.reportedStart);
  addDate(details, "Текущ срок", incident.estimatedEnd);
  addDate(details, "Първи запазен срок", incident.firstEstimatedEnd);
  item.append(details);
  item.append(element("p", "st-incident-extension", formatExtension(incident)));
  if (incident.estimatedEnd && incident.estimatedEnd.slice(0, 10) < getSofiaDateKey(observedAt)) {
    item.append(element("p", "st-incident-flag", "Текущият срок е минал, а записът още е в списъка."));
  }
  if (hasChangedStart(incident)) {
    item.append(element("p", "st-incident-flag", "Обявеното начало е променено от " + formatIncidentDate(incident.firstReportedStart)));
  }
  const firstCapture = incident.firstObservedAt
    ? formatIncidentDate(getSofiaDateKey(incident.firstObservedAt) + "T12:00:00Z")
    : null;
  item.append(element("p", "st-incident-first-capture", firstCapture ? "Първи запис при нас: " + firstCapture : "Няма запазена дата на първи запис."));
  return item;
}

export function startIncidents() {
  const openButton = document.getElementById("incidents-open");
  const dialog = document.getElementById("incidents-dialog");
  const closeButton = document.getElementById("incidents-close");
  const sortSelect = document.getElementById("incidents-sort");
  const typeSelect = document.getElementById("incidents-type");
  const list = document.getElementById("incidents-list");
  const observed = document.getElementById("incidents-observed");
  const notice = document.getElementById("incidents-notice");
  const summary = document.getElementById("incidents-summary");
  const empty = document.getElementById("incidents-empty");
  if (!openButton || !dialog || !closeButton || !sortSelect || !typeSelect || !list || !observed || !notice || !summary || !empty) {
    return;
  }
  let snapshot = null;
  let pendingRequest = false;
  let refreshFailed = false;

  function updateNotice() {
    notice.textContent = getIncidentsNotice(snapshot, new Date(), refreshFailed);
  }

  function renderList() {
    if (!snapshot) {
      updateNotice();
      return;
    }
    const matching = snapshot.incidents.filter((incident) => {
      return typeSelect.value === "all" || incident.type === typeSelect.value;
    });
    const incidents = sortIncidents(matching, sortSelect.value);
    const fragment = document.createDocumentFragment();
    for (const incident of incidents) {
      fragment.append(renderIncident(incident, snapshot.observedAt));
    }
    list.replaceChildren(fragment);
    const accidents = snapshot.incidents.filter((incident) => {
      return incident.type === "accident";
    }).length;
    const repairs = snapshot.count - accidents;
    summary.textContent = "Показани: " + incidents.length + " от " + snapshot.count + ". Общо " + accidents + " аварии и " + repairs + " ремонта.";
    observed.textContent = "Данни " + formatObservedLabel(snapshot.observedAt) + ".";
    observed.dateTime = snapshot.observedAt;
    empty.hidden = incidents.length > 0;
    empty.textContent = snapshot.count === 0 ? "Няма обявени аварии и ремонти при тази проверка." : "Няма записи от избрания вид.";
    updateNotice();
  }

  function acceptData(value) {
    const next = normalizeIncidents(value);
    if (snapshot && Date.parse(next.observedAt) < Date.parse(snapshot.observedAt)) {
      return;
    }
    snapshot = next;
    refreshFailed = false;
    openButton.disabled = false;
    openButton.textContent = "Виж всички аварии и ремонти (" + snapshot.count + ")";
    renderList();
  }

  async function refreshData() {
    if (pendingRequest || document.hidden) {
      return;
    }
    pendingRequest = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      controller.abort();
    }, 10000);
    try {
      const url = new URL("./incidents.json", document.baseURI);
      url.searchParams.set("v", String(Math.floor(Date.now() / 60000)));
      const response = await fetch(url, { cache: "no-store", signal: controller.signal });
      if (!response.ok) {
        throw new Error("Incident listing unavailable");
      }
      acceptData(await response.json());
    } catch {
      refreshFailed = true;
      updateNotice();
      if (!snapshot) {
        openButton.textContent = "Списъкът временно не е наличен";
      }
    } finally {
      window.clearTimeout(timeout);
      pendingRequest = false;
    }
  }

  openButton.addEventListener("click", () => {
    renderList();
    dialog.showModal();
    refreshData();
  });
  closeButton.addEventListener("click", () => {
    dialog.close();
  });
  dialog.addEventListener("close", () => {
    openButton.focus();
  });
  sortSelect.addEventListener("change", renderList);
  typeSelect.addEventListener("change", renderList);
  const initial = document.getElementById("initial-incidents");
  if (initial?.textContent.trim()) {
    try {
      const data = JSON.parse(initial.textContent);
      if (data !== null) {
        acceptData(data);
      }
    } catch {
      updateNotice();
    }
  }
  refreshData();
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      updateNotice();
      refreshData();
    }
  });
  window.setInterval(() => {
    updateNotice();
    if (dialog.open || !snapshot) {
      refreshData();
    }
  }, 60000);
}

if (typeof document !== "undefined") {
  startIncidents();
}
