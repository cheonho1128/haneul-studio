'use strict';
/* 하늘 스튜디오 - 편집기 화면 로직 */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 10);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const API = window.api;

const TRACK_H = { video: 64, text: 36, audio: 52 };
const FONTS = ['Malgun Gothic', 'Gulim', 'Dotum', 'Batang', 'Gungsuh', 'Segoe UI', 'Arial', 'Arial Black', 'Impact', 'Georgia', 'Times New Roman', 'Courier New', 'Comic Sans MS'];
const FILTERS = Core.FILTERS;
const TEXT_PRESETS = [
  { name: '기본 텍스트', s: { text: '텍스트를 입력하세요', fontSize: 80, color: '#ffffff', strokeWidth: 0, bgColor: '', bold: true } },
  { name: '자막', s: { text: '자막', fontSize: 56, color: '#ffffff', strokeColor: '#000000', strokeWidth: 6, y: 0.85, bold: true } },
  { name: '제목', s: { text: '제목', fontSize: 140, color: '#ffffff', strokeColor: '#1c4f8a', strokeWidth: 10, fontFamily: 'Arial Black', bold: true } },
  { name: '노란 강조', s: { text: '강조!', fontSize: 110, color: '#ffe14f', strokeColor: '#000000', strokeWidth: 10, bold: true } },
  { name: '박스 라벨', s: { text: '라벨', fontSize: 64, color: '#111111', bgColor: '#ffffff', strokeWidth: 0, bold: true } },
  { name: '반투명 박스', s: { text: '설명 문구', fontSize: 52, color: '#ffffff', bgColor: '#000000aa', strokeWidth: 0, y: 0.82 } },
  { name: '네온', s: { text: 'NEON', fontSize: 120, color: '#9ff3ff', strokeColor: '#00a8ff', strokeWidth: 4, shadow: 30, shadowColor: '#00c8ff', fontFamily: 'Arial Black', bold: true } },
  { name: '손글씨 느낌', s: { text: '오늘의 기록', fontSize: 90, color: '#ffffff', fontFamily: 'Comic Sans MS', strokeWidth: 0, shadow: 10, shadowColor: '#000000' } },
];

/* ---------- 상태 ---------- */
let project, filePath = null, dirty = false;
let selectedId = null;
let selectedIds = new Set();
let tool = 'select'; // 'select' | 'blade'
function setSel(id) { selectedId = id; selectedIds = new Set(id ? [id] : []); }
const isSel = id => id === selectedId || selectedIds.has(id);
let playhead = 0, playing = false, playStartWall = 0, playStartT = 0;
let pxPerSec = 60;
const undoStack = [], redoStack = [];

function newProject() {
  return {
    version: 1, width: 1920, height: 1080, fps: 30, media: [],
    tracks: [
      { id: uid(), kind: 'text', name: '텍스트 1', clips: [] },
      { id: uid(), kind: 'video', name: '영상 2', clips: [] },
      { id: uid(), kind: 'video', name: '메인 영상', clips: [] },
      { id: uid(), kind: 'audio', name: '오디오 1', clips: [] },
    ],
  };
}

