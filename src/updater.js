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

async function check() {
  const rel = await getJson(process.env.HANEUL_UPDATE_API || `https://api.github.com/repos/${REPO}/releases/latest`);
  const current = H().version;
  if (!rel) return { current, latest: null, available: false };
  const latest = String(rel.tag_name || '').replace(/^v/, '');
  const bundle = (rel.assets || []).find(a => a.name === 'update.json');
  const full = (rel.assets || []).find(a => /win.*\.zip$/i.test(a.name));
  const available = !!latest && H().compareVersions(latest, current) > 0;
  return {
    current, latest, available,
    notes: rel.body || '', page: rel.html_url,
    bundleUrl: bundle ? bundle.browser_download_url : null,
    fullUrl: full ? full.browser_download_url : null,
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
