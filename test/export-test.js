const { execFileSync } = require('child_process');
const path = require('path');
const { buildExportArgs } = require('../src/export');
const F = p => path.join(__dirname, 'fixtures', p);
const project = {
  width: 1920, height: 1080, fps: 30,
  media: [
    { id: 'a', path: F('a.mp4'), kind: 'video', width: 1280, height: 720, hasAudio: true, duration: 6 },
    { id: 'b', path: F('b_noaudio.mp4'), kind: 'video', width: 720, height: 1280, hasAudio: false, duration: 5 },
    { id: 'c', path: F('c.png'), kind: 'image', width: 800, height: 600, hasAudio: false },
    { id: 'm', path: F('m.mp3'), kind: 'audio', hasAudio: true, duration: 8 },
  ],
  tracks: [
    { id: 't1', kind: 'text', clips: [{ id: 'x1', type: 'text', start: 1, duration: 3, fadeIn: 0.2, fadeOut: 0.5, animIn: 'up', animDur: 0.5 }] },
    { id: 'v2', kind: 'video', clips: [{ id: 'p1', effects: [{ type: 'pixelate', amount: 40 }, { type: 'invert' }], mediaId: 'c', start: 2, in: 0, out: 2, speed: 1, transform: { scale: 0.4, x: 0.3, y: -0.2, rotation: 15 }, fadeIn: 0.5, opacity: 0.8 }] },
    { id: 'v1', kind: 'video', clips: [
      { id: 'c1', mediaId: 'a', start: 0, in: 1, out: 4, speed: 1.5, volume: 0.8, fadeIn: 0.5, filter: { preset: 'sepia', brightness: 10 }, effects: [{ type: 'zoomIn', amount: 80 }, { type: 'vignette', amount: 60 }, { type: 'shake', amount: 30 }] },
      { id: 'c2', mediaId: 'b', start: 2, in: 0, out: 2, speed: 0.5, fadeOut: 1, filter: { preset: 'grayscale', blur: 2, contrast: 20 }, transitionIn: { type: 'slideLeft', duration: 1 }, effects: [{ type: 'rgbSplit', amount: 70 }, { type: 'grain', amount: 50 }, { type: 'mirror' }, { type: 'flash', amount: 40 }], chroma: { on: true, color: '#00ff00', similarity: 30 } },
    ] },
    { id: 'au', kind: 'audio', clips: [{ id: 'm1', mediaId: 'm', start: 0.5, in: 0, out: 5, speed: 1, volume: 0.5, fadeIn: 1, fadeOut: 1 }] },
  ],
};
const out = path.join(__dirname, 'out.mp4');
const { args, duration } = buildExportArgs(project, { outPath: out, textImages: { x1: { cx: 960, cy: 950, steps: [{ png: F('textbox.png'), from: 0, to: 1.5 }, { png: F('textbox.png'), from: 1.5, to: 3 }] } }, preset: 'ultrafast' });
console.log('duration', duration);
execFileSync('ffmpeg', args, { stdio: ['ignore', 'ignore', 'inherit'] });
const probe = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height', '-of', 'compact', out]).toString();
console.log(probe);
for (const t of [0.2, 1.0, 2.5, 4.0, 5.5]) execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(t), '-i', out, '-frames:v', '1', '-vf', 'scale=480:-2', path.join(__dirname, `frame_${t}.png`)]);
console.log('OK');
