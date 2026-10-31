// 효과·필터·전환 목록의 움직이는 미리보기
(function () {
  'use strict';
  const W = 160, H = 90;

  // 예시 장면 A (노을 산), B (낮 바다)
  function sceneA(label = true) {
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    let gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#2b3a7a'); gr.addColorStop(0.55, '#f08a4b'); gr.addColorStop(1, '#f6c56b');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.fillStyle = '#ffe9a8'; g.beginPath(); g.arc(112, 50, 13, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#4a2f5c'; g.beginPath(); g.moveTo(0, 70); g.lineTo(35, 40); g.lineTo(65, 62); g.lineTo(95, 45); g.lineTo(130, 66); g.lineTo(160, 52); g.lineTo(160, 90); g.lineTo(0, 90); g.fill();
    g.fillStyle = '#2a1b38'; g.beginPath(); g.moveTo(0, 82); g.lineTo(50, 66); g.lineTo(100, 80); g.lineTo(160, 70); g.lineTo(160, 90); g.lineTo(0, 90); g.fill();
    g.fillStyle = '#1a1024'; g.fillRect(24, 58, 3, 18); g.beginPath(); g.arc(25.5, 56, 7, 0, Math.PI * 2); g.fill();
    if (label) { g.fillStyle = 'rgba(255,255,255,.9)'; g.font = 'bold 13px sans-serif'; g.fillText('A', 6, 15); }
    return c;
  }
  function sceneB() {
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    let gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#6cc3f2'); gr.addColorStop(0.5, '#bfe8ff'); gr.addColorStop(0.5, '#1f8fb8'); gr.addColorStop(1, '#0d5a7d');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.fillStyle = '#fff6b0'; g.beginPath(); g.arc(30, 20, 9, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(110, 18, 18, 6, 0, 0, Math.PI * 2); g.ellipse(124, 14, 12, 6, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e9d39a'; g.beginPath(); g.moveTo(60, 90); g.quadraticCurveTo(110, 66, 160, 72); g.lineTo(160, 90); g.fill();
    g.fillStyle = '#2f9e5b'; g.beginPath(); g.arc(138, 58, 10, Math.PI, 0); g.fill(); g.fillStyle = '#6b4a2b'; g.fillRect(136, 58, 4, 14);
    g.fillStyle = 'rgba(255,255,255,.95)'; g.font = 'bold 13px sans-serif'; g.fillText('B', 6, 15);
    return c;
  }
  let A, B, A0;
  const tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H; const tg = tmp.getContext('2d', { willReadFrequently: true });

  function drawEffect(g, type, t) {
    const A = A0;
    const p = (t % 2.4) / 2.4;            // 0~1 반복
    g.save(); g.clearRect(0, 0, W, H);
    if (type === 'zoomIn' || type === 'zoomOut') {
      const s = type === 'zoomIn' ? 1 + p * 0.45 : 1.45 - p * 0.45;
      g.translate(W / 2, H / 2); g.scale(s, s); g.drawImage(A, -W / 2, -H / 2);
    } else if (type === 'shake') {
      const k = Math.floor(t * 20);
      const rx = Math.sin(k * 12.9898) * 43758.5453 % 1, ry = Math.sin(k * 78.233) * 43758.5453 % 1;
      g.translate(W / 2 + rx * 6, H / 2 + ry * 6); g.scale(1.12, 1.12); g.drawImage(A, -W / 2, -H / 2);
    } else if (type === 'mirror') {
      if (p > 0.5) { g.translate(W, 0); g.scale(-1, 1); } g.drawImage(A, 0, 0);
    } else if (type === 'flipV') {
      if (p > 0.5) { g.translate(0, H); g.scale(1, -1); } g.drawImage(A, 0, 0);
    } else if (type === 'invert') {
      if (p > 0.5) g.filter = 'invert(1)'; g.drawImage(A, 0, 0);
    } else if (type === 'pixelate') {
      const sz = 2 + Math.round((0.5 - Math.abs(p - 0.5)) * 2 * 14);
      tg.clearRect(0, 0, W, H); tg.drawImage(A, 0, 0, W / sz, H / sz);
      g.imageSmoothingEnabled = false; g.drawImage(tmp, 0, 0, W / sz, H / sz, 0, 0, W, H);
    } else if (type === 'vignette') {
      g.drawImage(A, 0, 0);
      const r = g.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, W * 0.62);
      r.addColorStop(0, 'rgba(0,0,0,0)'); r.addColorStop(1, `rgba(0,0,0,${0.35 + 0.5 * (0.5 - Math.abs(p - 0.5)) * 2})`);
      g.fillStyle = r; g.fillRect(0, 0, W, H);
    } else if (type === 'flash') {
      g.drawImage(A, 0, 0);
      const a = p < 0.35 ? 1 - p / 0.35 : 0; g.fillStyle = `rgba(255,255,255,${a})`; g.fillRect(0, 0, W, H);
    } else if (type === 'grain' || type === 'rgbSplit') {
      tg.clearRect(0, 0, W, H); tg.drawImage(A, 0, 0);
      const d = tg.getImageData(0, 0, W, H), s = d.data;
      if (type === 'grain') {
        for (let i = 0; i < s.length; i += 4) { const n = (Math.random() - 0.5) * 70; s[i] += n; s[i + 1] += n; s[i + 2] += n; }
      } else {
        const off = Math.round(2 + 4 * Math.abs(Math.sin(t * 6))), src = new Uint8ClampedArray(s);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4, l = (y * W + Math.max(0, x - off)) * 4, r = (y * W + Math.min(W - 1, x + off)) * 4;
          s[i] = src[l]; s[i + 2] = src[r + 2];
        }
      }
      g.putImageData(d, 0, 0);
    } else g.drawImage(A, 0, 0);
    g.restore();
  }

  function drawTransition(g, type, t) {
    const T = 2.6, p = (t % T) / T;        // A 보이기 → 전환 → B 보이기
    const a0 = 0.3, a1 = 0.7, k = Math.min(1, Math.max(0, (p - a0) / (a1 - a0)));
    const e = k * k * (3 - 2 * k);
    g.save(); g.clearRect(0, 0, W, H); g.globalAlpha = 1;
    if (type === 'none') { g.drawImage(k < 0.5 ? A : B, 0, 0); }
    else if (type === 'dissolve') { g.drawImage(A, 0, 0); g.globalAlpha = e; g.drawImage(B, 0, 0); }
    else if (type === 'black' || type === 'white') {
      g.fillStyle = type === 'black' ? '#000' : '#fff'; g.fillRect(0, 0, W, H);
      if (k < 0.5) { g.globalAlpha = 1 - k * 2; g.drawImage(A, 0, 0); } else { g.globalAlpha = (k - 0.5) * 2; g.drawImage(B, 0, 0); }
    } else if (type.startsWith('slide')) {
      const dir = type.slice(5);
      const dx = dir === 'Left' ? 1 : dir === 'Right' ? -1 : 0, dy = dir === 'Up' ? 1 : dir === 'Down' ? -1 : 0;
      g.drawImage(A, 0, 0);
      g.drawImage(B, dx * W * (1 - e), dy * H * (1 - e));
    }
    g.restore();
  }

  function drawFilter(g, css) {
    const A = A0;
    g.save(); g.clearRect(0, 0, W, H); g.filter = css || 'none'; g.drawImage(A, 0, 0); g.restore();
  }

  const live = new Set();
  let raf = 0;
  function loop(now) {
    raf = 0;
    const t = now / 1000;
    for (const cv of live) {
      if (!cv.isConnected) { live.delete(cv); continue; }
      if (!cv.offsetParent) continue;   // 숨겨진 탭은 건너뛰기
      const g = cv.getContext('2d');
      if (cv.dataset.kind === 'effect') drawEffect(g, cv.dataset.type, t);
      else drawTransition(g, cv.dataset.type, t);
    }
    if (live.size) raf = requestAnimationFrame(loop);
  }
  function canvas(kind, type, css) {
    if (!A) { A = sceneA(); B = sceneB(); A0 = sceneA(false); }
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; cv.className = 'fxprev';
    cv.dataset.kind = kind; cv.dataset.type = type;
    if (kind === 'filter') drawFilter(cv.getContext('2d'), css);
    else { live.add(cv); if (!raf) raf = requestAnimationFrame(loop); }
    return cv;
  }
  window.FxPreview = { canvas };
})();
