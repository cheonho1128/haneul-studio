// 앱 안 업데이트용 묶음(update.json) 만들기: node tools/make-update.js [minShell]
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const src = path.join(root, 'src');
const files = {};
(function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (f !== 'boot.js') files[path.relative(src, p).split(path.sep).join('/')] = fs.readFileSync(p).toString('base64');
  }
})(src);
const out = { version: pkg.version, minShell: process.argv[2] || '0.2.0', createdAt: new Date().toISOString(), files };
// 저장소의 updates/ 폴더에 올리면 앱이 자동으로 찾아간다
const dir = path.join(root, 'updates');
fs.mkdirSync(dir, { recursive: true });
const name = `update-${pkg.version}.json`;
fs.writeFileSync(path.join(dir, name), JSON.stringify(out));
const notesFile = path.join(root, 'CHANGELOG-latest.txt');
const notes = fs.existsSync(notesFile) ? fs.readFileSync(notesFile, 'utf8').trim() : '';
fs.writeFileSync(path.join(dir, 'latest.json'), JSON.stringify({ version: pkg.version, minShell: out.minShell, bundle: name, notes, date: out.createdAt }, null, 2));
// 오래된 묶음은 지운다 (최근 3개만 보관)
const old = fs.readdirSync(dir).filter(f => /^update-.*\.json$/.test(f)).sort((a, b) => fs.statSync(path.join(dir, b)).mtimeMs - fs.statSync(path.join(dir, a)).mtimeMs).slice(3);
old.forEach(f => fs.unlinkSync(path.join(dir, f)));
console.log(name, Object.keys(files).length, 'files');