const clipDur = Core.clipDuration;
const clipEnd = Core.clipEnd;
const projDur = () => Math.max(0, ...project.tracks.flatMap(t => t.clips.map(clipEnd)));
const mediaOf = c => project.media.find(m => m.id === c.mediaId);
function findClip(id) {
  for (const t of project.tracks) { const c = t.clips.find(x => x.id === id); if (c) return { track: t, clip: c }; }
  return null;
}
function fileUrl(p) {
  const norm = p.replace(/\\/g, '/');
  const parts = norm.split('/').map((s, i) => (i === 0 && /^[A-Za-z]:$/.test(s)) ? s : encodeURIComponent(s));
  return 'file://' + (norm.startsWith('/') ? '' : '/') + parts.join('/');
}
function fmt(t, ms = true) {
  t = Math.max(0, t);
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${String(m).padStart(2, '0')}:${ms ? s.toFixed(2).padStart(5, '0') : String(Math.floor(s)).padStart(2, '0')}`;
}
function toast(msg, ms = 2200) {
  const el = $('#toast'); el.textContent = msg; el.classList.remove('hidden');
  clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.add('hidden'), ms);
}

/* ---------- 실행 취소 ---------- */
function snapshot() { return JSON.stringify(project); }
function commit() {
  undoStack.push(commit.last); if (undoStack.length > 200) undoStack.shift();
  redoStack.length = 0; commit.last = snapshot(); setDirty(true);
}
function undo() {
  if (!undoStack.length) return;
  redoStack.push(snapshot()); project = JSON.parse(undoStack.pop()); commit.last = snapshot();
  afterLoad(false); setDirty(true);
}
function redo() {
  if (!redoStack.length) return;
  undoStack.push(snapshot()); project = JSON.parse(redoStack.pop()); commit.last = snapshot();
  afterLoad(false); setDirty(true);
}
function setDirty(v) { dirty = v; $('#projName').textContent = (filePath ? filePath.split(/[\\/]/).pop() : '제목 없음') + (dirty ? ' *' : ''); }

/* ---------- 미디어 ---------- */
async function importPaths(paths) {
  const added = [];
  for (const p of paths) {
    try {
      const info = await API.probe(p);
      const m = { id: uid(), ...info };
      project.media.push(m);
      added.push(m);
      if (m.hasAudio) loadWave(m);
      loadStrip(m);
    } catch (e) { toast(String(e.message || e).split('\n')[0]); }
  }
  if (added.length) { commit(); renderMedia(); toast(`${added.length}개 파일을 가져왔어요`); }
  return added;
}
const waves = {};
const strips = {};
async function loadStrip(m) {
  if (m.kind !== 'video' || strips[m.id]) return;
  strips[m.id] = 'loading';
  try { strips[m.id] = await API.filmstrip(m.path, m.duration); } catch { strips[m.id] = null; }
  renderTimeline();
}
async function loadWave(m) {
  if (waves[m.id]) return;
  waves[m.id] = 'loading';
  try { waves[m.id] = await API.waveform(m.path); } catch { waves[m.id] = []; }
  renderTimeline();
}

function renderMedia() {
  const list = $('#mediaList'); list.innerHTML = '';
  for (const m of project.media) {
    const el = document.createElement('div');
    el.className = 'media-item' + (m.missing ? ' missing' : '');
    el.draggable = true;
    const icon = m.kind === 'audio' ? '♪' : (m.kind === 'image' ? '🖼' : '🎞');
    el.innerHTML = `<div class="thumb">${m.thumb ? '' : icon}</div><div class="name"></div>${m.kind !== 'image' ? `<span class="dur">${fmt(m.duration, false)}</span>` : ''}<button class="del" title="목록에서 제거">✕</button>`;
    if (m.thumb) el.querySelector('.thumb').style.backgroundImage = `url("${fileUrl(m.thumb)}")`;
    el.querySelector('.name').textContent = m.name;
    el.title = m.path;
    el.ondragstart = e => { e.dataTransfer.setData('text/media-id', m.id); e.dataTransfer.effectAllowed = 'copy'; dragMediaKind = m.kind; };
    el.ondragend = () => { dragMediaKind = null; $$('.track').forEach(t => t.classList.remove('drop-ok')); };
    el.ondblclick = () => addMediaClip(m, null, playhead);
    el.querySelector('.del').onclick = e => {
      e.stopPropagation();
      const used = project.tracks.some(t => t.clips.some(c => c.mediaId === m.id));
      if (used && !confirm('타임라인에서 사용 중인 파일입니다. 해당 클립도 모두 삭제할까요?')) return;
      project.tracks.forEach(t => t.clips = t.clips.filter(c => c.mediaId !== m.id));
      project.media = project.media.filter(x => x.id !== m.id);
      commit(); renderAll();
    };
    list.appendChild(el);
  }
}
let dragMediaKind = null;

function trackFits(track, kind) {
  if (kind === 'text') return track.kind === 'text';
  if (kind === 'audio') return track.kind === 'audio';
  return track.kind === 'video';
}

function freeSpot(track, start, dur, ignoreId) {
  // 겹치지 않는 위치 찾기(앞쪽 빈 곳 또는 겹치는 클립 뒤)
  const others = track.clips.filter(c => c.id !== ignoreId).sort((a, b) => a.start - b.start);
  const overlaps = s => others.some(c => s < clipEnd(c) - 1e-6 && s + dur > c.start + 1e-6);
  if (!overlaps(start)) return start;
  for (const c of others) { const s = clipEnd(c); if (s >= start - dur && !overlaps(s)) return s; }
  return Math.max(start, ...others.map(clipEnd));
}

function addMediaClip(m, track, start) {
  if (!track) {
    track = project.tracks.slice().reverse().find(t => trackFits(t, m.kind));
    if (!track) { track = { id: uid(), kind: m.kind === 'audio' ? 'audio' : 'video', name: '새 트랙', clips: [] }; project.tracks.push(track); }
    // 메인 트랙에 추가할 때는 끝에 붙이기
    if (m.kind !== 'audio' && track.clips.length && start === playhead) start = Math.max(...track.clips.map(clipEnd));
  }
  const dur = m.kind === 'image' ? 5 : m.duration;
  const c = {
    id: uid(), mediaId: m.id, start: 0, in: 0, out: dur, speed: 1, volume: 1,
    fadeIn: 0, fadeOut: 0, opacity: 1,
    filter: { preset: 'none', brightness: 0, contrast: 0, saturation: 0, blur: 0 },
    transform: { scale: 1, x: 0, y: 0, rotation: 0 },
  };
  c.start = freeSpot(track, Math.max(0, start), dur);
  track.clips.push(c);
  setSel(c.id);
  commit(); renderAll();
  return c;
}

function addTextClip(style, start = playhead, dur = 3, track) {
  track = track || project.tracks.find(t => t.kind === 'text');
  if (!track) { track = { id: uid(), kind: 'text', name: '텍스트', clips: [] }; project.tracks.unshift(track); }
  const c = Object.assign({
    id: uid(), type: 'text', start: 0, duration: dur, text: '텍스트', fontFamily: 'Malgun Gothic', fontSize: 80,
    color: '#ffffff', strokeColor: '#000000', strokeWidth: 0, bgColor: '', bold: false, italic: false, align: 'center',
    x: 0.5, y: 0.5, shadow: 0, shadowColor: '#000000', fadeIn: 0, fadeOut: 0, opacity: 1, anim: 'none',
  }, style);
  c.start = freeSpot(track, start, dur);
  track.clips.push(c);
  setSel(c.id);
  commit(); renderAll();
  return c;
}

/* ---------- 미리보기 ---------- */
const canvas = $('#preview');
const ctx = canvas.getContext('2d');
const videoEls = new Map(); // clipId -> HTMLVideoElement / HTMLAudioElement
const imageEls = new Map(); // mediaId -> Image

function getEl(c, m) {
  let el = videoEls.get(c.id);
  const want = m.kind === 'audio' ? 'AUDIO' : 'VIDEO';
  if (el && (el.__src !== m.path || el.tagName !== want)) { el.pause(); el.removeAttribute('src'); el.load(); videoEls.delete(c.id); el = null; }
  if (!el) {
    el = document.createElement(want === 'AUDIO' ? 'audio' : 'video');
    el.preload = 'auto'; el.__src = m.path; el.src = fileUrl(m.path);
    el.addEventListener('seeked', () => { if (!playing) requestDraw(); });
    el.addEventListener('loadeddata', () => { if (!playing) requestDraw(); });
    videoEls.set(c.id, el);
  }
  return el;
}
function getImg(m) {
  let img = imageEls.get(m.id);
  if (!img) { img = new Image(); img.src = fileUrl(m.path); img.onload = () => requestDraw(); imageEls.set(m.id, img); }
  return img;
}
function cleanupEls() {
  const ids = new Set(project.tracks.flatMap(t => t.clips.map(c => c.id)));
  for (const [id, el] of videoEls) if (!ids.has(id)) { el.pause(); el.removeAttribute('src'); el.load(); videoEls.delete(id); }
}

function filterCss(f, c) {
  const parts = [];
  if (f) {
    if (f.brightness) parts.push(`brightness(${1 + f.brightness / 125})`);
    if (f.contrast) parts.push(`contrast(${1 + f.contrast / 100})`);
    if (f.saturation) parts.push(`saturate(${Math.max(0, 1 + f.saturation / 100)})`);
    const p = FILTERS.find(x => x.id === f.preset); if (p && p.css) parts.push(p.css);
    if (f.blur) parts.push(`blur(${f.blur * 0.6 * canvasScale()}px)`);
  }
  if (c && hasFx(c, 'invert')) parts.push('invert(1)');
  return parts.join(' ') || 'none';
}
function canvasScale() { return canvas.width / project.width; }
const hasFx = (c, type) => (c.effects || []).some(e => e.type === type);
const fxAmt = (c, type) => { const e = (c.effects || []).find(x => x.type === type); return e ? (e.amount ?? 50) / 100 : 0; };

function fadeAlpha(c, local, dur, tp = {}) {
  let a = c.opacity ?? 1;
  const fi = Math.min(Math.max(c.fadeIn || 0, tp.alphaIn || 0), dur / 2), fo = Math.min(Math.max(c.fadeOut || 0, tp.alphaOut || 0), dur / 2);
  local = Math.min(local, dur);
  if (fi > 0 && local < fi) a *= local / fi;
  if (fo > 0 && local > dur - fo) a *= (dur - local) / fo;
  return clamp(a, 0, 1);
}

function sizeCanvas() {
  const wrap = $('#previewWrap');
  const maxW = wrap.clientWidth - 24, maxH = wrap.clientHeight - 24;
  const r = Math.min(maxW / project.width, maxH / project.height, 1);
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(16, Math.round(project.width * r)), h = Math.max(16, Math.round(project.height * r));
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  requestDraw();
}

/* ----- 텍스트 ----- */
function textFont(c, scale) { return `${c.italic ? 'italic ' : ''}${c.bold ? 'bold ' : ''}${c.fontSize * scale}px "${c.fontFamily}", "Malgun Gothic", sans-serif`; }
/** 텍스트 블록 크기/위치 계산 */
function textLayout(g, c, W, H, scale) {
  g.save(); g.font = textFont(c, scale);
  const lines = String(c.text).split('\n');
  const fs = c.fontSize * scale, lh = fs * 1.25;
  const widths = lines.map(l => g.measureText(l).width);
  g.restore();
  const bw = Math.max(1, ...widths);
  const ax = c.align === 'left' ? 0 : c.align === 'right' ? 1 : 0.5;
  const cx = c.x * W, cy = c.y * H;
  const left = cx - bw * ax;
  const pad = fs * 0.3;
  const extra = Math.max(pad, (c.strokeWidth || 0) * scale * 1.2, (c.shadow || 0) * scale * 1.5) + 4;
  return { lines, widths, fs, lh, bw, bh: lines.length * lh, ax, cx, cy, left, top: cy - (lines.length * lh) / 2, pad, extra, blockCx: left + bw / 2 };
}
/** 텍스트 그리기. reveal: 보이는 글자 수 (타자기 효과) */
function drawText(g, c, W, H, scale, alpha = 1, reveal = null) {
  if (!c.text) return;
  const L = textLayout(g, c, W, H, scale);
  g.save();
  g.globalAlpha = alpha;
  g.font = textFont(c, scale);
  g.textBaseline = 'middle';
  if (c.bgColor) {
    g.fillStyle = c.bgColor;
    roundRect(g, L.left - L.pad, L.top - L.pad * 0.5, L.bw + L.pad * 2, L.bh + L.pad, L.fs * 0.18);
    g.fill();
  }
  let remain = reveal === null ? Infinity : reveal;
  L.lines.forEach((line, i) => {
    if (remain <= 0) return;
    const y = L.top + L.lh * (i + 0.5);
    const lx = L.left + (L.bw - L.widths[i]) * L.ax;
    const part = remain === Infinity ? line : [...line].slice(0, remain).join('');
    remain -= [...line].length;
    g.textAlign = 'left';
    if (c.shadow) { g.shadowColor = c.shadowColor || '#000'; g.shadowBlur = c.shadow * scale; }
    if (c.strokeWidth > 0) {
      g.lineJoin = 'round'; g.lineWidth = c.strokeWidth * 2 * scale; g.strokeStyle = c.strokeColor;
      g.strokeText(part, lx, y);
      g.shadowBlur = 0;
    }
    g.fillStyle = c.color; g.fillText(part, lx, y);
  });
  g.restore();
}
/** 타자기 효과 단계: [{from, to, chars}] */
function textSteps(c) {
  const dur = clipDur(c);
  if (c.animIn !== 'typewriter') return [{ from: 0, to: dur, chars: null }];
  const len = [...String(c.text).replace(/\n/g, '')].length;
  const n = Math.max(1, Math.min(len, 15));
  const reveal = Math.min(dur * 0.7, Math.max(0.3, (c.animDur || 0.06 * len)));
  const steps = [];
  for (let i = 0; i < n; i++) steps.push({ from: i * reveal / n, to: i === n - 1 ? dur : (i + 1) * reveal / n, chars: Math.ceil(len * (i + 1) / n) });
  return steps;
}
function textAnimState(c, local, dur, W, H) {
  const animD = Math.min(c.animDur || 0.5, dur);
  const p = clamp(local / Math.max(0.01, animD), 0, 1), e = (1 - p) * (1 - p);
  const off = 0.06 * H;
  let dx = 0, dy = 0;
  if (c.animIn === 'up') dy = off * e;
  if (c.animIn === 'down') dy = -off * e;
  if (c.animIn === 'left') dx = -off * e;
  if (c.animIn === 'right') dx = off * e;
  const slide = ['up', 'down', 'left', 'right'].includes(c.animIn);
  const cc = slide ? { ...c, fadeIn: Math.max(c.fadeIn || 0, animD) } : c;
  let reveal = null;
  if (c.animIn === 'typewriter') { const st = textSteps(c).find(s => local >= s.from && local < s.to); reveal = st ? st.chars : null; }
  return { dx, dy, alpha: fadeAlpha(cc, local, dur), reveal };
}
function drawTextAnimated(g, c, W, H, scale, local, dur) {
  const st = textAnimState(c, local, dur, W, H);
  g.save(); g.translate(st.dx, st.dy);
  drawText(g, c, W, H, scale, st.alpha, st.reveal);
  g.restore();
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

/* ----- 효과용 보조 캔버스 ----- */
const fxCanvases = [];
function fxCanvas(i, w, h) {
  let c = fxCanvases[i];
  if (!c) { c = document.createElement('canvas'); fxCanvases[i] = c; }
  w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } else c.getContext('2d').clearRect(0, 0, w, h);
  return c;
}
let noiseTile = null;
function getNoise() {
  if (noiseTile) return noiseTile;
  noiseTile = document.createElement('canvas'); noiseTile.width = noiseTile.height = 256;
  const g = noiseTile.getContext('2d'), d = g.createImageData(256, 256);
  for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
  g.putImageData(d, 0, 0);
  return noiseTile;
}
function hexRgb(h) { h = (h || '#00ff00').replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
function tinted(src, color, idx) {
  const c = fxCanvas(idx, src.width, src.height), g = c.getContext('2d');
  g.globalCompositeOperation = 'source-over'; g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'multiply'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'destination-in'; g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-over';
  return c;
}
const COMPLEX_FX = ['zoomIn', 'zoomOut', 'pixelate', 'rgbSplit', 'grain', 'vignette', 'flash'];

/** 미디어 클립 한 장면을 그린다 */
function drawMediaClip(src, c, m, W, H, t, local, dur, tp, alpha) {
  const sw = src.videoWidth || src.naturalWidth || m.width, sh = src.videoHeight || src.naturalHeight || m.height;
  if (!sw || !sh) return;
  const tf = c.transform || { scale: 1, x: 0, y: 0, rotation: 0 };
  const fit = Math.min(W / sw, H / sh) * tf.scale;
  const dw = sw * fit, dh = sh * fit;
  const vdur = dur + (tp.extend || 0);
  let x = W / 2 + tf.x * W, y = H / 2 + tf.y * H;
  if (hasFx(c, 'shake')) { const amp = (0.004 + 0.03 * fxAmt(c, 'shake')) * W; x += amp * Math.sin(t * 37); y += amp * Math.cos(t * 29); }
  if (tp.slide) {
    const p = clamp((t - c.start) / tp.slide.d, 0, 1), e = (1 - p) * (1 - p);
    if (tp.slide.dir === 'left') x += W * e; if (tp.slide.dir === 'right') x -= W * e;
    if (tp.slide.dir === 'up') y += H * e; if (tp.slide.dir === 'down') y -= H * e;
  }
  const css = filterCss(c.filter, c);
  const complex = (c.effects || []).some(e => COMPLEX_FX.includes(e.type)) || (c.chroma && c.chroma.on) || tp.whiteIn || tp.whiteOut;
  let img = src, iw = dw, ih = dh;
  if (complex) {
    const fx = fxCanvas(0, dw, dh), g = fx.getContext('2d');
    g.filter = css;
    let zf = 1;
    if (hasFx(c, 'zoomIn')) zf = 1 + (0.05 + 0.35 * fxAmt(c, 'zoomIn')) * clamp(local / vdur, 0, 1);
    if (hasFx(c, 'zoomOut')) { const z = 0.05 + 0.35 * fxAmt(c, 'zoomOut'); zf = 1 + z - z * clamp(local / vdur, 0, 1); }
    g.drawImage(src, (fx.width - fx.width * zf) / 2, (fx.height - fx.height * zf) / 2, fx.width * zf, fx.height * zf);
    g.filter = 'none';
    if (hasFx(c, 'pixelate')) {
      const kf = 4 + fxAmt(c, 'pixelate') * 40;
      const tiny = fxCanvas(1, fx.width / kf * (project.width / W) , fx.height / kf * (project.width / W));
      tiny.getContext('2d').drawImage(fx, 0, 0, tiny.width, tiny.height);
      g.clearRect(0, 0, fx.width, fx.height); g.imageSmoothingEnabled = false;
      g.drawImage(tiny, 0, 0, fx.width, fx.height); g.imageSmoothingEnabled = true;
    }
    if (c.chroma && c.chroma.on) {
      const [kr, kg, kb] = hexRgb(c.chroma.color);
      const sim = (0.05 + 0.4 * (c.chroma.similarity ?? 30) / 100) * 442, blend = 0.08 * 442;
      const d = g.getImageData(0, 0, fx.width, fx.height), p = d.data;
      for (let i = 0; i < p.length; i += 4) {
        const dist = Math.hypot(p[i] - kr, p[i + 1] - kg, p[i + 2] - kb);
        if (dist < sim) p[i + 3] = 0; else if (dist < sim + blend) p[i + 3] *= (dist - sim) / blend;
      }
      g.putImageData(d, 0, 0);
    }
    if (hasFx(c, 'rgbSplit')) {
      const px = (2 + 18 * fxAmt(c, 'rgbSplit')) * W / 1920;
      const r = tinted(fx, '#ff0000', 2), gr = tinted(fx, '#00ff00', 3), b = tinted(fx, '#0000ff', 4);
      g.clearRect(0, 0, fx.width, fx.height);
      g.globalCompositeOperation = 'lighter';
      g.drawImage(r, -px, 0); g.drawImage(gr, 0, 0); g.drawImage(b, px, 0);
      g.globalCompositeOperation = 'source-over';
    }
    g.globalCompositeOperation = 'source-atop';
    if (hasFx(c, 'grain')) {
      g.globalAlpha = 0.05 + 0.2 * fxAmt(c, 'grain');
      const n = getNoise(), ox = Math.random() * 256, oy = Math.random() * 256;
      g.fillStyle = g.createPattern(n, 'repeat'); g.translate(-ox, -oy); g.fillRect(ox, oy, fx.width, fx.height); g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = 1;
    }
    if (hasFx(c, 'vignette')) {
      const a = 0.35 + 0.6 * fxAmt(c, 'vignette');
      const grd = g.createRadialGradient(fx.width / 2, fx.height / 2, Math.min(fx.width, fx.height) * 0.25, fx.width / 2, fx.height / 2, Math.hypot(fx.width, fx.height) / 2);
      grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, `rgba(0,0,0,${a})`);
      g.fillStyle = grd; g.fillRect(0, 0, fx.width, fx.height);
    }
    let white = 0;
    if (hasFx(c, 'flash')) { const d = 0.15 + 0.5 * fxAmt(c, 'flash'); if (local < d) white = Math.max(white, 1 - local / d); }
    if (tp.whiteIn && local < tp.whiteIn) white = Math.max(white, 1 - local / tp.whiteIn);
    if (tp.whiteOut && local > dur - tp.whiteOut) white = Math.max(white, Math.min(1, (local - (dur - tp.whiteOut)) / tp.whiteOut));
    if (white > 0) { g.globalAlpha = white; g.fillStyle = '#fff'; g.fillRect(0, 0, fx.width, fx.height); g.globalAlpha = 1; }
    g.globalCompositeOperation = 'source-over';
    img = fx;
  }
  ctx.save();
  ctx.globalAlpha = alpha;
  if (!complex) ctx.filter = css;
  ctx.translate(x, y);
  ctx.rotate((tf.rotation || 0) * Math.PI / 180);
  ctx.scale(hasFx(c, 'mirror') ? -1 : 1, hasFx(c, 'flipV') ? -1 : 1);
  ctx.drawImage(img, -iw / 2, -ih / 2, iw, ih);
  ctx.restore();
}

let drawQueued = false;
function requestDraw() { if (!drawQueued) { drawQueued = true; requestAnimationFrame(() => { drawQueued = false; draw(); }); } }

function draw() {
  const t = playhead;
  const W = canvas.width, H = canvas.height, s = canvasScale();
  const plan = Core.transitionPlan(project);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.filter = 'none';
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const activeEls = new Set();

  for (const tr of project.tracks.filter(x => x.kind === 'audio')) {
    for (const c of tr.clips) {
      if (t < c.start || t >= clipEnd(c)) continue;
      const m = mediaOf(c); if (!m) continue;
      const el = getEl(c, m); activeEls.add(el);
      syncMedia(el, c, t, tr.muted, fadeAlpha({ fadeIn: c.fadeIn, fadeOut: c.fadeOut }, t - c.start, clipDur(c)));
    }
  }
  const visual = project.tracks.filter(x => x.kind !== 'audio').slice().reverse();
  for (const tr of visual) {
    const clips = tr.clips.slice().sort((a, b) => a.start - b.start);
    for (const c of clips) {
      const tp = plan[c.id] || {};
      const dur = clipDur(c);
      const end = c.start + dur + (c.type === 'text' ? 0 : (tp.extend || 0));
      if (t < c.start || t >= end) continue;
      const local = t - c.start;
      if (c.type === 'text') { if (!tr.hidden) drawTextAnimated(ctx, c, W, H, s, local, dur); continue; }
      const m = mediaOf(c); if (!m) continue;
      const a = fadeAlpha(c, local, dur, tp);
      let src;
      if (m.kind === 'image') src = getImg(m);
      else {
        src = getEl(c, m); activeEls.add(src);
        syncMedia(src, c, t, tr.muted, local >= dur ? 0 : fadeAlpha({ fadeIn: c.fadeIn, fadeOut: c.fadeOut }, local, dur));
      }
      if (tr.hidden) continue;
      if ((src.tagName === 'VIDEO' && src.readyState < 2) || (src.tagName === 'IMG' && !src.complete)) continue;
      drawMediaClip(src, c, m, W, H, t, local, dur, tp, a);
    }
  }
  for (const el of videoEls.values()) if (!activeEls.has(el) && !el.paused) el.pause();
  const sel = selectedId && findClip(selectedId);
  if (sel && !playing && t >= sel.clip.start && t < clipEnd(sel.clip)) drawSelection(sel.clip, W, H, s);
  updateTimecode();
}

function clipBox(c, W, H, s) {
  if (c.type === 'text') {
    ctx.save();
    ctx.font = `${c.italic ? 'italic ' : ''}${c.bold ? 'bold ' : ''}${c.fontSize * s}px "${c.fontFamily}", "Malgun Gothic", sans-serif`;
    const lines = String(c.text).split('\n');
    const bw = Math.max(...lines.map(l => ctx.measureText(l).width)) + c.fontSize * s * 0.6;
    const bh = lines.length * c.fontSize * s * 1.25 + c.fontSize * s * 0.3;
    ctx.restore();
    const ax = c.align === 'left' ? 0 : c.align === 'right' ? 1 : 0.5;
    return { cx: c.x * W + bw * (0.5 - ax), cy: c.y * H, w: bw, h: bh, rot: 0 };
  }
  const m = mediaOf(c); if (!m) return null;
  const tf = c.transform;
  const fit = Math.min(W / m.width, H / m.height) * tf.scale;
  return { cx: W / 2 + tf.x * W, cy: H / 2 + tf.y * H, w: m.width * fit, h: m.height * fit, rot: tf.rotation || 0 };
}
function drawSelection(c, W, H, s) {
  const b = clipBox(c, W, H, s); if (!b) return;
  ctx.save();
  ctx.translate(b.cx, b.cy); ctx.rotate(b.rot * Math.PI / 180);
  ctx.strokeStyle = '#4fb3ff'; ctx.lineWidth = 2 * (window.devicePixelRatio || 1);
  ctx.setLineDash([6, 4]); ctx.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h);
  ctx.setLineDash([]); ctx.fillStyle = '#4fb3ff';
  const k = 10 * (window.devicePixelRatio || 1);
  ctx.fillRect(b.w / 2 - k / 2, b.h / 2 - k / 2, k, k);
  ctx.restore();
}

function syncMedia(el, c, t, muted, volFade) {
  const srcT = c.in + (t - c.start) * (c.speed || 1);
  el.muted = !!muted;
  el.volume = clamp((c.volume ?? 1) * volFade, 0, 1);
  if (playing) {
    if (el.playbackRate !== c.speed) el.playbackRate = c.speed;
    if (Math.abs(el.currentTime - srcT) > 0.25) el.currentTime = srcT;
    if (el.paused) el.play().catch(() => {});
  } else {
    if (!el.paused) el.pause();
    if (Math.abs(el.currentTime - srcT) > 0.02 && !el.seeking) el.currentTime = srcT;
  }
}

function tick() {
  if (!playing) return;
  playhead = playStartT + (performance.now() - playStartWall) / 1000;
  const end = projDur();
  if (playhead >= end) { playhead = end; setPlaying(false); }
  draw(); updatePlayhead(true);
  if (playing) requestAnimationFrame(tick);
}
function setPlaying(v) {
  if (v && projDur() <= 0) return;
  if (v && playhead >= projDur() - 0.01) playhead = 0;
  playing = v;
  $('#btnPlay').textContent = v ? '❚❚' : '▶';
  if (v) { playStartWall = performance.now(); playStartT = playhead; requestAnimationFrame(tick); }
  else { for (const el of videoEls.values()) el.pause(); requestDraw(); }
}
function seek(t) {
  playhead = clamp(t, 0, Math.max(projDur(), 0));
  if (playing) { playStartWall = performance.now(); playStartT = playhead; }
  updatePlayhead(); requestDraw();
}
function updateTimecode() { $('#timecode').textContent = `${fmt(playhead)} / ${fmt(projDur())}`; }

/* 미리보기에서 드래그로 위치 이동 */
canvas.addEventListener('pointerdown', e => {
  const sel = selectedId && findClip(selectedId);
  if (!sel || playing) return;
  const c = sel.clip;
  if (playhead < c.start || playhead >= clipEnd(c)) return;
  const rect = canvas.getBoundingClientRect();
  const r = canvas.width / rect.width;
  const W = canvas.width, H = canvas.height;
  const b = clipBox(c, W, H, canvasScale()); if (!b) return;
  const px = (e.clientX - rect.left) * r, py = (e.clientY - rect.top) * r;
  const corner = Math.hypot(px - (b.cx + b.w / 2), py - (b.cy + b.h / 2)) < 16 * r && !b.rot;
  const sx = e.clientX, sy = e.clientY;
  const orig = JSON.parse(JSON.stringify(c));
  canvas.setPointerCapture(e.pointerId);
  const move = ev => {
    const dx = (ev.clientX - sx) * r / W, dy = (ev.clientY - sy) * r / H;
    if (corner) {
      const d0 = Math.hypot(b.w / 2, b.h / 2);
      const d1 = Math.hypot(b.w / 2 + dx * W, b.h / 2 + dy * H);
      const k = Math.max(0.05, d1 / d0);
      if (c.type === 'text') c.fontSize = Math.round(clamp(orig.fontSize * k, 8, 600));
      else c.transform.scale = +clamp(orig.transform.scale * k, 0.05, 10).toFixed(3);
    } else if (c.type === 'text') { c.x = +(orig.x + dx).toFixed(4); c.y = +(orig.y + dy).toFixed(4); }
    else { c.transform.x = +(orig.transform.x + dx).toFixed(4); c.transform.y = +(orig.transform.y + dy).toFixed(4); }
    requestDraw();
  };
  const up = () => { canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up); commit(); renderProps(); };
  canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up);
});

/* ---------- 타임라인 ---------- */
const tracksEl = $('#tracks'), headsEl = $('#trackHeads'), scrollEl = $('#tlScroll'), innerEl = $('#tlInner'), ruler = $('#ruler');

function timelineWidth() { return Math.max(scrollEl.clientWidth, (projDur() + 30) * pxPerSec); }

function renderTimeline() {
  const width = timelineWidth();
  innerEl.style.width = width + 'px';
  tracksEl.innerHTML = ''; headsEl.innerHTML = '';
  project.tracks.forEach((tr, ti) => {
    const h = TRACK_H[tr.kind];
    const head = document.createElement('div');
    head.className = 'track-head'; head.style.setProperty('--h', h + 'px');
    const icon = tr.kind === 'audio' ? '♪' : tr.kind === 'text' ? 'T' : '▣';
    head.innerHTML = `<span class="nm" title="더블클릭해서 이름 바꾸기">${icon} </span>
      ${tr.kind !== 'audio' ? `<button class="${tr.hidden ? 'off' : ''}" data-a="hide" title="숨기기">${tr.hidden ? '◌' : '👁'}</button>` : ''}
      ${tr.kind !== 'text' ? `<button class="${tr.muted ? 'off' : ''}" data-a="mute" title="음소거">${tr.muted ? '🔇' : '🔊'}</button>` : ''}
      <button data-a="up" title="위로">▲</button><button data-a="del" title="트랙 삭제">✕</button>`;
    head.querySelector('.nm').append(tr.name);
    head.querySelector('.nm').ondblclick = () => { const n = prompt('트랙 이름', tr.name); if (n) { tr.name = n; commit(); renderTimeline(); } };
    head.onclick = e => {
      const a = e.target.dataset.a; if (!a) return;
      if (a === 'hide') tr.hidden = !tr.hidden;
      if (a === 'mute') tr.muted = !tr.muted;
      if (a === 'up' && ti > 0) [project.tracks[ti - 1], project.tracks[ti]] = [project.tracks[ti], project.tracks[ti - 1]];
      if (a === 'del') {
        if (tr.clips.length && !confirm('트랙과 안의 클립을 모두 삭제할까요?')) return;
        project.tracks.splice(ti, 1);
      }
      commit(); renderTimeline(); requestDraw();
    };
    headsEl.appendChild(head);

    const row = document.createElement('div');
    row.className = 'track'; row.style.setProperty('--h', h + 'px'); row.dataset.id = tr.id;
    row.ondragover = e => {
      if (!e.dataTransfer.types.includes('text/media-id')) return;
      if (dragMediaKind && !trackFits(tr, dragMediaKind)) return;
      e.preventDefault(); row.classList.add('drop-ok');
    };
    row.ondragleave = () => row.classList.remove('drop-ok');
    row.ondrop = e => {
      row.classList.remove('drop-ok');
      const m = project.media.find(x => x.id === e.dataTransfer.getData('text/media-id')); if (!m) return;
      e.preventDefault();
      const x = e.clientX - row.getBoundingClientRect().left;
      addMediaClip(m, tr, x / pxPerSec);
    };
    for (const c of tr.clips) row.appendChild(renderClip(c, tr));
    renderTransitionMarkers(tr, row);
    tracksEl.appendChild(row);
  });
  drawRuler(); updatePlayhead();
}

function renderClip(c, tr) {
  const el = document.createElement('div');
  const m = c.type === 'text' ? null : mediaOf(c);
  const kind = c.type === 'text' ? 'text' : (tr.kind === 'audio' ? 'audio' : (m ? m.kind : 'video'));
  el.className = `clip ${kind}` + (isSel(c.id) ? ' selected' : '');
  el.style.left = c.start * pxPerSec + 'px';
  const wpx = Math.max(4, clipDur(c) * pxPerSec);
  el.style.width = wpx + 'px';
  el.dataset.id = c.id;
  const label = document.createElement('div'); label.className = 'label';
  label.textContent = c.type === 'text' ? c.text.replace(/\n/g, ' ') : (m ? m.name : '(없는 파일)');
  el.appendChild(label);
  const badges = [];
  if (c.speed && c.speed !== 1) badges.push(`${c.speed}x`);
  if (c.filter && c.filter.preset && c.filter.preset !== 'none') badges.push(FILTERS.find(f => f.id === c.filter.preset)?.name);
  if (c.effects && c.effects.length) badges.push('✦' + c.effects.length);
  if (c.chroma && c.chroma.on) badges.push('크로마키');
  if (c.animIn && c.animIn !== 'none') badges.push('애니');
  if (badges.length) { const b = document.createElement('span'); b.className = 'badge'; b.textContent = badges.join(' · '); el.appendChild(b); }

  const showAudio = m && m.hasAudio && (kind === 'audio' || kind === 'video');
  // 필름스트립 (시간대별 장면)
  if (m && kind !== 'audio') {
    const strip = document.createElement('div'); strip.className = 'strip' + (showAudio ? ' with-audio' : '');
    const h = showAudio ? 38 : 52;
    const aspect = m.width && m.height ? m.width / m.height : 16 / 9;
    const tw = Math.max(24, Math.round(h * aspect));
    const fsInfo = strips[m.id];
    const count = Math.min(400, Math.ceil(wpx / tw));
    const step = wpx / count > tw ? wpx / count : tw;
    for (let i = 0, x = 0; x < wpx && i < 400; i++, x += step) {
      const img = document.createElement('img');
      img.style.left = x + 'px'; img.style.width = tw + 'px'; img.style.height = h + 'px';
      let srcPath = m.thumb;
      if (m.kind === 'video' && fsInfo && fsInfo.frames && fsInfo.frames.length) {
        const st = c.in + ((x + tw / 2) / pxPerSec) * (c.speed || 1);
        srcPath = fsInfo.frames[clamp(Math.floor(st / fsInfo.interval), 0, fsInfo.frames.length - 1)];
      }
      if (srcPath) { img.src = fileUrl(srcPath); img.draggable = false; strip.appendChild(img); }
    }
    el.appendChild(strip);
  }
  // 소리 파형
  if (showAudio) {
    const peaks = waves[m.id];
    const cv = document.createElement('canvas'); cv.className = 'wave' + (kind === 'audio' ? ' big' : '');
    const w = Math.min(8000, Math.max(4, Math.round(wpx)));
    const hh = kind === 'audio' ? 40 : 16;
    cv.width = w; cv.height = hh;
    if (Array.isArray(peaks) && peaks.length) {
      const g = cv.getContext('2d'); g.fillStyle = kind === 'audio' ? 'rgba(255,236,190,.9)' : 'rgba(140,220,255,.9)';
      const peakMax = peaks.__max || (peaks.__max = Math.max(0.05, ...peaks.slice(0, 200000)));
      for (let x = 0; x < w; x++) {
        const st = c.in + (x / w) * (c.out - c.in);
        const v = Math.min(1, (peaks[Math.floor(st * 50)] || 0) / peakMax) * ((c.volume ?? 1) > 0 ? 1 : 0.15);
        const bh = Math.max(1, v * hh);
        g.fillRect(x, (hh - bh) / 2, 1, bh);
      }
    }
    el.appendChild(cv);
  }
  const dur = clipDur(c);
  if (c.fadeIn > 0) { const f = document.createElement('div'); f.className = 'fade in'; f.style.width = Math.min(c.fadeIn, dur) * pxPerSec + 'px'; el.appendChild(f); }
  if (c.fadeOut > 0) { const f = document.createElement('div'); f.className = 'fade out'; f.style.width = Math.min(c.fadeOut, dur) * pxPerSec + 'px'; el.appendChild(f); }
  const hl = document.createElement('div'); hl.className = 'handle l';
  const hr = document.createElement('div'); hr.className = 'handle r';
  el.append(hl, hr);
  el.addEventListener('pointerdown', e => clipPointerDown(e, c, tr, el));
  return el;
}

/** 같은 영상 트랙에서 붙어 있는 클립 사이에 전환 버튼 표시 */
function renderTransitionMarkers(tr, row) {
  if (tr.kind !== 'video') return;
  const clips = tr.clips.slice().sort((a, b) => a.start - b.start);
  for (let i = 1; i < clips.length; i++) {
    const a = clips[i - 1], b = clips[i];
    if (Math.abs(clipEnd(a) - b.start) > 0.05) continue;
    const t = b.transitionIn && b.transitionIn.type !== 'none' ? b.transitionIn : null;
    const mk = document.createElement('button');
    mk.className = 'tmark' + (t ? ' on' : '');
    mk.title = t ? `전환: ${Core.TRANSITIONS.find(x => x.type === t.type)?.name} (클릭해서 변경)` : '전환 효과 넣기';
    mk.textContent = t ? '⧓' : '+';
    mk.style.left = b.start * pxPerSec + 'px';
    mk.addEventListener('pointerdown', e => e.stopPropagation());
    mk.onclick = e => {
      e.stopPropagation();
      if (!b.transitionIn || b.transitionIn.type === 'none') { b.transitionIn = { type: 'dissolve', duration: 0.5 }; commit(); }
      setSel(b.id); renderTimeline(); renderProps(); requestDraw();
      document.querySelector('#props .trans-group')?.scrollIntoView({ block: 'start' });
    };
    row.appendChild(mk);
  }
}

/** 여러 클립을 함께 옮기기 */
function groupDrag(e, anchor) {
  const items = [];
  for (const tr of project.tracks) for (const c of tr.clips) if (selectedIds.has(c.id)) items.push({ c, s0: c.start });
  const minStart = Math.min(...items.map(i => i.s0));
  const startX = e.clientX;
  const pts = snapPoints(null).filter(p => !items.some(i => Math.abs(i.c.start - p) < 1e-6 || Math.abs(clipEnd(i.c) - p) < 1e-6));
  let moved = false;
  const move = ev => {
    let dt = (ev.clientX - startX) / pxPerSec;
    if (!moved && Math.abs(ev.clientX - startX) < 3) return;
    moved = true;
    const sn = snap(anchor.start - (anchor.start - items.find(i => i.c === anchor).s0) + dt, pts);
    if (sn.hit !== null) { dt = sn.t - items.find(i => i.c === anchor).s0; showSnap(sn.hit); } else showSnap(null);
    dt = Math.max(dt, -minStart);
    for (const i of items) {
      i.c.start = i.s0 + dt;
      const el = tracksEl.querySelector(`.clip[data-id="${i.c.id}"]`); if (el) el.style.left = i.c.start * pxPerSec + 'px';
    }
    requestDraw();
  };
  const up = () => {
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
    showSnap(null);
    if (moved) {
      // 다른 클립과 겹치면 원래 위치로 되돌리기
      const clash = project.tracks.some(tr => tr.clips.some(o => !selectedIds.has(o.id) && tr.clips.some(c => selectedIds.has(c.id) && c.start < clipEnd(o) - 1e-6 && clipEnd(c) > o.start + 1e-6)));
      if (clash) { for (const i of items) i.c.start = i.s0; toast('다른 클립과 겹쳐서 옮길 수 없어요'); }
      else commit();
    }
    renderTimeline(); requestDraw();
  };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
}

function snapPoints(exceptId) {
  const pts = [0, playhead];
  for (const t of project.tracks) for (const c of t.clips) if (c.id !== exceptId) pts.push(c.start, clipEnd(c));
  return pts;
}
function snap(t, pts) {
  if (!$('#chkSnap').checked) return { t, hit: null };
  const th = 8 / pxPerSec;
  let best = null;
  for (const p of pts) if (Math.abs(p - t) < th && (best === null || Math.abs(p - t) < Math.abs(best - t))) best = p;
  return best === null ? { t, hit: null } : { t: best, hit: best };
}
function showSnap(t) {
  let l = innerEl.querySelector('.snapline');
  if (t === null) { if (l) l.remove(); return; }
  if (!l) { l = document.createElement('div'); l.className = 'snapline'; innerEl.appendChild(l); }
  l.style.left = t * pxPerSec + 'px';
}

function clipPointerDown(e, c, tr, el) {
  if (e.button !== 0) return;
  e.stopPropagation();
  if (tool === 'blade') {
    let t = (e.clientX - innerEl.getBoundingClientRect().left) / pxPerSec;
    if ($('#chkSnap').checked) t = snap(t, snapPoints(null)).t;
    setSel(c.id); splitAt(t); return;
  }
  if (e.shiftKey || e.ctrlKey) { toggleSelect(c.id); return; }
  if (selectedIds.size > 1 && selectedIds.has(c.id) && !e.target.classList.contains('handle')) { groupDrag(e, c); return; }
  selectClip(c.id);
  const mode = e.target.classList.contains('l') ? 'trimL' : e.target.classList.contains('r') ? 'trimR' : 'move';
  const startX = e.clientX, startY = e.clientY;
  const orig = { ...c };
  const m = c.type === 'text' ? null : mediaOf(c);
  const pts = snapPoints(c.id);
  let moved = false, curTrack = tr;
  el.setPointerCapture(e.pointerId);
  el.style.cursor = mode === 'move' ? 'grabbing' : 'ew-resize';

  const onMove = ev => {
    const dt = (ev.clientX - startX) / pxPerSec;
    if (!moved && Math.abs(ev.clientX - startX) < 3 && Math.abs(ev.clientY - startY) < 3) return;
    moved = true;
    const dur = clipDur(orig);
    if (mode === 'move') {
      let s = Math.max(0, orig.start + dt);
      const a = snap(s, pts), b = snap(s + dur, pts);
      if (a.hit !== null && (b.hit === null || Math.abs(a.t - s) <= Math.abs(b.t - s - dur))) { s = a.t; showSnap(a.hit); }
      else if (b.hit !== null) { s = b.t - dur; showSnap(b.hit); } else showSnap(null);
      c.start = Math.max(0, s);
      // 다른 트랙으로 이동
      const under = document.elementsFromPoint(ev.clientX, ev.clientY).find(x => x.classList && x.classList.contains('track'));
      if (under && under.dataset.id !== curTrack.id) {
        const nt = project.tracks.find(t => t.id === under.dataset.id);
        const k = c.type === 'text' ? 'text' : m.kind;
        if (nt && trackFits(nt, k)) {
          curTrack.clips = curTrack.clips.filter(x => x !== c); nt.clips.push(c); curTrack = nt;
          under.appendChild(el);
        }
      }
    } else if (mode === 'trimL') {
      let s = snap(orig.start + dt, pts).t;
      showSnap(snap(orig.start + dt, pts).hit);
      const speed = c.speed || 1;
      let delta = s - orig.start;
      if (c.type === 'text' || (m && m.kind === 'image')) {
        delta = clamp(delta, -orig.start, dur - 0.1);
        c.start = orig.start + delta;
        if (c.type === 'text') c.duration = orig.duration - delta; else c.out = orig.out - delta;
      } else {
        delta = clamp(delta, Math.max(-orig.start, -orig.in / speed), dur - 0.1);
        c.start = orig.start + delta; c.in = orig.in + delta * speed;
      }
    } else {
      const e2 = snap(orig.start + dur + dt, pts);
      showSnap(e2.hit);
      let nd = Math.max(0.1, e2.t - orig.start);
      if (c.type === 'text') c.duration = nd;
      else if (m.kind === 'image') c.out = orig.in + nd;
      else c.out = Math.min(m.duration, orig.in + nd * (c.speed || 1));
    }
    el.style.left = c.start * pxPerSec + 'px';
    el.style.width = Math.max(4, clipDur(c) * pxPerSec) + 'px';
    requestDraw();
  };
  const onUp = () => {
    el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerup', onUp);
    showSnap(null);
    if (moved) {
      // 같은 트랙에서 겹치면 빈 자리로 밀기
      const others = curTrack.clips.filter(x => x !== c);
      if (others.some(o => c.start < clipEnd(o) - 1e-6 && clipEnd(c) > o.start + 1e-6)) c.start = freeSpot(curTrack, c.start, clipDur(c), c.id);
      commit();
    }
    renderTimeline(); renderProps(); requestDraw();
  };
  el.addEventListener('pointermove', onMove); el.addEventListener('pointerup', onUp);
}

function refreshSelection() {
  $$('.clip').forEach(x => x.classList.toggle('selected', isSel(x.dataset.id)));
  renderProps(); requestDraw();
}
function selectClip(id) {
  if (selectedId === id && selectedIds.size <= 1) return;
  setSel(id);
  refreshSelection();
}
function toggleSelect(id) {
  if (selectedIds.has(id)) { selectedIds.delete(id); if (selectedId === id) selectedId = [...selectedIds][0] || null; }
  else { selectedIds.add(id); selectedId = id; }
  refreshSelection();
}
function selectWhere(pred) {
  const ids = [];
  for (const tr of project.tracks) for (const c of tr.clips) if (pred(c, tr)) ids.push(c.id);
  selectedIds = new Set(ids); selectedId = ids[0] || null;
  refreshSelection();
  if (ids.length) toast(`클립 ${ids.length}개를 선택했어요`);
}
function setTool(t) {
  tool = t;
  $('#btnToolSelect').classList.toggle('on', t === 'select');
  $('#btnToolBlade').classList.toggle('on', t === 'blade');
  document.body.classList.toggle('blade-mode', t === 'blade');
  if (t !== 'blade') showBlade(null);
}
function showBlade(x) {
  let l = innerEl.querySelector('.bladeline');
  if (x === null) { if (l) l.remove(); return; }
  if (!l) { l = document.createElement('div'); l.className = 'bladeline'; innerEl.appendChild(l); }
  l.style.left = x + 'px';
}
tracksEl.addEventListener('pointermove', e => {
  if (tool !== 'blade') return;
  let t = (e.clientX - innerEl.getBoundingClientRect().left) / pxPerSec;
  if ($('#chkSnap').checked) t = snap(t, snapPoints(null)).t;
  showBlade(t * pxPerSec);
});
tracksEl.addEventListener('pointerleave', () => showBlade(null));

function drawRuler() {
  const w = Math.min(innerEl.clientWidth || timelineWidth(), 32000);
  const dpr = window.devicePixelRatio || 1;
  ruler.width = w * dpr; ruler.style.width = w + 'px'; ruler.height = 26 * dpr; ruler.style.height = '26px';
  const g = ruler.getContext('2d'); g.scale(dpr, dpr);
  g.fillStyle = '#1d1f25'; g.fillRect(0, 0, w, 26);
  const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
  const major = steps.find(s => s * pxPerSec >= 80) || 600;
  const minor = major / 5;
  g.strokeStyle = '#3a3f4b'; g.fillStyle = '#8c93a3'; g.font = '10px sans-serif';
  for (let i = 0; i * minor * pxPerSec < w; i++) {
    const t = Math.round(i * minor * 1000) / 1000;
    const x = Math.round(t * pxPerSec) + 0.5;
    const isMajor = i % 5 === 0;
    g.beginPath(); g.moveTo(x, isMajor ? 10 : 18); g.lineTo(x, 26); g.stroke();
    if (isMajor) g.fillText(fmt(t, major < 1), x + 3, 10);
  }
}

function updatePlayhead(follow) {
  const x = playhead * pxPerSec;
  $('#playhead').style.left = x + 'px';
  if (follow) {
    const v0 = scrollEl.scrollLeft, v1 = v0 + scrollEl.clientWidth;
    if (x > v1 - 40 || x < v0) scrollEl.scrollLeft = x - 60;
  }
  updateTimecode();
}

function scrub(e) {
  const rect = innerEl.getBoundingClientRect();
  const move = ev => {
    let t = (ev.clientX - rect.left) / pxPerSec;
    if ($('#chkSnap').checked) t = snap(t, snapPoints(null).slice(2)).t;
    seek(Math.max(0, t));
  };
  move(e);
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
}
ruler.addEventListener('pointerdown', scrub);
$('#playhead .knob').addEventListener('pointerdown', scrub);
tracksEl.addEventListener('pointerdown', e => { if (e.target.classList.contains('track')) { selectClip(null); scrub(e); } });
scrollEl.addEventListener('scroll', () => { headsEl.scrollTop = scrollEl.scrollTop; });
scrollEl.addEventListener('wheel', e => {
  if (e.ctrlKey) {
    e.preventDefault();
    const rect = scrollEl.getBoundingClientRect();
    const tAt = (e.clientX - rect.left + scrollEl.scrollLeft) / pxPerSec;
    setZoom(pxPerSec * (e.deltaY < 0 ? 1.2 : 1 / 1.2));
    scrollEl.scrollLeft = tAt * pxPerSec - (e.clientX - rect.left);
  }
}, { passive: false });
function setZoom(v) { pxPerSec = clamp(v, 4, 400); $('#zoom').value = pxPerSec; renderTimeline(); }
$('#zoom').oninput = e => setZoom(+e.target.value);

/* 타임라인 높이 조절 */
$('#timelineArea').addEventListener('pointerdown', e => {
  const rect = $('#timelineArea').getBoundingClientRect();
  if (e.clientY - rect.top > 5) return;
  const move = ev => { document.body.style.setProperty('--tl-h', clamp(window.innerHeight - ev.clientY, 160, window.innerHeight - 320) + 'px'); sizeCanvas(); };
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
});

/* ---------- 편집 명령 ---------- */
function splitAt(t = playhead) {
  const targets = [];
  const sel = selectedId && findClip(selectedId);
  if (sel && t > sel.clip.start + 0.02 && t < clipEnd(sel.clip) - 0.02) targets.push(sel);
  else for (const tr of project.tracks) for (const c of tr.clips) if (t > c.start + 0.02 && t < clipEnd(c) - 0.02 && !tr.hidden) targets.push({ track: tr, clip: c });
  if (!targets.length) { toast('재생헤드 위치에 자를 클립이 없어요'); return; }
  for (const { track, clip: c } of targets) {
    const local = t - c.start;
    const b = JSON.parse(JSON.stringify(c)); b.id = uid();
    if (c.type === 'text') { b.duration = c.duration - local; c.duration = local; }
    else { const cut = c.in + local * (c.speed || 1); b.in = cut; c.out = cut; }
    b.start = t; c.fadeOut = 0; b.fadeIn = 0; b.transitionIn = { type: 'none', duration: 0.5 };
    track.clips.push(b);
  }
  commit(); renderTimeline(); renderProps(); requestDraw();
}
function trimSide(side) {
  const sel = selectedId && findClip(selectedId);
  if (!sel) { toast('먼저 클립을 선택하세요'); return; }
  const c = sel.clip, t = playhead;
  if (t <= c.start || t >= clipEnd(c)) { toast('재생헤드가 선택한 클립 위에 있어야 해요'); return; }
  const local = t - c.start;
  if (side === 'left') {
    if (c.type === 'text') c.duration -= local; else c.in += local * (c.speed || 1);
    c.start = t;
  } else {
    if (c.type === 'text') c.duration = local; else c.out = c.in + local * (c.speed || 1);
  }
  commit(); renderTimeline(); renderProps(); requestDraw();
}
function deleteSelected() {
  if (!selectedIds.size && !selectedId) return;
  const ids = new Set([...selectedIds, selectedId].filter(Boolean));
  for (const tr of project.tracks) tr.clips = tr.clips.filter(x => !ids.has(x.id));
  setSel(null); cleanupEls();
  commit(); renderTimeline(); renderProps(); requestDraw(); renderCaptions();
}
function duplicateSelected() {
  const sel = selectedId && findClip(selectedId); if (!sel) return;
  const b = JSON.parse(JSON.stringify(sel.clip)); b.id = uid();
  b.start = freeSpot(sel.track, clipEnd(sel.clip), clipDur(b));
  sel.track.clips.push(b); setSel(b.id);
  commit(); renderTimeline(); renderProps(); requestDraw();
}
function addTrack(kind) {
  const n = project.tracks.filter(t => t.kind === kind).length + 1;
  const name = { video: '영상', text: '텍스트', audio: '오디오' }[kind] + ' ' + n;
  const tr = { id: uid(), kind, name, clips: [] };
  let idx = kind === 'audio' ? -1 : project.tracks.findIndex(t => t.kind === kind);
  if (idx === -1 && kind === 'video') idx = project.tracks.findIndex(t => t.kind === 'audio');
  if (idx === -1 && kind === 'text') idx = 0;
  if (idx === -1) project.tracks.push(tr); else project.tracks.splice(idx, 0, tr);
  commit(); renderTimeline();
}

/* ---------- 속성 패널 ---------- */
function renderProps() {
  const box = $('#props'); box.innerHTML = '';
  if (selectedIds.size > 1) {
    $('#propTitle').textContent = `클립 ${selectedIds.size}개 선택됨`;
    box.innerHTML = '<p class="hint">여러 클립을 함께 옮기거나(끌기) 지울 수 있어요(Delete).<br>Shift 또는 Ctrl+클릭으로 선택을 더하거나 뺄 수 있어요.<br>하나만 편집하려면 그 클립을 그냥 클릭하세요.</p>';
    return;
  }
  const sel = selectedId && findClip(selectedId);
  if (!sel) { $('#propTitle').textContent = '속성'; box.innerHTML = '<p class="hint">타임라인에서 클립을 선택하면 여기서 편집할 수 있어요.<br><br>단축키는 F1 키나 위쪽의 ⌨ 단축키 버튼으로 볼 수 있어요.</p>'; return; }
  const c = sel.clip;
  const m = c.type === 'text' ? null : mediaOf(c);
  $('#propTitle').textContent = c.type === 'text' ? '텍스트' : m.kind === 'audio' ? '오디오' : m.kind === 'image' ? '사진' : '영상';
  const live = () => { requestDraw(); };
  const done = () => { commit(); renderTimeline(); renderCaptions(); };

  const group = title => { const g = document.createElement('div'); g.className = 'prop-group'; g.innerHTML = `<h4>${title}</h4>`; box.appendChild(g); return g; };
  const slider = (g, label, get, set, min, max, step, opts = {}) => {
    const row = document.createElement('div'); row.className = 'prop';
    row.innerHTML = `<span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}"><input type="number" min="${min}" max="${max}" step="${step}">`;
    const [r, n] = row.querySelectorAll('input');
    r.value = n.value = get();
    const apply = (v, final) => { v = clamp(+v, min, opts.hardMax ?? max); set(v); r.value = n.value = +(+v).toFixed(3); if (opts.relayout) renderTimeline(); live(); if (final) done(); };
    r.oninput = () => apply(r.value, false); r.onchange = () => apply(r.value, true);
    n.onchange = () => apply(n.value, true);
    g.appendChild(row);
  };
  const field = (g, label, input) => { const row = document.createElement('div'); row.className = 'prop full'; row.innerHTML = `<span>${label}</span>`; row.appendChild(input); g.appendChild(row); };

  if (c.type === 'text') {
    const g = group('내용');
    const ta = document.createElement('textarea'); ta.rows = 3; ta.value = c.text;
    ta.oninput = () => { c.text = ta.value; live(); }; ta.onchange = done;
    g.appendChild(ta);
    const g2 = group('글꼴');
    const sf = document.createElement('select'); sf.innerHTML = FONTS.map(f => `<option ${f === c.fontFamily ? 'selected' : ''}>${f}</option>`).join('');
    sf.onchange = () => { c.fontFamily = sf.value; live(); done(); };
    field(g2, '글꼴', sf);
    slider(g2, '크기', () => c.fontSize, v => c.fontSize = v, 8, 400, 1);
    const styleRow = document.createElement('div'); styleRow.className = 'chips';
    [['bold', '굵게'], ['italic', '기울임']].forEach(([k, n]) => {
      const b = document.createElement('button'); b.textContent = n; b.className = c[k] ? 'on' : '';
      b.onclick = () => { c[k] = !c[k]; b.className = c[k] ? 'on' : ''; live(); done(); }; styleRow.appendChild(b);
    });
    [['left', '왼쪽'], ['center', '가운데'], ['right', '오른쪽']].forEach(([k, n]) => {
      const b = document.createElement('button'); b.textContent = n; b.className = c.align === k ? 'on' : '';
      b.onclick = () => { c.align = k; live(); done(); renderProps(); }; styleRow.appendChild(b);
    });
    field(g2, '스타일', styleRow);
    const g3 = group('색상');
    const color = (label, key, allowNone) => {
      const wrap = document.createElement('div'); wrap.style.display = 'flex'; wrap.style.gap = '6px'; wrap.style.alignItems = 'center';
      const inp = document.createElement('input'); inp.type = 'color'; inp.value = (c[key] || '#000000').slice(0, 7);
      inp.oninput = () => { c[key] = inp.value + (key === 'bgColor' && alpha ? alpha.value : ''); live(); }; inp.onchange = done;
      wrap.appendChild(inp);
      let alpha = null;
      if (key === 'bgColor') {
        alpha = document.createElement('select');
        alpha.innerHTML = [['ff', '불투명'], ['bb', '75%'], ['88', '50%'], ['44', '25%']].map(([v, n]) => `<option value="${v}" ${((c.bgColor || '').slice(7) || 'ff') === v ? 'selected' : ''}>${n}</option>`).join('');
        alpha.onchange = () => { if (c.bgColor) { c.bgColor = c.bgColor.slice(0, 7) + alpha.value; live(); done(); } };
        wrap.appendChild(alpha);
      }
      if (allowNone) {
        const cb = document.createElement('label'); cb.className = 'chk'; cb.innerHTML = '<input type="checkbox"> 사용';
        const ck = cb.querySelector('input'); ck.checked = !!c[key];
        ck.onchange = () => { c[key] = ck.checked ? inp.value + (alpha ? alpha.value : '') : ''; live(); done(); };
        wrap.appendChild(cb);
      }
      field(g3, label, wrap);
    };
    color('글자색', 'color');
    color('테두리색', 'strokeColor');
    slider(g3, '테두리', () => c.strokeWidth, v => c.strokeWidth = v, 0, 30, 1);
    color('배경', 'bgColor', true);
    color('그림자색', 'shadowColor');
    slider(g3, '그림자', () => c.shadow || 0, v => c.shadow = v, 0, 60, 1);
    const g4 = group('위치');
    slider(g4, '가로', () => +(c.x * 100).toFixed(1), v => c.x = v / 100, 0, 100, 0.5);
    slider(g4, '세로', () => +(c.y * 100).toFixed(1), v => c.y = v / 100, 0, 100, 0.5);
    slider(g4, '불투명도', () => Math.round((c.opacity ?? 1) * 100), v => c.opacity = v / 100, 0, 100, 1);
    const g5 = group('시간 · 전환');
    slider(g5, '길이(초)', () => +c.duration.toFixed(2), v => c.duration = v, 0.1, 60, 0.1, { relayout: true, hardMax: 3600 });
    slider(g5, '페이드 인', () => c.fadeIn, v => c.fadeIn = v, 0, 3, 0.1, { relayout: true });
    slider(g5, '페이드 아웃', () => c.fadeOut, v => c.fadeOut = v, 0, 3, 0.1, { relayout: true });
    const gan = group('등장 애니메이션');
    const anChips = document.createElement('div'); anChips.className = 'chips';
    Core.TEXT_ANIMS.forEach(a => {
      const b = document.createElement('button'); b.textContent = a.name; b.className = (c.animIn || 'none') === a.id ? 'on' : '';
      b.onclick = () => { c.animIn = a.id; if (a.id === 'typewriter' && !c.animDur) c.animDur = 1; seek(c.start); setPlaying(true); done(); renderProps(); };
      anChips.appendChild(b);
    });
    gan.appendChild(anChips);
    if (c.animIn && c.animIn !== 'none') slider(gan, '속도(초)', () => c.animDur ?? 0.5, v => c.animDur = v, 0.1, 3, 0.1);
    const ap = document.createElement('button'); ap.className = 'wide'; ap.textContent = '이 스타일을 같은 트랙 텍스트 전체에 적용';
    ap.onclick = () => {
      const keys = ['fontFamily', 'fontSize', 'color', 'strokeColor', 'strokeWidth', 'bgColor', 'bold', 'italic', 'align', 'x', 'y', 'shadow', 'shadowColor', 'opacity'];
      sel.track.clips.forEach(o => { if (o.type === 'text') keys.forEach(k => o[k] = c[k]); });
      done(); live(); toast('스타일을 적용했어요');
    };
    group('일괄 적용').appendChild(ap);
    return;
  }

  if (m.kind !== 'audio') {
    const g = group('화면');
    slider(g, '크기(%)', () => Math.round(c.transform.scale * 100), v => c.transform.scale = v / 100, 5, 400, 1);
    slider(g, '가로 위치', () => Math.round(c.transform.x * 100), v => c.transform.x = v / 100, -100, 100, 1);
    slider(g, '세로 위치', () => Math.round(c.transform.y * 100), v => c.transform.y = v / 100, -100, 100, 1);
    slider(g, '회전(°)', () => c.transform.rotation, v => c.transform.rotation = v, -180, 180, 1);
    slider(g, '불투명도', () => Math.round((c.opacity ?? 1) * 100), v => c.opacity = v / 100, 0, 100, 1);
    const fill = document.createElement('div'); fill.className = 'chips';
    [['맞춤', 1], ['화면 채우기', 'fill']].forEach(([n, v]) => {
      const b = document.createElement('button'); b.textContent = n;
      b.onclick = () => {
        c.transform.x = 0; c.transform.y = 0;
        c.transform.scale = v === 'fill' ? +(Math.max(project.width / m.width, project.height / m.height) / Math.min(project.width / m.width, project.height / m.height)).toFixed(3) : 1;
        live(); done(); renderProps();
      };
      fill.appendChild(b);
    });
    field(g, '빠른 설정', fill);

    const gf = group('필터');
    const chips = document.createElement('div'); chips.className = 'chips';
    FILTERS.forEach(f => {
      const b = document.createElement('button'); b.className = 'filter-chip' + (c.filter.preset === f.id ? ' on' : '');
      b.innerHTML = `<div class="sw" style="filter:${f.css || 'none'}"></div><div>${f.name}</div>`;
      b.onclick = () => { c.filter.preset = f.id; live(); done(); renderProps(); };
      chips.appendChild(b);
    });
    gf.appendChild(chips);
    const ga = group('보정');
    slider(ga, '밝기', () => c.filter.brightness, v => c.filter.brightness = v, -100, 100, 1);
    slider(ga, '대비', () => c.filter.contrast, v => c.filter.contrast = v, -100, 100, 1);
    slider(ga, '채도', () => c.filter.saturation, v => c.filter.saturation = v, -100, 100, 1);
    slider(ga, '흐림', () => c.filter.blur, v => c.filter.blur = v, 0, 40, 1);
    const rs = document.createElement('button'); rs.textContent = '보정 초기화'; rs.className = 'wide';
    rs.onclick = () => { Object.assign(c.filter, { brightness: 0, contrast: 0, saturation: 0, blur: 0 }); live(); done(); renderProps(); };
    ga.appendChild(rs);
  }

  if (m.kind !== 'audio') {
    const ge = group('효과');
    c.effects = c.effects || [];
    const pal = document.createElement('div'); pal.className = 'chips';
    Core.EFFECTS.forEach(fx => {
      const on = c.effects.some(e => e.type === fx.type);
      const b = document.createElement('button'); b.className = 'fx-chip' + (on ? ' on' : ''); b.title = fx.hint;
      b.innerHTML = `<span>${fx.icon}</span>${fx.name}`;
      b.onclick = () => {
        if (on) c.effects = c.effects.filter(e => e.type !== fx.type);
        else {
          if (fx.type === 'zoomIn') c.effects = c.effects.filter(e => e.type !== 'zoomOut');
          if (fx.type === 'zoomOut') c.effects = c.effects.filter(e => e.type !== 'zoomIn');
          c.effects.push({ type: fx.type, amount: 50 });
        }
        live(); done(); renderProps();
      };
      pal.appendChild(b);
    });
    ge.appendChild(pal);
    const NO_AMOUNT = ['invert', 'mirror', 'flipV'];
    c.effects.filter(e => !NO_AMOUNT.includes(e.type)).forEach(e => {
      const def = Core.EFFECTS.find(x => x.type === e.type);
      slider(ge, def ? def.name : e.type, () => e.amount ?? 50, v => e.amount = v, 0, 100, 1);
    });

    const gk = group('크로마키 (배경색 지우기)');
    c.chroma = c.chroma || { on: false, color: '#00ff00', similarity: 30 };
    const krow = document.createElement('div'); krow.style.cssText = 'display:flex;gap:8px;align-items:center';
    const kon = document.createElement('label'); kon.className = 'chk'; kon.innerHTML = '<input type="checkbox"> 사용';
    kon.querySelector('input').checked = !!c.chroma.on;
    kon.querySelector('input').onchange = ev => { c.chroma.on = ev.target.checked; live(); done(); renderProps(); };
    const kc = document.createElement('input'); kc.type = 'color'; kc.value = c.chroma.color;
    kc.oninput = () => { c.chroma.color = kc.value; live(); }; kc.onchange = done;
    krow.append(kon, kc);
    [['초록', '#00ff00'], ['파랑', '#0047ff']].forEach(([n, v]) => { const b = document.createElement('button'); b.textContent = n; b.onclick = () => { c.chroma.color = v; c.chroma.on = true; live(); done(); renderProps(); }; krow.appendChild(b); });
    field(gk, '색', krow);
    if (c.chroma.on) slider(gk, '범위', () => c.chroma.similarity ?? 30, v => c.chroma.similarity = v, 0, 100, 1);

    const gtr = group('전환 (앞 클립에서 넘어올 때)'); gtr.classList.add('trans-group');
    c.transitionIn = c.transitionIn || { type: 'none', duration: 0.5 };
    const tchips = document.createElement('div'); tchips.className = 'chips';
    Core.TRANSITIONS.forEach(tt => {
      const b = document.createElement('button'); b.textContent = tt.name; b.className = c.transitionIn.type === tt.type ? 'on' : '';
      b.onclick = () => { c.transitionIn.type = tt.type; seek(Math.max(0, c.start - 0.6)); done(); renderProps(); if (tt.type !== 'none') setPlaying(true); };
      tchips.appendChild(b);
    });
    gtr.appendChild(tchips);
    if (c.transitionIn.type !== 'none') slider(gtr, '길이(초)', () => c.transitionIn.duration, v => c.transitionIn.duration = v, 0.1, 3, 0.1);
    const tp = document.createElement('p'); tp.className = 'hint';
    tp.textContent = '같은 트랙에서 바로 앞에 붙어 있는 클립과 이어지는 효과예요. 타임라인의 클립 사이 + 버튼으로도 넣을 수 있어요.';
    gtr.appendChild(tp);
    const ab = document.createElement('button'); ab.className = 'wide'; ab.textContent = '이 전환을 트랙 전체에 적용';
    ab.onclick = () => { sel.track.clips.forEach(o => { if (o.type !== 'text') o.transitionIn = { ...c.transitionIn }; }); done(); toast('트랙 전체에 전환을 적용했어요'); };
    gtr.appendChild(ab);
  }

  if (m.kind === 'video') {
    const gfz = group('정지 화면');
    const fb = document.createElement('button'); fb.className = 'wide'; fb.textContent = '재생헤드 위치에 정지 화면 넣기 (3초)';
    fb.onclick = () => freezeFrame(sel);
    gfz.appendChild(fb);
  }

  if (m.kind !== 'image') {
    const gs = group('속도');
    const chips = document.createElement('div'); chips.className = 'chips';
    [0.25, 0.5, 1, 1.5, 2, 3, 5].forEach(v => {
      const b = document.createElement('button'); b.textContent = v + 'x'; b.className = c.speed === v ? 'on' : '';
      b.onclick = () => setSpeed(c, v); chips.appendChild(b);
    });
    gs.appendChild(chips);
    slider(gs, '직접 입력', () => c.speed, v => { }, 0.1, 10, 0.05);
    const last = gs.querySelector('.prop:last-child');
    last.querySelectorAll('input').forEach(i => i.onchange = () => setSpeed(c, clamp(+i.value, 0.1, 10)));
    last.querySelector('input[type=range]').oninput = null;
  }
  if (m.hasAudio) {
    const gv = group('소리');
    slider(gv, '볼륨(%)', () => Math.round((c.volume ?? 1) * 100), v => c.volume = v / 100, 0, 200, 1);
    if (m.kind === 'video') {
      const b = document.createElement('button'); b.className = 'wide'; b.textContent = '오디오 분리 (별도 트랙으로)';
      b.onclick = () => detachAudio(sel);
      gv.appendChild(b);
    }
  }
  const gt = group('전환 효과 · 시간');
  slider(gt, '페이드 인', () => c.fadeIn, v => c.fadeIn = v, 0, 5, 0.1, { relayout: true });
  slider(gt, '페이드 아웃', () => c.fadeOut, v => c.fadeOut = v, 0, 5, 0.1, { relayout: true });
  const tip = document.createElement('p'); tip.className = 'hint';
  tip.textContent = m.kind === 'audio' ? '음악이 서서히 커지고 작아집니다.' : '메인 트랙에서는 검은 화면으로, 위 트랙에서는 아래 영상과 자연스럽게 겹쳐지는(디졸브) 전환이 됩니다.';
  gt.appendChild(tip);
  if (m.kind === 'image') slider(gt, '길이(초)', () => +(c.out - c.in).toFixed(2), v => c.out = c.in + v, 0.1, 60, 0.1, { relayout: true, hardMax: 3600 });
  const info = document.createElement('p'); info.className = 'hint';
  info.textContent = `${m.name} · ${m.width ? m.width + '×' + m.height + ' · ' : ''}원본 ${fmt(c.in)}~${fmt(c.out)}`;
  gt.appendChild(info);
}

