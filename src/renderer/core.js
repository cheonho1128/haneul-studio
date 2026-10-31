// 미리보기(화면)와 내보내기(FFmpeg)가 함께 쓰는 공용 정의
(function (root, factory) {
  const m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else root.Core = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const FILTERS = [
    { id: 'none', name: '원본', css: '', ff: '' },
    { id: 'grayscale', name: '흑백', css: 'grayscale(1)', ff: 'hue=s=0' },
    { id: 'sepia', name: '빈티지', css: 'sepia(1)', ff: 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131' },
    { id: 'warm', name: '따뜻하게', css: 'sepia(.25) saturate(1.15) hue-rotate(-8deg)', ff: 'colorbalance=rs=.12:gs=.03:bs=-.12' },
    { id: 'cool', name: '차갑게', css: 'hue-rotate(12deg) saturate(.95) brightness(1.02)', ff: 'colorbalance=rs=-.12:gs=0:bs=.14' },
    { id: 'vivid', name: '선명하게', css: 'saturate(1.5) contrast(1.1)', ff: 'eq=saturation=1.5:contrast=1.1' },
    { id: 'fade', name: '바랜 느낌', css: 'contrast(.8) saturate(.75) brightness(1.08)', ff: 'eq=contrast=0.8:saturation=0.75:brightness=0.06' },
    { id: 'dramatic', name: '드라마틱', css: 'contrast(1.35) saturate(.85) brightness(.95)', ff: 'eq=contrast=1.35:saturation=0.85:brightness=-0.04' },
    { id: 'film', name: '필름', css: 'sepia(.35) contrast(1.15) saturate(.9)', ff: 'colorchannelmixer=.85:.25:.05:0:.15:.8:.1:0:.1:.2:.7,eq=contrast=1.12' },
    { id: 'cyber', name: '사이버', css: 'hue-rotate(-25deg) saturate(1.6) contrast(1.1)', ff: 'hue=h=-25:s=1.6,eq=contrast=1.1' },
  ];
  const FILTER_PRESET_FFMPEG = Object.fromEntries(FILTERS.map(f => [f.id, f.ff]));

  const EFFECTS = [
    { type: 'zoomIn', name: '줌 인', icon: '🔍', hint: '천천히 가까이 (켄 번즈)', cat: '카메라' },
    { type: 'zoomOut', name: '줌 아웃', icon: '🔭', hint: '천천히 멀어짐', cat: '카메라' },
    { type: 'shake', name: '흔들림', icon: '〰', hint: '카메라 흔들림', cat: '카메라' },
    { type: 'pulse', name: '심장 박동', icon: '♥', hint: '박자에 맞춰 툭툭 커짐', cat: '카메라' },
    { type: 'swing', name: '좌우 흔들흔들', icon: '↺', hint: '시계추처럼 기울어짐', cat: '카메라' },
    { type: 'spin', name: '빙글빙글', icon: '⟳', hint: '계속 회전', cat: '카메라' },
    { type: 'rgbSplit', name: '글리치', icon: '▦', hint: 'RGB 색 분리', cat: '레트로' },
    { type: 'grain', name: '필름 그레인', icon: '░', hint: '노이즈 질감', cat: '레트로' },
    { type: 'scanlines', name: '오래된 TV', icon: '☰', hint: '가로 줄무늬 (스캔라인)', cat: '레트로' },
    { type: 'vignette', name: '비네팅', icon: '◎', hint: '가장자리 어둡게', cat: '레트로' },
    { type: 'posterize', name: '포스터', icon: '▤', hint: '색 단계를 줄여 만화처럼', cat: '레트로' },
    { type: 'letterbox', name: '시네마 바', icon: '▭', hint: '위아래 검은 띠 (영화 느낌)', cat: '레트로' },
    { type: 'flash', name: '플래시', icon: '✦', hint: '시작할 때 하얗게 번쩍', cat: '빛·색' },
    { type: 'strobe', name: '깜빡임', icon: '⚡', hint: '빠르게 밝아졌다 어두워짐', cat: '빛·색' },
    { type: 'glow', name: '몽환 글로우', icon: '✺', hint: '빛이 번지는 느낌', cat: '빛·색' },
    { type: 'rainbow', name: '무지개 색 변화', icon: '🌈', hint: '색이 계속 바뀜', cat: '빛·색' },
    { type: 'duotone', name: '블루 톤', icon: '◑', hint: '푸른 단색 톤', cat: '빛·색' },
    { type: 'invert', name: '색 반전', icon: '◐', hint: '네거티브', cat: '빛·색' },
    { type: 'blur', name: '흐림', icon: '◌', hint: '화면 전체 흐리게', cat: '빛·색' },
    { type: 'pixelate', name: '모자이크', icon: '▩', hint: '픽셀화', cat: '화면' },
    { type: 'split4', name: '4분할', icon: '⊞', hint: '같은 화면 4개', cat: '화면' },
    { type: 'mirrorSplit', name: '좌우 대칭', icon: '⧓', hint: '왼쪽 절반을 거울처럼', cat: '화면' },
    { type: 'mirror', name: '좌우 반전', icon: '⇋', hint: '거울', cat: '화면' },
    { type: 'flipV', name: '상하 반전', icon: '⇵', hint: '뒤집기', cat: '화면' },
  ];
  const EFFECT_CATS = ['카메라', '레트로', '빛·색', '화면'];
  const NO_AMOUNT_FX = ['invert', 'mirror', 'flipV', 'split4', 'mirrorSplit', 'duotone'];

  /* 마스크 전환: v(x,y)가 작은 곳부터 B가 드러난다 (x,y: 0~1, a: 가로/세로 비율) */
  const MASKS = {
    wipeLeft: { js: (x) => 1 - x, ff: '(1-X/W)' },
    wipeRight: { js: (x) => x, ff: '(X/W)' },
    wipeUp: { js: (x, y) => 1 - y, ff: '(1-Y/H)' },
    wipeDown: { js: (x, y) => y, ff: '(Y/H)' },
    wipeDiag: { js: (x, y) => (x + y) / 2, ff: '((X/W+Y/H)/2)' },
    blindsH: { js: (x, y) => (y * 8) % 1, ff: 'mod(Y/H*8,1)' },
    blindsV: { js: (x) => (x * 10) % 1, ff: 'mod(X/W*10,1)' },
    checker: { js: (x, y) => ((Math.floor(x * 8) + Math.floor(y * 4.5)) % 2) * 0.5 + ((x * 8) % 1) * 0.5, ff: '(mod(floor(X/W*8)+floor(Y/H*4.5),2)*0.5+mod(X/W*8,1)*0.5)' },
    pixelDissolve: { js: (x, y) => Math.abs(Math.sin(Math.floor(x * 40) * 12.9898 + Math.floor(y * 22.5) * 78.233) * 43758.5453) % 1, ff: 'mod(abs(sin(floor(X/W*40)*12.9898+floor(Y/H*22.5)*78.233)*43758.5453),1)' },
    circleOpen: { js: (x, y, a) => Math.hypot((x - 0.5) * a, y - 0.5) / Math.hypot(0.5 * a, 0.5), ff: '(hypot((X/W-0.5)*W/H,Y/H-0.5)/hypot(0.5*W/H,0.5))' },
    circleClose: { js: (x, y, a) => 1 - Math.hypot((x - 0.5) * a, y - 0.5) / Math.hypot(0.5 * a, 0.5), ff: '(1-hypot((X/W-0.5)*W/H,Y/H-0.5)/hypot(0.5*W/H,0.5))' },
    clock: { js: (x, y) => ((Math.atan2(x - 0.5, 0.5 - y) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI), ff: '(mod(atan2(X/W-0.5,0.5-Y/H)+2*PI,2*PI)/(2*PI))' },
    barnV: { js: (x) => Math.abs(x - 0.5) * 2, ff: '(abs(X/W-0.5)*2)' },
    barnH: { js: (x, y) => Math.abs(y - 0.5) * 2, ff: '(abs(Y/H-0.5)*2)' },
    diamond: { js: (x, y) => Math.abs(x - 0.5) + Math.abs(y - 0.5), ff: '(abs(X/W-0.5)+abs(Y/H-0.5))' },
  };
  const MASK_EDGE = 0.06;
  const smooth = p => p * p * (3 - 2 * p);
  /** 마스크 알파 (0~1) */
  function maskAlpha(type, x, y, a, p) {
    const v = MASKS[type].js(x, y, a), P = smooth(Math.min(1, Math.max(0, p)));
    return Math.min(1, Math.max(0, (P * (1 + MASK_EDGE) - v) / MASK_EDGE));
  }
  /** geq 알파 표현식 (T: 전환 시작부터 흐른 시간) */
  function maskExpr(type, d) {
    const p = `min(1,T/${d.toFixed(4)})`;
    return `clip(((${p})*(${p})*(3-2*(${p}))*${(1 + MASK_EDGE).toFixed(3)}-${MASKS[type].ff})/${MASK_EDGE},0,1)`;
  }

  const TRANSITIONS = [
    { type: 'none', name: '없음', cat: '기본' },
    { type: 'dissolve', name: '디졸브', cat: '기본' },
    { type: 'black', name: '검은 화면', cat: '기본' },
    { type: 'white', name: '흰 화면', cat: '기본' },
    { type: 'pixelDissolve', name: '픽셀 디졸브', cat: '기본' },
    { type: 'slideLeft', name: '슬라이드 ←', cat: '슬라이드' },
    { type: 'slideRight', name: '슬라이드 →', cat: '슬라이드' },
    { type: 'slideUp', name: '슬라이드 ↑', cat: '슬라이드' },
    { type: 'slideDown', name: '슬라이드 ↓', cat: '슬라이드' },
    { type: 'pushLeft', name: '밀어내기 ←', cat: '슬라이드' },
    { type: 'pushRight', name: '밀어내기 →', cat: '슬라이드' },
    { type: 'pushUp', name: '밀어내기 ↑', cat: '슬라이드' },
    { type: 'pushDown', name: '밀어내기 ↓', cat: '슬라이드' },
    { type: 'wipeLeft', name: '와이프 ←', cat: '와이프' },
    { type: 'wipeRight', name: '와이프 →', cat: '와이프' },
    { type: 'wipeUp', name: '와이프 ↑', cat: '와이프' },
    { type: 'wipeDown', name: '와이프 ↓', cat: '와이프' },
    { type: 'wipeDiag', name: '대각선 와이프', cat: '와이프' },
    { type: 'blindsH', name: '블라인드 (가로)', cat: '와이프' },
    { type: 'blindsV', name: '블라인드 (세로)', cat: '와이프' },
    { type: 'checker', name: '체커보드', cat: '와이프' },
    { type: 'circleOpen', name: '원형 열기', cat: '도형' },
    { type: 'circleClose', name: '원형 닫기', cat: '도형' },
    { type: 'clock', name: '시계 방향', cat: '도형' },
    { type: 'barnV', name: '문 열기 (세로)', cat: '도형' },
    { type: 'barnH', name: '문 열기 (가로)', cat: '도형' },
    { type: 'diamond', name: '다이아몬드', cat: '도형' },
    { type: 'zoomInT', name: '줌 인', cat: '줌·회전' },
    { type: 'zoomOutT', name: '줌 아웃', cat: '줌·회전' },
    { type: 'spinT', name: '회전 등장', cat: '줌·회전' },
  ];
  const TRANSITION_CATS = ['기본', '슬라이드', '와이프', '도형', '줌·회전'];

  const TEXT_ANIMS = [
    { id: 'none', name: '없음' }, { id: 'up', name: '위로 올라오기' }, { id: 'down', name: '위에서 내려오기' },
    { id: 'left', name: '왼쪽에서' }, { id: 'right', name: '오른쪽에서' }, { id: 'typewriter', name: '타자기' },
  ];

  function clipDuration(c) {
    if (c.type === 'text' || c.type === 'adjust') return Number(c.duration) || 0;
    return ((Number(c.out) || 0) - (Number(c.in) || 0)) / (Number(c.speed) || 1);
  }
  function clipEnd(c) { return (Number(c.start) || 0) + clipDuration(c); }
  function projectDuration(project) {
    let end = 0;
    for (const t of project.tracks) for (const c of t.clips) end = Math.max(end, clipEnd(c));
    return end;
  }

  /** 클립 사이 전환을 클립별 렌더링 지시로 바꾼다 */
  function transitionPlan(project) {
    const plan = {};
    const P = id => (plan[id] = plan[id] || { extend: 0, alphaIn: 0, alphaOut: 0, whiteIn: 0, whiteOut: 0, slide: null, mask: null, pushOut: null, kfTrans: null });
    for (const tr of project.tracks) {
      if (tr.kind !== 'video') continue;
      const clips = tr.clips.slice().sort((a, b) => a.start - b.start);
      clips.forEach((b, i) => {
        const t = b.transitionIn;
        if (!t || !t.type || t.type === 'none') return;
        const d = Math.max(0.1, Math.min(Number(t.duration) || 0.5, clipDuration(b) / 2));
        const a = i > 0 && Math.abs(clipEnd(clips[i - 1]) - b.start) < 0.05 ? clips[i - 1] : null;
        const pa = a && P(a.id), pb = P(b.id);
        const half = d / 2;
        if (t.type === 'dissolve') { pb.alphaIn = d; if (pa) pa.extend = Math.max(pa.extend, d); }
        else if (t.type.startsWith('slide')) {
          pb.slide = { dir: t.type.slice(5).toLowerCase(), d };
          if (pa) pa.extend = Math.max(pa.extend, d);
        } else if (t.type.startsWith('push')) {
          pb.slide = { dir: t.type.slice(4).toLowerCase(), d };
          if (pa) { pa.extend = Math.max(pa.extend, d); pa.pushOut = { dir: pb.slide.dir, d, at: b.start }; }
        } else if (MASKS[t.type]) {
          pb.mask = { type: t.type, d };
          if (pa) pa.extend = Math.max(pa.extend, d);
        } else if (t.type === 'zoomInT' || t.type === 'zoomOutT' || t.type === 'spinT') {
          pb.kfTrans = { type: t.type, d };
          if (t.type !== 'spinT') pb.alphaIn = d * 0.7;
          if (pa) pa.extend = Math.max(pa.extend, d);
        } else if (t.type === 'black') { pb.alphaIn = half; if (pa) pa.alphaOut = Math.min(half, clipDuration(a) / 2); }
        else if (t.type === 'white') { pb.whiteIn = half; if (pa) pa.whiteOut = Math.min(half, clipDuration(a) / 2); }
      });
    }
    return plan;
  }

  /* ----- 색 보정 (프리미어의 Lumetri 기본 보정과 비슷) ----- */
  const COLOR_KEYS = ['exposure', 'highlights', 'shadows', 'whites', 'blacks', 'temperature', 'tint', 'vibrance'];
  function hasColor(col) { return !!col && COLOR_KEYS.some(k => Number(col[k])); }
  /** 0~1 입력값에 대한 R,G,B 출력값 */
  function toneMap(col, x) {
    const n = k => (Number(col[k]) || 0) / 100;
    let v = x * Math.pow(2, n('exposure') * 1.5);
    const bp = -n('blacks') * 0.12;               // 블랙: +면 어두운 부분을 띄움
    v = bp + v * (1 - bp) * (1 + n('whites') * 0.25);
    const c = Math.min(1, Math.max(0, v));
    v += n('shadows') * 0.35 * Math.pow(1 - c, 2) * Math.min(1, c * 6 + 0.15);
    v += n('highlights') * 0.3 * c * c * Math.min(1, (1 - c) * 6 + 0.15);
    const t = n('temperature'), ti = n('tint');
    const clamp = z => Math.min(1, Math.max(0, z));
    return [clamp(v * (1 + t * 0.12 + ti * 0.04)), clamp(v * (1 - ti * 0.1)), clamp(v * (1 - t * 0.12 + ti * 0.04))];
  }
  function toneTables(col) {
    const r = new Uint8ClampedArray(256), g = new Uint8ClampedArray(256), b = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) { const o = toneMap(col, i / 255); r[i] = o[0] * 255; g[i] = o[1] * 255; b[i] = o[2] * 255; }
    return [r, g, b];
  }
  /** ffmpeg curves 필터용 점 목록 */
  function curvesFilter(col) {
    const pts = [[], [], []];
    for (let i = 0; i <= 16; i++) { const x = i / 16, o = toneMap(col, x); for (let k = 0; k < 3; k++) pts[k].push(`${x.toFixed(4)}/${o[k].toFixed(4)}`); }
    return `curves=r='${pts[0].join(' ')}':g='${pts[1].join(' ')}':b='${pts[2].join(' ')}'`;
  }

  /* ----- 키프레임 ----- */
  const KF_PROPS = ['x', 'y', 'scale', 'rotation', 'opacity', 'volume'];
  function staticVal(c, prop) {
    const tf = c.transform || {};
    if (prop === 'x') return Number(tf.x) || 0;
    if (prop === 'y') return Number(tf.y) || 0;
    if (prop === 'scale') return tf.scale ?? 1;
    if (prop === 'rotation') return Number(tf.rotation) || 0;
    if (prop === 'opacity') return c.opacity ?? 1;
    if (prop === 'volume') return c.volume ?? 1;
    return 0;
  }
  function hasKf(c, prop) { return !!(c.kf && c.kf[prop] && c.kf[prop].length); }
  function anyKf(c) { return !!c.kf && KF_PROPS.some(p => hasKf(c, p)); }
  function ease(p, e) { return e === 'smooth' ? p * p * (3 - 2 * p) : p; }
  /** 클립 안 시간(local)에서의 값 */
  function kfValue(c, prop, local) {
    if (!hasKf(c, prop)) return staticVal(c, prop);
    const k = c.kf[prop];
    if (local <= k[0].t) return k[0].v;
    for (let i = 1; i < k.length; i++) {
      if (local < k[i].t) { const a = k[i - 1], b = k[i], p = (local - a.t) / Math.max(1e-6, b.t - a.t); return a.v + (b.v - a.v) * ease(p, a.ease); }
    }
    return k[k.length - 1].v;
  }
  /** ffmpeg 표현식 (tv: 시간 변수 이름, mul: 곱할 값) */
  function kfExpr(c, prop, tv, mul = 1, add = 0) {
    const f = v => (v * mul + add).toFixed(5);
    if (!hasKf(c, prop)) return f(staticVal(c, prop));
    const k = c.kf[prop];
    let e = f(k[k.length - 1].v);
    for (let i = k.length - 1; i >= 1; i--) {
      const a = k[i - 1], b = k[i];
      const p = `((${tv}-${a.t.toFixed(4)})/${Math.max(1e-4, b.t - a.t).toFixed(4)})`;
      const pe = a.ease === 'smooth' ? `(${p}*${p}*(3-2*${p}))` : p;
      e = `if(lt(${tv},${b.t.toFixed(4)}),${f(a.v)}+(${f(b.v)}-${f(a.v)})*${pe},${e})`;
    }
    return `if(lt(${tv},${k[0].t.toFixed(4)}),${f(k[0].v)},${e})`;
  }
  function kfMax(c, prop) { return hasKf(c, prop) ? Math.max(...c.kf[prop].map(k => k.v)) : staticVal(c, prop); }

  /** 전환·움직임 효과를 키프레임으로 바꾼 클립 (원본은 그대로) */
  function effClip(c, tp) {
    const fx = c.effects || [];
    const amt = type => { const e = fx.find(x => x.type === type); return e ? (Number(e.amount ?? 50)) / 100 : null; };
    const pulse = amt('pulse'), swing = amt('swing'), spin = amt('spin');
    const kt = tp && tp.kfTrans;
    if (pulse === null && swing === null && spin === null && !kt) return c;
    const out = { ...c, kf: { ...(c.kf || {}) } };
    const dur = clipDuration(c) + ((tp && tp.extend) || 0);
    const s0 = staticVal(c, 'scale'), r0 = staticVal(c, 'rotation');
    if (pulse !== null && !hasKf(c, 'scale')) {
      const k = [], per = 0.6, big = s0 * (1.04 + 0.12 * pulse);
      for (let t = 0; t < dur + per && k.length < 400; t += per) k.push({ t: +t.toFixed(3), v: s0, ease: 'smooth' }, { t: +(t + 0.12).toFixed(3), v: big, ease: 'smooth' });
      out.kf.scale = k;
    }
    if (spin !== null && !hasKf(c, 'rotation')) out.kf.rotation = [{ t: 0, v: r0 }, { t: +dur.toFixed(3), v: r0 + (30 + 330 * spin) * dur }];
    else if (swing !== null && !hasKf(c, 'rotation')) {
      const k = [], per = 1.2, A = 2 + 8 * swing;
      for (let t = 0, i = 0; t < dur + per && k.length < 400; t += per / 2, i++) k.push({ t: +t.toFixed(3), v: r0 + (i % 2 ? -A : A), ease: 'smooth' });
      out.kf.rotation = k;
    }
    if (kt) {
      const d = kt.d;
      const merge = (prop, from, to) => {
        const base = out.kf[prop] && out.kf[prop].length ? out.kf[prop] : null;
        if (base && hasKf(c, prop)) return;            // 사용자가 넣은 키프레임은 건드리지 않음
        const after = base ? base.filter(k => k.t > d) : [];
        out.kf[prop] = [{ t: 0, v: from, ease: 'smooth' }, { t: d, v: to }, ...after];
      };
      if (kt.type === 'zoomInT') merge('scale', s0 * 0.4, s0);
      if (kt.type === 'zoomOutT') merge('scale', s0 * 1.8, s0);
      if (kt.type === 'spinT') { merge('scale', s0 * 0.2, s0); merge('rotation', r0 - 270, r0); }
    }
    return out;
  }

  return { effClip, maskAlpha, maskExpr, MASKS, EFFECT_CATS, NO_AMOUNT_FX, TRANSITION_CATS, KF_PROPS, hasKf, anyKf, kfValue, kfExpr, kfMax, staticVal, COLOR_KEYS, hasColor, toneMap, toneTables, curvesFilter, FILTERS, FILTER_PRESET_FFMPEG, EFFECTS, TRANSITIONS, TEXT_ANIMS, clipDuration, clipEnd, projectDuration, transitionPlan };
});
