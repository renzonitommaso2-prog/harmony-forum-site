const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const splash = document.getElementById("splash");
const startButton = document.getElementById("startButton");

const W = canvas.width;
const H = canvas.height;
const groundY = 410;
const worldW = 2650;

const assets = {};
const assetList = [
  ["background", "assets/background_32.png"],
  ["tileset", "assets/tileset_32.png"],
  ["treeSprite", "assets/krook_tree.png"],
  ["clockSprite", "assets/animated_clock.png"],
  ["houseSprite", "assets/brick_house.png"],
];

let started = false;
let mode = 0;
let cutscene = null;
let paused = false;
let interactCooldown = 0;
let blockedObjectId = null;
let camX = 0;
let time = 0;
let lastT = performance.now();
let audio;

const keys = new Set();
const player = {
  x: 92,
  y: groundY - 56,
  w: 28,
  h: 56,
  vx: 0,
  facing: 1,
};

const objects = [
  {
    id: "tree",
    label: "Albero",
    x: 760,
    audio: "basso",
    color: "#6effb7",
    quote: "Aristotele: la forma ordina la materia.",
  },
  {
    id: "clock",
    label: "Orologio",
    x: 1420,
    audio: "melodia",
    color: "#9bc7ff",
    quote: "Whitney: motion graphics as visual music.",
  },
  {
    id: "house",
    label: "Casa",
    x: 2130,
    audio: "pad",
    color: "#ff6ed3",
    quote: "McLuhan: il medium e il messaggio collassano.",
  },
];

const ads = Array.from({ length: 95 }, (_, i) => ({
  x: 80 + Math.random() * (worldW - 160),
  y: 32 + Math.random() * 285,
  w: 42 + Math.random() * 118,
  h: 18 + Math.random() * 58,
  hue: Math.floor(Math.random() * 360),
  text: ["SALE", "BUY", "NEW", "24H", "CLICK", "VIRAL", "AD", "MAX", "WOW"][i % 9],
  blink: Math.random() * 7,
}));

function loadImageAsset(key, src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      assets[key] = img;
      resolve();
    };
    img.onerror = () => resolve();
    img.src = src;
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function roundedRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

class AudioSystem {
  constructor() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.82;
    this.master.connect(this.ctx.destination);
    this.noiseGain = this.ctx.createGain();
    this.noiseGain.gain.value = 0.28;
    this.noiseGain.connect(this.master);
    this.tracks = {};
    this.fallbacks = {};
    this.buildNoise();
    this.createFallback("basso", 77, "sawtooth");
    this.createFallback("melodia", 196, "sine");
    this.createFallback("pad", 124, "triangle");
    this.loadTrack("basso", ["assets/basso.mp3", "assets/track_1.mp3"]);
    this.loadTrack("melodia", ["assets/melodia.mp3", "assets/track_2.mp3"]);
    this.loadTrack("pad", ["assets/pad.mp3", "assets/track_3.mp3"]);
  }

  async resume() {
    await this.ctx.resume();
  }

  setPaused(isPaused) {
    const target = isPaused ? 0 : 0.82;
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.04);
  }

  buildNoise() {
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 700;
    source.connect(filter);
    filter.connect(this.noiseGain);
    source.start();
  }

  createFallback(name, freq, type) {
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.master);
    const osc = this.ctx.createOscillator();
    const mod = this.ctx.createOscillator();
    const modGain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    mod.frequency.value = name === "melodia" ? 0.16 : 0.07;
    modGain.gain.value = name === "melodia" ? 11 : 4;
    mod.connect(modGain);
    modGain.connect(osc.frequency);
    osc.connect(gain);
    osc.start();
    mod.start();
    this.fallbacks[name] = gain;
  }

  async loadTrack(name, urls) {
    for (const url of urls) {
      try {
        const response = await fetch(url);
        if (!response.ok) continue;
        const arrayBuffer = await response.arrayBuffer();
        const buffer = await this.ctx.decodeAudioData(arrayBuffer);
        const source = this.ctx.createBufferSource();
        const gain = this.ctx.createGain();
        source.buffer = buffer;
        source.loop = true;
        gain.gain.value = 0;
        source.connect(gain);
        gain.connect(this.master);
        source.start();
        this.tracks[name] = gain;
        this.fallbacks[name].gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
        return;
      } catch {
        // Missing user audio falls back to procedural layers.
      }
    }
  }

  setMode(nextMode) {
    const now = this.ctx.currentTime;
    this.noiseGain.gain.setTargetAtTime(nextMode === 0 ? 0.3 : 0, now, 0.24);
    for (const name of ["basso", "melodia", "pad"]) {
      this.setLayer(name, nextMode === 1 ? 0.16 : 0);
    }
  }

  setLayer(name, value) {
    const gain = this.tracks[name] || this.fallbacks[name];
    if (!gain) return;
    gain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.08);
  }

  updateMix() {
    if (paused || mode !== 1 || cutscene) return;
    const distances = objects.map((obj) => Math.abs(player.x - obj.x));
    const nearest = distances.indexOf(Math.min(...distances));
    objects.forEach((obj, i) => {
      const proximity = clamp(1 - distances[i] / 360, 0, 1);
      const target = i === nearest ? lerp(0.18, 1, proximity) : lerp(0.1, 0.02, proximity);
      this.setLayer(obj.audio, target);
    });
  }
}

