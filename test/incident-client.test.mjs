import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setImmediate } from "node:timers/promises";
import { startIncidentPage, startIncidents } from "../src/incidents.js";

const fixture = JSON.parse(await readFile(new URL("./fixtures/incidents.json", import.meta.url), "utf8"));

function dailyHistory() {
  const previous = structuredClone(fixture);
  previous.observedAt = "2026-11-10T20:30:00Z";
  previous.incidents[2].estimatedEnd = "2026-11-22T23:59:00Z";
  return {
    sourceType: "toplo-bg",
    locality: "bg.sofia",
    startDate: "2026-11-09",
    endDate: "2026-11-11",
    daily: [
      { date: "2026-11-09", snapshot: null },
      { date: "2026-11-10", snapshot: previous },
      { date: "2026-11-11", snapshot: fixture },
    ],
  };
}

function findNode(root, predicate) {
  if (predicate(root)) {
    return root;
  }
  for (const child of root.children) {
    const found = findNode(child, predicate);
    if (found) {
      return found;
    }
  }
  return null;
}

class Node {
  constructor(tagName = "div") {
    this.tagName = tagName;
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.listeners = new Map();
    this.text = "";
  }

  set textContent(value) {
    this.text = String(value);
    this.children = [];
  }

  get textContent() {
    return this.text + this.children.map((child) => {
      return child.textContent;
    }).join(" ");
  }

  append(...nodes) {
    for (const node of nodes) {
      if (node.tagName === "#document-fragment") {
        this.append(...node.children);
      } else {
        node.parentNode = this;
        this.children.push(node);
      }
    }
  }

  replaceChildren(...nodes) {
    this.text = "";
    this.children = [];
    this.append(...nodes);
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  addEventListener(name, callback) {
    this.listeners.set(name, callback);
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }

  contains(node) {
    return this === node || this.children.some((child) => {
      return child.contains(node);
    });
  }

  closest(selector) {
    if (selector === ".st-incident" && this.className === "st-incident") {
      return this;
    }
    return this.parentNode?.closest(selector) ?? null;
  }

  querySelector(selector) {
    for (const child of this.children) {
      if (selector === '[data-action="' + child.dataset.action + '"]') {
        return child;
      }
      const match = child.querySelector(selector);
      if (match) {
        return match;
      }
    }
    return null;
  }

  focus() {
    document.activeElement = this;
  }
}

function replaceGlobal(context, name, value) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  context.after(() => {
    if (descriptor) {
      Object.defineProperty(globalThis, name, descriptor);
    } else {
      delete globalThis[name];
    }
  });
}

function pageHarness(context, response, history = null) {
  const elements = new Map();
  for (const id of [
    "incident-page",
    "incident-detail",
    "incident-page-heading",
    "incident-page-type",
    "incident-page-addresses",
    "incident-page-observed",
    "incident-page-notice",
    "initial-incidents",
    "initial-incident-daily",
  ]) {
    elements.set(id, new Node());
  }
  elements.get("incident-page").dataset.incidentId = "repair";
  elements.get("initial-incidents").textContent = JSON.stringify(fixture);
  elements.get("initial-incident-daily").textContent = JSON.stringify(history);
  const intervals = [];
  replaceGlobal(context, "document", {
    hidden: false,
    baseURI: "https://example.com/nastud/",
    getElementById(id) {
      return elements.get(id) ?? null;
    },
    createElement(tagName) {
      return new Node(tagName);
    },
    createDocumentFragment() {
      return new Node("#document-fragment");
    },
    addEventListener() {},
  });
  replaceGlobal(context, "window", {
    setTimeout() {
      return 1;
    },
    clearTimeout() {},
    setInterval(callback) {
      intervals.push(callback);
    },
  });
  context.mock.method(globalThis, "fetch", response);
  return { elements, intervals };
}

function listHarness(context, response) {
  const harness = pageHarness(context, response);
  for (const id of [
    "incidents-open",
    "incidents-dialog",
    "incidents-close",
    "incidents-sort",
    "incidents-type",
    "incidents-list",
    "incidents-observed",
    "incidents-notice",
    "incidents-summary",
    "incidents-empty",
  ]) {
    harness.elements.set(id, new Node());
  }
  harness.elements.get("incidents-sort").value = "oldest";
  harness.elements.get("incidents-type").value = "all";
  return harness;
}

