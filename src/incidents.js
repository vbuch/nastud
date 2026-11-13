import { formatObservedLabel, getSofiaDateKey } from "./app.js";
import { getIncidentPath } from "./incident-history.js";
import { getIncidentDetailView } from "./incident-view.js";

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

export function formatIncidentAge(incident, observedAt) {
  const days = getIncidentAgeDays(incident, observedAt);
  if (days === null) {
    return null;
  }
  if (incident.reportedStart.slice(0, 10) > getSofiaDateKey(observedAt)) {
    return "Посоченото начало е след датата на проверката.";
  }
  if (days === 0) {
    return "Началото е в деня на проверката.";
  }
  return "От посоченото начало: " + days + (days === 1 ? " ден" : " дни");
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
  if (!incident.estimatedEnd) {
    return "Няма обявен текущ срок за приключване.";
  }
  const days = getEstimateExtensionDays(incident);
  if (days === null) {
    return "Няма запазен първи срок за сравнение.";
  }
  if (days === 0) {
    return "Текущият срок съвпада с първия запазен срок.";
  }
  const absoluteDays = Math.abs(days);
  const rounded = Math.round(absoluteDays);
  let amount = "по-малко от 1 ден";
  if (absoluteDays >= 1) {
    const approximation = Number.isInteger(absoluteDays) ? "" : "около ";
    amount = approximation + rounded + (rounded === 1 ? " ден" : " дни");
  }
  const direction = days > 0 ? "по-късен" : "по-ранен";
  return "Текущият срок е с " + amount + " " + direction + " от първия запазен срок.";
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

function renderIncident(incident, observedAt, position) {
  const item = element("li", "st-incident");
  item.dataset.incidentId = incident.id;
  item.append(element("span", "st-incident-number", "№ " + position));
  const header = element("div", "st-incident-heading");
  const heading = element("h3");
  const titleLink = element("a", "st-incident-link", incident.name);
  titleLink.href = getIncidentPath(incident.id);
  titleLink.dataset.action = "heading";
  heading.append(titleLink);
  header.append(heading);
  header.append(element("span", "st-incident-type", incident.type === "accident" ? "Авария" : "Ремонт"));
  item.append(header);
  if (incident.addresses.trim()) {
    item.append(element("p", "st-incident-addresses", incident.addresses));
  }
  const age = formatIncidentAge(incident, observedAt);
  if (age !== null) {
    item.append(element("p", "st-incident-age", age));
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
  const detailLink = element("a", "st-incident-detail-link", "Виж подробности");
  detailLink.href = getIncidentPath(incident.id);
  detailLink.dataset.action = "detail";
  detailLink.setAttribute("aria-label", "Виж подробности: " + incident.name);
  item.append(detailLink);
  return item;
}

function renderOverview(view) {
  const overview = element("div", "st-incident-overview");
  const deadline = element("section", "st-incident-deadline-card");
  deadline.append(element("h2", "", "Обявен срок"));
  deadline.append(element("p", "st-incident-due-date", view.deadline));
  deadline.append(element("p", "st-incident-remaining", view.remaining));
  deadline.append(element("p", "st-incident-check-context", "Към последната проверка"));
  if (view.overdue) {
    deadline.append(element("p", "st-incident-flag", "Топлофикация все още публикува този запис."));
  }
  const position = element("section", "st-incident-position");
  position.append(element("h2", "", "Място в списъка"));
  const value = element("p", "st-incident-position-value", "№ " + view.position.position);
  value.append(element("span", "", " от " + view.position.total));
  position.append(value);
  position.append(element("p", "st-incident-position-note", "Подредено по начална дата, от най-старото към най-новото. Редът на отстраняване не е обявен."));
  overview.append(deadline, position);
  return overview;
}

function renderProgress(view) {
  const section = element("section", "st-incident-progress");
  section.append(element("h2", "", "Как се промени срокът"));
  if (view.change) {
    section.append(element("p", "st-incident-change", view.change));
    section.append(element("p", "st-incident-change-context", "Спрямо първия срок, който видяхме."));
  }
  const observations = element("ol", "st-incident-observations");
  for (const point of view.observations) {
    const item = element("li", "st-incident-observation");
    item.append(element("p", "st-incident-observation-label", point.label));
    item.append(element("p", "st-incident-observation-date", point.checkedDate));
    const deadline = element("p", "st-incident-observation-deadline");
    deadline.append(element("span", "", "Обявен край"));
    deadline.append(element("strong", "", point.deadline));
    item.append(deadline);
    item.append(element("p", "st-incident-observation-remaining", point.remaining));
    observations.append(item);
  }
  section.append(observations);
  section.append(element("p", "st-incident-history-note", view.historyNote));
  return section;
}

function renderMore(incident, observedAt, view) {
  const more = element("details", "st-incident-more");
  more.append(element("summary", "", "Още подробности"));
  const dates = element("dl", "st-incident-dates");
  dates.append(element("dt", "", "Обявено начало"));
  dates.append(element("dd", "", view.reportedStart));
  dates.append(element("dt", "", "Първа проверка при нас"));
  dates.append(element("dd", "", view.firstObserved));
  more.append(dates);
  const age = formatIncidentAge(incident, observedAt);
  if (age) {
    more.append(element("p", "st-incident-age", age));
  }
  if (view.changedStart) {
    more.append(element("p", "st-incident-flag", view.changedStart));
  }
  more.append(element("p", "st-incident-history-note", "Нямаме данни за предишните места в списъка."));
  return more;
}

export function startIncidentPage() {
  const page = document.getElementById("incident-page");
  const detail = document.getElementById("incident-detail");
  if (!page || !detail) {
    return;
  }
  let id = page.dataset.incidentId;
  if (!id) {
    try {
      const root = new URL(document.baseURI).pathname;
      const route = window.location.pathname.slice(root.length);
      const match = /^incident\/([A-Za-z0-9_-]+)\/$/.exec(route);
      if (match) {
        const binary = atob(match[1].replace(/-/g, "+").replace(/_/g, "/"));
        id = new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(binary, (character) => {
          return character.charCodeAt(0);
        }));
      }
    } catch {
      id = null;
    }
  }
  if (!id) {
    detail.replaceChildren(element("p", "", "Тази страница не е намерена."));
    return;
  }
  let snapshot = null;
  let pending = false;

  function render() {
    const incident = snapshot.incidents.find((entry) => {
      return entry.id === id;
    });
    const observed = document.getElementById("incident-page-observed");
    observed.textContent = "Последна проверка: " + formatObservedLabel(snapshot.observedAt).replace(/^към /, "") + ".";
    observed.dateTime = snapshot.observedAt;
    if (!incident) {
      detail.replaceChildren(element("p", "st-incident-unlisted", "Записът вече не е в текущия списък на Топлофикация. Няма потвърждение за приключване."));
      return;
    }
    document.getElementById("incident-page-heading").textContent = incident.name;
    const view = getIncidentDetailView(incident, snapshot);
    document.getElementById("incident-page-type").textContent = view.type;
    document.getElementById("incident-page-addresses").textContent = view.addresses;
    detail.replaceChildren(renderOverview(view), renderProgress(view), renderMore(incident, snapshot.observedAt, view));
  }

  function accept(value) {
    const next = normalizeIncidents(value);
    if (snapshot && Date.parse(next.observedAt) < Date.parse(snapshot.observedAt)) {
      return;
    }
    snapshot = next;
    render();
  }

  async function refresh() {
    if (pending || document.hidden) {
      return;
    }
    pending = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      controller.abort();
    }, 10000);
    try {
      const response = await fetch(new URL("./incidents.json", document.baseURI), { cache: "no-store", signal: controller.signal });
      if (!response.ok) {
        throw new Error("Incident listing unavailable");
      }
      accept(await response.json());
      document.getElementById("incident-page-notice").textContent = "";
    } catch {
      document.getElementById("incident-page-notice").textContent = snapshot
        ? "Не успяхме да обновим данните. Показваме последния запазен списък от проверката по-горе."
        : "Данните временно не са достъпни.";
    } finally {
      window.clearTimeout(timeout);
      pending = false;
    }
  }

  try {
    accept(JSON.parse(document.getElementById("initial-incidents").textContent));
  } catch {
    // Keep the initial HTML available if its bootstrap cannot be read.
  }
  refresh();
  document.addEventListener("visibilitychange", refresh);
  window.setInterval(refresh, 60000);
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
    const focused = list.contains(document.activeElement) ? document.activeElement : null;
    const focusedId = focused?.closest(".st-incident")?.dataset.incidentId;
    const focusedAction = focused?.dataset.action;
    const fragment = document.createDocumentFragment();
    for (const [index, incident] of incidents.entries()) {
      fragment.append(renderIncident(incident, snapshot.observedAt, index + 1));
    }
    list.replaceChildren(fragment);
    if (focusedId) {
      const item = [...list.children].find((entry) => {
        return entry.dataset.incidentId === focusedId;
      });
      const target = item?.querySelector('[data-action="' + focusedAction + '"]');
      if (target) {
        target.focus({ preventScroll: true });
      } else {
        sortSelect.focus({ preventScroll: true });
      }
    }
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
    openButton.removeAttribute("title");
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
        openButton.title = "Списъкът временно не е наличен";
      }
    } finally {
      window.clearTimeout(timeout);
      pendingRequest = false;
    }
  }

  function openList() {
    renderList();
    if (!dialog.open) {
      dialog.showModal();
    }
    refreshData();
  }

  openButton.addEventListener("click", openList);
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
  if (window.location?.hash === "#incidents") {
    openList();
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
  startIncidentPage();
}
