'use strict';
// 앱 안 업데이트: GitHub 릴리스에서 update.json(코드 묶음)을 받아 설치한다.
const { app, net, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const REPO = 'cheonho1128/haneul-studio';
const H = () => global.HANEUL || { version: '0.0.0', shellVersion: '0.0.0', compareVersions: () => 0, updatesDir: path.join(app.getPath('userData'), 'updates') };

async function getJson(url) {
  const r = await net.fetch(url, { headers: { 'User-Agent': 'HaneulStudio', Accept: 'application/vnd.github+json' } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`서버 응답 오류 (${r.status})`);
  return r.json();
}

const RAW = `https://raw.githubusercontent.com/${REPO}/main/updates/`;

async function check() {
  // 저장소의 updates/latest.json 에 최신 버전 정보가 있다
  const rel = await getJson(process.env.HANEUL_UPDATE_API || RAW + 'latest.json?t=' + Date.now());
  const current = H().version;
  if (!rel) return { current, latest: null, available: false };
  const latest = String(rel.version || '').replace(/^v/, '');
  const available = !!latest && H().compareVersions(latest, current) > 0;
  return {
    current, latest, available,
    notes: rel.notes || '', page: rel.page || `https://github.com/${REPO}`,
    bundleUrl: rel.bundle ? (/^https?:/.test(rel.bundle) ? rel.bundle : RAW + rel.bundle) : null,
    fullUrl: rel.fullUrl || null,
  };
}

async function install(info, onProgress) {
  if (!info.bundleUrl) throw new Error('업데이트 파일이 없어요');
  onProgress && onProgress(0.1);
  const r = await net.fetch(info.bundleUrl, { headers: { 'User-Agent': 'HaneulStudio' } });
  if (!r.ok) throw new Error(`다운로드 실패 (${r.status})`);
  const bundle = await r.json();
  onProgress && onProgress(0.7);
  if (bundle.minShell && H().compareVersions(bundle.minShell, H().shellVersion) > 0) {
    return { needFull: true, page: info.page, fullUrl: info.fullUrl };
  }
  const dir = path.join(H().updatesDir, bundle.version);
  const tmp = dir + '.tmp';
  fs.rmSync(tmp, { recursive: true, force: true });
  for (const [rel, b64] of Object.entries(bundle.files)) {
    const safe = path.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, '');
    const f = path.join(tmp, safe);
    if (!f.startsWith(tmp)) continue;
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, Buffer.from(b64, 'base64'));
  }
  if (!fs.existsSync(path.join(tmp, 'main.js'))) throw new Error('업데이트 파일이 올바르지 않아요');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.renameSync(tmp, dir);
  fs.writeFileSync(path.join(H().updatesDir, 'current.json'), JSON.stringify({ version: bundle.version, installedAt: new Date().toISOString() }));
  // 오래된 업데이트 폴더 정리
  for (const d of fs.readdirSync(H().updatesDir)) {
    if (d !== bundle.version && d !== 'current.json' && d !== H().version) fs.rmSync(path.join(H().updatesDir, d), { recursive: true, force: true });
  }
  onProgress && onProgress(1);
  return { installed: bundle.version };
}

function restart() { app.relaunch(); app.exit(0); }
function openPage(url) { shell.openExternal(url || `https://github.com/${REPO}/releases/latest`); }

module.exports = { check, install, restart, openPage, REPO };
