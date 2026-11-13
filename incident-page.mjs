import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { escapeHtml, serializeData } from "./data.mjs";
import { renderIncidentShareImage } from "./share-image.mjs";
import { formatObservedLabel } from "./src/app.js";
import { getIncidentPath } from "./src/incident-history.js";
import { getIncidentDetailView } from "./src/incident-view.js";
import { formatIncidentAge, sortIncidents } from "./src/incidents.js";

const templatePath = fileURLToPath(new URL("./src/incident.html", import.meta.url));

function renderInitialDetail(incident, snapshot, view) {
  const age = formatIncidentAge(incident, snapshot.observedAt);
  const observations = view.observations.map((observation) => {
    return `<li class="st-incident-observation">
      <p class="st-incident-observation-label">${escapeHtml(observation.label)}</p>
      <time class="st-incident-observation-date">${escapeHtml(observation.checkedDate)}</time>
      <p class="st-incident-observation-deadline"><span>Обявен край</span><strong>${escapeHtml(observation.deadline)}</strong></p>
      <p class="st-incident-observation-remaining">${escapeHtml(observation.remaining)}</p>
    </li>`;
  }).join("");
  return `<div class="st-incident-overview">
    <section class="st-incident-deadline-card">
      <h2>Обявен срок</h2>
      <p class="st-incident-due-date">${escapeHtml(view.deadline)}</p>
      <p class="st-incident-remaining">${escapeHtml(view.remaining)}</p>
      <p class="st-incident-check-context">Към последната проверка</p>
      ${view.overdue ? '<p class="st-incident-flag">Топлофикация все още публикува този запис.</p>' : ""}
    </section>
    <section class="st-incident-position">
      <h2>Място в списъка</h2>
      <p class="st-incident-position-value">№ ${view.position.position}<span> от ${view.position.total}</span></p>
      <p class="st-incident-position-note">Подредено по начална дата, от най-старото към най-новото. Редът на отстраняване не е обявен.</p>
    </section>
  </div>
  <section class="st-incident-progress">
    <h2>Как се промени срокът</h2>
    ${view.change === null ? "" : '<p class="st-incident-change">' + escapeHtml(view.change) + '</p><p class="st-incident-change-context">Спрямо първия срок, който видяхме.</p>'}
    <ol class="st-incident-observations">${observations}</ol>
    <p class="st-incident-history-note">${escapeHtml(view.historyNote)}</p>
  </section>
  <details class="st-incident-more">
    <summary>Още подробности</summary>
    <dl class="st-incident-dates">
      <dt>Обявено начало</dt><dd>${escapeHtml(view.reportedStart)}</dd>
      <dt>Първа проверка при нас</dt><dd>${escapeHtml(view.firstObserved)}</dd>
    </dl>
    ${age === null ? "" : '<p class="st-incident-age">' + escapeHtml(age) + "</p>"}
    ${view.changedStart === null ? "" : '<p class="st-incident-flag">' + escapeHtml(view.changedStart) + "</p>"}
    <p class="st-incident-history-note">Нямаме данни за предишните места в списъка.</p>
  </details>`;
}

