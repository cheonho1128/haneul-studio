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
    { type: 'zoomIn', name: '줌 인', icon: '🔍', hint: '천천히 가까이 (켄 번즈)' },
    { type: 'zoomOut', name: '줌 아웃', icon: '🔭', hint: '천천히 멀어짐' },
    { type: 'shake', name: '흔들림', icon: '〰', hint: '카메라 흔들림' },
    { type: 'rgbSplit', name: '글리치', icon: '▦', hint: 'RGB 색 분리' },
    { type: 'vignette', name: '비네팅', icon: '◎', hint: '가장자리 어둡게' },
    { type: 'grain', name: '필름 그레인', icon: '░', hint: '노이즈 질감' },
    { type: 'pixelate', name: '모자이크', icon: '▩', hint: '픽셀화' },
    { type: 'flash', name: '플래시', icon: '✦', hint: '시작할 때 하얗게 번쩍' },
    { type: 'invert', name: '색 반전', icon: '◐', hint: '네거티브' },
    { type: 'mirror', name: '좌우 반전', icon: '⇋', hint: '거울' },
    { type: 'flipV', name: '상하 반전', icon: '⇵', hint: '뒤집기' },
  ];

  const TRANSITIONS = [
    { type: 'none', name: '없음' },
    { type: 'dissolve', name: '디졸브' },
    { type: 'black', name: '검은 화면' },
    { type: 'white', name: '흰 화면' },
    { type: 'slideLeft', name: '슬라이드 ←' },
    { type: 'slideRight', name: '슬라이드 →' },
    { type: 'slideUp', name: '슬라이드 ↑' },
    { type: 'slideDown', name: '슬라이드 ↓' },
  ];

  const TEXT_ANIMS = [
    { id: 'none', name: '없음' }, { id: 'up', name: '위로 올라오기' }, { id: 'down', name: '위에서 내려오기' },
    { id: 'left', name: '왼쪽에서' }, { id: 'right', name: '오른쪽에서' }, { id: 'typewriter', name: '타자기' },
  ];

  function clipDuration(c) {
    if (c.type === 'text') return Number(c.duration) || 0;
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
    const P = id => (plan[id] = plan[id] || { extend: 0, alphaIn: 0, alphaOut: 0, whiteIn: 0, whiteOut: 0, slide: null });
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
        } else if (t.type === 'black') { pb.alphaIn = half; if (pa) pa.alphaOut = Math.min(half, clipDuration(a) / 2); }
        else if (t.type === 'white') { pb.whiteIn = half; if (pa) pa.whiteOut = Math.min(half, clipDuration(a) / 2); }
      });
    }
    return plan;
  }

  return { FILTERS, FILTER_PRESET_FFMPEG, EFFECTS, TRANSITIONS, TEXT_ANIMS, clipDuration, clipEnd, projectDuration, transitionPlan };
});
