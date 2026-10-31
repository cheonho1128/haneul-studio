// GitHub 저장/열기 흐름 테스트 (네트워크 대신 가짜 저장소)
const fs = require('fs'), path = require('path'), os = require('os');
const { saveToGitHub, openFromGitHub } = require('../src/github');
const F = p => path.join(__dirname, 'fixtures', p);
const remote = { assets: {}, projects: {} };
const fake = {
  async check() { return { fullName: 'x/y' }; },
  async listAssets() { return Object.keys(remote.assets).map((n, i) => ({ id: i, name: n, size: remote.assets[n].length })); },
  async uploadAsset(file, name, prog) { remote.assets[name] = fs.readFileSync(file); prog(1, 1); uploads++; },
  async downloadAsset(a, dest) { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, remote.assets[a.name]); downloads++; },
  async writeProject(n, d) { remote.projects[n] = JSON.stringify(d); },
  async readProject(n) { return JSON.parse(remote.projects[n]); },
};
let uploads = 0, downloads = 0;
(async () => {
  const data = { media: [{ id: 'a', path: F('a.mp4') }, { id: 'm', path: F('m.mp3') }], tracks: [{ clips: [{ color: { lut: { path: F('warm.cube') } } }] }] };
  await saveToGitHub(fake, '테스트', data, () => {});
  await saveToGitHub(fake, '테스트', data, () => {});   // 두 번째는 다시 올리지 않아야 함
  console.log('uploads', uploads, Object.keys(remote.assets));
  const other = fs.mkdtempSync(path.join(process.argv[2] || os.tmpdir(), 'pc2-'));
  const p2 = JSON.parse(remote.projects['테스트']); p2.media.forEach(m => m.path = 'C:\\nope\\' + m.ghName); fs.writeFileSync(path.join(other, 'x'), '');
  remote.projects['테스트'] = JSON.stringify(p2);
  const got = await openFromGitHub(fake, '테스트', other, () => {});
  console.log('downloads', downloads, got.media.map(m => fs.existsSync(m.path) && path.basename(m.path)), fs.existsSync(got.tracks[0].clips[0].color.lut.path));
  await openFromGitHub(fake, '테스트', other, () => {});
  console.log('downloads after reopen', downloads);
})().catch(e => { console.error(e); process.exit(1); });
