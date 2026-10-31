const { execFileSync } = require('child_process');
const path = require('path');
const { buildExportArgs } = require('../src/export');
const F = p => path.join(__dirname, 'fixtures', p);
const project = {
  width: 1280, height: 720, fps: 30,
  media: [
    { id: 'a', path: F('a.mp4'), kind: 'video', width: 1280, height: 720, hasAudio: true, duration: 6 },
    { id: 'c', path: F('c.png'), kind: 'image', width: 800, height: 600 },
  ],
  tracks: [
    { id: 'adj', kind: 'video', clips: [{ id: 'j1', type: 'adjust', start: 3, duration: 2, filter: { preset: 'grayscale' }, effects: [{ type: 'vignette', amount: 80 }] }] },
    { id: 'v2', kind: 'video', clips: [{ id: 'p1', mediaId: 'c', start: 0, in: 0, out: 6, speed: 1, transform: { scale: 0.3, x: 0, y: 0, rotation: 0 },
      kf: { x: [{ t: 0, v: -0.3 }, { t: 5, v: 0.3 }], scale: [{ t: 0, v: 0.2 }, { t: 5, v: 0.6 }], rotation: [{ t: 0, v: 0 }, { t: 5, v: 180 }], opacity: [{ t: 0, v: 0.2 }, { t: 3, v: 1 }] } }] },
    { id: 'v1', kind: 'video', clips: [{ id: 'c1', mediaId: 'a', start: 0, in: 0, out: 6, speed: 1, reverse: true, kf: { volume: [{ t: 0, v: 0 }, { t: 3, v: 1 }] } }] },
  ],
};
const out = path.join(__dirname, 'out2.mp4');
const { args } = buildExportArgs(project, { outPath: out, preset: 'ultrafast', outWidth: 640, outHeight: 360, range: { from: 1, to: 5 } });
execFileSync(path.join(__dirname, '..', 'node_modules', 'ffmpeg-static', 'ffmpeg'), args, { stdio: ['ignore', 'ignore', 'inherit'] });
console.log(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=width,height', '-of', 'compact', out]).toString());
const fr = [];
for (const t of [0.2, 1.5, 2.5, 3.8]) { const f = path.join(__dirname, `k_${t}.png`); execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(t), '-i', out, '-frames:v', '1', f]); fr.push(f); }
execFileSync('ffmpeg', ['-v', 'error', '-y', ...fr.flatMap(f => ['-i', f]), '-filter_complex', 'hstack=4', path.join(__dirname, 'k.png')]);
console.log('OK');
