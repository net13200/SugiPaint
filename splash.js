(() => {
  "use strict";

  const splash = document.getElementById("splash");
  if (!splash) return;

  const paths = [...document.querySelectorAll("#kanji-svg .kanji-stroke")];
  const tip = document.getElementById("brush-tip");
  const word = document.getElementById("splash-word");

  const STROKE_MS = 420;
  const GAP_MS = 90;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let skipped = false;
  let done = false;

  function easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  function finishAll() {
    if (done) return;
    done = true;
    paths.forEach((p) => {
      p.style.strokeDashoffset = "0";
    });
    tip.setAttribute("opacity", "0");
    word.classList.add("is-visible");
    setTimeout(hideSplash, reduceMotion ? 200 : 1450);
  }

  function hideSplash() {
    splash.classList.add("is-hidden");
    setTimeout(() => splash.remove(), 550);
  }

  function drawStroke(path) {
    const len = path.getTotalLength();
    const start = path.getPointAtLength(0);
    tip.setAttribute("cx", start.x);
    tip.setAttribute("cy", start.y);
    tip.setAttribute("opacity", "1");

    return new Promise((resolve) => {
      const t0 = performance.now();
      function frame(now) {
        if (skipped || done) {
          resolve();
          return;
        }
        const t = Math.min(1, (now - t0) / STROKE_MS);
        const eased = easeInOutQuad(t);
        path.style.strokeDashoffset = String(len * (1 - eased));
        const pt = path.getPointAtLength(len * eased);
        tip.setAttribute("cx", pt.x);
        tip.setAttribute("cy", pt.y);
        if (t < 1) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function playSequence() {
    for (const path of paths) {
      if (skipped) break;
      await drawStroke(path);
      if (skipped) break;
      await wait(GAP_MS);
    }
    finishAll();
  }

  paths.forEach((p) => {
    const len = p.getTotalLength();
    p.style.strokeDasharray = String(len);
    p.style.strokeDashoffset = String(len);
  });

  splash.addEventListener("pointerdown", () => {
    skipped = true;
    finishAll();
  });

  // Safety net: never let a stalled animation trap the app behind the splash.
  setTimeout(finishAll, 6000);

  if (reduceMotion) {
    finishAll();
  } else {
    playSequence();
  }
})();
