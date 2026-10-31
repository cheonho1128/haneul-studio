const { _electron: electron } = require('playwright');
const path = require('path');
const F = p => path.join(__dirname, 'fixtures', p);
(async () => {
  const app = await electron.launch({ executablePath: require(path.join(__dirname, '..', 'node_modules', 'electron')), args: ['.', '--no-sandbox'], cwd: path.join(__dirname, '..') });
  const win = await app.firstWindow();
  const errors = []; win.on('pageerror', e => errors.push(String(e)));
  await win.waitForTimeout(1000);
  await win.evaluate(async (fx) => { await window.__studio.importPaths([fx.s, fx.a]); }, { s: F('scenes.mp4'), a: F('a.mp4') });
  await win.waitForTimeout(500);
  await win.evaluate(() => document.querySelectorAll('.media-item').forEach(el => el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))));
  await win.waitForTimeout(1200);
  const shots = [];
  for (const [ty, fx] of [['clock', null], ['pushLeft', null], ['spinT', null], ['circleOpen', 'glow'], ['blindsH', 'posterize'], ['checker', 'letterbox']]) {
    await win.evaluate(([ty, fx]) => { const s = window.__studio; const c = s.project.tracks.flatMap(t => t.clips).find(c => c.start > 1); c.transitionIn = { type: ty, duration: 1 }; c.effects = fx ? [{ type: fx, amount: 60 }] : []; s.seek(c.start + 0.45); }, [ty, fx]);
    await win.waitForTimeout(600);
    const f = path.join(__dirname, `pv_${ty}.png`); await (await win.$('#preview')).screenshot({ path: f }); shots.push(f);
  }
  console.log(shots.join(' '));
  console.log('errors', errors);
  app.process().kill('SIGKILL'); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
