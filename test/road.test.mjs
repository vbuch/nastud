import { test } from "node:test";
import assert from "node:assert/strict";
import { startRoad } from "../src/road.js";

function installRoad(context) {
  function element() {
    const listeners = new Map();
    return {
      style: {
        setProperty(name, value) {
          this[name] = value;
        },
      },
      children: [],
      attributes: new Map(),
      classList: {
        add() {
        },
      },
      focusVisible: false,
      disabled: false,
      clientWidth: 720,
      clientHeight: 240,
      addEventListener(type, callback) {
        listeners.set(type, callback);
      },
      dispatch(type) {
        listeners.get(type)?.();
      },
      setAttribute(name, value) {
        this.attributes.set(name, value);
      },
      append(child) {
        this.children.push(child);
      },
      matches(selector) {
        assert.equal(selector, ":focus-visible");
        return this.focusVisible;
      },
      getBoundingClientRect() {
        return { left: 0, top: 0, width: 80, height: 60 };
      },
      querySelector() {
        return { getBoundingClientRect: this.getBoundingClientRect };
      },
      remove() {
      },
    };
  }

  const selectors = [
    ".st-street", ".st-road-plane", ".st-manholes", ".st-effects",
    ".st-line", ".st-asphalt", ".st-curb", ".st-announcement",
  ];
  const nodes = new Map(selectors.map((selector) => {
    return [selector, element()];
  }));
  const root = {
    isConnected: true,
    querySelector(selector) {
      return nodes.get(selector);
    },
  };
  const document = {
    hidden: false,
    activeElement: null,
    getElementById() {
      return root;
    },
    createElement: element,
  };
  const frames = [];
  const reducedMotion = { matches: false };
  let observeIntersection;
  const globals = {
    document,
    window: {
      matchMedia() {
        return reducedMotion;
      },
      requestAnimationFrame(callback) {
        frames.push(callback);
      },
      setTimeout() {
      },
    },
    IntersectionObserver: class {
      constructor(callback) {
        observeIntersection = callback;
      }
      observe() {
      }
      disconnect() {
      }
    },
  };
  for (const [name, value] of Object.entries(globals)) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    context.after(() => {
      if (previous) {
        Object.defineProperty(globalThis, name, previous);
      } else {
        delete globalThis[name];
      }
    });
  }
  startRoad();
  return {
    document,
    reducedMotion,
    holes: nodes.get(".st-manholes").children,
    effects: nodes.get(".st-effects"),
    announcement: nodes.get(".st-announcement"),
    step(timestamp) {
      const callback = frames.shift();
      assert.ok(callback, "An animation frame must remain scheduled");
      callback(timestamp);
    },
    setVisible(isIntersecting) {
      observeIntersection([{ isIntersecting }]);
    },
  };
}

test("road follows current keyboard focus when focus-visible changes without focus or blur", (context) => {
  const road = installRoad(context);
  const hole = road.holes[0];
  road.step(0);
  road.step(50);
  const moving = hole.style.transform;

  road.document.activeElement = hole;
  hole.focusVisible = true;
  hole.dispatch("focus");
  road.step(100);
  assert.equal(hole.style.transform, moving);

  hole.focusVisible = false;
  road.step(150);
  assert.notEqual(hole.style.transform, moving);
  const resumed = hole.style.transform;

  hole.focusVisible = true;
  road.step(200);
  assert.equal(hole.style.transform, resumed);
  road.document.activeElement = null;
  road.step(250);
  assert.notEqual(hole.style.transform, resumed);
});

test("road resumes after hidden or offscreen states and preserves reduced-motion preference", (context) => {
  const road = installRoad(context);
  const hole = road.holes[0];
  road.step(0);
  const initial = hole.style.transform;
  road.document.hidden = true;
  road.step(50);
  assert.equal(hole.style.transform, initial);
  road.document.hidden = false;
  road.setVisible(false);
  road.step(100);
  assert.equal(hole.style.transform, initial);
  road.setVisible(true);
  road.reducedMotion.matches = true;
  road.step(150);
  assert.equal(hole.style.transform, initial);
  road.reducedMotion.matches = false;
  road.step(200);
  assert.notEqual(hole.style.transform, initial);
});

test("zero timestamps and returning to a suspended page do not jump the road", (context) => {
  const road = installRoad(context);
  const hole = road.holes[0];
  const initial = hole.style.transform;
  road.step(0);
  road.step(0);
  assert.equal(hole.style.transform, initial);
  road.step(50);
  const oneStep = hole.style.transform;
  assert.notEqual(oneStep, initial);
  road.document.hidden = true;
  road.document.hidden = false;
  road.step(60000);
  assert.notEqual(hole.style.transform, oneStep);
  assert.ok(road.holes.includes(hole), "Resuming must retain the existing cover");
  const transformX = Number(/translate3d\(([-\d.]+)px/.exec(hole.style.transform)[1]);
  const initialX = Number(/translate3d\(([-\d.]+)px/.exec(initial)[1]);
  assert.ok(initialX - transformX < 5, "A long browser suspension must advance by at most two short steps");
});

test("opening a keyboard-focused cover releases steam and allows the road to resume", (context) => {
  const road = installRoad(context);
  const hole = road.holes[0];
  road.document.activeElement = hole;
  hole.focusVisible = true;
  hole.dispatch("focus");
  road.step(0);
  const paused = hole.style.transform;
  road.step(50);
  assert.equal(hole.style.transform, paused);

  hole.dispatch("click");
  assert.equal(hole.disabled, true);
  assert.equal(hole.attributes.get("aria-label"), "Шахтата е отворена");
  assert.ok(road.effects.children.some((effect) => {
    return effect.className === "st-puff";
  }));
  assert.match(road.announcement.textContent, /Шахтата изпусна пара/);
  road.step(100);
  assert.notEqual(hole.style.transform, paused);
});
