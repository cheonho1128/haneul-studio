const { _electron: electron } = require('playwright');
const path = require('path');
const F = p => path.join(__dirname, 'fixtures', p);
(async () => {
  const app = await electron.launch({ executablePath: require(path.join(__dirname, '..', 'node_modules', 'electron')), args: ['.', '--no-sandbox'], cwd: path.join(__dirname, '..') });
  const win = await app.firstWindow();
  const errors = [];
  win.on('pageerror', e => errors.push(String(e)));
  win.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await win.waitForTimeout(1000);
  await win.evaluate(async (fx) => {
    const s = window.__studio;
    await s.importPaths([fx.a, fx.b, fx.c, fx.m]);
    for (const i of [0, 1, 3]) document.querySelectorAll('.media-item')[i].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    const p = s.project;
    const main = p.tracks.find(t => t.name === '메인 영상');
    const [c1, c2] = main.clips;
    c1.effects = [{ type: 'zoomIn', amount: 80 }, { type: 'vignette', amount: 70 }];
    c2.transitionIn = { type: 'slideLeft', duration: 1 };
    c2.effects = [{ type: 'rgbSplit', amount: 80 }, { type: 'grain', amount: 50 }];
    s.seek(1);
    s.addTextClip({ text: '타자기 효과 테스트', fontSize: 90, color: '#ffe14f', strokeColor: '#000000', strokeWidth: 8, bold: true, y: 0.8, animIn: 'typewriter', animDur: 1 });
    s.seek(6.4);
  }, { a: F('a.mp4'), b: F('b_noaudio.mp4'), c: F('c.png'), m: F('m.mp3') });
  await win.waitForTimeout(2500);
  // 한글 입력 상태 흉내: key는 'ㄴ', code는 KeyS
  await win.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ㄴ', code: 'KeyS', bubbles: true })));
  await win.waitForTimeout(300);
  console.log('tracks:', await win.evaluate(() => window.__studio.project.tracks.map(t => `${t.name}: ${t.clips.length}`).join(', ')));
  await win.click('.clip.video >> nth=1');
  await win.waitForTimeout(800);
  await win.screenshot({ path: path.join(__dirname, 'ui3.png') });
  await win.keyboard.press('F1');
  await win.waitForTimeout(300);
  await win.screenshot({ path: path.join(__dirname, 'ui4.png') });
  await win.keyboard.press('Escape');
  const r = await win.evaluate(async (out) => {
    const s = window.__studio;
    return await window.api.startExport({ project: s.project, textPngs: s.renderTextPngs(), outPath: out, crf: 23, preset: 'ultrafast' });
  }, path.join(__dirname, 'ui-out.mp4'));
  console.log('export:', r.ok, r.error ? r.error.slice(-800) : '');
  // 미리보기 캡처 (6.4초)
  await win.evaluate(() => window.__studio.seek(6.4));
  await win.waitForTimeout(800);
  await (await win.$('#preview')).screenshot({ path: path.join(__dirname, 'prev-6.4.png') });
  console.log('errors:', errors);
  app.process().kill('SIGKILL');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
