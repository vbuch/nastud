import { formatIncidentDate, getEstimateExtensionDays, hasChangedStart } from "./incidents.js";
import { getIncidentPosition, getIncidentProgress, getRemainingDays } from "./incident-history.js";
import { getSofiaDateKey } from "./app.js";
import { getIncidentDailyChangeRows, getIncidentDailyComparison, getIncidentDailyRows } from "./incident-daily.js";

const dailyDateFormatter = new Intl.DateTimeFormat("bg-BG", {
  timeZone: "UTC",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const dailyTimeFormatter = new Intl.DateTimeFormat("bg-BG", {
  timeZone: "Europe/Sofia",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function dailyDate(date) {
  return dailyDateFormatter.format(new Date(date + "T12:00:00Z"));
}

function dayAmount(days) {
  return days + (days === 1 ? " ден" : " дни");
}

function remainingText(days, first = false) {
  if (days === null) {
    return first ? "Нямаме данни за срока при тази проверка." : "Няма обявена дата за приключване.";
  }
  if (days < 0) {
    return (first ? "Срокът вече беше минал с " : "Срокът е минал с ") + dayAmount(Math.abs(days)) + ".";
  }
  if (days === 0) {
    return first ? "Срокът беше в същия ден." : "Срокът е в деня на проверката.";
  }
  if (first) {
    return (days === 1 ? "Тогава оставаше " : "Тогава оставаха ") + dayAmount(days) + ".";
  }
  return (days === 1 ? "Остава " : "Остават ") + dayAmount(days) + ".";
}

function deadlineChange(incident) {
  const days = getEstimateExtensionDays(incident);
  if (days === null) {
    return null;
  }
  if (days === 0) {
    return "Същият срок като при първата ни проверка";
  }
  const absolute = Math.abs(days);
  let amount = "По-малко от 1 ден";
  if (absolute >= 1) {
    amount = (Number.isInteger(absolute) ? "" : "Около ") + dayAmount(Math.round(absolute));
  }
  return amount + (days > 0 ? " по-късно" : " по-рано");
}

function dailyDeadlineChange(days) {
  if (days === null) {
    return null;
  }
  if (days === 0) {
    return "Обявеният срок е без промяна.";
  }
  const absolute = Math.abs(days);
  let amount = "по-малко от 1 ден";
  if (absolute >= 1) {
    amount = (Number.isInteger(absolute) ? "" : "около ") + dayAmount(Math.round(absolute));
  }
  return "Обявеният срок е с " + amount + (days > 0 ? " по-късен." : " по-ранен.");
}

export function getIncidentDailyView(history, snapshot, id) {
  const rows = getIncidentDailyRows(history, snapshot, id);
  if (!history || rows.length === 0) {
    return null;
  }
  const comparison = getIncidentDailyComparison(history, snapshot, id);
  let comparisonView = null;
  if (comparison) {
    const change = comparison.positionChange;
    let position = null;
    if (change !== null) {
      position = change === 0
        ? "Мястото е без промяна."
        : "Мястото е с " + Math.abs(change) + (change < 0 ? " по-напред." : " по-назад.");
    }
    comparisonView = {
      label: "От " + dailyDate(comparison.previousDate) + " до " + dailyDate(comparison.currentDate),
      position,
      deadline: dailyDeadlineChange(comparison.deadlineChangeDays),
    };
  }
  return {
    period: dailyDate(rows[0].date) + " до " + dailyDate(rows[rows.length - 1].date),
    comparison: comparisonView,
    rows: getIncidentDailyChangeRows(rows).map((row) => {
      let position = "Няма данни";
      let deadline = "Няма данни";
      let remaining = "";
      if (row.state === "present") {
        position = "№ " + row.position + " от " + row.total;
        deadline = row.estimatedEnd ? dailyDate(row.estimatedEnd.slice(0, 10)) : "Няма обявен срок";
        remaining = remainingText(row.remainingDays, true);
      } else if (row.state === "absent") {
        position = "Не е в списъка (общо " + row.total + ")";
        deadline = "Не се прилага";
      }
      return {
        ...row,
        dateLabel: row.throughDate && row.throughDate !== row.date
          ? dailyDate(row.date) + " до " + dailyDate(row.throughDate)
          : dailyDate(row.date),
        checkedTime: row.observedAt ? dailyTimeFormatter.format(new Date(row.observedAt)) + " ч." : "Няма дневна проверка",
        positionLabel: position,
        deadlineLabel: deadline,
        remainingLabel: remaining,
      };
    }),
  };
}

export function getIncidentDetailView(incident, snapshot, history = null) {
  const days = getRemainingDays(incident.estimatedEnd, snapshot.observedAt);
  const points = getIncidentProgress(incident, snapshot.observedAt);
  const daily = getIncidentDailyView(history, snapshot, incident.id);
  return {
    type: incident.type === "accident" ? "Авария" : "Ремонт",
    addresses: incident.addresses,
    deadline: incident.estimatedEnd ? formatIncidentDate(incident.estimatedEnd) : "Няма обявен срок",
    remaining: remainingText(days),
    overdue: days !== null && days < 0,
    checkedDate: formatIncidentDate(getSofiaDateKey(snapshot.observedAt) + "T12:00:00Z"),
    position: getIncidentPosition(snapshot, incident.id),
    change: deadlineChange(incident),
    daily,
    historyNote: daily
      ? "Дневните проверки по-долу допълват това сравнение. Първият запазен срок е отделна отправна точка."
      : points.length > 1
        ? "Показваме първата и последната проверка. Нямаме данни кога са направени промените между тях."
        : "Показваме последната проверка. Нямаме по-стара проверка с дата.",
    observations: points.map((point) => {
      let deadline = point.kind === "first" ? "Няма запазен срок" : "Няма обявен срок";
      if (point.estimatedEnd) {
        deadline = formatIncidentDate(point.estimatedEnd);
      }
      return {
        label: point.kind === "first" ? "При първата ни проверка" : "При последната проверка",
        checkedDate: formatIncidentDate(point.date + "T12:00:00Z"),
        deadline,
        remaining: remainingText(point.remainingDays, point.kind === "first"),
      };
    }),
    reportedStart: formatIncidentDate(incident.reportedStart),
    firstObserved: incident.firstObservedAt
      ? formatIncidentDate(getSofiaDateKey(incident.firstObservedAt) + "T12:00:00Z")
      : "Нямаме по-стара проверка",
    changedStart: hasChangedStart(incident)
      ? "Топлофикация е променила началната дата. При първата ни проверка тя беше " + formatIncidentDate(incident.firstReportedStart)
      : null,
  };
}
