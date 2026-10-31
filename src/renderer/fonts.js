// 무료 글꼴(구글 폰트, SIL OFL 상업용 무료) 목록과 불러오기
(function () {
  const B = 'https://raw.githubusercontent.com/google/fonts/main/ofl/';
  const F = (family, label, cat, files) => ({ family, label, cat, files: files.map(([p, w]) => ({ url: B + p, weight: w || 'normal' })) });
  const LIST = [
    F('Noto Sans KR', '본고딕 (Noto Sans KR)', 'ko', [['notosanskr/NotoSansKR%5Bwght%5D.ttf', '100 900']]),
    F('Nanum Gothic', '나눔고딕', 'ko', [['nanumgothic/NanumGothic-Regular.ttf'], ['nanumgothic/NanumGothic-Bold.ttf', 'bold'], ['nanumgothic/NanumGothic-ExtraBold.ttf', '800']]),
    F('Nanum Myeongjo', '나눔명조', 'ko', [['nanummyeongjo/NanumMyeongjo-Regular.ttf'], ['nanummyeongjo/NanumMyeongjo-Bold.ttf', 'bold']]),
    F('Nanum Pen Script', '나눔손글씨 펜', 'ko', [['nanumpenscript/NanumPenScript-Regular.ttf']]),
    F('Nanum Brush Script', '나눔손글씨 붓', 'ko', [['nanumbrushscript/NanumBrushScript-Regular.ttf']]),
    F('Nanum Gothic Coding', '나눔고딕코딩', 'ko', [['nanumgothiccoding/NanumGothicCoding-Regular.ttf']]),
    F('Black Han Sans', '검은고딕 (Black Han Sans)', 'ko', [['blackhansans/BlackHanSans-Regular.ttf']]),
    F('Do Hyeon', '도현체', 'ko', [['dohyeon/DoHyeon-Regular.ttf']]),
    F('Jua', '주아체', 'ko', [['jua/Jua-Regular.ttf']]),
    F('Gothic A1', '고딕 A1', 'ko', [['gothica1/GothicA1-Regular.ttf'], ['gothica1/GothicA1-Bold.ttf', 'bold']]),
    F('IBM Plex Sans KR', 'IBM 플렉스 산스 KR', 'ko', [['ibmplexsanskr/IBMPlexSansKR-Regular.ttf'], ['ibmplexsanskr/IBMPlexSansKR-Bold.ttf', 'bold']]),
    F('Gowun Dodum', '고운돋움', 'ko', [['gowundodum/GowunDodum-Regular.ttf']]),
    F('Gowun Batang', '고운바탕', 'ko', [['gowunbatang/GowunBatang-Regular.ttf'], ['gowunbatang/GowunBatang-Bold.ttf', 'bold']]),
    F('Hahmlet', '함렛', 'ko', [['hahmlet/Hahmlet%5Bwght%5D.ttf', '100 900']]),
    F('Orbit', '오르빗', 'ko', [['orbit/Orbit-Regular.ttf']]),
    F('Sunflower', '해바라기', 'ko', [['sunflower/Sunflower-Medium.ttf'], ['sunflower/Sunflower-Bold.ttf', 'bold']]),
    F('Dongle', '동글', 'ko', [['dongle/Dongle-Regular.ttf'], ['dongle/Dongle-Bold.ttf', 'bold']]),
    F('Gaegu', '개구체', 'ko', [['gaegu/Gaegu-Regular.ttf'], ['gaegu/Gaegu-Bold.ttf', 'bold']]),
    F('Gamja Flower', '감자꽃', 'ko', [['gamjaflower/GamjaFlower-Regular.ttf']]),
    F('Gugi', '구기체', 'ko', [['gugi/Gugi-Regular.ttf']]),
    F('Hi Melody', '하이멜로디', 'ko', [['himelody/HiMelody-Regular.ttf']]),
    F('Yeon Sung', '연성체', 'ko', [['yeonsung/YeonSung-Regular.ttf']]),
    F('Song Myung', '송명체', 'ko', [['songmyung/SongMyung-Regular.ttf']]),
    F('East Sea Dokdo', '동해독도', 'ko', [['eastseadokdo/EastSeaDokdo-Regular.ttf']]),
    F('Dokdo', '독도체', 'ko', [['dokdo/Dokdo-Regular.ttf']]),
    F('Poor Story', '푸어스토리', 'ko', [['poorstory/PoorStory-Regular.ttf']]),
    F('Single Day', '싱글데이', 'ko', [['singleday/SingleDay-Regular.ttf']]),
    F('Stylish', '스타일리시', 'ko', [['stylish/Stylish-Regular.ttf']]),
    F('Cute Font', '귀여운체', 'ko', [['cutefont/CuteFont-Regular.ttf']]),
    F('Kirang Haerang', '기랑해랑', 'ko', [['kiranghaerang/KirangHaerang-Regular.ttf']]),
    F('Black And White Picture', '흑백사진', 'ko', [['blackandwhitepicture/BlackAndWhitePicture-Regular.ttf']]),
    F('Diphylleia', '디필레이아', 'ko', [['diphylleia/Diphylleia-Regular.ttf']]),
    F('Bebas Neue', 'Bebas Neue', 'en', [['bebasneue/BebasNeue-Regular.ttf']]),
    F('Anton', 'Anton', 'en', [['anton/Anton-Regular.ttf']]),
    F('Oswald', 'Oswald', 'en', [['oswald/Oswald%5Bwght%5D.ttf', '200 700']]),
    F('Montserrat', 'Montserrat', 'en', [['montserrat/Montserrat%5Bwght%5D.ttf', '100 900']]),
    F('Poppins', 'Poppins', 'en', [['poppins/Poppins-Regular.ttf'], ['poppins/Poppins-Bold.ttf', 'bold']]),
    F('Kanit', 'Kanit', 'en', [['kanit/Kanit-Bold.ttf', 'bold'], ['kanit/Kanit-Bold.ttf']]),
    F('Fredoka', 'Fredoka', 'en', [['fredoka/Fredoka%5Bwdth,wght%5D.ttf', '300 700']]),
    F('Bangers', 'Bangers (만화)', 'en', [['bangers/Bangers-Regular.ttf']]),
    F('Bungee', 'Bungee', 'en', [['bungee/Bungee-Regular.ttf']]),
    F('Righteous', 'Righteous', 'en', [['righteous/Righteous-Regular.ttf']]),
    F('Press Start 2P', 'Press Start 2P (픽셀)', 'en', [['pressstart2p/PressStart2P-Regular.ttf']]),
    F('Abril Fatface', 'Abril Fatface', 'en', [['abrilfatface/AbrilFatface-Regular.ttf']]),
    F('Playfair Display', 'Playfair Display', 'en', [['playfairdisplay/PlayfairDisplay%5Bwght%5D.ttf', '400 900']]),
    F('Pacifico', 'Pacifico (손글씨)', 'en', [['pacifico/Pacifico-Regular.ttf']]),
    F('Lobster', 'Lobster', 'en', [['lobster/Lobster-Regular.ttf']]),
    F('Dancing Script', 'Dancing Script', 'en', [['dancingscript/DancingScript%5Bwght%5D.ttf', '400 700']]),
    F('Caveat', 'Caveat', 'en', [['caveat/Caveat%5Bwght%5D.ttf', '400 700']]),
    F('Great Vibes', 'Great Vibes', 'en', [['greatvibes/GreatVibes-Regular.ttf']]),
  ];
  const SYSTEM_DEFAULT = ['Malgun Gothic', 'Gulim', 'Dotum', 'Batang', 'Gungsuh', 'Segoe UI', 'Arial', 'Arial Black', 'Impact', 'Georgia', 'Times New Roman', 'Courier New', 'Comic Sans MS'];
  const loaded = new Map(); // family -> Promise
  let systemFamilies = null;

  function fileUrl(p) {
    const norm = p.replace(/\\/g, '/');
    return 'file://' + (norm.startsWith('/') ? '' : '/') + norm.split('/').map((s, i) => (i === 0 && /^[A-Za-z]:$/.test(s)) ? s : encodeURIComponent(s)).join('/');
  }
  function ensure(family) {
    const def = LIST.find(f => f.family === family);
    if (!def) return Promise.resolve(true);
    if (loaded.has(family)) return loaded.get(family);
    const p = (async () => {
      for (const f of def.files) {
        const local = await window.api.getFont(f.url);
        const face = new FontFace(family, `url("${fileUrl(local)}")`, { weight: f.weight });
        await face.load();
        document.fonts.add(face);
      }
      return true;
    })().catch(e => { loaded.delete(family); throw e; });
    loaded.set(family, p);
    return p;
  }
  async function system() {
    if (systemFamilies) return systemFamilies;
    try {
      const fonts = await window.queryLocalFonts();
      systemFamilies = [...new Set(fonts.map(f => f.family))].sort((a, b) => a.localeCompare(b, 'ko'));
    } catch (_) { systemFamilies = SYSTEM_DEFAULT; }
    return systemFamilies;
  }
  window.Fonts = { LIST, SYSTEM_DEFAULT, ensure, system, isFree: fam => LIST.some(f => f.family === fam) };
})();
