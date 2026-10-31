const { _electron: electron } = require('playwright');
const path = require('path');
(async () => {
  const app = await electron.launch({ executablePath: require(path.join(__dirname, '..', 'node_modules', 'electron')), args: ['.', '--no-sandbox'], cwd: path.join(__dirname, '..') });
  const win = await app.firstWindow();
  const errors = []; win.on('pageerror', e => errors.push(String(e)));
  await win.waitForTimeout(1200);
  for (const [tab, n] of [['effects', 1], ['transitions', 2], ['filters', 3]]) {
    await win.click(`[data-tab="${tab}"]`);
    await win.waitForTimeout(tab === 'transitions' ? 1100 : 700);
    await win.screenshot({ path: path.join(__dirname, `lib${n}.png`), clip: { x: 0, y: 40, width: 280, height: 560 } });
  }
  console.log('errors', errors);
  app.process().kill('SIGKILL'); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
