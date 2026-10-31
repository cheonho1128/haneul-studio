'use strict';
// 시작 파일: 앱 안 업데이트로 받은 새 코드가 있으면 그걸 실행하고, 없거나 문제가 있으면 기본 코드를 실행한다.
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const SHELL_VERSION = require('../package.json').version;
function binPath(p) { return p.replace('app.asar', 'app.asar.unpacked'); }
function cmp(a, b) {
  const pa = String(a).replace(/^v/, '').split('.').map(Number), pb = String(b).replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d; }
  return 0;
}

global.HANEUL = {
  shellVersion: SHELL_VERSION,
  version: SHELL_VERSION,
  ffmpeg: binPath(require('ffmpeg-static')),
  updatesDir: path.join(app.getPath('userData'), 'updates'),
  compareVersions: cmp,
};

let loaded = false;
try {
  const cur = JSON.parse(fs.readFileSync(path.join(global.HANEUL.updatesDir, 'current.json'), 'utf8'));
  const entry = path.join(global.HANEUL.updatesDir, cur.version, 'main.js');
  if (cmp(cur.version, SHELL_VERSION) > 0 && fs.existsSync(entry)) {
    global.HANEUL.version = cur.version;
    require(entry);
    loaded = true;
  }
} catch (e) {
  if (e && e.code !== 'ENOENT') {
    console.error('업데이트 코드 실행 실패, 기본 코드로 실행합니다:', e);
    try { fs.unlinkSync(path.join(global.HANEUL.updatesDir, 'current.json')); } catch (_) { /* 무시 */ }
  }
}
if (!loaded) { global.HANEUL.version = SHELL_VERSION; require('./main.js'); }