function drawCoverImage(img, x, y, w, h, alpha = 1) {
  if (!img) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
  ctx.restore();
}

function drawWorld() {
  drawCoverImage(assets.background, 0, 0, W, H, 1);
  ctx.fillStyle = "rgba(5, 7, 10, 0.3)";
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.translate(-camX, 0);
  drawBuildings();
  drawGround();
  objects.forEach(drawObject);
  drawPlayer();
  if (mode === 0) {
    drawOverload();
  } else {
    drawWireframe();
  }
  ctx.restore();

  drawHud();
  if (cutscene) drawCutscene(cutscene);
}

function drawBuildings() {
  ctx.save();
  for (let x = -80; x < worldW + 260; x += 180) {
    const h = 118 + ((x / 180) % 5 + 5) % 5 * 24;
    const w = 108 + ((x / 180) % 3 + 3) % 3 * 18;
    const y = groundY - h;
    ctx.fillStyle = x % 360 === 0 ? "#11171d" : "#151b22";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#0b0f14";
    ctx.fillRect(x - 8, y - 10, w + 16, 12);
    ctx.fillStyle = "rgba(215, 255, 245, 0.28)";
    for (let wx = x + 18; wx < x + w - 18; wx += 28) {
      for (let wy = y + 24; wy < groundY - 34; wy += 34) {
        const lit = Math.sin(wx * 0.07 + wy * 0.11) > -0.15;
        ctx.fillStyle = lit ? "rgba(216, 255, 245, 0.32)" : "rgba(48, 59, 68, 0.55)";
        ctx.fillRect(wx, wy, 13, 16);
        ctx.fillStyle = "rgba(4, 7, 10, 0.45)";
        ctx.fillRect(wx + 6, wy, 2, 16);
      }
    }
  }
  ctx.restore();
}

function drawGround() {
  ctx.fillStyle = "#15191f";
  ctx.fillRect(-200, groundY, worldW + 400, H - groundY);
  const tile = assets.tileset;
  for (let x = -64; x < worldW + 128; x += 64) {
    if (tile) ctx.drawImage(tile, 4, 67, 64, 31, x, groundY - 28, 64, 31);
    ctx.fillStyle = x % 128 === 0 ? "#262d34" : "#303741";
    ctx.fillRect(x, groundY - 4, 64, 4);
  }
}

