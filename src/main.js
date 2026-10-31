'use strict';
const { app, BrowserWindow, ipcMain, dialog, Menu, shell, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execFile } = require('child_process');
const { buildExportArgs, voicePreviewArgs } = require('./export');
const { cloudRoots, resolveProjectPaths, packProject } = require('./projectfiles');

function binPath(p) { return p.replace('app.asar', 'app.asar.unpacked'); }
const FFMPEG = global.HANEUL ? global.HANEUL.ffmpeg : binPath(require('ffmpeg-static'));
const updater = require('./updater');

let win;
let exportProc = null;
const TMP = path.join(os.tmpdir(), 'haneul-studio');
fs.mkdirSync(TMP, { recursive: true });

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1100, minHeight: 700,
    backgroundColor: '#15161a', title: '하늘 스튜디오',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('close', e => {
    if (win.__forceClose) return;
    e.preventDefault();
    win.webContents.send('app:before-close');
  });
}

app.whenReady().then(() => {
  const { session } = require('electron');
  // 내 PC 글꼴 목록 읽기 허용
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === 'local-fonts'));
  session.defaultSession.setPermissionCheckHandler((_wc, perm) => perm === 'local-fonts');
  createWindow();
});
app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => { if (exportProc) exportProc.kill('SIGKILL'); });

ipcMain.handle('app:close', () => { win.__forceClose = true; win.close(); });
ipcMain.handle('app:devtools', () => win.webContents.toggleDevTools());

const MEDIA_EXT = { video: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v', 'wmv'], image: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'], audio: ['mp3', 'wav', 'aac', 'm4a', 'ogg', 'flac', 'wma'] };
function kindOf(p) {
  const ext = path.extname(p).slice(1).toLowerCase();
  for (const k of Object.keys(MEDIA_EXT)) if (MEDIA_EXT[k].includes(ext)) return k;
  return null;
}

ipcMain.handle('media:open-dialog', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: '미디어 가져오기', properties: ['openFile', 'multiSelections'],
    filters: [{ name: '미디어', extensions: [...MEDIA_EXT.video, ...MEDIA_EXT.image, ...MEDIA_EXT.audio] }],
  });
  return r.canceled ? [] : r.filePaths;
});

function run(bin, args) {
  return new Promise((resolve, reject) => execFile(bin, args, { maxBuffer: 1 << 24, windowsHide: true }, (err, stdout, stderr) => err ? reject(new Error(stderr || err.message)) : resolve(stdout)));
}

