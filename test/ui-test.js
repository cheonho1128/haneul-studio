const { _electron: electron } = require('playwright');
const path = require('path');
const F = p => path.join(__dirname, 'fixtures', p);
(async () => {
  const app = await electron.launch({ executablePath: require(path.join(__dirname, '..', 'node_modules', 'electron')), args: ['.', '--no-sandbox'], cwd: path.join(__dirname, '..') });
  const win = await app.firstWindow();
  const errors = [];
  win.on('pageerror', e => errors.push(String(e)));
  win.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await win.setViewportSize?.({ width: 1440, height: 900 });
  await win.waitForTimeout(1000); console.log('early', errors, await win.evaluate(() => typeof window.api));
  await win.evaluate(async (fx) => {
    const s = window.__studio;
    const ms = await s.importPaths([fx.a, fx.b, fx.c, fx.m]);
    document.querySelectorAll('.media-item')[0].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    document.querySelectorAll('.media-item')[1].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    document.querySelectorAll('.media-item')[3].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    s.seek(1);
    s.addTextClip({ text: '안녕하세요 하늘 스튜디오', fontSize: 90, color: '#ffe14f', strokeColor: '#000000', strokeWidth: 8, bold: true, y: 0.8 });
    s.seek(2);
  }, { a: F('a.mp4'), b: F('b_noaudio.mp4'), c: F('c.png'), m: F('m.mp3') });
  await win.waitForTimeout(1500);
  // 분할 테스트
  await win.keyboard.press('s');
  await win.waitForTimeout(500);
  const info = await win.evaluate(() => window.__studio.project.tracks.map(t => `${t.name}: ${t.clips.length}`).join(', '));
  console.log('tracks:', info);
  await win.screenshot({ path: path.join(__dirname, 'ui.png') });
  // 클립 선택 후 속성 패널
  await win.click('.clip.video');
  await win.waitForTimeout(400);
  await win.screenshot({ path: path.join(__dirname, 'ui2.png') });
  const r = await win.evaluate(async (out) => {
    const s = window.__studio;
    return await window.api.startExport({ project: s.project, textPngs: s.renderTextPngs(), outPath: out, crf: 23, preset: 'ultrafast' });
  }, path.join(__dirname, 'ui-out.mp4'));
  console.log('export:', r.ok, r.error ? r.error.slice(-500) : '');
  console.log('errors:', errors);
  app.process().kill();
})().catch(e => { console.error(e); process.exit(1); });
