// 프로젝트 파일 모으기 (클라우드 폴더 저장) · 다른 PC에서 경로 다시 찾기
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');

function cloudRoots() {
  const home = os.homedir(), out = [];
  const add = (name, p) => { try { if (p && fs.existsSync(p) && fs.statSync(p).isDirectory() && !out.some(o => o.path.toLowerCase() === p.toLowerCase())) out.push({ name, path: p }); } catch (_) {} };
  add('OneDrive', process.env.OneDriveConsumer); add('OneDrive', process.env.OneDrive); add('OneDrive (회사/학교)', process.env.OneDriveCommercial);
  add('OneDrive', path.join(home, 'OneDrive'));
  if (process.platform === 'win32') for (const d of 'DEFGHIJKLMNOPQRSTUVWXYZ') for (const sub of ['My Drive', '내 드라이브']) add('구글 드라이브', `${d}:\\${sub}`);
  add('구글 드라이브', path.join(home, 'Google Drive')); add('구글 드라이브', path.join(home, 'My Drive'));
  add('Dropbox', path.join(home, 'Dropbox'));
  return out;
}
const isInside = (dir, p) => { const rel = path.relative(dir, p); return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel); };
const relOf = (dir, p) => path.relative(dir, p).split(path.sep).join('/');
/** 다른 PC에서 열었을 때 파일 위치 다시 찾기 */
function resolveProjectPaths(data, projFile) {
  const dir = path.dirname(projFile);
  const fix = (obj) => {
    if (!obj || !obj.path) return;
    const cands = [];
    if (obj.rel) cands.push(path.join(dir, ...obj.rel.split('/')));
    cands.push(obj.path);
    const base = String(obj.path).split(/[\\/]/).pop();
    cands.push(path.join(dir, '미디어', base), path.join(dir, 'LUT', base), path.join(dir, base));
    const hit = cands.find(c => { try { return fs.existsSync(c); } catch (_) { return false; } });
    if (hit) obj.path = hit;
  };
  for (const m of data.media || []) fix(m);
  for (const t of data.tracks || []) for (const c of t.clips || []) if (c.color && c.color.lut) fix(c.color.lut);
  return data;
}
async function uniqueCopy(src, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  const ext = path.extname(src), stem = path.basename(src, ext);
  const size = fs.statSync(src).size;
  for (let i = 0; ; i++) {
    const d = path.join(destDir, i ? `${stem} (${i})${ext}` : stem + ext);
    if (!fs.existsSync(d)) { await fs.promises.copyFile(src, d); return d; }
    if (fs.statSync(d).size === size) return d;          // 이미 복사된 같은 파일
  }
}
/** 프로젝트 폴더 안으로 미디어·LUT를 모으고 상대 경로를 기록 */
async function packProject(data, projFile, copyFiles, onProgress = () => {}) {
  const dir = path.dirname(projFile);
  const jobs = [];
  for (const m of data.media || []) jobs.push({ obj: m, sub: '미디어' });
  for (const t of data.tracks || []) for (const c of t.clips || []) if (c.color && c.color.lut && c.color.lut.path) jobs.push({ obj: c.color.lut, sub: 'LUT' });
  let done = 0;
  const total = jobs.filter(j => copyFiles && j.obj.path && !isInside(dir, j.obj.path) && fs.existsSync(j.obj.path)).length;
  for (const j of jobs) {
    const p = j.obj.path;
    if (!p) continue;
    if (copyFiles && !isInside(dir, p) && fs.existsSync(p)) {
      onProgress({ done, total, name: path.basename(p) });
      j.obj.path = await uniqueCopy(p, path.join(dir, j.sub));
      done++;
    }
    if (isInside(dir, j.obj.path)) j.obj.rel = relOf(dir, j.obj.path); else delete j.obj.rel;
  }
  onProgress({ done: total, total, name: '' });
  return data;
}
module.exports = { cloudRoots, resolveProjectPaths, packProject };
