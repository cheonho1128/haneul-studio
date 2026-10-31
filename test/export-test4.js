const { execFileSync } = require('child_process');
const path = require('path');
const { buildExportArgs, voicePreviewArgs } = require('../src/export');
const F = p => path.join(__dirname, 'fixtures', p);
const FF = path.join(__dirname, '..', 'node_modules', 'ffmpeg-static', 'ffmpeg');
const project = { width: 640, height: 360, fps: 25,
  media: [{ id: 'a', path: F('a.mp4'), kind: 'video', width: 1280, height: 720, hasAudio: true, duration: 6 }, { id: 'm', path: F('m.mp3'), kind: 'audio', hasAudio: true, duration: 8 }],
  tracks: [{ id: 'v', kind: 'video', clips: [{ id: 'c1', mediaId: 'a', start: 0, in: 0, out: 4, speed: 1, voice: 'chipmunk', denoise: true }] },
           { id: 'au', kind: 'audio', clips: [{ id: 'c2', mediaId: 'm', start: 0, in: 0, out: 4, speed: 1, voice: 'robot' }] }] };
for (const [fmt, ext, extra] of [['mp4', 'mp4', { loudnorm: true }], ['mp3', 'mp3', {}], ['gif', 'gif', {}], ['png', 'png', { range: { from: 2, to: 2.04 } }]]) {
  const out = path.join(__dirname, `fmt.${ext}`);
  const { args } = buildExportArgs(project, { outPath: out, preset: 'ultrafast', format: fmt, ...extra });
  try { execFileSync(FF, args, { stdio: ['ignore', 'ignore', 'pipe'] }); console.log(fmt, 'ok', require('fs').statSync(out).size); }
  catch (e) { console.log(fmt, 'FAIL', String(e.stderr).split('\n').filter(l => /rror|nvalid/.test(l)).slice(0, 3).join(' | ')); }
}
for (const v of ['echo', 'cave', 'phone', 'radio', 'chipmunk', 'deep', 'robot']) {
  const out = path.join(__dirname, `voice_${v}.wav`);
  try { execFileSync(FF, voicePreviewArgs({ in: 0, out: 3, voice: v }, F('m.mp3'), out)); console.log(v, 'ok'); } catch (e) { console.log(v, 'FAIL', String(e.stderr).slice(-300)); }
}
