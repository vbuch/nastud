import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setImmediate } from "node:timers/promises";
import { startIncidentPage, startIncidents } from "../src/incidents.js";

const fixture = JSON.parse(await readFile(new URL("./fixtures/incidents.json", import.meta.url), "utf8"));

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

function pageHarness(context, response) {
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
  ]) {
    elements.set(id, new Node());
  }
  elements.get("incident-page").dataset.incidentId = "repair";
  elements.get("initial-incidents").textContent = JSON.stringify(fixture);
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
