// GitHub 비공개 저장소에 프로젝트 올리기 / 받기
// - 프로젝트(JSON): 저장소의 projects/<이름>.hsproj
// - 영상·사진·음악·LUT: Release "haneul-media"의 첨부 파일 (파일 하나 2GB까지), 이름은 내용 해시라 같은 파일은 한 번만 올라감
'use strict';
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const API_HOST = 'api.github.com';
const TAG = 'haneul-media';
const UA = 'HaneulStudio';

function request({ method = 'GET', host = API_HOST, pathname, token, headers = {}, body, bodyStream, bodyLength, onUpload, accept }) {
  return new Promise((resolve, reject) => {
    const h = { 'User-Agent': UA, Accept: accept || 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...headers };
    if (token) h.Authorization = `Bearer ${token}`;
    let data = null;
    if (body !== undefined) { data = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)); h['Content-Type'] = h['Content-Type'] || 'application/json'; h['Content-Length'] = data.length; }
    if (bodyStream) h['Content-Length'] = bodyLength;
    const req = https.request({ method, host, path: pathname, headers: h }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        let json = null; try { json = JSON.parse(buf.toString('utf8')); } catch (_) {}
        resolve({ status: res.statusCode, headers: res.headers, json, buf });
      });
    });
    req.on('error', reject);
    if (data) req.end(data);
    else if (bodyStream) {
      let sent = 0;
      bodyStream.on('data', c => { sent += c.length; if (onUpload) onUpload(sent, bodyLength); });
      bodyStream.on('error', reject);
      bodyStream.pipe(req);
    } else req.end();
  });
}
function fail(r, what) {
  const msg = r.json && r.json.message ? r.json.message : `HTTP ${r.status}`;
  if (r.status === 401) return new Error('토큰이 맞지 않거나 만료됐어요. 토큰을 다시 넣어 주세요.');
  if (r.status === 403 || r.status === 404) return new Error(`${what}: 권한이 없거나 저장소를 찾지 못했어요 (${msg})`);
  return new Error(`${what}: ${msg}`);
}

function sha1File(p) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha1');
    fs.createReadStream(p).on('data', c => h.update(c)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });
}

class GitHubStore {
  constructor(cfg) { this.owner = cfg.owner; this.repo = cfg.repo; this.token = cfg.token; this.release = null; }
  get base() { return `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}`; }
  api(o) { return request({ token: this.token, ...o }); }

  /** 저장소 확인 (비공개·쓰기 권한) */
  async check() {
    const r = await this.api({ pathname: this.base });
    if (r.status !== 200) throw fail(r, '저장소 확인');
    if (!r.json.private) throw new Error('공개 저장소예요. 영상이 다른 사람에게 보일 수 있으니 비공개(Private) 저장소를 써 주세요.');
    if (r.json.permissions && !r.json.permissions.push) throw new Error('이 토큰으로는 저장소에 쓸 수 없어요. 토큰 권한에서 Contents를 "Read and write"로 해 주세요.');
    return { fullName: r.json.full_name, empty: r.json.size === 0 };
  }

  async ensureRelease() {
    if (this.release) return this.release;
    let r = await this.api({ pathname: `${this.base}/releases/tags/${TAG}` });
    if (r.status === 200) return (this.release = r.json);
    // 빈 저장소면 릴리스를 만들 수 없어서 안내 파일부터 하나 만든다
    const info = await this.api({ pathname: this.base });
    if (info.status === 200 && info.json.size === 0) {
      const w = await this.api({ method: 'PUT', pathname: `${this.base}/contents/README.md`, body: { message: '하늘 스튜디오 프로젝트 저장소', content: Buffer.from('# 하늘 스튜디오 프로젝트\n\n하늘 스튜디오가 자동으로 관리하는 저장소예요. 영상 파일은 Releases의 haneul-media에 있어요.\n').toString('base64') } });
      if (w.status >= 300) throw fail(w, '저장소 준비');
    }
    r = await this.api({ method: 'POST', pathname: `${this.base}/releases`, body: { tag_name: TAG, name: '하늘 스튜디오 미디어', body: '영상·사진·음악 파일 보관용 (자동 관리)', draft: false, prerelease: true } });
    if (r.status >= 300) throw fail(r, '미디어 보관함 만들기');
    return (this.release = r.json);
  }

  async listAssets() {
    const rel = await this.ensureRelease();
    const out = [];
    for (let page = 1; page < 50; page++) {
      const r = await this.api({ pathname: `${this.base}/releases/${rel.id}/assets?per_page=100&page=${page}` });
      if (r.status !== 200) throw fail(r, '파일 목록');
      out.push(...r.json);
      if (r.json.length < 100) break;
    }
    return out;
  }

  async uploadAsset(file, name, onProgress) {
    const rel = await this.ensureRelease();
    const size = fs.statSync(file).size;
    if (size > 2 * 1024 * 1024 * 1024 - 1) throw new Error(`${path.basename(file)} 파일이 2GB보다 커서 올릴 수 없어요.`);
    const r = await request({
      method: 'POST', host: 'uploads.github.com', token: this.token,
      pathname: `${this.base}/releases/${rel.id}/assets?name=${encodeURIComponent(name)}`,
      headers: { 'Content-Type': 'application/octet-stream' },
      bodyStream: fs.createReadStream(file), bodyLength: size, onUpload: onProgress,
    });
    if (r.status >= 300) throw fail(r, `${path.basename(file)} 올리기`);
    return r.json;
  }