test("incident details lead with the affected address and deadline and use ordinary observation cards", async (context) => {
  const { elements } = pageHarness(context, async () => {
    return Response.json(fixture);
  });

  startIncidentPage();
  await setImmediate();

  assert.equal(elements.get("incident-page-type").textContent, "Ремонт");
  assert.equal(elements.get("incident-page-addresses").textContent, fixture.incidents[2].addresses);
  const detail = elements.get("incident-detail");
  const content = detail.textContent;
  assert.ok(content.indexOf("Обявен срок") < content.indexOf("Място в списъка"));
  assert.match(content, /Как се промени срокът/);
  const pending = [detail];
  while (pending.length > 0) {
    const node = pending.pop();
    assert.ok(!["svg", "table", "button"].includes(node.tagName));
    pending.push(...node.children);
  }
  const template = await readFile(new URL("../src/incident.html", import.meta.url), "utf8");
  assert.doesNotMatch(template, /incident-share|Копирай връзка/);
});

test("an older detail refresh cannot replace the saved incident or observation time", async (context) => {
  const older = structuredClone(fixture);
  older.observedAt = "2026-11-10T15:00:00.000Z";
  older.incidents[2].name = "An older name";
  const { elements } = pageHarness(context, async () => {
    return Response.json(older);
  });

  startIncidentPage();
  await setImmediate();

  assert.equal(elements.get("incident-page-heading").textContent, fixture.incidents[2].name);
  assert.equal(elements.get("incident-page-observed").dateTime, fixture.observedAt);
  assert.match(elements.get("incident-detail").textContent, /№ 2/);
  assert.doesNotMatch(elements.get("incident-detail").textContent, /An older name/);
});

test("a failed detail refresh preserves the saved values and their original timestamp", async (context) => {
  const { elements } = pageHarness(context, async () => {
    throw new Error("Network unavailable");
  });

  startIncidentPage();
  const initial = elements.get("incident-detail").textContent;
  await setImmediate();

  assert.equal(elements.get("incident-detail").textContent, initial);
  assert.equal(elements.get("incident-page-observed").dateTime, fixture.observedAt);
  assert.match(elements.get("incident-page-notice").textContent, /последния запазен/);
});

test("daily history has an accessible chronological table and exact dated comparisons", async (context) => {
  const history = dailyHistory();
  const requested = [];
  const { elements } = pageHarness(context, async (url) => {
    requested.push(url.href);
    return Response.json(url.pathname.endsWith("incident-daily.json") ? history : fixture);
  }, history);

  startIncidentPage();
  await setImmediate();

  const detail = elements.get("incident-detail");
  const table = findNode(detail, (node) => {
    return node.tagName === "table";
  });
  assert.ok(table);
  assert.match(table.textContent, /Промени в мястото и обявения срок/);
  assert.doesNotMatch(table.textContent, /Няма дневна проверка|09\.11\.2026/);
  assert.match(detail.textContent, /От 10\.11\.2026 г\. до 11\.11\.2026 г\./);
  assert.match(detail.textContent, /Обявеният срок е с 1 ден по-късен/);
  const body = table.children.find((node) => {
    return node.tagName === "tbody";
  });
  assert.equal(body.children.length, 2);
  assert.equal(body.children[0].dataset.historyState, "present");
  const time = findNode(body.children[0], (node) => {
    return node.tagName === "time";
  });
  assert.equal(time.dateTime, "2026-11-10T20:30:00Z");
  assert.equal(body.children[0].children[0].attributes.scope, "row");
  assert.deepEqual(requested.sort(), [
    "https://example.com/nastud/incident-daily.json",
    "https://example.com/nastud/incidents.json",
  ]);
});

