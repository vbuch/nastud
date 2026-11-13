import { normalizeWeather } from "./weather.js";

const SOFIA_TIME_ZONE = "Europe/Sofia";
const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const HEATING_SEASON_START = "2026-10-29";
const TIMELINE_MILESTONES = [
  {
    date: HEATING_SEASON_START,
    label: "Поетапно пускане на отоплението",
    sourceUrl: "https://toplo.bg/heating_season2627",
    announcedOn: "2026-10-28",
  },
];

const dayPartsFormatter = new Intl.DateTimeFormat("en", {
  timeZone: SOFIA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const timeFormatter = new Intl.DateTimeFormat("bg-BG", {
  timeZone: SOFIA_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const axisDateFormatter = new Intl.DateTimeFormat("bg-BG", {
  timeZone: SOFIA_TIME_ZONE,
  day: "numeric",
  month: "short",
});

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isTimestamp(value) {
  return typeof value === "string"
    && /(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function isDateKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const timestamp = Date.parse(value + "T12:00:00Z");
  return Number.isFinite(timestamp)
    && new Date(timestamp).toISOString().slice(0, 10) === value;
}

export function getSofiaDateKey(value) {
  const parts = dayPartsFormatter.formatToParts(new Date(value));
  const fields = Object.fromEntries(parts.map((part) => {
    return [part.type, part.value];
  }));
  return fields.year + "-" + fields.month + "-" + fields.day;
}

export function formatObservedLabel(observedAt, now = new Date()) {
  if (!isTimestamp(observedAt)) {
    return "към последната проверка";
  }
  const observed = new Date(observedAt);
  return "към " + timeFormatter.format(observed) + " на " + formatCalendarDate(getSofiaDateKey(observed), now);
}

function formatCalendarDate(date, now = new Date()) {
  const today = getSofiaDateKey(now);
  const options = {
    timeZone: SOFIA_TIME_ZONE,
    day: "numeric",
    month: "long",
  };
  if (today.slice(0, 4) !== date.slice(0, 4)) {
    options.year = "numeric";
  }
  return new Intl.DateTimeFormat("bg-BG", options).format(new Date(date + "T12:00:00Z"));
}

export function formatComparisonText(comparison, current, now = new Date()) {
  if (!comparison || !current) {
    return "";
  }
  const today = getSofiaDateKey(now);
  const yesterday = new Date(Date.parse(today + "T12:00:00Z") - DAY_MILLISECONDS)
    .toISOString().slice(0, 10);
  const reference = getSofiaDateKey(current.observedAt) === today && comparison.date === yesterday
    ? "вчера"
    : formatCalendarDate(comparison.date, now);
  const change = current.count - comparison.count;

  if (change === 0) {
    return "Без промяна от " + reference + ".";
  }
  const direction = change < 0 ? "по-малко" : "повече";
  return "С " + Math.abs(change) + " " + direction + " от " + reference + ".";
}

export function getDataNotice(current) {
  return current ? "" : "В момента няма актуални данни.";
}

export function normalizeTimeline(value) {
  if (!isRecord(value) || !Array.isArray(value.daily) || value.daily.length > 10000) {
    throw new Error("Invalid timeline response");
  }
  const current = value.current;
  if (current !== null && (!isRecord(current) || !isCount(current.count) || !isTimestamp(current.observedAt))) {
    throw new Error("Invalid current count");
  }

  const records = new Map();
  for (const record of value.daily) {
    if (!isRecord(record) || !isDateKey(record.date) || !isCount(record.count) || !isTimestamp(record.observedAt)) {
      throw new Error("Invalid daily count");
    }
    const previous = records.get(record.date);
    if (!previous || Date.parse(previous.observedAt) < Date.parse(record.observedAt)) {
      records.set(record.date, {
        date: record.date,
        count: record.count,
        observedAt: record.observedAt,
      });
    }
  }

  const comparison = value.comparison ?? null;
  if (comparison !== null && (
    !isRecord(comparison)
    || !isDateKey(comparison.date)
    || !isCount(comparison.count)
    || !isTimestamp(comparison.observedAt)
    || !current
    || !Number.isSafeInteger(comparison.change)
    || comparison.change !== current.count - comparison.count
  )) {
    throw new Error("Invalid comparison");
  }

  return {
    sourceType: typeof value.sourceType === "string" ? value.sourceType : "toplo-bg",
    locality: typeof value.locality === "string" ? value.locality : "bg.sofia",
    sourceUrl: "https://toplo.bg/accidents-and-maintenance",
    current: current ? { count: current.count, observedAt: current.observedAt } : null,
    daily: [...records.values()].sort((left, right) => {
      return left.date.localeCompare(right.date);
    }),
    comparison,
    weather: normalizeWeather(value.weather ?? null),
  };
}

export function getTimelinePoints(data) {
  const points = new Map(data.daily.map((record) => {
    return [record.date, { ...record, isCurrent: false }];
  }));
  if (data.current) {
    const date = getSofiaDateKey(data.current.observedAt);
    const previous = points.get(date);
    if (!previous || Date.parse(previous.observedAt) <= Date.parse(data.current.observedAt)) {
      points.set(date, { date, ...data.current, isCurrent: true });
    }
  }
  return [...points.values()].sort((left, right) => {
    return left.date.localeCompare(right.date);
  });
}

export function getTimelineRange(points, now = new Date()) {
  if (points.length === 0) {
    return null;
  }
  const today = getSofiaDateKey(now);
  const monthStart = new Date(today.slice(0, 7) + "-01T12:00:00Z");
  const previousMonthEnd = new Date(monthStart.getTime() - DAY_MILLISECONDS);
  const previousMonthDay = Math.min(Number(today.slice(8, 10)), previousMonthEnd.getUTCDate());
  const monthAgo = previousMonthEnd.toISOString().slice(0, 8) + String(previousMonthDay).padStart(2, "0");
  const start = monthAgo < HEATING_SEASON_START ? monthAgo : HEATING_SEASON_START;
  const end = points[points.length - 1].date;
  return end >= start ? { start, end } : null;
}

export function getWeatherPoints(weather, incidentPoints, range = null) {
  if (!weather || incidentPoints.length === 0) {
    return [];
  }
  const first = range?.start ?? incidentPoints[0].date;
  const last = range?.end ?? incidentPoints[incidentPoints.length - 1].date;
  return weather.daily.filter((point) => {
    return point.date >= first && point.date <= last;
  });
}

export function getTimelineMilestones(points, now = new Date()) {
  const range = getTimelineRange(points, now);
  if (!range) {
    return [];
  }
  return TIMELINE_MILESTONES.filter((milestone) => {
    return milestone.date >= range.start && milestone.date <= range.end;
  });
}

export function getDailyChange(points, date) {
  const previousDate = new Date(Date.parse(date + "T12:00:00Z") - DAY_MILLISECONDS)
    .toISOString().slice(0, 10);
  const point = points.find((record) => {
    return record.date === date;
  });
  const previous = points.find((record) => {
    return record.date === previousDate;
  });
  return point && previous ? point.count - previous.count : null;
}

export function formatDailyChange(change) {
  if (!Number.isFinite(change)) {
    return "";
  }
  const arrow = change > 0 ? "↑" : change < 0 ? "↓" : "→";
  return arrow + " " + Math.abs(change);
}

export function formatTemperature(meanC) {
  if (!Number.isFinite(meanC)) {
    return "няма температура";
  }
  return new Intl.NumberFormat("bg-BG", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(meanC) + " °C";
}

export function makeTemperatureAxis(points) {
  const values = points.filter((point) => {
    return Number.isFinite(point.meanC);
  }).map((point) => {
    return point.meanC;
  });
  if (values.length === 0) {
    return null;
  }
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const step = Math.max(5, Math.ceil((maximum - minimum) / 15) * 5);
  const low = Math.floor((minimum - 1) / step) * step;
  const high = Math.max(low + step * 2, Math.ceil((maximum + 1) / step) * step);
  const ticks = [];
  for (let value = low; value <= high; value += step) {
    ticks.push(value);
  }
  return { low, high, ticks };
}

export function makeTimelinePath(points) {
  let path = "";
  let previous = null;
  for (const point of points) {
    if (!Number.isFinite(point.y)) {
      previous = null;
      continue;
    }
    const command = !previous || point.timestamp - previous.timestamp > DAY_MILLISECONDS * 1.1 ? "M" : "L";
    path += command + point.x + "," + point.y + " ";
    previous = point;
  }
  return path.trim();
}

function svgElement(name, attributes, text) {
  const element = document.createElementNS(SVG_NAMESPACE, name);
  for (const [attribute, value] of Object.entries(attributes)) {
    element.setAttribute(attribute, String(value));
  }
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

function makeYAxis(points) {
  const values = points.map((point) => {
    return point.count;
  });
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const span = Math.max(4, maximum - minimum);
  const rawStep = span / 3;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const fraction = rawStep / magnitude;
  let rounded = 10;
  for (const candidate of [1, 2, 5, 10]) {
    if (fraction <= candidate) {
      rounded = candidate;
      break;
    }
  }
  const step = Math.max(1, rounded * magnitude);
  const low = Math.max(0, Math.floor((minimum - step * 0.3) / step) * step);
  const high = Math.max(low + step * 2, Math.ceil((maximum + step * 0.3) / step) * step);
  const ticks = [];
  for (let value = low; value <= high + step * 0.01; value += step) {
    ticks.push(Math.round(value));
  }
  return { low, high, ticks };
}

export function startCounter() {
  const root = document.getElementById("counter-app");
  if (!root) {
    return;
  }

  const count = root.querySelector("#current-count");
  if (!count) {
    return;
  }
  const observedLabel = root.querySelector("#observed-label");
  const comparison = root.querySelector("#comparison");
  const notice = root.querySelector("#data-notice");
  const chart = root.querySelector("#timeline-chart");
  const svg = root.querySelector("#timeline-svg");
  const chartButton = root.querySelector("#timeline-interaction");
  const milestoneLabels = root.querySelector("#timeline-milestones");
  const empty = root.querySelector("#timeline-empty");
  const selectedLabel = root.querySelector("#timeline-selected");
  const selectedDay = root.querySelector("#timeline-selected-date");
  const selectedTime = root.querySelector("#timeline-selected-time");
  const selectedCount = root.querySelector("#timeline-selected-count");
  const selectedChange = root.querySelector("#timeline-selected-change");
  const selectedDelta = root.querySelector("#timeline-selected-delta");
  const selectedTemperature = root.querySelector("#timeline-selected-temperature");
  const weatherLegend = root.querySelector("#timeline-weather-legend");
  const weatherNotice = root.querySelector("#timeline-weather-notice");
  const weatherCredit = root.querySelector(".st-weather-credit");
  let data = null;
  let points = [];
  let plotted = [];
  let selectedDate = null;
  let rangeDate = null;
  let cursor = null;
  let focusDot = null;
  let weatherFocusDot = null;
  let weatherPlotted = [];
  let pendingRequest = false;
  let resizeFrame = null;

  function fitNumber() {
    count.style.fontSize = "";
    if (count.scrollWidth > count.clientWidth && count.clientWidth > 0) {
      const currentSize = Number.parseFloat(window.getComputedStyle(count).fontSize);
      count.style.fontSize = (currentSize * count.clientWidth / count.scrollWidth * 0.98) + "px";
    }
  }

  function selectPoint(index) {
    const point = plotted[index];
    if (!point || !cursor || !focusDot) {
      return;
    }
    selectedDate = point.date;
    cursor.setAttribute("x1", String(point.x));
    cursor.setAttribute("x2", String(point.x));
    focusDot.setAttribute("cx", String(point.x));
    focusDot.setAttribute("cy", String(point.y));
    const temperaturePoint = weatherPlotted.find((weatherPoint) => {
      return weatherPoint.date === point.date;
    });
    const temperature = temperaturePoint?.meanC ?? null;
    if (weatherFocusDot) {
      weatherFocusDot.setAttribute("visibility", Number.isFinite(temperaturePoint?.y) ? "visible" : "hidden");
      weatherFocusDot.setAttribute("cx", String(point.x));
      weatherFocusDot.setAttribute("cy", String(temperaturePoint?.y ?? 0));
    }
    const day = formatCalendarDate(point.date);
    const time = point.isCurrent ? ", " + timeFormatter.format(new Date(point.observedAt)) : "";
    const change = getDailyChange(points, point.date);
    selectedDay.textContent = day;
    selectedDay.dateTime = point.date;
    selectedTime.textContent = point.isCurrent ? "към " + timeFormatter.format(new Date(point.observedAt)) : "";
    selectedCount.textContent = String(point.count);
    selectedChange.hidden = change === null;
    selectedDelta.textContent = formatDailyChange(change);
    selectedTemperature.textContent = Number.isFinite(temperature) ? formatTemperature(temperature) : "няма данни";
    selectedTemperature.classList.toggle("st-selection-missing", !Number.isFinite(temperature));
    let changeDescription = "";
    if (change !== null) {
      changeDescription = change === 0
        ? " Без промяна от предходния ден."
        : " С " + Math.abs(change) + " " + (change > 0 ? "повече" : "по-малко") + " от предходния ден.";
    }
    const temperatureDescription = data.weather ? " Средна температура в София: " + formatTemperature(temperature) + "." : "";
    chartButton.setAttribute("aria-label", day + time + ": " + point.count + " аварии и ремонти." + changeDescription + temperatureDescription + " Използвай стрелките за друг ден.");
  }

  function drawTimeline() {
    const focusedSource = milestoneLabels.contains(document.activeElement) ? document.activeElement.href : null;
    svg.replaceChildren();
    milestoneLabels.replaceChildren();
    cursor = null;
    focusDot = null;
    weatherFocusDot = null;
    plotted = [];
    weatherPlotted = [];
    const now = new Date();
    rangeDate = getSofiaDateKey(now);
    const range = getTimelineRange(points, now);
    const milestones = getTimelineMilestones(points, now);
    chart.classList.toggle("st-chart-has-milestone", milestones.length > 0);
    const visiblePoints = range ? points.filter((point) => {
      return point.date >= range.start && point.date <= range.end;
    }) : [];
    empty.hidden = visiblePoints.length > 0;
    chartButton.disabled = visiblePoints.length === 0;
    selectedLabel.hidden = visiblePoints.length === 0;
    const weatherPoints = getWeatherPoints(data?.weather, visiblePoints, range);
    const temperatureAxis = makeTemperatureAxis(weatherPoints);
    weatherLegend.hidden = !data?.weather;
    weatherNotice.textContent = temperatureAxis
      ? "Средна дневна температура за София."
      : "В момента няма температури за показания период.";

    if (visiblePoints.length === 0) {
      svg.setAttribute("aria-label", "Няма налични данни за графиката");
      return;
    }

    const width = Math.max(240, chart.clientWidth);
    const height = Math.max(72, chart.clientHeight);
    const axis = makeYAxis(visiblePoints);
    const left = Math.max(34, String(axis.high).length * 7 + 12);
    const right = temperatureAxis ? 49 : 14;
    const bottom = height - 29;
    const plotWidth = Math.max(60, width - left - right);
    const firstTime = Date.parse(range.start + "T12:00:00Z");
    const lastTime = Date.parse(range.end + "T12:00:00Z");
    const timeSpan = lastTime - firstTime;
    let focusedMilestone = null;
    let top = 15;
    for (const milestone of milestones) {
      const timestamp = Date.parse(milestone.date + "T12:00:00Z");
      const x = timeSpan === 0 ? left + plotWidth / 2 : left + (timestamp - firstTime) / timeSpan * plotWidth;
      const link = document.createElement("a");
      link.className = "st-chart-milestone";
      link.href = milestone.sourceUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = formatCalendarDate(milestone.date) + " · " + milestone.label;
      link.title = "Съобщение на Топлофикация от " + formatCalendarDate(milestone.announcedOn);
      milestoneLabels.append(link);
      if (link.href === focusedSource) {
        focusedMilestone = link;
      }
      link.style.left = Math.max(6, Math.min(x, width - link.offsetWidth - 6)) + "px";
      top = Math.max(top, link.offsetHeight + 10);
      svg.append(svgElement("line", {
        class: "st-chart-milestone-line",
        x1: x,
        x2: x,
        y1: link.offsetHeight + 4,
        y2: bottom,
      }));
      svg.append(svgElement("path", {
        class: "st-chart-milestone-cap",
        d: "M" + x + "," + (top - 3) + " l4,4 l-4,4 l-4,-4 Z",
      }));
    }
    svg.setAttribute("viewBox", "0 0 " + width + " " + height);
    const milestoneDescription = milestones.map((milestone) => {
      return " " + formatCalendarDate(milestone.date) + ": " + milestone.label + ".";
    }).join("");
    svg.setAttribute("aria-label", "Брой аварии и ремонти" + (temperatureAxis ? " и средна температура в София" : "") + " от " + formatCalendarDate(range.start) + " до " + formatCalendarDate(range.end) + "." + milestoneDescription);

    const visibleTicks = axis.ticks.filter((tick, index) => {
      if (height >= 180) {
        return true;
      }
      if (index === 0 || index === axis.ticks.length - 1) {
        return true;
      }
      return height >= 120 && index === Math.floor(axis.ticks.length / 2);
    });
    for (const tick of visibleTicks) {
      const y = bottom - (tick - axis.low) / (axis.high - axis.low) * (bottom - top);
      svg.append(svgElement("line", { class: "st-chart-grid", x1: left, x2: width - right, y1: y, y2: y }));
      svg.append(svgElement("text", { class: "st-chart-label", x: left - 10, y: y + 4, "text-anchor": "end" }, tick));
    }

    if (temperatureAxis) {
      for (const [index, tick] of temperatureAxis.ticks.entries()) {
        if (height < 120 && index !== 0 && index !== temperatureAxis.ticks.length - 1) {
          continue;
        }
        const y = bottom - (tick - temperatureAxis.low) / (temperatureAxis.high - temperatureAxis.low) * (bottom - top);
        svg.append(svgElement("text", {
          class: "st-chart-label st-chart-temperature-label",
          x: width - right + 9,
          y: y + 4,
          "text-anchor": "start",
        }, tick + " °C"));
      }
      weatherPlotted = weatherPoints.map((point) => {
        const timestamp = Date.parse(point.date + "T12:00:00Z");
        return {
          ...point,
          timestamp,
          x: timeSpan === 0 ? left + plotWidth / 2 : left + (timestamp - firstTime) / timeSpan * plotWidth,
          y: Number.isFinite(point.meanC)
            ? bottom - (point.meanC - temperatureAxis.low) / (temperatureAxis.high - temperatureAxis.low) * (bottom - top)
            : null,
        };
      });
      svg.append(svgElement("path", { class: "st-chart-temperature-line", d: makeTimelinePath(weatherPlotted) }));
      for (const point of weatherPlotted) {
        if (Number.isFinite(point.y)) {
          svg.append(svgElement("circle", { class: "st-chart-temperature-point", cx: point.x, cy: point.y, r: 2 }));
        }
      }
    }

    plotted = visiblePoints.map((point) => {
      const timestamp = Date.parse(point.date + "T12:00:00Z");
      return {
        ...point,
        timestamp,
        x: timeSpan === 0 ? left + plotWidth / 2 : left + (timestamp - firstTime) / timeSpan * plotWidth,
        y: bottom - (point.count - axis.low) / (axis.high - axis.low) * (bottom - top),
      };
    });

    svg.append(svgElement("path", { class: "st-chart-line", d: makeTimelinePath(plotted) }));

    for (const point of plotted) {
      svg.append(svgElement("circle", {
        class: point.isCurrent ? "st-chart-point st-chart-current" : "st-chart-point",
        cx: point.x,
        cy: point.y,
        r: plotted.length > 100 ? 1.8 : 3,
      }));
    }

    const labelCount = timeSpan === 0 ? 1 : width < 480 ? 3 : 5;
    const labels = new Set();
    for (let index = 0; index < labelCount; index++) {
      const fraction = labelCount === 1 ? 0.5 : index / (labelCount - 1);
      const timestamp = timeSpan === 0 ? firstTime : firstTime + timeSpan * fraction;
      const date = new Date(timestamp).toISOString().slice(0, 10);
      if (labels.has(date)) {
        continue;
      }
      labels.add(date);
      const x = timeSpan === 0 ? left + plotWidth / 2 : left + fraction * plotWidth;
      const anchor = labelCount === 1 ? "middle" : index === 0 ? "start" : index === labelCount - 1 ? "end" : "middle";
      svg.append(svgElement("text", { class: "st-chart-label", x, y: height - 7, "text-anchor": anchor }, axisDateFormatter.format(new Date(date + "T12:00:00Z"))));
    }

    cursor = svgElement("line", { class: "st-chart-cursor", x1: 0, x2: 0, y1: top, y2: bottom });
    focusDot = svgElement("circle", { class: "st-chart-focus", cx: 0, cy: 0, r: 4.5 });
    svg.append(cursor, focusDot);
    if (temperatureAxis) {
      weatherFocusDot = svgElement("circle", { class: "st-chart-focus st-chart-temperature-focus", cx: 0, cy: 0, r: 4 });
      svg.append(weatherFocusDot);
    }
    const selection = plotted.findIndex((point) => {
      return point.date === selectedDate;
    });
    selectPoint(selection < 0 ? plotted.length - 1 : selection);
    focusedMilestone?.focus({ preventScroll: true });
  }

  function updatePresentation() {
    observedLabel.textContent = formatObservedLabel(data?.current?.observedAt);
    observedLabel.dateTime = data?.current?.observedAt ?? "";
    comparison.textContent = formatComparisonText(data?.comparison, data?.current);
    notice.textContent = getDataNotice(data?.current);
    if (rangeDate !== getSofiaDateKey(new Date())) {
      drawTimeline();
    }
  }

  function acceptData(value) {
    const nextData = normalizeTimeline(value);
    data = nextData;
    points = getTimelinePoints(data);
    count.textContent = data.current ? String(data.current.count) : "?";
    updatePresentation();
    drawTimeline();
    fitNumber();
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
      const url = new URL("./timeline.json", document.baseURI);
      url.searchParams.set("v", String(Math.floor(Date.now() / 60000)));
      const response = await fetch(url, { cache: "no-store", signal: controller.signal });
      if (!response.ok) {
        throw new Error("Timeline unavailable");
      }
      acceptData(await response.json());
    } catch {
      updatePresentation();
    } finally {
      window.clearTimeout(timeout);
      pendingRequest = false;
    }
  }

  function selectAtPointer(event) {
    if (plotted.length === 0) {
      return;
    }
    const bounds = chart.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    let nearest = 0;
    for (let index = 1; index < plotted.length; index++) {
      if (Math.abs(plotted[index].x - x) < Math.abs(plotted[nearest].x - x)) {
        nearest = index;
      }
    }
    selectPoint(nearest);
  }

  chartButton.addEventListener("pointermove", selectAtPointer);
  chartButton.addEventListener("pointerdown", selectAtPointer);
  weatherCredit.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && weatherCredit.open) {
      event.preventDefault();
      weatherCredit.open = false;
      weatherCredit.querySelector("summary").focus();
    }
  });
  chartButton.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") {
      return;
    }
    event.preventDefault();
    const index = Math.max(0, plotted.findIndex((point) => {
      return point.date === selectedDate;
    }));
    let next = event.key === "ArrowLeft" ? index - 1 : index + 1;
    if (event.key === "Home") {
      next = 0;
    }
    if (event.key === "End") {
      next = plotted.length - 1;
    }
    selectPoint(Math.max(0, Math.min(next, plotted.length - 1)));
  });

  function resize() {
    if (resizeFrame !== null) {
      window.cancelAnimationFrame(resizeFrame);
    }
    resizeFrame = window.requestAnimationFrame(() => {
      resizeFrame = null;
      drawTimeline();
      fitNumber();
    });
  }

  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(resize);
    observer.observe(chart);
  } else {
    window.addEventListener("resize", resize);
  }

  const initialData = document.getElementById("initial-timeline");
  if (initialData?.textContent.trim()) {
    try {
      acceptData(JSON.parse(initialData.textContent));
    } catch {
      notice.textContent = "В момента няма актуални данни.";
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      updatePresentation();
      refreshData();
    }
  });
  refreshData();
  window.setInterval(() => {
    updatePresentation();
    refreshData();
  }, 60000);
}

if (typeof document !== "undefined") {
  startCounter();
}