function drawObject(obj) {
  const sx = obj.x;
  ctx.save();
  ctx.translate(sx, groundY);
  ctx.imageSmoothingEnabled = false;
  if (obj.id === "tree") {
    const img = assets.treeSprite;
    if (img) ctx.drawImage(img, -62, -178, 124, 178);
  }
  if (obj.id === "clock") {
    const img = assets.clockSprite;
    if (img) {
      const frameW = img.width / 3;
      const frame = Math.floor(time * 4) % 3;
      ctx.drawImage(img, frame * frameW, 0, frameW, img.height, -24, -118, 48, 118);
    }
  }
  if (obj.id === "house") {
    const img = assets.houseSprite;
    if (img) ctx.drawImage(img, -82, -136, 164, 136);
  }
  if (mode === 1) {
    ctx.strokeStyle = obj.color;
    ctx.globalAlpha = 0.7 + Math.sin(time * 5) * 0.18;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, -64, 58, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPlayer() {
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.scale(player.facing, 1);
  ctx.fillStyle = "#090b0e";
  ctx.fillRect(-12, 14, 24, 42);
  ctx.fillStyle = "#d8fff5";
  ctx.fillRect(-10, 0, 20, 16);
  ctx.fillStyle = mode === 1 ? "#78ffdf" : "#ffdd56";
  ctx.fillRect(player.facing > 0 ? 8 : -11, 4, 5, 6);
  ctx.fillStyle = "#0b0e11";
  ctx.fillRect(-11, 54, 8, 20);
  ctx.fillRect(3, 54, 8, 20);
  ctx.restore();
}

function drawOverload() {
  for (const ad of ads) {
    const flicker = (Math.sin(time * 8 + ad.blink) + 1) * 0.5;
    ctx.globalAlpha = 0.42 + flicker * 0.5;
    ctx.fillStyle = `hsl(${ad.hue}, 100%, ${46 + flicker * 24}%)`;
    ctx.fillRect(ad.x, ad.y, ad.w, ad.h);
    ctx.fillStyle = "#fff";
    ctx.font = "900 18px Arial";
    ctx.fillText(ad.text, ad.x + 6, ad.y + Math.min(24, ad.h - 5));
  }
  ctx.globalAlpha = 1;
}

function drawWireframe() {
  ctx.save();
  ctx.strokeStyle = "rgba(105, 255, 220, 0.5)";
  ctx.lineWidth = 1;
  for (let x = -200; x < worldW + 300; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, groundY - 2);
    ctx.lineTo(x + 34, H + 40);
    ctx.stroke();
  }
  for (let y = groundY; y < H + 70; y += 22) {
    ctx.beginPath();
    ctx.moveTo(-200, y);
    ctx.lineTo(worldW + 300, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawHud() {
  ctx.save();
  ctx.font = "700 13px Arial";
  ctx.textBaseline = "middle";
  const label = mode === 0 ? "SOVRACCARICO" : "HARMONY";
  ctx.fillStyle = mode === 0 ? "rgba(255, 70, 80, 0.78)" : "rgba(85, 255, 220, 0.78)";
  roundedRect(20, 20, 132, 30, 6);
  ctx.fill();
  ctx.fillStyle = "#071014";
  ctx.fillText(label, 34, 36);
  if (paused) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.68)";
    roundedRect(W - 112, 20, 92, 30, 6);
    ctx.fill();
    ctx.fillStyle = "#dffef8";
    ctx.fillText("PAUSA", W - 94, 36);
  }
  ctx.restore();
}

function drawCutscene(obj) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "rgba(0, 0, 0, 0.82)";
  ctx.fillRect(0, 0, W, H);
  ctx.translate(W / 2, H / 2 - 24);
  if (obj.id === "tree") drawFractalTree(time);
  if (obj.id === "clock") drawClockCutscene(time);
  if (obj.id === "house") drawDataArt(time);
  ctx.restore();
}

function drawFractalTree(t) {
  ctx.strokeStyle = "#80ffb8";
  ctx.lineCap = "round";
  function branch(len, depth) {
    ctx.lineWidth = depth * 0.7;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -len);
    ctx.stroke();
    ctx.translate(0, -len);
    if (depth > 0) {
      const pulse = Math.sin(t * 2 + depth) * 0.2;
      ctx.save();
      ctx.rotate(-0.42 - pulse);
      branch(len * 0.73, depth - 1);
      ctx.restore();
      ctx.save();
      ctx.rotate(0.48 + pulse);
      branch(len * 0.7, depth - 1);
      ctx.restore();
      ctx.save();
      ctx.rotate(0.08 + pulse * 0.4);
      branch(len * 0.55, depth - 2);
      ctx.restore();
    }
  }
  ctx.translate(0, 160);
  branch(92, 8);
}

function drawClockCutscene(t) {
  ctx.save();
  ctx.strokeStyle = "rgba(155, 199, 255, 0.55)";
  ctx.lineWidth = 2;
  for (let r = 56; r <= 210; r += 38) {
    ctx.beginPath();
    ctx.arc(0, 0, r + Math.sin(t * 2 + r) * 5, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let i = 0; i < 12; i += 1) {
    const a = i / 12 * Math.PI * 2 - Math.PI / 2;
    const inner = 156;
    const outer = i % 3 === 0 ? 196 : 182;
    ctx.strokeStyle = i % 3 === 0 ? "#d8fff5" : "rgba(155, 199, 255, 0.72)";
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
    ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
    ctx.stroke();
  }
  const minute = t * 1.2;
  const hour = t * 0.18;
  drawClockHand(hour, 86, 8, "#d8fff5");
  drawClockHand(minute, 142, 4, "#9bc7ff");
  drawClockHand(-t * 4, 166, 2, "#ff6ed3");
  ctx.fillStyle = "#0b1118";
  ctx.strokeStyle = "#d8fff5";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  for (let i = 0; i < 72; i += 1) {
    const a = i / 72 * Math.PI * 2 + t * 0.5;
    const r = 235 + Math.sin(t * 3 + i) * 18;
    ctx.fillStyle = `hsla(${190 + i * 2}, 100%, 72%, 0.45)`;
    ctx.fillRect(Math.cos(a) * r, Math.sin(a) * r, 3, 3);
  }
  ctx.restore();
}

function drawClockHand(angle, length, width, color) {
  const a = angle - Math.PI / 2;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.cos(a) * length, Math.sin(a) * length);
  ctx.stroke();
}

