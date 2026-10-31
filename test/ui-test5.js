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
    await s.importPaths([fx.s, fx.a]);
    document.querySelectorAll('.media-item')[0].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  }, { s: F('scenes.mp4'), a: F('a.mp4') });
  await win.waitForTimeout(1500);
  // 장면 자동 분할 (우클릭 메뉴)
  await win.click('.clip.video', { button: 'right' });
  await win.waitForTimeout(300);
  await win.click('#ctxMenu >> text=장면 바뀌는 곳마다 자동 분할');
  await win.waitForTimeout(3000);
  console.log('clips after scene split', await win.evaluate(() => window.__studio.project.tracks.flatMap(t => t.clips.map(c => `${c.start.toFixed(2)}-${(c.in).toFixed(2)}..${c.out.toFixed(2)}`))));
  // 마커, I/O
  await win.evaluate(() => window.__studio.seek(1));
  await win.mouse.click(600, 200); // 포커스
  await win.keyboard.press('KeyM');
  await win.keyboard.press('KeyI');
  await win.evaluate(() => window.__studio.seek(4.5));
  await win.keyboard.press('KeyM');
  await win.keyboard.press('KeyO');
  console.log('markers', await win.evaluate(() => JSON.stringify([window.__studio.project.markers.map(m => m.t), window.__studio.project.inPoint, window.__studio.project.outPoint])));
  // 조정 레이어
  await win.evaluate(() => window.__studio.seek(0.5));
  await win.click('.tabs button[data-tab="effects"]').catch(() => {});
  await win.click('#btnAdjust');
  await win.waitForTimeout(300);
  await win.evaluate(() => { const s = window.__studio; const c = s.project.tracks.flatMap(t => t.clips).find(c => c.type === 'adjust'); c.filter.preset = 'grayscale'; c.duration = 2; s.seek(1); });
  // 키프레임: 장면 클립 하나에 scale 키프레임
  await win.evaluate(() => { const s = window.__studio; const c = s.project.tracks.flatMap(t => t.clips).find(c => c.type !== 'adjust' && c.start > 1.5); c.kf = { scale: [{ t: 0, v: 1 }, { t: 1.5, v: 0.5 }], rotation: [{ t: 0, v: 0 }, { t: 1.5, v: 30 }] }; s.selectClip(c.id); s.seek(c.start + 1); });
  await win.waitForTimeout(500);
  // 트랙 잠금
  const lockBtn = await win.$('[data-a="lock"]');
  await lockBtn.click();
  await win.waitForTimeout(300);
  await win.screenshot({ path: path.join(__dirname, 'ui8.png') });
  await win.keyboard.press('Delete');
  console.log('clips after delete on locked', await win.evaluate(() => window.__studio.project.tracks.flatMap(t => t.clips).length));
  // 내보내기 대화상자
  await win.click('#btnExport');
  await win.selectOption('#expSize', '1080x1920');
  await win.waitForTimeout(200);
  console.log('expInfo', await win.textContent('#expInfo'));
  await win.screenshot({ path: path.join(__dirname, 'ui9.png') });
  await win.click('#expCancel');
  const r = await win.evaluate(async (out) => { const s = window.__studio; return window.api.startExport({ project: s.project, textPngs: s.renderTextPngs(), outPath: out, crf: 28, preset: 'ultrafast', outWidth: 540, outHeight: 960, outFps: 30, range: { from: s.project.inPoint, to: s.project.outPoint } }); }, path.join(__dirname, 'ui-out5.mp4'));
  console.log('export', r.ok, r.error ? r.error.slice(-800) : '');
  console.log('errors', errors);
  app.process().kill('SIGKILL'); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