async function freezeFrame(sel) {
  const c = sel.clip, t = playhead;
  if (t <= c.start + 0.05 || t >= clipEnd(c) - 0.05) { toast('재생헤드를 이 클립 위로 옮겨 주세요'); return; }
  const m = mediaOf(c);
  const srcT = c.in + (t - c.start) * (c.speed || 1);
  let png;
  try { png = await API.extractFrame(m.path, srcT); } catch (e) { toast('프레임을 가져오지 못했어요'); return; }
  const info = await API.probe(png);
  const fm = { id: uid(), ...info, name: `정지 화면 ${fmt(t)}` };
  project.media.push(fm);
  const FREEZE = 3;
  // 뒤쪽 클립 밀기
  sel.track.clips.forEach(o => { if (o !== c && o.start >= t - 1e-6) o.start += FREEZE; });
  const b = JSON.parse(JSON.stringify(c)); b.id = uid();
  const cut = c.in + (t - c.start) * (c.speed || 1);
  b.in = cut; c.out = cut; b.start = t + FREEZE; b.transitionIn = { type: 'none', duration: 0.5 };
  c.fadeOut = 0; b.fadeIn = 0;
  const f = { id: uid(), mediaId: fm.id, start: t, in: 0, out: FREEZE, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, opacity: c.opacity ?? 1,
    filter: JSON.parse(JSON.stringify(c.filter)), transform: JSON.parse(JSON.stringify(c.transform)), effects: [] };
  sel.track.clips.push(f, b);
  setSel(f.id);
  commit(); renderAll(); toast('정지 화면을 넣었어요');
}