test("a daily history failure preserves saved captures while allowing a newer incident check", async (context) => {
  const history = dailyHistory();
  const next = structuredClone(fixture);
  next.observedAt = "2026-11-11T16:30:00Z";
  next.incidents[2].estimatedEnd = "2026-11-24T23:59:00Z";
  const { elements } = pageHarness(context, async (url) => {
    if (url.pathname.endsWith("incident-daily.json")) {
      throw new Error("Daily history unavailable");
    }
    return Response.json(next);
  }, history);

  startIncidentPage();
  await setImmediate();

  assert.equal(elements.get("incident-page-observed").dateTime, next.observedAt);
  assert.match(elements.get("incident-detail").textContent, /Обявеният срок е с 2 дни по-късен/);
  assert.match(elements.get("incident-detail").textContent, /22:30 ч\./);
  assert.match(elements.get("incident-page-notice").textContent, /запазените дневни проверки/);
});

test("unchanged checks do not add rows and the previous-day comparison remains available", async (context) => {
  const history = dailyHistory();
  history.daily[1].snapshot.incidents[2].estimatedEnd = fixture.incidents[2].estimatedEnd;
  const { elements } = pageHarness(context, async (url) => {
    return Response.json(url.pathname.endsWith("incident-daily.json") ? history : fixture);
  }, history);

  startIncidentPage();
  await setImmediate();

  const detail = elements.get("incident-detail");
  const body = findNode(detail, (node) => {
    return node.tagName === "tbody";
  });
  assert.equal(body.children.length, 1);
  assert.match(body.children[0].textContent, /10\.11\.2026/);
  assert.doesNotMatch(body.children[0].textContent, /11\.11\.2026/);
  assert.match(detail.textContent, /Период: 10\.11\.2026 г\. до 11\.11\.2026 г\./);
  assert.match(detail.textContent, /От 10\.11\.2026 г\. до 11\.11\.2026 г\./);
  assert.match(detail.textContent, /Обявеният срок е без промяна/);
});

test("older daily captures cannot replace saved checks or the current snapshot", async (context) => {
  const history = dailyHistory();
  const older = structuredClone(history);
  older.daily[1].snapshot.observedAt = "2026-11-10T10:30:00Z";
  older.daily[1].snapshot.incidents[2].estimatedEnd = "2026-11-30T23:59:00Z";
  older.daily[2].snapshot.observedAt = "2026-11-11T10:00:00Z";
  const { elements } = pageHarness(context, async (url) => {
    return Response.json(url.pathname.endsWith("incident-daily.json") ? older : fixture);
  }, history);

  startIncidentPage();
  await setImmediate();

  const content = elements.get("incident-detail").textContent;
  assert.match(content, /Обявеният срок е с 1 ден по-късен/);
  assert.match(content, /22:30 ч\./);
  assert.doesNotMatch(content, /30\.11\.2026/);
  assert.equal(elements.get("incident-page-observed").dateTime, fixture.observedAt);
});

test("a newer listing preserves an open details disclosure and its keyboard focus", async (context) => {
  const history = dailyHistory();
  const { elements, intervals } = pageHarness(context, async (url) => {
    return Response.json(url.pathname.endsWith("incident-daily.json") ? history : fixture);
  }, history);
  startIncidentPage();
  await setImmediate();
  const detail = elements.get("incident-detail");
  const disclosure = findNode(detail, (node) => {
    return node.tagName === "details";
  });
  disclosure.open = true;
  disclosure.children[0].focus();

  intervals[0]();
  await setImmediate();

  const refreshed = findNode(detail, (node) => {
    return node.tagName === "details";
  });
  assert.equal(refreshed.open, true);
  assert.equal(document.activeElement, refreshed.children[0]);
});

test("a newer complete listing removes an absent incident's position without confirming resolution", async (context) => {
  const next = structuredClone(fixture);
  next.observedAt = "2026-11-12T15:00:00.000Z";
  next.incidents = next.incidents.filter((incident) => {
    return incident.id !== "repair";
  });
  next.count = next.incidents.length;
  const { elements } = pageHarness(context, async () => {
    return Response.json(next);
  });

  startIncidentPage();
  assert.match(elements.get("incident-detail").textContent, /Място в списъка/);
  await setImmediate();

  const text = elements.get("incident-detail").textContent;
  assert.equal(elements.get("incident-page-observed").dateTime, next.observedAt);
  assert.match(text, /вече не е в текущия списък/);
  assert.match(text, /Няма потвърждение за приключване/);
  assert.doesNotMatch(text, /Място в списъка|№|отстранена|приключила/);
});

