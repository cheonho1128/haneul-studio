// 새 전환·효과 전부 내보내기 테스트
const { execFileSync } = require('child_process');
const path = require('path');
const core = require('../src/renderer/core');
const { buildExportArgs } = require('../src/export');
const F = p => path.join(__dirname, 'fixtures', p);
const FF = path.join(__dirname, '..', 'node_modules', 'ffmpeg-static', 'ffmpeg');
const mode = process.argv[2] || 'trans';
const media = [
  { id: 'a', path: F('a.mp4'), kind: 'video', width: 1280, height: 720, hasAudio: true, duration: 6 },
  { id: 'c', path: F('c.png'), kind: 'image', width: 800, height: 600 },
];
const clips = []; const samples = [];
let t = 0;
const list = mode === 'trans' ? core.TRANSITIONS.filter(x => x.type !== 'none') : core.EFFECTS;
list.forEach((x, i) => {
  const L = 1.2;
  const c = { id: 'k' + i, mediaId: (i % 2 && mode === 'trans') ? 'c' : 'a', start: t, in: 0, out: L, speed: 1, transform: { scale: 1, x: 0, y: 0, rotation: 0 } };
  if (mode === 'trans') { c.transitionIn = { type: x.type, duration: 0.6 }; samples.push(t + 0.3); }
  else { c.effects = [{ type: x.type, amount: 60 }]; samples.push(t + 0.5); }
  clips.push(c); t += L;
});
const project = { width: 640, height: 360, fps: 25, media, tracks: [{ id: 'v1', kind: 'video', clips }] };
const out = path.join(__dirname, `out3_${mode}.mp4`);
const { args } = buildExportArgs(project, { outPath: out, preset: 'ultrafast' });
const t0 = Date.now();
execFileSync(FF, args, { stdio: ['ignore', 'ignore', 'inherit'] });
console.log('export s', (Date.now() - t0) / 1000);
const fr = samples.map((s, i) => { const f = path.join(__dirname, `s_${mode}_${i}.png`); execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', s.toFixed(3), '-i', out, '-frames:v', '1', '-vf', 'scale=213:120', f]); return f; });
execFileSync('ffmpeg', ['-v', 'error', '-y', ...fr.flatMap(f => ['-i', f]), '-filter_complex', `xstack=inputs=${fr.length}:layout=${fr.map((_, i) => `${(i % 6) * 213}_${Math.floor(i / 6) * 120}`).join('|')}:fill=gray`, path.join(__dirname, `grid_${mode}.png`)]);
console.log('OK', list.map((x, i) => `${i}:${x.name}`).join(' '));
