export function startRoad() {
  const root = document.getElementById("counter-app");
  if (!root) {
    return;
  }

  const street = root.querySelector(".st-street");
  const plane = root.querySelector(".st-road-plane");
  const manholeLayer = root.querySelector(".st-manholes");
  const effects = root.querySelector(".st-effects");
  const line = root.querySelector(".st-line");
  const asphalt = root.querySelector(".st-asphalt");
  const curb = root.querySelector(".st-curb");
  const announcement = root.querySelector(".st-announcement");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const settings = { speed: 42, steam: 10 };
  const sounds = [
    "ПСССТ!",
    "ФШШШШ!",
    "БУМ!",
    "ПУФ!",
    "ПШШШ!",
    "ДРЪН!",
    "ФЪССС!",
    "ПЛОП!",
  ];
  const holes = [];
  let soundIndex = 0;
  let keyboardFocus = false;
  let visible = true;
  let lastTime = null;
  let travel = 0;
  let untilSpawn = 2;
  let previousWidth = plane.clientWidth || 736;

  function lanePosition(lane) {
    if (street.clientHeight < 180) {
      return plane.clientHeight * 0.27 + (lane === 0 ? -5 : 5);
    }
    if (lane === 0) {
      return plane.clientHeight * 0.18;
    }
    return Math.min(plane.clientHeight * 0.5, street.clientHeight - 86);
  }

  function drawHole(hole) {
    hole.button.style.transform = "translate3d(" + (hole.x - 40) + "px," + (hole.y - 40) + "px,0)";
  }

  function burst(hole) {
    if (hole.open) {
      return;
    }
    hole.open = true;
    hole.button.classList.add("st-open");
    hole.button.setAttribute("aria-label", "Шахтата е отворена");
    hole.button.disabled = true;
    keyboardFocus = false;
    const source = hole.button.getBoundingClientRect();
    const overlay = effects.getBoundingClientRect();
    const cover = hole.button.querySelector(".st-lid").getBoundingClientRect();
    const sourceX = source.left + source.width / 2 - overlay.left;
    const sourceY = source.top + source.height / 2 - overlay.top;
    const direction = Math.random() > 0.5 ? 1 : -1;
    const flyingLid = document.createElement("span");
    flyingLid.className = "st-lid st-flying-lid";
    flyingLid.style.left = sourceX + "px";
    flyingLid.style.top = sourceY + "px";
    flyingLid.style.setProperty("--lid-size", cover.width + "px");
    flyingLid.style.setProperty("--lid-flatten", String(cover.height / cover.width));
    flyingLid.style.setProperty("--lid-mid", (direction * (40 + Math.random() * 40)) + "px");
    flyingLid.style.setProperty("--lid-end", (direction * (100 + Math.random() * 100)) + "px");
    effects.append(flyingLid);
    window.setTimeout(() => {
      flyingLid.remove();
    }, 1400);

    for (let index = 0; index < settings.steam; index++) {
      const puff = document.createElement("span");
      puff.className = "st-puff";
      puff.style.left = (sourceX + (Math.random() - 0.5) * 24) + "px";
      puff.style.top = sourceY + "px";
      puff.style.setProperty("--puff-size", (18 + Math.random() * 26) + "px");
      puff.style.setProperty("--puff-drift", ((Math.random() - 0.5) * 115) + "px");
      puff.style.setProperty("--puff-delay", (index * 35) + "ms");
      puff.style.setProperty("--puff-time", (1000 + Math.random() * 700) + "ms");
      effects.append(puff);
      window.setTimeout(() => {
        puff.remove();
      }, 2300);
    }

    const hiss = document.createElement("span");
    hiss.className = "st-hiss";
    const sound = sounds[soundIndex];
    soundIndex = (soundIndex + 1) % sounds.length;
    hiss.textContent = sound;
    hiss.style.left = Math.max(64, Math.min(sourceX, overlay.width - 64)) + "px";
    hiss.style.top = (sourceY - 40) + "px";
    effects.append(hiss);
    window.setTimeout(() => {
      hiss.remove();
    }, 1300);
    announcement.textContent = sound + " Шахтата изпусна пара.";
  }

  function spawn(x, lane) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "st-manhole cursor-interaction";
    button.setAttribute("aria-label", "Пусни пара от шахтата");
    button.innerHTML = '<span class="st-hole" aria-hidden="true"></span><span class="st-lid" aria-hidden="true"></span>';
    const hole = { button, x, y: lanePosition(lane), lane, open: false };
    button.addEventListener("click", () => {
      burst(hole);
    });
    button.addEventListener("focus", () => {
      keyboardFocus = button.matches(":focus-visible");
    });
    button.addEventListener("blur", () => {
      keyboardFocus = false;
    });
    manholeLayer.append(button);
    holes.push(hole);
    drawHole(hole);
  }

  function animate(now) {
    if (!root.isConnected) {
      return;
    }
    const seconds = lastTime === null ? 0 : Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    if (!reducedMotion.matches && !keyboardFocus && visible && !document.hidden) {
      const distance = settings.speed * seconds;
      travel += distance;
      untilSpawn -= seconds;
      line.style.transform = "translateX(" + (-(travel % 108)) + "px)";
      asphalt.style.backgroundPosition = (2 - travel % 9) + "px 3px," + (5 - travel % 13) + "px 1px";
      curb.style.backgroundPositionX = (-(travel % 120)) + "px";

      for (let index = holes.length - 1; index >= 0; index--) {
        const hole = holes[index];
        hole.x -= distance;
        drawHole(hole);
        if (hole.x < -90) {
          hole.button.remove();
          holes.splice(index, 1);
        }
      }

      if (untilSpawn <= 0) {
        const lane = Math.random() > 0.5 ? 1 : 0;
        const width = plane.clientWidth || 736;
        const blocked = holes.some((hole) => {
          return hole.lane === lane && hole.x > width - 20;
        });
        if (!blocked) {
          spawn(width + 72, lane);
          untilSpawn = 1.8 + Math.random() * 1.6;
        }
      }
    }

    window.requestAnimationFrame(animate);
  }

  if (typeof IntersectionObserver !== "undefined") {
    const observer = new IntersectionObserver((entries) => {
      visible = entries[0]?.isIntersecting ?? true;
      if (!root.isConnected) {
        observer.disconnect();
      }
    });
    observer.observe(street);
  }

  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(() => {
      const width = plane.clientWidth || previousWidth;
      const ratio = width / previousWidth;
      for (const hole of holes) {
        hole.x *= ratio;
        hole.y = lanePosition(hole.lane);
        drawHole(hole);
      }
      previousWidth = width;
    });
    observer.observe(street);
  }

  const width = plane.clientWidth || 736;
  spawn(Math.max(48, width * 0.16), 0);
  spawn(width * 0.5, 1);
  spawn(Math.min(width - 48, width * 0.84), 0);
  window.requestAnimationFrame(animate);
}

if (typeof document !== "undefined") {
  startRoad();
}
