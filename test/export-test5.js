const { execFileSync } = require('child_process');
const path = require('path');
const { buildExportArgs } = require('../src/export');
const F = p => path.join(__dirname, 'fixtures', p);
const FF = path.join(__dirname, '..', 'node_modules', 'ffmpeg-static', 'ffmpeg');
const project = { width: 360, height: 640, fps: 25,
  media: [{ id: 'a', path: F('a.mp4'), kind: 'video', width: 1280, height: 720, hasAudio: true, duration: 6 }, { id: 'c', path: F('c.png'), kind: 'image', width: 800, height: 600 }],
  tracks: [{ id: 'v', kind: 'video', clips: [
    { id: 'c1', mediaId: 'a', start: 0, in: 0, out: 2, speed: 1, bg: { type: 'blur', amount: 60 }, crop: { l: 0.1, r: 0.2, t: 0.05, b: 0.05 } },
    { id: 'c2', mediaId: 'c', start: 2, in: 0, out: 2, speed: 1, bg: { type: 'color', color: '#3355aa' }, transitionIn: { type: 'dissolve', duration: 0.5 } }] }] };
const out = path.join(__dirname, 'bg.mp4');
const { args } = buildExportArgs(project, { outPath: out, preset: 'ultrafast' });
execFileSync(FF, args, { stdio: ['ignore', 'ignore', 'pipe'] });
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', out, '-vf', "select='eq(n,10)+eq(n,80)',tile=2x1", '-frames:v', '1', path.join(__dirname, 'bg.png')]);
console.log('ok');