test("the missing-page fallback identifies an old incident link under the hosting prefix", async (context) => {
  const next = structuredClone(fixture);
  next.observedAt = "2026-11-12T15:00:00.000Z";
  next.incidents = next.incidents.slice(0, 2);
  next.count = 2;
  const { elements } = pageHarness(context, async () => {
    return Response.json(next);
  });
  elements.get("incident-page").dataset.incidentId = "";
  elements.get("initial-incidents").textContent = JSON.stringify(next);
  window.location = { pathname: "/nastud/incident/cmVwYWly/" };

  startIncidentPage();
  await setImmediate();

  assert.match(elements.get("incident-detail").textContent, /вече не е в текущия списък/);
  assert.equal(elements.get("incident-page-observed").dateTime, next.observedAt);
});

test("the missing-page fallback rejects an invalid encoded route without requesting incident data", async (context) => {
  let requests = 0;
  const { elements } = pageHarness(context, async () => {
    requests += 1;
    return Response.json(fixture);
  });
  elements.get("incident-page").dataset.incidentId = "";
  window.location = { pathname: "/nastud/incident/_w/" };

  startIncidentPage();
  await setImmediate();

  assert.equal(elements.get("incident-detail").textContent, "Тази страница не е намерена.");
  assert.equal(requests, 0);
});

test("list refresh keeps keyboard focus on the same incident action after its position changes", async (context) => {
  let next = fixture;
  const { elements, intervals } = listHarness(context, async () => {
    return Response.json(next);
  });
  startIncidents();
  await setImmediate();
  elements.get("incidents-dialog").open = true;
  const list = elements.get("incidents-list");
  const oldItem = list.children.find((item) => {
    return item.dataset.incidentId === "repair";
  });
  const oldLink = oldItem.querySelector('[data-action="heading"]');
  oldLink.focus();

  next = structuredClone(fixture);
  next.observedAt = "2026-11-12T15:00:00.000Z";
  next.incidents[2].reportedStart = "2026-11-12T10:00:00Z";
  intervals[0]();
  await setImmediate();

  const newItem = list.children[2];
  assert.equal(newItem.dataset.incidentId, "repair");
  const newLink = newItem.querySelector('[data-action="heading"]');
  assert.notEqual(newLink, oldLink);
  assert.equal(document.activeElement, newLink);
  assert.equal(newLink.href, oldLink.href);

  next = {
    ...next,
    observedAt: "2026-11-13T15:00:00.000Z",
    count: 2,
    incidents: next.incidents.slice(0, 2),
  };
  intervals[0]();
  await setImmediate();
  assert.equal(document.activeElement, elements.get("incidents-sort"));
});

test("visible numbering follows the selected sort and filter while links keep their stable identity", async (context) => {
  const { elements } = listHarness(context, async () => {
    return Response.json(fixture);
  });
  startIncidents();
  await setImmediate();

  elements.get("incidents-type").value = "accident";
  elements.get("incidents-sort").value = "newest";
  elements.get("incidents-sort").listeners.get("change")();

  const items = elements.get("incidents-list").children;
  assert.deepEqual(items.map((item) => {
    return item.dataset.incidentId;
  }), ["newer", "oldest"]);
  assert.equal(items[0].children[0].textContent, "№ 1");
  assert.equal(items[1].children[0].textContent, "№ 2");
  assert.equal(items[0].querySelector('[data-action="heading"]').href, "incident/bmV3ZXI/");
  assert.equal(items[1].querySelector('[data-action="heading"]').href, "incident/b2xkZXN0/");
});

test("returning from an incident page opens the complete list through its fragment link", async (context) => {
  const { elements } = listHarness(context, async () => {
    return Response.json(fixture);
  });
  window.location = { hash: "#incidents" };
  const dialog = elements.get("incidents-dialog");
  dialog.showModal = () => {
    dialog.open = true;
  };

  startIncidents();
  await setImmediate();

  assert.equal(dialog.open, true);
  assert.equal(elements.get("incidents-list").children.length, fixture.count);
});
