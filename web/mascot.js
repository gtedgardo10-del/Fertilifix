(() => {
  "use strict";

  const mascots = Array.from(document.querySelectorAll(".mascot-icon, .mascot-avatar"));
  if (!mascots.length) return;

  const motionPreference = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;
  const reduceMotion = Boolean(motionPreference?.matches);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  let pointerX = window.innerWidth / 2;
  let pointerY = window.innerHeight / 2;
  let pointerTimer = null;
  let lastPointerAt = 0;
  const moodStates = ["thinking", "speaking", "happy", "sad"];

  function setMood(state) {
    const mood = moodStates.includes(state) ? state : "idle";
    for (const mascot of mascots) {
      for (const name of moodStates) mascot.classList.toggle(`is-${name}`, mood === name);
    }
  }

  function hatchEgg(host) {
    if (!host || reduceMotion) return;
    host.classList.remove("is-hatching");
    void host.offsetWidth;
    host.classList.add("is-hatching");
    window.setTimeout(() => host.classList.remove("is-hatching"), 820);
  }

  function setGaze(x, y) {
    for (const mascot of mascots) {
      const travel = mascot.classList.contains("mascot-avatar") ? 2.7 : 1.45;
      const pupils = mascot.querySelector(".mascot-pupils");
      if (!pupils) continue;
      pupils.style.transform = `translate(${(x * travel).toFixed(2)}px, ${(y * travel * 0.72).toFixed(2)}px)`;
    }
  }

  function lookToward(x, y) {
    const halfWidth = Math.max(window.innerWidth / 2, 1);
    const halfHeight = Math.max(window.innerHeight / 2, 1);
    setGaze(
      clamp((x - halfWidth) / halfWidth, -1, 1),
      clamp((y - halfHeight) / halfHeight, -1, 1),
    );
  }

  function lookForward() {
    setGaze(0, 0);
  }

  function scheduleBlink(mascot) {
    if (reduceMotion) return;
    const delay = 2300 + Math.random() * 2900;
    window.setTimeout(() => {
      if (document.visibilityState === "visible") {
        mascot.classList.add("is-blinking");
        window.setTimeout(() => mascot.classList.remove("is-blinking"), 190);
        if (Math.random() < 0.16) {
          window.setTimeout(() => {
            if (document.visibilityState === "visible") {
              mascot.classList.add("is-blinking");
              window.setTimeout(() => mascot.classList.remove("is-blinking"), 190);
            }
          }, 250);
        }
      }
      scheduleBlink(mascot);
    }, delay);
  }

  function scheduleIdleLook() {
    if (reduceMotion) return;
    window.clearTimeout(pointerTimer);
    pointerTimer = window.setTimeout(() => {
      const idleFor = performance.now() - lastPointerAt;
      if (idleFor > 2800 && document.visibilityState === "visible") {
        const angle = Math.random() * Math.PI * 2;
        const distance = 0.22 + Math.random() * 0.38;
        const x = Math.cos(angle) * distance;
        const y = Math.sin(angle) * distance;
        setGaze(x, y);
        window.setTimeout(() => {
          if (performance.now() - lastPointerAt > 2800) lookForward();
        }, 700 + Math.random() * 650);
      }
      scheduleIdleLook();
    }, 2200 + Math.random() * 1900);
  }

  function followPointer(event) {
    if (event.pointerType === "touch") return;
    pointerX = event.clientX;
    pointerY = event.clientY;
    lastPointerAt = performance.now();
    lookToward(pointerX, pointerY);
    scheduleIdleLook();
  }

  window.addEventListener("fertilifix:mascot-state", (event) => {
    setMood(event.detail?.state);
  });

  for (const mascot of mascots) {
    mascot.addEventListener("click", () => {
      hatchEgg(mascot.closest(".mascot-mini-wrap, .mascot-avatar-wrap"));
    });
  }

  window.addEventListener("pointermove", followPointer, { passive: true });
  window.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "touch") return;
    lookToward(event.clientX, event.clientY);
    window.setTimeout(lookForward, 700);
  }, { passive: true });
  window.addEventListener("resize", () => lookToward(pointerX, pointerY), { passive: true });
  window.addEventListener("blur", lookForward);
  document.addEventListener("pointerleave", lookForward);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") lookForward();
  });

  for (const mascot of mascots) scheduleBlink(mascot);
  scheduleIdleLook();
})();