function setSpeed(c, v) {
  c.speed = v;
  const sel = findClip(c.id);
  const others = sel.track.clips.filter(x => x !== c);
  const next = others.filter(o => o.start >= c.start).sort((a, b) => a.start - b.start)[0];
  if (next && clipEnd(c) > next.start) toast('속도를 늦춰서 다음 클립과 겹쳤어요. 다음 클립을 옮겨 주세요.');
  commit(); renderTimeline(); renderProps(); requestDraw();
}

function detachAudio(sel) {
  const c = sel.clip;
  let at = project.tracks.find(t => t.kind === 'audio' && !t.clips.some(o => c.start < clipEnd(o) && clipEnd(c) > o.start));
  if (!at) { at = { id: uid(), kind: 'audio', name: '분리된 오디오', clips: [] }; project.tracks.push(at); }
  at.clips.push({ id: uid(), mediaId: c.mediaId, start: c.start, in: c.in, out: c.out, speed: c.speed, volume: c.volume ?? 1, fadeIn: 0, fadeOut: 0 });
  c.volume = 0;
  commit(); renderTimeline(); renderProps(); toast('오디오를 분리했어요. 원본 클립은 음소거됐어요.');
}

/* ---------- 텍스트 / 자막 탭 ---------- */
function renderTextPresets() {
  const box = $('#textPresets');
  for (const p of TEXT_PRESETS) {
    const el = document.createElement('div'); el.className = 'text-preset';
    const s = p.s;
    el.textContent = p.name;
    el.style.color = s.color; el.style.fontFamily = `"${s.fontFamily || 'Malgun Gothic'}"`; el.style.fontWeight = s.bold ? 'bold' : 'normal';
    if (s.strokeWidth) el.style.webkitTextStroke = `1px ${s.strokeColor}`;
    if (s.bgColor) { el.style.background = s.bgColor; }
    if (s.shadow) el.style.textShadow = `0 0 8px ${s.shadowColor}`;
    el.onclick = () => addTextClip({ ...s });
    box.appendChild(el);
  }
}

