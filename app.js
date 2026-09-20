(() => {
  "use strict";

  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d", { willReadFrequently: false });
  const wrap = document.getElementById("canvas-wrap");
  const confettiLayer = document.getElementById("confetti-layer");

  const colorRow = document.getElementById("color-row");
  const stampRow = document.getElementById("stamp-row");
  const toolButtons = [...document.querySelectorAll(".tool-btn")];
  const sizeButtons = [...document.querySelectorAll(".size-btn")];

  const btnUndo = document.getElementById("btn-undo");
  const btnClear = document.getElementById("btn-clear");
  const btnSave = document.getElementById("btn-save");
  const btnMirror = document.getElementById("btn-mirror");
  const btnSound = document.getElementById("btn-sound");

  const COLORS = [
    "#ff5e5e", "#ff9d4d", "#ffd93d", "#7bd858",
    "#3ddc97", "#4dc7ff", "#5b7bff", "#a86bff",
    "#ff6bd6", "#8a5a44", "#2e2e3a", "#ffffff",
  ];

  const STAMPS = [
    "⭐", "❤️", "🎈", "🦄", "🚗",
    "🐶", "🐱", "🐰", "🐻", "🦁", "🐼", "🐨", "🐷", "🐸", "🐵",
    "🐔", "🐤", "🦋", "🐢", "🐟", "🐳", "🦖",
    "🌞", "🌙", "🌈", "🌸", "🌻", "🌼", "🌳", "🌵", "🍀", "🌊",
    "🍎", "🍌", "🍇", "🍓", "🍊", "🍉", "🍕", "🍦", "🍩", "🎂", "🥕", "🌽",
  ];

  const SIZES = { small: 8, medium: 20, large: 40 };
  const STAMP_SIZES = { small: 42, medium: 64, large: 96 };

  const state = {
    tool: "brush",
    color: COLORS[0],
    rainbow: false,
    size: "medium",
    stamp: STAMPS[0],
    soundOn: true,
    mirror: false,
    hue: 0,
    drawing: false,
    lastX: 0,
    lastY: 0,
  };

  let dpr = Math.max(1, window.devicePixelRatio || 1);
  let cssW = 0;
  let cssH = 0;

  // ---------- Mirror / symmetry drawing ----------

  function mirrorTransforms() {
    if (!state.mirror) return [(x, y) => [x, y]];
    return [
      (x, y) => [x, y],
      (x, y) => [cssW - x, y],
      (x, y) => [x, cssH - y],
      (x, y) => [cssW - x, cssH - y],
    ];
  }

  // ---------- Canvas sizing ----------

  function resizeCanvas(preserve = true) {
    const rect = wrap.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    cssW = w;
    cssH = h;

    let snapshot = null;
    if (preserve && canvas.width > 0 && canvas.height > 0) {
      snapshot = document.createElement("canvas");
      snapshot.width = canvas.width;
      snapshot.height = canvas.height;
      snapshot.getContext("2d").drawImage(canvas, 0, 0);
    }

    dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (snapshot) {
      ctx.drawImage(snapshot, 0, 0, snapshot.width, snapshot.height, 0, 0, w, h);
    } else {
      fillWhite();
    }
  }

  function fillWhite() {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  // ---------- Undo stack ----------

  const undoStack = [];
  const MAX_UNDO = 20;

  function pushUndo() {
    try {
      undoStack.push(canvas.toDataURL("image/png"));
      if (undoStack.length > MAX_UNDO) undoStack.shift();
    } catch (e) {
      /* ignore snapshot failures */
    }
  }

  function undo() {
    if (undoStack.length === 0) return;
    const dataUrl = undoStack.pop();
    const img = new Image();
    img.onload = () => {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      ctx.restore();
      scheduleAutosave();
    };
    img.src = dataUrl;
    playTone(320, 0.08);
  }

  // ---------- Sound (WebAudio, no assets) ----------

  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  }

  function playTone(freq, duration = 0.12, type = "sine") {
    if (!state.soundOn || !audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  }

  function popSound() { playTone(520 + Math.random() * 200, 0.1, "triangle"); }
  function clickSound() { playTone(760, 0.06, "square"); }

  // ---------- UI builders ----------

  function buildColors() {
    COLORS.forEach((c, i) => {
      const b = document.createElement("button");
      b.className = "color-swatch";
      b.style.background = c;
      b.setAttribute("aria-label", "Color");
      if (i === 0) b.classList.add("is-active");
      b.addEventListener("pointerdown", () => selectColor(c, b));
      colorRow.appendChild(b);
    });

    const rainbow = document.createElement("button");
    rainbow.className = "color-swatch rainbow";
    rainbow.setAttribute("aria-label", "Rainbow color");
    rainbow.addEventListener("pointerdown", () => selectRainbow(rainbow));
    colorRow.appendChild(rainbow);
  }

  function selectColor(c, btn) {
    state.color = c;
    state.rainbow = false;
    [...colorRow.children].forEach((el) => el.classList.remove("is-active"));
    btn.classList.add("is-active");
    ensureAudio();
    clickSound();
  }

  function selectRainbow(btn) {
    state.rainbow = true;
    [...colorRow.children].forEach((el) => el.classList.remove("is-active"));
    btn.classList.add("is-active");
    ensureAudio();
    clickSound();
  }

  function buildStamps() {
    STAMPS.forEach((s, i) => {
      const b = document.createElement("button");
      b.className = "stamp-btn";
      b.textContent = s;
      if (i === 0) b.classList.add("is-active");
      b.addEventListener("pointerdown", () => {
        state.stamp = s;
        [...stampRow.children].forEach((el) => el.classList.remove("is-active"));
        b.classList.add("is-active");
        ensureAudio();
        clickSound();
      });
      stampRow.appendChild(b);
    });
  }

  function selectTool(tool, btn) {
    state.tool = tool;
    toolButtons.forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    colorRow.hidden = tool !== "brush";
    stampRow.hidden = tool !== "stamp";
    ensureAudio();
    clickSound();
  }

  toolButtons.forEach((b) => b.addEventListener("pointerdown", () => selectTool(b.dataset.tool, b)));
  sizeButtons.forEach((b) =>
    b.addEventListener("pointerdown", () => {
      state.size = b.dataset.size;
      sizeButtons.forEach((x) => x.classList.remove("is-active"));
      b.classList.add("is-active");
      ensureAudio();
      clickSound();
    })
  );

  // ---------- Drawing ----------

  function getPos(evt) {
    const rect = canvas.getBoundingClientRect();
    return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
  }

  function currentStrokeColor() {
    if (state.rainbow) {
      state.hue = (state.hue + 6) % 360;
      return `hsl(${state.hue}, 85%, 55%)`;
    }
    return state.color;
  }

  function drawDot(x, y) {
    const r = SIZES[state.size] / 2;
    const color = state.tool === "eraser" ? null : currentStrokeColor();
    for (const t of mirrorTransforms()) {
      const [mx, my] = t(x, y);
      ctx.beginPath();
      if (state.tool === "eraser") {
        ctx.globalCompositeOperation = "destination-out";
        ctx.arc(mx, my, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = "source-over";
      } else {
        ctx.fillStyle = color;
        ctx.arc(mx, my, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function strokeSegment(x0, y0, x1, y1) {
    const r = SIZES[state.size];
    const color = state.tool === "eraser" ? null : currentStrokeColor();
    ctx.lineWidth = r;
    for (const t of mirrorTransforms()) {
      const [mx0, my0] = t(x0, y0);
      const [mx1, my1] = t(x1, y1);
      if (state.tool === "eraser") {
        ctx.globalCompositeOperation = "destination-out";
        ctx.beginPath();
        ctx.moveTo(mx0, my0);
        ctx.lineTo(mx1, my1);
        ctx.stroke();
        ctx.globalCompositeOperation = "source-over";
      } else {
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(mx0, my0);
        ctx.lineTo(mx1, my1);
        ctx.stroke();
      }
    }
  }

  function placeStamp(x, y) {
    const size = STAMP_SIZES[state.size];
    ctx.save();
    ctx.font = `${size}px "Baloo 2", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const t of mirrorTransforms()) {
      const [mx, my] = t(x, y);
      ctx.fillText(state.stamp, mx, my);
    }
    ctx.restore();
  }

  function spawnConfetti(x, y) {
    const rect = wrap.getBoundingClientRect();
    for (let i = 0; i < 6; i++) {
      const piece = document.createElement("span");
      piece.className = "confetti-piece";
      piece.textContent = STAMPS[Math.floor(Math.random() * STAMPS.length)];
      piece.style.left = x + (Math.random() * 40 - 20) + "px";
      piece.style.top = y - 10 + "px";
      piece.style.fontSize = 14 + Math.random() * 10 + "px";
      confettiLayer.appendChild(piece);
      setTimeout(() => piece.remove(), 950);
    }
  }

  function pointerDown(evt) {
    ensureAudio();
    canvas.setPointerCapture(evt.pointerId);
    const { x, y } = getPos(evt);
    pushUndo();
    state.drawing = true;
    state.lastX = x;
    state.lastY = y;

    if (state.tool === "stamp") {
      placeStamp(x, y);
      spawnConfetti(x, y);
      popSound();
      state.drawing = false;
      scheduleAutosave();
      return;
    }

    drawDot(x, y);
  }

  function pointerMove(evt) {
    if (!state.drawing) return;
    const { x, y } = getPos(evt);
    strokeSegment(state.lastX, state.lastY, x, y);
    state.lastX = x;
    state.lastY = y;
  }

  function pointerUp() {
    if (state.drawing) {
      state.drawing = false;
      scheduleAutosave();
    }
  }

  canvas.addEventListener("pointerdown", pointerDown);
  canvas.addEventListener("pointermove", pointerMove);
  canvas.addEventListener("pointerup", pointerUp);
  canvas.addEventListener("pointercancel", pointerUp);
  canvas.addEventListener("pointerleave", () => {
    if (state.drawing) pointerUp();
  });

  // Prevent context menu / long-press menu on canvas (kids tapping a lot)
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  // ---------- Top actions ----------

  btnUndo.addEventListener("pointerdown", () => {
    ensureAudio();
    undo();
  });

  btnClear.addEventListener("pointerdown", () => {
    ensureAudio();
    pushUndo();
    fillWhite();
    playTone(200, 0.15, "sawtooth");
    scheduleAutosave();
  });

  btnSave.addEventListener("pointerdown", () => {
    ensureAudio();
    const link = document.createElement("a");
    link.download = "my-sugipaint-picture.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
    popSound();
  });

  btnSound.addEventListener("pointerdown", () => {
    state.soundOn = !state.soundOn;
    btnSound.textContent = state.soundOn ? "🔊" : "🔇";
    if (state.soundOn) {
      ensureAudio();
      clickSound();
    }
  });

  btnMirror.addEventListener("pointerdown", () => {
    state.mirror = !state.mirror;
    btnMirror.classList.toggle("is-active", state.mirror);
    ensureAudio();
    clickSound();
  });

  // ---------- Autosave ----------

  const STORAGE_KEY = "sugipaint-drawing";
  let autosaveTimer = null;

  function scheduleAutosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, canvas.toDataURL("image/png"));
      } catch (e) {
        /* storage full or unavailable — ignore */
      }
    }, 500);
  }

  function loadAutosave() {
    let saved = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      saved = null;
    }
    if (!saved) return;
    const img = new Image();
    img.onload = () => {
      const rect = wrap.getBoundingClientRect();
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
      ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, rect.width, rect.height);
    };
    img.src = saved;
  }

  // ---------- Init ----------

  buildColors();
  buildStamps();
  resizeCanvas(false);
  loadAutosave();

  window.addEventListener("resize", () => resizeCanvas(true));
  window.addEventListener("orientationchange", () => setTimeout(() => resizeCanvas(true), 200));

  // Wake the audio context on the very first touch anywhere (mobile autoplay rules)
  window.addEventListener("pointerdown", ensureAudio, { once: true });
})();
