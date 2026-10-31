const { _electron: electron } = require('playwright');
const path = require('path'), fs = require('fs'), os = require('os');
const F = p => path.join(__dirname, 'fixtures', p);
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-'));
  const app = await electron.launch({ executablePath: require(path.join(__dirname, '..', 'node_modules', 'electron')), args: ['.', '--no-sandbox'], cwd: path.join(__dirname, '..') });
  const win = await app.firstWindow();
  const errors = []; win.on('pageerror', e => errors.push(String(e)));
  await win.waitForTimeout(1000);
  await win.evaluate(async (fx) => { await window.__studio.importPaths([fx.a, fx.m]); }, { a: F('a.mp4'), m: F('m.mp3') });
  await win.waitForTimeout(500);
  await win.click('#btnCloud');
  await win.waitForTimeout(400);
  await win.screenshot({ path: path.join(__dirname, 'ui14.png') });
  const r = await win.evaluate(async (dir) => { const s = window.__studio; return window.api.cloudSave({ data: s.project, filePath: dir + '/내 프로젝트/내 프로젝트.hsproj' }); }, tmp);
  console.log('saved', r.filePath, r.data.media.map(m => m.rel + ' -> ' + m.path));
  // 다른 PC 흉내: 폴더를 옮기고 경로를 엉뚱하게 바꿔서 다시 풀기
  const moved = path.join(tmp, 'other-pc'); fs.mkdirSync(moved);
  fs.renameSync(path.join(tmp, '내 프로젝트'), path.join(moved, '내 프로젝트'));
  const pf = path.join(moved, '내 프로젝트', '내 프로젝트.hsproj');
  const d = JSON.parse(fs.readFileSync(pf, 'utf8')); d.media.forEach(m => m.path = 'C:\\Users\\nobody\\' + path.basename(m.path)); fs.writeFileSync(pf, JSON.stringify(d));
  console.log('files', fs.readdirSync(path.join(moved, '내 프로젝트', '미디어')));
  console.log('errors', errors);
  app.process().kill('SIGKILL');
  // resolveProjectPaths 확인은 main 내부라 직접 require 불가 → 같은 로직 확인용으로 project:open 대신 cloud:open 우회 불가, 경로 규칙만 출력
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