export async function buildIncidentPages({ snapshot, canonical, outDirectory, now = new Date() }) {
  const outputRoot = resolve(outDirectory);
  const incidentDirectory = resolve(outputRoot, "incident");
  if (dirname(incidentDirectory) !== outputRoot) {
    throw new Error("The generated incident directory must stay inside the output directory");
  }
  await rm(incidentDirectory, { recursive: true, force: true });
  if (!snapshot) {
    await rm(resolve(outputRoot, "404.html"), { force: true });
    return [];
  }
  const template = await readFile(templatePath, "utf8");
  const pages = [];
  const ordered = sortIncidents(snapshot.incidents);
  for (let index = 0; index < ordered.length; index += 1) {
    const incident = ordered[index];
    const position = index + 1;
    const view = getIncidentDetailView(incident, snapshot);
    const path = getIncidentPath(incident.id);
    const pageUrl = new URL(path, canonical);
    const pageDirectory = resolve(outDirectory, path);
    const image = renderIncidentShareImage(incident, snapshot, { position, now });
    const imageHash = createHash("sha256").update(image).digest("hex").slice(0, 12);
    const imageUrl = new URL("share.png", pageUrl);
    imageUrl.searchParams.set("v", imageHash);
    const title = incident.name + " | На студ";
    const description = [
      view.addresses,
      incident.estimatedEnd ? "Обявен срок: " + view.deadline : "Няма обявен срок.",
      view.remaining,
      "№ " + position + " от " + snapshot.count + " по обявено начало.",
      "Данни " + formatObservedLabel(snapshot.observedAt, now) + ".",
    ].filter((part) => {
      return part.trim();
    }).join(" ");
    const tokens = {
      BASE_URL: "../../",
      ROBOTS: "index,follow",
      META_TITLE: escapeHtml(title),
      META_DESCRIPTION: escapeHtml(description),
      CANONICAL_URL: escapeHtml(pageUrl.href),
      OG_IMAGE_URL: escapeHtml(imageUrl.href),
      INCIDENT_ID: escapeHtml(incident.id),
      INCIDENT_NAME: escapeHtml(incident.name),
      INCIDENT_TYPE: escapeHtml(view.type),
      INCIDENT_ADDRESSES: escapeHtml(view.addresses),
      OBSERVED_AT: escapeHtml(snapshot.observedAt),
      OBSERVED_LABEL: escapeHtml(formatObservedLabel(snapshot.observedAt, now).replace(/^към /, "")),
      INITIAL_DETAIL: renderInitialDetail(incident, snapshot, view),
      INITIAL_INCIDENTS: serializeData(snapshot),
    };
    const html = template.replace(/\{\{([A-Z_]+)\}\}/g, (match, name) => {
      if (!(name in tokens)) {
        throw new Error("Unknown incident page template token: " + name);
      }
      return tokens[name];
    });
    if (html.includes("{{")) {
      throw new Error("Unresolved incident page template token");
    }
    await mkdir(pageDirectory, { recursive: true });
    await Promise.all([
      writeFile(resolve(pageDirectory, "index.html"), html),
      writeFile(resolve(pageDirectory, "share.png"), image),
      writeFile(resolve(pageDirectory, "share-square.png"), renderIncidentShareImage(incident, snapshot, { position, height: 1200, now })),
    ]);
    pages.push(pageUrl.href);
  }
  const fallbackTokens = {
    BASE_URL: escapeHtml(canonical.pathname),
    ROBOTS: "noindex,follow",
    META_TITLE: "Авария или ремонт | На студ",
    META_DESCRIPTION: "Провери дали записът още е в текущия списък на Топлофикация.",
    CANONICAL_URL: escapeHtml(canonical.href),
    OG_IMAGE_URL: escapeHtml(new URL("share.png", canonical).href),
    INCIDENT_ID: "",
    INCIDENT_NAME: "Авария или ремонт",
    INCIDENT_TYPE: "",
    INCIDENT_ADDRESSES: "",
    OBSERVED_AT: escapeHtml(snapshot.observedAt),
    OBSERVED_LABEL: escapeHtml(formatObservedLabel(snapshot.observedAt, now).replace(/^към /, "")),
    INITIAL_DETAIL: '<p class="st-incident-unlisted">Този адрес няма страница в текущата публикация. <a href="./">Виж всички аварии и ремонти.</a></p>',
    INITIAL_INCIDENTS: serializeData(snapshot),
  };
  const fallback = template.replace(/\{\{([A-Z_]+)\}\}/g, (match, name) => {
    if (!(name in fallbackTokens)) {
      throw new Error("Unknown incident fallback template token: " + name);
    }
    return fallbackTokens[name];
  });
  await writeFile(resolve(outDirectory, "404.html"), fallback);
  return pages;
}