// ffmpeg -i 출력에서 정보 읽기 (ffprobe 없이)
function probeWithFfmpeg(p) {
  return new Promise(resolve => {
    execFile(FFMPEG, ['-hide_banner', '-i', p], { windowsHide: true, maxBuffer: 1 << 22 }, (_err, _o, stderr) => {
      const txt = String(stderr || '');
      const d = txt.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      const duration = d ? (+d[1]) * 3600 + (+d[2]) * 60 + parseFloat(d[3]) : 0;
      const vline = txt.split('\n').find(l => /Stream #.*Video:/.test(l) && !/attached pic/.test(l));
      const sz = vline && vline.match(/,\s*(\d{2,5})x(\d{2,5})/);
      const rot = txt.match(/rotation of (-?[\d.]+) degrees/) || txt.match(/rotate\s*:\s*(-?\d+)/);
      resolve({
        duration, hasVideo: !!sz, width: sz ? +sz[1] : 0, height: sz ? +sz[2] : 0,
        hasAudio: /Stream #.*Audio:/.test(txt), rotation: rot ? Math.round(parseFloat(rot[1])) : 0,
      });
    });
  });
}

ipcMain.handle('media:probe', async (_e, p) => {
  const kind = kindOf(p);
  if (!kind) throw new Error('지원하지 않는 형식입니다: ' + path.basename(p));
  const { duration, width: w0, height: h0, hasVideo, hasAudio: aud, rotation } = await probeWithFfmpeg(p);
  let width = hasVideo ? w0 : 0, height = hasVideo ? h0 : 0;
  if (rotation && Math.abs(rotation) % 180 === 90) [width, height] = [height, width];
  const a = aud;
  const info = {
    path: p, name: path.basename(p), kind,
    duration: kind === 'image' ? 5 : duration,
    width, height, hasAudio: !!a && kind !== 'image',
    thumb: null,
  };
  if (kind === 'video') {
    const thumb = path.join(TMP, `thumb_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`);
    try {
      await run(FFMPEG, ['-v', 'error', '-y', '-ss', String(Math.min(1, info.duration / 2)), '-i', p, '-frames:v', '1', '-vf', 'scale=240:-2', thumb]);
      info.thumb = thumb;
    } catch (_) { /* 썸네일 실패는 무시 */ }
  } else if (kind === 'image') info.thumb = p;
  return info;
});

ipcMain.handle('media:waveform', async (_e, p) => {
  // 오디오 파형: 초당 50개 샘플의 최대 진폭
  return new Promise(resolve => {
    const proc = spawn(FFMPEG, ['-v', 'error', '-i', p, '-ac', '1', '-ar', '2000', '-f', 's16le', '-'], { windowsHide: true });
    const peaks = []; let cur = 0, n = 0; let leftover = null;
    proc.stdout.on('data', buf => {
      if (leftover) { buf = Buffer.concat([leftover, buf]); leftover = null; }
      const len = buf.length - (buf.length % 2);
      if (len < buf.length) leftover = buf.subarray(len);
      for (let i = 0; i < len; i += 2) {
        const s = Math.abs(buf.readInt16LE(i)) / 32768;
        if (s > cur) cur = s;
        if (++n === 40) { peaks.push(Math.round(cur * 100) / 100); cur = 0; n = 0; }
      }
    });
    proc.on('close', () => resolve(peaks));
    proc.on('error', () => resolve([]));
  });
});

// 필름스트립: 일정 간격으로 작은 프레임 이미지를 뽑아 캐시에 저장
const crypto = require('crypto');
function cacheDir() { const d = path.join(app.getPath('userData'), 'cache'); fs.mkdirSync(d, { recursive: true }); return d; }
ipcMain.handle('media:filmstrip', async (_e, p, duration) => {
  let st; try { st = fs.statSync(p); } catch { return null; }
  const key = crypto.createHash('md5').update(p + '|' + st.size + '|' + st.mtimeMs).digest('hex');
  const dir = path.join(cacheDir(), 'fs_' + key);
  const count = Math.max(1, Math.min(240, Math.ceil(duration)));
  const interval = Math.max(0.25, duration / count);
  const done = path.join(dir, 'done.json');
  if (fs.existsSync(done)) return JSON.parse(fs.readFileSync(done, 'utf8'));
  fs.mkdirSync(dir, { recursive: true });
  try {
    await run(FFMPEG, ['-v', 'error', '-y', ...(duration > 900 ? ['-skip_frame', 'nokey'] : []), '-i', p, '-vf', `fps=1/${interval.toFixed(4)},scale=-2:64`, '-vsync', 'vfr', '-q:v', '6', path.join(dir, 'f%04d.jpg')]);
  } catch (_) { /* 키프레임만으로 실패하면 아래에서 재시도 */ }
  let files = fs.readdirSync(dir).filter(f => f.endsWith('.jpg')).sort();
  if (files.length < Math.min(count, 3)) {
    await run(FFMPEG, ['-v', 'error', '-y', '-i', p, '-vf', `fps=1/${interval.toFixed(4)},scale=-2:64`, '-q:v', '6', path.join(dir, 'f%04d.jpg')]).catch(() => {});
    files = fs.readdirSync(dir).filter(f => f.endsWith('.jpg')).sort();
  }
  const info = { dir, interval, frames: files.map(f => path.join(dir, f)) };
  fs.writeFileSync(done, JSON.stringify(info));
  return info;
});

// 장면 전환 지점 찾기 (작게 줄여서 빠르게 분석)
ipcMain.handle('media:scenes', async (_e, p, from, to) => {
  const args = ['-hide_banner', '-nostats', '-ss', String(Math.max(0, from || 0))];
  if (to) args.push('-t', String(Math.max(0.1, to - (from || 0))));
  args.push('-i', p, '-an', '-sn', '-vf', "scale=160:-2,select='gt(scene,0.32)',showinfo", '-f', 'null', '-');
  const txt = await new Promise(res => execFile(FFMPEG, args, { windowsHide: true, maxBuffer: 1 << 26 }, (_e2, _o, se) => res(String(se || ''))));
  const out = [];
  for (const m of txt.matchAll(/pts_time:([\d.]+)/g)) { const t = (from || 0) + parseFloat(m[1]); if (!out.length || t - out[out.length - 1] > 0.5) out.push(+t.toFixed(3)); }
  return out;
});


/* ---------- 클라우드 폴더 (OneDrive·구글 드라이브) 저장 ---------- */
ipcMain.handle('cloud:roots', () => cloudRoots());
ipcMain.handle('cloud:pick-folder', async () => {
  const r = await dialog.showOpenDialog(win, { title: '저장할 폴더 고르기 (동기화되는 폴더)', properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('cloud:open', async (_e, root) => {
  const def = root && fs.existsSync(path.join(root, '하늘 스튜디오')) ? path.join(root, '하늘 스튜디오') : root;
  const r = await dialog.showOpenDialog(win, { title: '클라우드에서 프로젝트 열기', defaultPath: def || undefined, properties: ['openFile'], filters: [{ name: '하늘 스튜디오 프로젝트', extensions: ['hsproj'] }] });
  if (r.canceled) return null;
  return { filePath: r.filePaths[0], data: resolveProjectPaths(JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8')), r.filePaths[0]) };
});
ipcMain.handle('cloud:save', async (_e, { data, filePath }) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  data.cloud = true;
  await packProject(data, filePath, true, v => win && win.webContents.send('cloud:progress', v));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 1), 'utf8');
  return { filePath, data };
});

/* ---------- GitHub에 프로젝트 올리기 / 받기 ---------- */
const { GitHubStore, saveToGitHub, openFromGitHub } = require('./github');
const ghFile = () => path.join(app.getPath('userData'), 'github.json');
function ghConfig() {
  try {
    const j = JSON.parse(fs.readFileSync(ghFile(), 'utf8'));
    const token = j.enc && safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(Buffer.from(j.enc, 'base64')) : j.token;
    return { owner: j.owner, repo: j.repo, token };
  } catch (_) { return null; }
}
ipcMain.handle('github:config', () => { const c = ghConfig(); return c ? { repo: `${c.owner}/${c.repo}`, hasToken: !!c.token } : null; });
ipcMain.handle('github:connect', async (_e, { repo, token }) => {
  const m = String(repo || '').trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').match(/^([\w.-]+)\/([\w.-]+)$/);
  if (!m) throw new Error('저장소는 "아이디/저장소이름" 모양으로 넣어 주세요. 예: cheonho1128/haneul-projects');
  const tok = String(token || '').trim() || (ghConfig() || {}).token;
  if (!tok) throw new Error('토큰을 넣어 주세요.');
  const store = new GitHubStore({ owner: m[1], repo: m[2], token: tok });
  const info = await store.check();
  await store.ensureRelease();
  const save = { owner: m[1], repo: m[2] };
  if (safeStorage.isEncryptionAvailable()) save.enc = safeStorage.encryptString(tok).toString('base64'); else save.token = tok;
  fs.writeFileSync(ghFile(), JSON.stringify(save));
  return { repo: info.fullName };
});
ipcMain.handle('github:disconnect', () => { try { fs.unlinkSync(ghFile()); } catch (_) {} return true; });
const ghStore = () => { const c = ghConfig(); if (!c || !c.token) throw new Error('먼저 GitHub를 연결해 주세요.'); return new GitHubStore(c); };
const ghProgress = v => win && win.webContents.send('github:progress', v);
ipcMain.handle('github:list', async () => ghStore().listProjects());
ipcMain.handle('github:save', async (_e, { name, data }) => saveToGitHub(ghStore(), name, data, ghProgress));
ipcMain.handle('github:open', async (_e, name) => openFromGitHub(ghStore(), name, path.join(app.getPath('userData'), 'github-media'), ghProgress));
ipcMain.handle('shell:open-url', (_e, url) => { if (/^https:\/\/github\.com\//.test(url)) shell.openExternal(url); });

// 음성 효과 미리 듣기
ipcMain.handle('audio:voice-preview', async (_e, clip, p) => {
  const out = path.join(cacheDir(), `voice_${Date.now()}.wav`);
  await run(FFMPEG, voicePreviewArgs(clip, p, out));
  return out;
});

// 정지 화면용 프레임 추출
ipcMain.handle('media:frame', async (_e, p, t) => {
  const out = path.join(cacheDir(), `freeze_${Date.now()}.png`);
  await run(FFMPEG, ['-v', 'error', '-y', '-ss', String(Math.max(0, t)), '-i', p, '-frames:v', '1', out]);
  return out;
});

ipcMain.handle('project:save', async (_e, { data, filePath, saveAs }) => {
  const wasCloud = !!data.cloud;
  let p = filePath;
  if (!p || saveAs) {
    const r = await dialog.showSaveDialog(win, { title: '프로젝트 저장', defaultPath: '내 프로젝트.hsproj', filters: [{ name: '하늘 스튜디오 프로젝트', extensions: ['hsproj'] }] });
    if (r.canceled) return null;
    p = r.filePath;
  }
  await packProject(data, p, wasCloud);
  fs.writeFileSync(p, JSON.stringify(data, null, 1), 'utf8');
  return { filePath: p, data };
});

ipcMain.handle('project:open', async () => {
  const r = await dialog.showOpenDialog(win, { title: '프로젝트 열기', properties: ['openFile'], filters: [{ name: '하늘 스튜디오 프로젝트', extensions: ['hsproj'] }] });
  if (r.canceled) return null;
  return { filePath: r.filePaths[0], data: resolveProjectPaths(JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8')), r.filePaths[0]) };
});

ipcMain.handle('lut:open', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'LUT 불러오기', properties: ['openFile'], filters: [{ name: 'LUT', extensions: ['cube'] }] });
  if (r.canceled) return null;
  return { path: r.filePaths[0], name: path.basename(r.filePaths[0]), text: fs.readFileSync(r.filePaths[0], 'utf8') };
});
ipcMain.handle('file:read-text', (_e, p) => fs.readFileSync(p, 'utf8'));
ipcMain.handle('file:exists', (_e, p) => fs.existsSync(p));

ipcMain.handle('srt:open', async () => {
  const r = await dialog.showOpenDialog(win, { title: '자막 파일 가져오기', properties: ['openFile'], filters: [{ name: '자막', extensions: ['srt'] }] });
  if (r.canceled) return null;
  return fs.readFileSync(r.filePaths[0], 'utf8');
});

ipcMain.handle('srt:save', async (_e, text) => {
  const r = await dialog.showSaveDialog(win, { title: '자막 내보내기', defaultPath: '자막.srt', filters: [{ name: '자막', extensions: ['srt'] }] });
  if (r.canceled) return null;
  fs.writeFileSync(r.filePath, '﻿' + text, 'utf8');
  return r.filePath;
});

const EXPORT_TYPES = { mp4: ['MP4 동영상', '내 영상'], gif: ['GIF 움짤', '내 움짤'], mp3: ['MP3 소리', '내 소리'], png: ['PNG 사진', '내 화면'] };
ipcMain.handle('export:choose', async (_e, fmt = 'mp4') => {
  const [nm, base] = EXPORT_TYPES[fmt] || EXPORT_TYPES.mp4;
  const r = await dialog.showSaveDialog(win, { title: '내보내기', defaultPath: `${base}.${fmt}`, filters: [{ name: nm, extensions: [fmt] }] });
  return r.canceled ? null : r.filePath;
});

ipcMain.handle('export:start', async (_e, { project, textPngs, outPath, crf, preset, outWidth, outHeight, outFps, range, format, loudnorm }) => {
  const dir = fs.mkdtempSync(path.join(TMP, 'export_'));
  const textImages = {};
  let n = 0;
  for (const [id, info] of Object.entries(textPngs || {})) {
    textImages[id] = {
      cx: info.cx, cy: info.cy,
      steps: info.steps.map(st => {
        const f = path.join(dir, `t${n++}.png`);
        fs.writeFileSync(f, Buffer.from(st.png.split(',')[1], 'base64'));
        return { png: f, from: st.from, to: st.to };
      }),
    };
  }
  const { args, duration } = buildExportArgs(project, { outPath, textImages, crf, preset, outWidth, outHeight, outFps, range, format, loudnorm });
  return new Promise(resolve => {
    exportProc = spawn(FFMPEG, args, { windowsHide: true });
    let errTail = '';
    exportProc.stdout.on('data', d => {
      const m = /out_time_(?:us|ms)=(\d+)/g; let x, last = null;
      const s = d.toString();
      while ((x = m.exec(s))) last = Number(x[1]);
      if (last !== null) win.webContents.send('export:progress', Math.min(1, last / 1e6 / duration));
    });
    exportProc.stderr.on('data', d => { errTail = (errTail + d.toString()).slice(-4000); });
    exportProc.on('close', code => {
      const cancelled = exportProc && exportProc.__cancelled;
      exportProc = null;
      fs.rmSync(dir, { recursive: true, force: true });
      if (code === 0) resolve({ ok: true, outPath });
      else resolve({ ok: false, cancelled, error: errTail });
    });
  });
});

ipcMain.handle('export:cancel', () => { if (exportProc) { exportProc.__cancelled = true; exportProc.kill(); } });
// 무료 글꼴 받기 (캐시)
ipcMain.handle('font:get', async (_e, url) => {
  if (!/^https:\/\/raw\.githubusercontent\.com\/google\/fonts\//.test(url)) throw new Error('허용되지 않은 주소');
  const dir = path.join(app.getPath('userData'), 'fonts'); fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, decodeURIComponent(url.split('/').slice(-2).join('_')).replace(/[^\w.\-\[\],]/g, '_'));
  if (fs.existsSync(f) && fs.statSync(f).size > 1000) return f;
  const { net } = require('electron');
  const r = await net.fetch(url);
  if (!r.ok) throw new Error('글꼴을 받지 못했어요 (' + r.status + ')');
  fs.writeFileSync(f + '.part', Buffer.from(await r.arrayBuffer()));
  fs.renameSync(f + '.part', f);
  return f;
});

ipcMain.handle('app:version', () => ({ version: global.HANEUL ? global.HANEUL.version : app.getVersion(), shell: global.HANEUL ? global.HANEUL.shellVersion : app.getVersion() }));
let lastUpdateInfo = null;
ipcMain.handle('update:check', async () => { lastUpdateInfo = await updater.check(); return lastUpdateInfo; });
ipcMain.handle('update:install', async () => {
  if (!lastUpdateInfo) lastUpdateInfo = await updater.check();
  return updater.install(lastUpdateInfo, v => win && win.webContents.send('update:progress', v));
});
ipcMain.handle('update:restart', () => { win.__forceClose = true; updater.restart(); });
ipcMain.handle('update:open', (_e, url) => updater.openPage(url));
ipcMain.handle('shell:show', (_e, p) => shell.showItemInFolder(p));