function captionTrack() {
  let tr = project.tracks.find(t => t.kind === 'text' && t.name.startsWith('자막'));
  if (!tr) { tr = { id: uid(), kind: 'text', name: '자막', clips: [] }; project.tracks.unshift(tr); }
  return tr;
}
const CAPTION_STYLE = { fontSize: 56, color: '#ffffff', strokeColor: '#000000', strokeWidth: 6, y: 0.86, bold: true };
$('#captionInput').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    const text = e.target.value.trim(); if (!text) return;
    const dur = clamp(+$('#captionDur').value || 2.5, 0.3, 60);
    const c = addTextClip({ ...CAPTION_STYLE, text }, playhead, dur, captionTrack());
    e.target.value = '';
    seek(clipEnd(c));
    renderCaptions();
  }
});

function parseTime(s) { const m = s.trim().match(/(\d+):(\d+):(\d+)[,.](\d+)/); return m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4]) / 1000 : 0; }
function srtTime(t) {
  const ms = Math.round(t * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
}
$('#btnSrtImport').onclick = async () => {
  const txt = await API.openSrt(); if (txt == null) return;
  const blocks = txt.replace(/^﻿/, '').replace(/\r/g, '').split(/\n\s*\n/);
  const tr = { id: uid(), kind: 'text', name: '자막 (SRT)', clips: [] };
  for (const b of blocks) {
    const lines = b.split('\n').filter(Boolean);
    const ti = lines.findIndex(l => l.includes('-->')); if (ti < 0) continue;
    const [a, z] = lines[ti].split('-->');
    const start = parseTime(a), end = parseTime(z);
    const text = lines.slice(ti + 1).join('\n').replace(/<[^>]+>/g, '');
    if (end > start && text) tr.clips.push(Object.assign({
      id: uid(), type: 'text', start, duration: end - start, text, fontFamily: 'Malgun Gothic', italic: false, align: 'center', x: 0.5,
      bgColor: '', shadow: 0, shadowColor: '#000000', fadeIn: 0, fadeOut: 0, opacity: 1,
    }, CAPTION_STYLE));
  }
  if (!tr.clips.length) { toast('자막을 읽지 못했어요'); return; }
  project.tracks.unshift(tr); commit(); renderAll(); toast(`자막 ${tr.clips.length}개를 가져왔어요`);
};
$('#btnSrtExport').onclick = async () => {
  const clips = project.tracks.filter(t => t.kind === 'text').flatMap(t => t.clips).sort((a, b) => a.start - b.start);
  if (!clips.length) { toast('내보낼 텍스트가 없어요'); return; }
  const out = clips.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(clipEnd(c))}\n${c.text}\n`).join('\n');
  const p = await API.saveSrt(out); if (p) toast('자막을 저장했어요');
};
function renderCaptions() {
  const box = $('#captionList'); box.innerHTML = '';
  const clips = project.tracks.filter(t => t.kind === 'text').flatMap(t => t.clips).sort((a, b) => a.start - b.start);
  for (const c of clips) {
    const row = document.createElement('div'); row.className = 'cap-row';
    row.innerHTML = `<span class="t">${fmt(c.start)}</span><span></span>`;
    row.lastChild.textContent = c.text;
    row.onclick = () => { seek(c.start + 0.01); selectClip(c.id); };
    box.appendChild(row);
  }
}

/* ---------- 프로젝트 저장/열기 ---------- */
async function afterLoad(resetView = true) {
  cleanupEls();
  for (const m of project.media) { m.missing = !(await API.fileExists(m.path)); if (!m.missing) { if (m.hasAudio) loadWave(m); loadStrip(m); } }
  $('#selRatio').value = `${project.width}x${project.height}`;
  if (!$('#selRatio').value) { const o = new Option(`${project.width}×${project.height}`, `${project.width}x${project.height}`); $('#selRatio').add(o); $('#selRatio').value = o.value; }
  $('#selFps').value = String(project.fps);
  if (resetView) { setSel(null); playhead = 0; }
  if (selectedId && !findClip(selectedId)) setSel(null);
  sizeCanvas(); renderAll();
  const missing = project.media.filter(m => m.missing);
  if (missing.length) toast(`찾을 수 없는 파일이 ${missing.length}개 있어요: ${missing.map(m => m.name).join(', ')}`, 5000);
}
function renderAll() { renderMedia(); renderTimeline(); renderProps(); renderCaptions(); requestDraw(); }

async function save(saveAs = false) {
  const p = await API.saveProject({ data: project, filePath, saveAs });
  if (p) { filePath = p; setDirty(false); toast('저장했어요'); return true; }
  return false;
}
async function confirmDiscard() {
  if (!dirty) return true;
  const r = confirm('저장하지 않은 변경 사항이 있어요. 저장할까요?\n(확인 = 저장, 취소 = 저장하지 않고 계속)');
  if (r) return save();
  return true;
}
$('#btnNew').onclick = async () => { if (!(await confirmDiscard())) return; project = newProject(); filePath = null; commit.last = snapshot(); undoStack.length = 0; afterLoad(); setDirty(false); };
$('#btnOpen').onclick = async () => {
  if (!(await confirmDiscard())) return;
  const r = await API.openProject(); if (!r) return;
  project = r.data; filePath = r.filePath; commit.last = snapshot(); undoStack.length = 0; redoStack.length = 0;
  await afterLoad(); setDirty(false);
};
$('#btnSave').onclick = () => save();
$('#btnUndo').onclick = undo; $('#btnRedo').onclick = redo;
API.onBeforeClose(async () => {
  if (dirty && !confirm('저장하지 않은 변경 사항이 있어요. 그래도 종료할까요?')) return;
  API.closeApp();
});

$('#selRatio').onchange = e => { const [w, h] = e.target.value.split('x').map(Number); project.width = w; project.height = h; commit(); sizeCanvas(); };
$('#selFps').onchange = e => { project.fps = +e.target.value; commit(); };

/* ---------- 내보내기 ---------- */
function renderTextPngs() {
  // 텍스트마다 글자 영역만큼의 PNG를 만든다 (타자기 효과는 단계별로 여러 장)
  const out = {};
  const W = project.width, H = project.height;
  const cv = document.createElement('canvas');
  const g = cv.getContext('2d');
  for (const tr of project.tracks) {
    if (tr.kind !== 'text' || tr.hidden) continue;
    for (const c of tr.clips) {
      if (!c.text) continue;
      const L = textLayout(g, c, W, H, 1);
      const cw = Math.ceil(L.bw + L.extra * 2 + L.pad * 2), ch = Math.ceil(L.bh + L.extra * 2 + L.pad * 2);
      cv.width = cw; cv.height = ch;
      const steps = textSteps(c).map(st => {
        g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cw, ch);
        g.translate(cw / 2 - L.blockCx, ch / 2 - L.cy);
        drawText(g, c, W, H, 1, c.opacity ?? 1, st.chars);
        return { png: cv.toDataURL('image/png'), from: st.from, to: st.to };
      });
      out[c.id] = { cx: L.blockCx, cy: L.cy, steps };
    }
  }
  return out;
}
$('#btnExport').onclick = () => {
  if (projDur() <= 0) { toast('타임라인이 비어 있어요'); return; }
  setPlaying(false);
  const missing = project.media.filter(m => m.missing);
  if (missing.length) { toast('찾을 수 없는 파일이 있어 내보낼 수 없어요'); return; }
  $('#expInfo').textContent = `${project.width}×${project.height} · ${project.fps}fps · 길이 ${fmt(projDur())}`;
  $('#exportForm').classList.remove('hidden'); $('#exportProgress').classList.add('hidden');
  $('#modal').classList.remove('hidden');
};
$('#expCancel').onclick = () => $('#modal').classList.add('hidden');
let lastExport = null;
$('#expGo').onclick = async () => {
  const outPath = await API.chooseExport(); if (!outPath) return;
  $('#exportForm').classList.add('hidden'); $('#exportProgress').classList.remove('hidden');
  $('#expAbort').classList.remove('hidden'); $('#expDone').classList.add('hidden'); $('#expShow').classList.add('hidden');
  $('#expBar').style.width = '0%'; $('#expStatus').textContent = '내보내는 중… 0%';
  const started = Date.now();
  const r = await API.startExport({ project, textPngs: renderTextPngs(), outPath, crf: +$('#expQuality').value, preset: $('#expPreset').value });
  $('#expAbort').classList.add('hidden'); $('#expDone').classList.remove('hidden');
  if (r.ok) {
    lastExport = r.outPath; $('#expBar').style.width = '100%';
    $('#expStatus').textContent = `완료! (${Math.round((Date.now() - started) / 1000)}초) ${r.outPath}`;
    $('#expShow').classList.remove('hidden');
  } else if (r.cancelled) $('#expStatus').textContent = '내보내기를 중지했어요.';
  else { $('#expStatus').textContent = '내보내기에 실패했어요: ' + (r.error || '').split('\n').filter(Boolean).slice(-2).join(' '); console.error(r.error); }
};
API.onExportProgress(v => { $('#expBar').style.width = (v * 100).toFixed(1) + '%'; $('#expStatus').textContent = `내보내는 중… ${Math.round(v * 100)}%`; });
$('#expAbort').onclick = () => API.cancelExport();
$('#expDone').onclick = () => $('#modal').classList.add('hidden');
$('#expShow').onclick = () => lastExport && API.showInFolder(lastExport);

/* ---------- 기타 UI ---------- */
$$('.tabs button').forEach(b => b.onclick = () => {
  $$('.tabs button').forEach(x => x.classList.toggle('active', x === b));
  $$('.tab').forEach(t => t.classList.toggle('hidden', t.id !== 'tab-' + b.dataset.tab));
});
$('#btnImport').onclick = async () => { const ps = await API.openMediaDialog(); if (ps.length) importPaths(ps); };
$('#btnPlay').onclick = () => setPlaying(!playing);
$('#btnStart').onclick = () => seek(0);
$('#btnEnd').onclick = () => seek(projDur());
$('#btnSplit').onclick = () => splitAt();
$('#btnDelete').onclick = deleteSelected;
$('#btnDup').onclick = duplicateSelected;
$('#btnFit').onclick = () => fitTimeline();
$('#btnToolSelect').onclick = () => setTool('select');
$('#btnToolBlade').onclick = () => setTool('blade');
$('#btnSelLeft').onclick = () => selectWhere(c => c.start < playhead - 1e-6);
$('#btnSelRight').onclick = () => selectWhere(c => clipEnd(c) > playhead + 1e-6);
$('#btnTrimL').onclick = () => trimSide('left');
$('#btnTrimR').onclick = () => trimSide('right');
$('#btnAddVideoTrack').onclick = () => addTrack('video');
$('#btnAddTextTrack').onclick = () => addTrack('text');
$('#btnAddAudioTrack').onclick = () => addTrack('audio');

document.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); });
document.addEventListener('drop', e => {
  if (!e.dataTransfer.files.length) return;
  e.preventDefault();
  const paths = [...e.dataTransfer.files].map(f => API.pathForFile(f)).filter(Boolean);
  importPaths(paths);
});

/* ---------- 클립보드 ---------- */
let clipboard = null;
function copySelected(cut) {
  const sel = selectedId && findClip(selectedId); if (!sel) { toast('먼저 클립을 선택하세요'); return; }
  clipboard = { clip: JSON.parse(JSON.stringify(sel.clip)), trackKind: sel.track.kind, trackId: sel.track.id };
  if (cut) deleteSelected(); else toast('복사했어요');
}
function paste() {
  if (!clipboard) return;
  let tr = project.tracks.find(t => t.id === clipboard.trackId) || project.tracks.find(t => t.kind === clipboard.trackKind);
  if (!tr) return;
  const c = JSON.parse(JSON.stringify(clipboard.clip)); c.id = uid();
  c.start = freeSpot(tr, playhead, clipDur(c));
  tr.clips.push(c); setSel(c.id);
  commit(); renderTimeline(); renderProps(); requestDraw(); renderCaptions();
}
function rippleDelete() {
  const sel = selectedId && findClip(selectedId); if (!sel) return;
  const gap = clipDur(sel.clip), at = sel.clip.start;
  sel.track.clips = sel.track.clips.filter(x => x !== sel.clip);
  sel.track.clips.forEach(o => { if (o.start >= at) o.start = Math.max(0, o.start - gap); });
  setSel(null); cleanupEls();
  commit(); renderTimeline(); renderProps(); requestDraw(); renderCaptions();
}
function nudge(dt) {
  const sel = selectedId && findClip(selectedId); if (!sel) return;
  sel.clip.start = Math.max(0, sel.clip.start + dt);
  commit(); renderTimeline(); requestDraw();
}

/* ---------- 단축키 ---------- */
const SHORTCUTS = [
  ['재생 / 정지', 'Space 또는 K'],
  ['선택 도구', 'A'],
  ['분할 도구 (클릭한 곳을 자르기)', 'B'],
  ['재생헤드 왼쪽 클립 모두 선택 / 오른쪽 모두 선택', '[ / ]'],
  ['모두 선택 / 선택 더하기·빼기', 'Ctrl+A / Shift+클릭'],
  ['재생헤드 위치에서 분할', 'S 또는 Ctrl+B'],
  ['재생헤드 앞부분 잘라내기 / 뒷부분 잘라내기', 'Q / W'],
  ['삭제 / 빈자리 당겨서 삭제', 'Delete / Shift+Delete'],
  ['복사 / 잘라내기 / 붙여넣기', 'Ctrl+C / Ctrl+X / Ctrl+V'],
  ['복제', 'Ctrl+D'],
  ['실행 취소 / 다시 실행', 'Ctrl+Z / Ctrl+Y (Ctrl+Shift+Z)'],
  ['1프레임 이동 / 1초 이동', '← → / Shift+← →'],
  ['5초 뒤로 / 앞으로', 'J / L'],
  ['선택한 클립 1프레임 옮기기', 'Alt+← →'],
  ['처음 / 끝으로', 'Home / End'],
  ['타임라인 확대 / 축소', 'Ctrl+휠, + / -'],
  ['화면에 맞게 보기', 'Shift+Z'],
  ['텍스트 추가', 'T'],
  ['파일 가져오기', 'Ctrl+I'],
  ['저장 / 다른 이름으로 저장', 'Ctrl+S / Ctrl+Shift+S'],
  ['새 프로젝트 / 열기', 'Ctrl+N / Ctrl+O'],
  ['내보내기', 'Ctrl+E'],
  ['선택 해제', 'Esc'],
  ['단축키 보기', 'F1 또는 ?'],
];
function showShortcuts() {
  const box = $('#shortcutList'); box.innerHTML = '';
  for (const [n, k] of SHORTCUTS) {
    const row = document.createElement('div'); row.className = 'sc-row';
    row.innerHTML = '<span></span><kbd></kbd>';
    row.firstChild.textContent = n; row.lastChild.textContent = k;
    box.appendChild(row);
  }
  $('#shortcutModal').classList.remove('hidden');
}
$('#btnShortcuts').onclick = showShortcuts;
$('#shortcutClose').onclick = () => $('#shortcutModal').classList.add('hidden');
function fitTimeline() { const d = projDur(); if (d > 0) setZoom((scrollEl.clientWidth - 40) / d); scrollEl.scrollLeft = 0; }

document.addEventListener('keydown', e => {
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'textarea' || (tag === 'input' && !['range', 'checkbox', 'color'].includes(e.target.type)) || tag === 'select') return;
  if (!$('#modal').classList.contains('hidden')) return;
  if (!$('#shortcutModal').classList.contains('hidden')) { if (e.code === 'Escape' || e.code === 'F1') $('#shortcutModal').classList.add('hidden'); return; }
  // 한글 입력 상태에서도 동작하도록 실제 키 위치(e.code)로 판단
  const code = e.code, ctrl = e.ctrlKey || e.metaKey, shift = e.shiftKey, alt = e.altKey;
  const fps = project.fps || 30;
  let handled = true;
  if (ctrl && code === 'KeyZ') shift ? redo() : undo();
  else if (ctrl && code === 'KeyY') redo();
  else if (ctrl && code === 'KeyS') save(shift);
  else if (ctrl && code === 'KeyO') $('#btnOpen').click();
  else if (ctrl && code === 'KeyN') $('#btnNew').click();
  else if (ctrl && code === 'KeyD') duplicateSelected();
  else if (ctrl && code === 'KeyI') $('#btnImport').click();
  else if (ctrl && code === 'KeyE') $('#btnExport').click();
  else if (ctrl && code === 'KeyB') splitAt();
  else if (ctrl && code === 'KeyC') copySelected(false);
  else if (ctrl && code === 'KeyX') copySelected(true);
  else if (ctrl && code === 'KeyV') paste();
  else if (ctrl && code === 'KeyA') selectWhere(() => true);
  else if (ctrl && shift && code === 'F12') API.toggleDevTools();
  else if (ctrl) handled = false;
  else if (code === 'Space' || code === 'KeyK') setPlaying(!playing);
  else if (code === 'KeyS') splitAt();
  else if (code === 'KeyA') setTool('select');
  else if (code === 'KeyB') setTool('blade');
  else if (code === 'BracketLeft') selectWhere(c => c.start < playhead - 1e-6);
  else if (code === 'BracketRight') selectWhere(c => clipEnd(c) > playhead + 1e-6);
  else if (code === 'KeyQ') trimSide('left');
  else if (code === 'KeyW') trimSide('right');
  else if (code === 'KeyJ') seek(playhead - 5);
  else if (code === 'KeyL') seek(playhead + 5);
  else if (code === 'KeyT') addTextClip({ ...TEXT_PRESETS[0].s });
  else if (code === 'KeyZ' && shift) fitTimeline();
  else if (code === 'Delete' || code === 'Backspace') shift ? rippleDelete() : deleteSelected();
  else if (code === 'ArrowLeft') alt ? nudge(-1 / fps) : seek(playhead - (shift ? 1 : 1 / fps));
  else if (code === 'ArrowRight') alt ? nudge(1 / fps) : seek(playhead + (shift ? 1 : 1 / fps));
  else if (code === 'Home') seek(0);
  else if (code === 'End') seek(projDur());
  else if (code === 'Equal' || code === 'NumpadAdd') setZoom(pxPerSec * 1.25);
  else if (code === 'Minus' || code === 'NumpadSubtract') setZoom(pxPerSec / 1.25);
  else if (code === 'Escape') { selectClip(null); setTool('select'); }
  else if (code === 'F1' || (code === 'Slash' && shift)) showShortcuts();
  else handled = false;
  if (handled) e.preventDefault();
});
window.addEventListener('resize', () => { sizeCanvas(); renderTimeline(); });

/* ---------- 업데이트 ---------- */
let updInfo = null;
function updShow(ids) { ['updGo', 'updRestart', 'updPage', 'updNotes', 'updBarWrap'].forEach(id => $('#' + id).classList.toggle('hidden', !ids.includes(id))); }
async function checkUpdate(silent) {
  try {
    const v = await API.appVersion();
    if (!silent) { $('#updateModal').classList.remove('hidden'); $('#updStatus').textContent = `현재 버전 ${v.version} · 확인 중…`; updShow([]); }
    updInfo = await API.checkUpdate();
    $('#updDot').classList.toggle('hidden', !updInfo.available);
    if (silent) { if (updInfo.available) toast(`새 버전 ${updInfo.latest}이 있어요. 위쪽 업데이트 버튼을 눌러 주세요.`, 5000); return; }
    if (!updInfo.latest) { $('#updStatus').textContent = `현재 버전 ${v.version} · 아직 올라온 업데이트가 없어요.`; return; }
    if (!updInfo.available) { $('#updStatus').textContent = `현재 버전 ${v.version} · 최신 버전이에요.`; return; }
    $('#updStatus').textContent = `새 버전 ${updInfo.latest}이 있어요 (현재 ${v.version}).`;
    $('#updNotes').textContent = updInfo.notes || '';
    updShow(updInfo.notes ? ['updGo', 'updNotes'] : ['updGo']);
  } catch (e) {
    if (!silent) $('#updStatus').textContent = '업데이트를 확인하지 못했어요. 인터넷 연결을 확인해 주세요. (' + (e.message || e) + ')';
  }
}
$('#btnUpdate').onclick = () => checkUpdate(false);
$('#updClose').onclick = () => $('#updateModal').classList.add('hidden');
$('#updPage').onclick = () => API.openUpdatePage(updInfo && (updInfo.fullUrl || updInfo.page));
$('#updGo').onclick = async () => {
  if (dirty && !confirm('저장하지 않은 변경 사항이 있어요. 업데이트 후 다시 시작하면 사라질 수 있어요. 계속할까요?')) return;
  updShow(['updBarWrap']); $('#updBar').style.width = '5%'; $('#updStatus').textContent = '받는 중…';
  try {
    const r = await API.installUpdate();
    if (r.needFull) {
      $('#updStatus').textContent = '이번 업데이트는 앱 전체를 새로 받아야 해요. 다운로드 페이지에서 새 zip을 받아 주세요.';
      updShow(['updPage']); return;
    }
    $('#updStatus').textContent = `${r.installed} 버전 설치 완료! 다시 시작하면 적용돼요.`;
    updShow(['updRestart']);
  } catch (e) { $('#updStatus').textContent = '업데이트에 실패했어요: ' + (e.message || e); updShow(['updGo']); }
};
API.onUpdateProgress(v => { $('#updBar').style.width = Math.round(v * 100) + '%'; });
$('#updRestart').onclick = () => API.restartApp();
API.appVersion().then(v => { $('#btnUpdate').title = `업데이트 확인 (현재 버전 ${v.version})`; });
setTimeout(() => checkUpdate(true), 4000);

/* ---------- 시작 ---------- */
project = newProject();
commit.last = snapshot();
renderTextPresets();
sizeCanvas();
renderAll();
setDirty(false);
window.__studio = { get project() { return project; }, importPaths, addTextClip, splitAt, seek, setPlaying, selectClip, get playhead() { return playhead; }, renderTextPngs };
