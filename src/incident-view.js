import { formatIncidentDate, getEstimateExtensionDays, hasChangedStart } from "./incidents.js";
import { getIncidentPosition, getIncidentProgress, getRemainingDays } from "./incident-history.js";
import { getSofiaDateKey } from "./app.js";

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

export function getIncidentDetailView(incident, snapshot) {
  const days = getRemainingDays(incident.estimatedEnd, snapshot.observedAt);
  const points = getIncidentProgress(incident, snapshot.observedAt);
  return {
    type: incident.type === "accident" ? "Авария" : "Ремонт",
    addresses: incident.addresses,
    deadline: incident.estimatedEnd ? formatIncidentDate(incident.estimatedEnd) : "Няма обявен срок",
    remaining: remainingText(days),
    overdue: days !== null && days < 0,
    checkedDate: formatIncidentDate(getSofiaDateKey(snapshot.observedAt) + "T12:00:00Z"),
    position: getIncidentPosition(snapshot, incident.id),
    change: deadlineChange(incident),
    historyNote: points.length > 1
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