function drawDataArt(t) {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  const img = assets.houseSprite;
  const pulse = 1 + Math.sin(t * 2) * 0.035;
  ctx.scale(pulse, pulse);
  if (img) ctx.drawImage(img, -128, -144, 256, 212);
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 7; i += 1) {
    const x = -118 + i * 39;
    const y = -74 + Math.sin(t * 2.4 + i) * 6;
    ctx.fillStyle = `hsla(${315 + i * 10}, 100%, 68%, ${0.18 + Math.sin(t * 3 + i) * 0.08})`;
    ctx.fillRect(x, y, 22, 32);
  }
  ctx.strokeStyle = "rgba(255, 110, 211, 0.42)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 9; i += 1) {
    const y = 92 + i * 18;
    ctx.beginPath();
    ctx.moveTo(-190 + Math.sin(t + i) * 12, y);
    ctx.quadraticCurveTo(0, y - 40 - Math.sin(t * 2 + i) * 20, 190 + Math.cos(t + i) * 12, y);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "source-over";
  ctx.strokeStyle = "rgba(121, 255, 227, 0.72)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-160, 110);
  ctx.lineTo(-90, 28);
  ctx.lineTo(0, 82);
  ctx.lineTo(84, 12);
  ctx.lineTo(162, 108);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
}

function update(dt) {
  if (!started || paused) return;
  interactCooldown = Math.max(0, interactCooldown - dt);
  if (blockedObjectId) {
    const blocked = objects.find((obj) => obj.id === blockedObjectId);
    if (!blocked || Math.abs(player.x - blocked.x) > 90) blockedObjectId = null;
  }
  if (!cutscene) {
    const left = keys.has("a") || keys.has("arrowleft");
    const right = keys.has("d") || keys.has("arrowright");
    const dir = (right ? 1 : 0) - (left ? 1 : 0);
    player.vx = dir * 235;
    if (dir) player.facing = dir;
    player.x = clamp(player.x + player.vx * dt, 36, worldW - 48);
    camX = clamp(player.x - W * 0.42, 0, worldW - W);
    if (mode === 1 && interactCooldown <= 0) {
      for (const obj of objects) {
        if (obj.id !== blockedObjectId && Math.abs(player.x - obj.x) < 38) {
          cutscene = obj;
          audio.setLayer(obj.audio, 1);
          objects.filter((other) => other !== obj).forEach((other) => audio.setLayer(other.audio, 0.05));
          break;
        }
      }
    }
  }
  audio.updateMix();
}

function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  if (!paused) time += dt;
  update(dt);
  drawWorld();
  requestAnimationFrame(frame);
}

function toggleMode() {
  if (!started || paused || cutscene) return;
  mode = mode === 0 ? 1 : 0;
  audio.setMode(mode);
}

function togglePause() {
  if (!started) return;
  paused = !paused;
  audio.setPaused(paused);
}

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (["arrowleft", "arrowright", " ", "escape", "esc", "enter"].includes(key)) event.preventDefault();
  keys.add(key);
  if (key === " ") toggleMode();
  if (key === "escape" || key === "esc") togglePause();
  if (key === "enter" && cutscene) {
    blockedObjectId = cutscene.id;
    cutscene = null;
    interactCooldown = 1.8;
    audio.updateMix();
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key.toLowerCase());
});

startButton.addEventListener("click", async () => {
  if (!audio) audio = new AudioSystem();
  started = true;
  mode = 0;
  audio.setMode(0);
  splash.classList.add("hidden");
  try {
    await Promise.race([
      audio.resume(),
      new Promise((resolve) => setTimeout(resolve, 300)),
    ]);
  } catch {
    // Some automated browsers keep audio suspended; the first real user gesture resumes it.
  }
});

Promise.all(assetList.map(([key, src]) => loadImageAsset(key, src))).then(() => {
  requestAnimationFrame(frame);
});