  async downloadAsset(asset, dest, onProgress) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const tmp = dest + '.part';
    const get = (host, pathname, auth) => new Promise((resolve, reject) => {
      const headers = { 'User-Agent': UA, Accept: 'application/octet-stream' };
      if (auth) headers.Authorization = `Bearer ${this.token}`;
      https.get({ host, path: pathname, headers }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          const u = new URL(res.headers.location);
          return resolve(get(u.host, u.pathname + u.search, u.host === API_HOST));
        }
        if (res.statusCode !== 200) { res.resume(); return reject(new Error(`${asset.name} 받기 실패 (HTTP ${res.statusCode})`)); }
        const total = +res.headers['content-length'] || asset.size || 0;
        let got = 0;
        const out = fs.createWriteStream(tmp);
        res.on('data', c => { got += c.length; if (onProgress) onProgress(got, total); });
        res.pipe(out);
        out.on('finish', () => out.close(() => resolve()));
        out.on('error', reject);
      }).on('error', reject);
    });
    await get(API_HOST, `${this.base}/releases/assets/${asset.id}`, true);
    fs.renameSync(tmp, dest);
  }

  async listProjects() {
    const r = await this.api({ pathname: `${this.base}/contents/projects` });
    if (r.status === 404) return [];
    if (r.status !== 200) throw fail(r, '프로젝트 목록');
    return r.json.filter(f => f.type === 'file' && f.name.endsWith('.hsproj')).map(f => ({ name: f.name.replace(/\.hsproj$/, ''), size: f.size }));
  }

  async readProject(name) {
    const r = await this.api({ pathname: `${this.base}/contents/projects/${encodeURIComponent(name)}.hsproj` });
    if (r.status !== 200) throw fail(r, '프로젝트 받기');
    let text;
    if (r.json.content && r.json.encoding === 'base64') text = Buffer.from(r.json.content, 'base64').toString('utf8');
    else {   // 1MB 넘는 파일은 raw로 받기
      const raw = await this.api({ pathname: `${this.base}/contents/projects/${encodeURIComponent(name)}.hsproj`, accept: 'application/vnd.github.raw' });
      if (raw.status !== 200) throw fail(raw, '프로젝트 받기');
      text = raw.buf.toString('utf8');
    }
    return JSON.parse(text);
  }

  async writeProject(name, data) {
    const p = `${this.base}/contents/projects/${encodeURIComponent(name)}.hsproj`;
    const cur = await this.api({ pathname: p });
    const body = { message: `프로젝트 저장: ${name}`, content: Buffer.from(JSON.stringify(data, null, 1), 'utf8').toString('base64') };
    if (cur.status === 200 && cur.json.sha) body.sha = cur.json.sha;
    const r = await this.api({ method: 'PUT', pathname: p, body });
    if (r.status >= 300) throw fail(r, '프로젝트 저장');
  }
}

/** 프로젝트에 쓰인 파일 목록 (미디어 + LUT) */
function fileRefs(data) {
  const refs = [];
  for (const m of data.media || []) refs.push(m);
  for (const t of data.tracks || []) for (const c of t.clips || []) if (c.color && c.color.lut && c.color.lut.path) refs.push(c.color.lut);
  return refs;
}

/** 올리기: 새 파일만 올리고 프로젝트 JSON 저장 */
async function saveToGitHub(store, name, data, progress) {
  progress({ step: '연결 확인 중…' });
  await store.check();
  const assets = await store.listAssets();
  const have = new Set(assets.map(a => a.name));
  const refs = fileRefs(data).filter(o => o.path && fs.existsSync(o.path));
  let i = 0;
  for (const o of refs) {
    i++;
    progress({ step: `파일 확인 중 ${i}/${refs.length}: ${path.basename(o.path)}` });
    const hash = await sha1File(o.path);
    const assetName = hash + (path.extname(o.path).toLowerCase() || '.bin');
    if (!have.has(assetName)) {
      await store.uploadAsset(o.path, assetName, (sent, total) => progress({ step: `올리는 중 ${i}/${refs.length}: ${path.basename(o.path)}`, ratio: total ? sent / total : 0 }));
      have.add(assetName);
    }
    o.gh = assetName;
    o.ghName = path.basename(o.path);
  }
  data.ghProject = name;
  progress({ step: '프로젝트 저장 중…' });
  await store.writeProject(name, data);
  return data;
}

/** 받기: 이 PC에 없는 파일만 내려받아 경로를 바꿔 준다 */
async function openFromGitHub(store, name, cacheDir, progress) {
  progress({ step: '프로젝트 받는 중…' });
  const data = await store.readProject(name);
  const refs = fileRefs(data).filter(o => o.gh);
  if (!refs.length) return data;
  const assets = await store.listAssets();
  const byName = Object.fromEntries(assets.map(a => [a.name, a]));
  let i = 0;
  for (const o of refs) {
    i++;
    const nice = o.ghName || o.gh;
    if (o.path && fs.existsSync(o.path)) { try { if ((await sha1File(o.path)) + (path.extname(o.path).toLowerCase() || '.bin') === o.gh) continue; } catch (_) {} }
    const dest = path.join(cacheDir, o.gh.slice(0, 2), o.gh.replace(/(\.[^.]+)?$/, m => '') + '_' + nice);
    if (!fs.existsSync(dest)) {
      const a = byName[o.gh];
      if (!a) { progress({ step: `${nice} 파일이 GitHub에 없어요` }); continue; }
      await store.downloadAsset(a, dest, (got, total) => progress({ step: `받는 중 ${i}/${refs.length}: ${nice}`, ratio: total ? got / total : 0 }));
    }
    o.path = dest;
  }
  return data;
}

module.exports = { GitHubStore, saveToGitHub, openFromGitHub };
