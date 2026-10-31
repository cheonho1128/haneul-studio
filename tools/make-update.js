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
fs.mkdirSync(path.join(root, 'dist-update'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist-update', 'update.json'), JSON.stringify(out));
console.log('update.json', pkg.version, Object.keys(files).length, 'files');
