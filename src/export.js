// FFmpeg 명령 생성기: 프로젝트(JSON)를 ffmpeg 인자 배열로 변환한다.
'use strict';
const core = require('./renderer/core.js');
const { clipDuration, projectDuration, transitionPlan, FILTER_PRESET_FFMPEG, hasColor, curvesFilter, hasKf, kfExpr, kfMax, effClip, maskExpr } = core;

function num(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }
function f3(v) { return num(v).toFixed(3); }
function even(v) { const n = Math.max(2, Math.round(v)); return n % 2 ? n + 1 : n; }

function atempoChain(speed) {
  const parts = [];
  let s = speed;
  while (s > 2) { parts.push('atempo=2.0'); s /= 2; }
  while (s < 0.5) { parts.push('atempo=0.5'); s /= 0.5; }
  if (Math.abs(s - 1) > 1e-4) parts.push(`atempo=${s.toFixed(4)}`);
  return parts;
}

function colorFilters(f) {
  const out = [];
  if (!f) return out;
  const b = num(f.brightness), c = num(f.contrast), s = num(f.saturation);
  if (b || c || s) out.push(`eq=brightness=${(b / 250).toFixed(3)}:contrast=${(1 + c / 100).toFixed(3)}:saturation=${Math.max(0, 1 + s / 100).toFixed(3)}`);
  if (f.preset && FILTER_PRESET_FFMPEG[f.preset]) out.push(FILTER_PRESET_FFMPEG[f.preset]);
  if (num(f.blur) > 0) out.push(`gblur=sigma=${(num(f.blur) * 0.6).toFixed(2)}`);
  return out;
}

function effectAmount(c, type) {
  const e = (c.effects || []).find(x => x.type === type);
  return e ? num(e.amount, 50) / 100 : 0;
}
function hasEffect(c, type) { return (c.effects || []).some(x => x.type === type); }
function hex(c) { return '0x' + String(c || '#00ff00').replace('#', '').slice(0, 6); }

/** 슬라이드 전환/텍스트 애니메이션용 위치 보정식 (ffmpeg 표현식) */
function easeExpr(start, d) {
  const p = `min(1,max(0,(t-${f3(start)})/${f3(Math.max(0.01, d))}))`;
  return `(1-${p})*(1-${p})`;
}

/**
 * @param project 프로젝트
 * @param opts { outPath, textImages: {clipId: {cx, cy, steps:[{png, from, to}]}}, crf, preset }
 */
function buildExportArgs(project, opts) {
  const W = even(project.width), H = even(project.height), FPS = num(project.fps, 30);
  const total = Math.max(0.1, projectDuration(project));
  const mediaById = Object.fromEntries((project.media || []).map(m => [m.id, m]));
  const inputs = [];
  const filters = [];
  const audioLabels = [];
  let idx = 0;
  const plan = transitionPlan(project);

  filters.push(`color=c=black:s=${W}x${H}:r=${FPS}:d=${f3(total)},format=rgba[base]`);
  let last = 'base';
  let ov = 0;

  const visualTracks = project.tracks.filter(t => t.kind !== 'audio').slice().reverse();
  for (const track of visualTracks) {
    const clips = track.clips.slice().sort((a, b) => a.start - b.start);
    for (let c of clips) {
      const dur = clipDuration(c);
      if (dur <= 0) continue;
      const start = num(c.start);
      const tp = plan[c.id] || {};
      const extend = tp.extend || 0; // 다음 클립과 겹치는 전환을 위해 늘리는 시간
      const fadeIn = Math.min(Math.max(num(c.fadeIn), tp.alphaIn || 0), dur / 2);
      const fadeOut = Math.min(Math.max(num(c.fadeOut), tp.alphaOut || 0), dur / 2);
      const fadeF = [];
      if (fadeIn > 0) fadeF.push(`fade=t=in:st=0:d=${f3(fadeIn)}:alpha=1`);
      if (fadeOut > 0) fadeF.push(`fade=t=out:st=${f3(dur - fadeOut)}:d=${f3(fadeOut)}:alpha=1`);

      if (c.type === 'text') {
        const ti = opts.textImages && opts.textImages[c.id];
        if (!ti || track.hidden) continue;
        const animD = Math.min(num(c.animDur, 0.5), dur);
        let xExpr = `${f3(ti.cx)}-overlay_w/2`, yExpr = `${f3(ti.cy)}-overlay_h/2`;
        const off = (0.06 * H).toFixed(1), e = easeExpr(start, animD);
        if (c.animIn === 'up') yExpr += `+${off}*${e}`;
        if (c.animIn === 'down') yExpr += `-${off}*${e}`;
        if (c.animIn === 'left') xExpr += `-${off}*${e}`;
        if (c.animIn === 'right') xExpr += `+${off}*${e}`;
        const slideFade = ['up', 'down', 'left', 'right'].includes(c.animIn) ? animD : 0;
        const fi = Math.min(Math.max(num(c.fadeIn), slideFade), dur / 2);
        const fo = Math.min(num(c.fadeOut), dur / 2);
        for (const step of ti.steps) {
          const sd = step.to - step.from;
          if (sd <= 0) continue;
          inputs.push('-loop', '1', '-framerate', String(FPS), '-t', f3(sd), '-i', step.png);
          const k = idx++;
          const chain = [`fps=${FPS}`, 'format=rgba'];
          if (fi > 0 && step.from === 0) chain.push(`fade=t=in:st=0:d=${f3(Math.min(fi, sd))}:alpha=1`);
          if (fo > 0 && step.to >= dur - fo) {
            const st = Math.max(0, dur - fo - step.from);
            chain.push(`fade=t=out:st=${f3(st)}:d=${f3(Math.min(fo, sd - st))}:alpha=1`);
          }
          const s0 = start + step.from;
          chain.push(`setpts=PTS-STARTPTS+${f3(s0)}/TB`);
          filters.push(`[${k}:v]${chain.join(',')}[v${k}]`);
          filters.push(`[${last}][v${k}]overlay=x='${xExpr}':y='${yExpr}':eof_action=pass:enable='between(t,${f3(s0)},${f3(start + step.to)})'[o${ov}]`);
          last = `o${ov++}`;
        }
        continue;
      }

      // 조정 레이어·효과 구간: 그 아래까지 합성된 화면을 잘라 와서 같은 처리 과정을 거친다
      const isAdj = c.type === 'adjust';
      if (isAdj && track.hidden) continue;
      const m = isAdj ? { kind: 'adjust', width: W, height: H } : mediaById[c.mediaId];
      if (!m) continue;
      const c0 = c;
      c = effClip(isAdj ? { ...c0, transform: { scale: 1, x: 0, y: 0, rotation: 0 } } : c0, tp);
      const speed = isAdj ? 1 : num(c.speed, 1);
      const srcLen = num(c.out) - num(c.in);
      const vdur = dur + extend;
      let k, adjIn = null;
      if (isAdj) {
        k = `adj${ov}`;
        filters.push(`[${last}]split[${k}base][${k}src]`);
        last = `${k}base`;
        adjIn = `${k}src`;
      } else {
        if (m.kind === 'image') inputs.push('-loop', '1', '-framerate', String(FPS), '-t', f3(vdur), '-i', m.path);
        else {
          const avail = m.duration ? Math.max(srcLen, num(m.duration) - num(c.in)) : srcLen;
          inputs.push('-ss', f3(c.in), '-t', f3(Math.min(avail, srcLen + extend * speed)), '-i', m.path);
        }
        k = idx++;
      }

      if (!track.hidden && m.kind !== 'audio') {
        const tr = c.transform || {};
        const kfS = hasKf(c, 'scale'), kfR = hasKf(c, 'rotation'), kfO = hasKf(c, 'opacity');
        const sMax = kfS ? Math.min(Math.max(0.05, kfMax(c, 'scale')), 4) : num(tr.scale, 1);
        const scale = sMax;
        const cr = c.crop || {}, cl = num(cr.l), ct = num(cr.t), cw = Math.max(0.05, 1 - cl - num(cr.r)), chh = Math.max(0.05, 1 - ct - num(cr.b));
        const cropped = cl || ct || cw < 1 || chh < 1;
        const mw = num(m.width, W) * cw, mh = num(m.height, H) * chh;
        const fit = Math.min(W / mw, H / mh) * scale;
        const w = even(mw * fit), h = even(mh * fit);
        const chain = [];
        let inLbl = adjIn || `${k}:v`, bn = 0;
        const branch = fn => {
          const a = `br${k}_${bn++}`, o = `br${k}_${bn++}`;
          filters.push(`[${inLbl}]${chain.length ? chain.join(',') : 'null'}[${a}]`);
          chain.length = 0;
          filters.push(...fn(a, o, `br${k}_${bn++}`, `br${k}_${bn++}`, `br${k}_${bn++}`, `br${k}_${bn++}`));
          inLbl = o;
        };
        const pre = isAdj ? [`trim=start=${f3(start)}:end=${f3(start + dur)}`, 'setpts=PTS-STARTPTS'] : m.kind !== 'image' ? [...(c.reverse ? ['reverse'] : []), `setpts=(PTS-STARTPTS)/${speed.toFixed(4)}`] : [];
        const cropF = cropped ? [`crop=trunc(iw*${cw.toFixed(4)}/2)*2:trunc(ih*${chh.toFixed(4)}/2)*2:trunc(iw*${cl.toFixed(4)}):trunc(ih*${ct.toFixed(4)})`] : [];
        // 배경 채우기 (흐림 / 색)
        const bg = c.bg && c.bg.type && c.bg.type !== 'none' ? c.bg : null;
        if (bg) {
          const bgEnd = `,${fadeF.length ? fadeF.join(',') + ',' : ''}${extend > 0 ? `tpad=stop_mode=clone:stop_duration=${f3(extend)},` : ''}setpts=PTS-STARTPTS+${f3(start)}/TB`;
          if (bg.type === 'blur') {
            filters.push(`[${inLbl}]split[bgs${k}][bgm${k}]`);
            inLbl = `bgm${k}`;
            const sig = ((10 + 40 * num(bg.amount, 50) / 100) * W / 1920).toFixed(2);
            filters.push(`[bgs${k}]${[...pre, `fps=${FPS}`, ...cropF, `scale=${W}:${H}:force_original_aspect_ratio=increase`, `crop=${W}:${H}`, `gblur=sigma=${sig}`, 'eq=brightness=-0.04', 'format=rgba'].join(',')}${bgEnd}[bgv${k}]`);
          } else {
            filters.push(`color=c=${hex(bg.color || '#000000')}:s=${W}x${H}:r=${FPS}:d=${f3(vdur)},format=rgba${bgEnd}[bgv${k}]`);
          }
          filters.push(`[${last}][bgv${k}]overlay=0:0:eof_action=pass:enable='between(t,${f3(start)},${f3(start + vdur)})'[o${ov}]`);
          last = `o${ov++}`;
        }
        chain.push(...pre);
        chain.push(`fps=${FPS}`, ...cropF);
        // 모자이크
        const pix = effectAmount(c, 'pixelate');
        if (hasEffect(c, 'pixelate')) {
          const kf = 4 + pix * 40;
          chain.push(`scale=${even(w / kf)}:${even(h / kf)}`, `scale=${w}:${h}:flags=neighbor`);
        } else chain.push(`scale=${w}:${h}`);
        chain.push('setsar=1');
        // 줌 인/아웃 (켄 번즈)
        const nFrames = Math.max(1, Math.round(vdur * FPS));
        if (hasEffect(c, 'zoomIn')) {
          const z = (0.05 + 0.35 * effectAmount(c, 'zoomIn')).toFixed(3);
          chain.push(`zoompan=z='1+${z}*on/${nFrames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${w}x${h}:fps=${FPS}`);
        } else if (hasEffect(c, 'zoomOut')) {
          const z = (0.05 + 0.35 * effectAmount(c, 'zoomOut')).toFixed(3);
          chain.push(`zoompan=z='1+${z}-${z}*on/${nFrames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${w}x${h}:fps=${FPS}`);
        }
        chain.push(...colorFilters(c.filter));
        if (hasColor(c.color)) {
          chain.push(curvesFilter(c.color));
          const vib = num(c.color.vibrance);
          if (vib) chain.push(`vibrance=intensity=${(vib / 100).toFixed(3)}`);
        }
        if (c.color && c.color.lut && c.color.lut.path) {
          const lp = c.color.lut.path.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, '');
          chain.push(`lut3d=file='${lp}'`);
        }
        if (hasEffect(c, 'invert')) chain.push('negate');
        if (hasEffect(c, 'grain')) chain.push(`noise=alls=${Math.round(8 + 40 * effectAmount(c, 'grain'))}:allf=t+u`);
        if (hasEffect(c, 'vignette')) chain.push(`vignette=a=${(0.25 + 0.6 * effectAmount(c, 'vignette')).toFixed(3)}`);
        const amt = type => effectAmount(c, type);
        if (hasEffect(c, 'blur')) chain.push(`gblur=sigma=${((2 + 18 * amt('blur')) * w / 1920).toFixed(2)}`);
        if (hasEffect(c, 'rainbow')) chain.push(`hue=H=2*PI*t*${(0.2 + 0.8 * amt('rainbow')).toFixed(3)}`);
        if (hasEffect(c, 'posterize')) { const st = Math.round(256 / Math.max(2, Math.round(8 - 6 * amt('posterize')))); const e = `floor(val/${st})*${st}+${Math.floor(st / 2)}`; chain.push(`lutrgb=r='${e}':g='${e}':b='${e}'`); }
        if (hasEffect(c, 'duotone')) chain.push('colorchannelmixer=rr=0.164:rg=0.323:rb=0.063:gr=0.254:gg=0.499:gb=0.097:br=0.344:bg=0.675:bb=0.131');
        if (hasEffect(c, 'glow')) {
          const sg = (6 + 20 * amt('glow')) * w / 1920, op = (0.3 + 0.5 * amt('glow')).toFixed(3);
          chain.push('format=gbrp');
          branch((a, o, x1, x2) => [`[${a}]split[${x1}][${x2}]`, `[${x2}]gblur=sigma=${Math.max(1, sg).toFixed(2)}[${x2}b]`, `[${x1}][${x2}b]blend=all_mode=screen:all_opacity=${op}[${o}]`]);
        }
        if (hasEffect(c, 'split4')) {
          const hw = even(w / 2), hh = even(h / 2);
          chain.push(`scale=${hw}:${hh}`);
          branch((a, o, x1, x2, x3, x4) => [`[${a}]split=4[${x1}][${x2}][${x3}][${x4}]`, `[${x1}][${x2}]hstack[${x1}t]`, `[${x3}][${x4}]hstack[${x3}t]`, `[${x1}t][${x3}t]vstack,scale=${w}:${h}[${o}]`]);
        }
        if (hasEffect(c, 'mirrorSplit')) {
          const hw = even(w / 2);
          chain.push(`scale=${hw * 2}:${h}`);
          branch((a, o, x1, x2) => [`[${a}]crop=${hw}:${h}:0:0,split[${x1}][${x2}]`, `[${x2}]hflip[${x2}f]`, `[${x1}][${x2}f]hstack,scale=${w}:${h}[${o}]`]);
        }
        if (hasEffect(c, 'scanlines')) { const sp = Math.max(2, Math.round(4 * H / 1080)), th = Math.max(1, Math.round(sp / 2)); chain.push(`drawgrid=w=${w + 10}:h=${sp}:t=${th}:c=black@${(0.2 + 0.6 * amt('scanlines')).toFixed(2)}`); }
        if (hasEffect(c, 'strobe')) chain.push(`eq=brightness='0.3*gt(mod(t*${(3 + 9 * amt('strobe')).toFixed(2)},1),0.5)':eval=frame`);
        if (hasEffect(c, 'letterbox')) { const lb = even(h * (0.06 + 0.1 * amt('letterbox'))); chain.push(`drawbox=x=0:y=0:w=iw:h=${lb}:color=black:t=fill`, `drawbox=x=0:y=ih-${lb}:w=iw:h=${lb}:color=black:t=fill`); }
        if (hasEffect(c, 'flash')) chain.push(`fade=t=in:st=0:d=${f3(0.15 + 0.5 * effectAmount(c, 'flash'))}:c=white`);
        if (tp.whiteIn) chain.push(`fade=t=in:st=0:d=${f3(tp.whiteIn)}:c=white`);
        if (tp.whiteOut) chain.push(`fade=t=out:st=${f3(dur - tp.whiteOut)}:d=${f3(tp.whiteOut)}:c=white`);
        chain.push('format=rgba');
        if (c.chroma && c.chroma.on) {
          const sim = (0.05 + 0.4 * num(c.chroma.similarity, 30) / 100).toFixed(3);
          chain.push(`colorkey=${hex(c.chroma.color)}:${sim}:0.08`);
        }
        if (hasEffect(c, 'rgbSplit')) {
          const px = Math.max(1, Math.round((2 + 18 * effectAmount(c, 'rgbSplit')) * W / 1920));
          chain.push(`rgbashift=rh=-${px}:bh=${px}`);
        }
        if (tp.mask) {
          const D = Math.min(tp.mask.d, dur);
          const ex = maskExpr(tp.mask.type, D);
          branch((a, o, x1, x2) => [`[${a}]split[${x1}][${x2}]`, `[${x1}]trim=duration=${f3(D)},geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*${ex}'[${x1}m]`, `[${x2}]trim=start=${f3(D)},setpts=PTS-STARTPTS[${x2}m]`, `[${x1}m][${x2}m]concat=n=2:v=1:a=0[${o}]`]);
        }
        if (hasEffect(c, 'mirror')) chain.push('hflip');
        if (hasEffect(c, 'flipV')) chain.push('vflip');
        if (kfO) chain.push(`geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*max(0,min(1,${kfExpr(c, 'opacity', 'T')}))'`);
        else if (num(c.opacity, 1) < 1) chain.push(`colorchannelmixer=aa=${num(c.opacity, 1).toFixed(3)}`);
        const rot = num(tr.rotation);
        if (kfR) chain.push(`rotate=a='${kfExpr(c, 'rotation', 't', Math.PI / 180)}':ow='hypot(iw,ih)':oh='hypot(iw,ih)':c=none`);
        else if (rot) { const r = (rot * Math.PI / 180).toFixed(5); chain.push(`rotate=${r}:ow=rotw(${r}):oh=roth(${r}):c=none`); }
        chain.push(...fadeF);
        if (extend > 0) chain.push(`tpad=stop_mode=clone:stop_duration=${f3(extend)}`);
        if (kfS) {
          const se = `(${kfExpr(c, 'scale', 't')})/${sMax.toFixed(4)}`;
          chain.push(`scale=w='max(2,trunc(iw*${se}/2)*2)':h='max(2,trunc(ih*${se}/2)*2)':eval=frame`);
        }
        chain.push(`setpts=PTS-STARTPTS+${f3(start)}/TB`);
        filters.push(`[${inLbl}]${chain.join(',') || 'null'}[v${k}]`);
        const lt = `(t-${f3(start)})`;
        let x = `(main_w-overlay_w)/2+${hasKf(c, 'x') ? `(${kfExpr(c, 'x', lt, W)})` : (num(tr.x) * W).toFixed(1)}`;
        let y = `(main_h-overlay_h)/2+${hasKf(c, 'y') ? `(${kfExpr(c, 'y', lt, H)})` : (num(tr.y) * H).toFixed(1)}`;
        if (hasEffect(c, 'shake')) {
          const amp = ((0.004 + 0.03 * effectAmount(c, 'shake')) * W).toFixed(1);
          x += `+${amp}*sin(t*37)`; y += `+${amp}*cos(t*29)`;
        }
        if (tp.pushOut) {
          const e = `(1-${easeExpr(tp.pushOut.at, tp.pushOut.d)})`;
          if (tp.pushOut.dir === 'left') x += `-main_w*${e}`;
          if (tp.pushOut.dir === 'right') x += `+main_w*${e}`;
          if (tp.pushOut.dir === 'up') y += `-main_h*${e}`;
          if (tp.pushOut.dir === 'down') y += `+main_h*${e}`;
        }
        if (tp.slide) {
          const e = easeExpr(start, tp.slide.d);
          if (tp.slide.dir === 'left') x += `+main_w*${e}`;
          if (tp.slide.dir === 'right') x += `-main_w*${e}`;
          if (tp.slide.dir === 'up') y += `+main_h*${e}`;
          if (tp.slide.dir === 'down') y += `-main_h*${e}`;
        }
        filters.push(`[${last}][v${k}]overlay=x='${x}':y='${y}':eof_action=pass:enable='between(t,${f3(start)},${f3(start + vdur)})'[o${ov}]`);
        last = `o${ov++}`;
      }
      if (!isAdj && m.hasAudio && !track.muted && num(c.volume, 1) > 0 && m.kind !== 'image') {
        audioLabels.push(audioChain(filters, k, c, speed, dur, start));
      }
    }
  }

  for (const track of project.tracks.filter(t => t.kind === 'audio')) {
    if (track.muted) continue;
    for (const c of track.clips) {
      const m = mediaById[c.mediaId];
      if (!m || !m.hasAudio || num(c.volume, 1) <= 0) continue;
      const dur = clipDuration(c);
      if (dur <= 0) continue;
      inputs.push('-ss', f3(c.in), '-t', f3(num(c.out) - num(c.in)), '-i', m.path);
      const k = idx++;
      audioLabels.push(audioChain(filters, k, c, num(c.speed, 1), dur, num(c.start)));
    }
  }

  const OW = opts.outWidth ? even(opts.outWidth) : W, OH = opts.outHeight ? even(opts.outHeight) : H;
  const outScale = (OW !== W || OH !== H) ? `scale=${OW}:${OH}:force_original_aspect_ratio=decrease,pad=${OW}:${OH}:(ow-iw)/2:(oh-ih)/2:color=black,` : '';
  const fmt = opts.format || 'mp4';
  if (fmt === 'gif') {
    const gw = Math.min(OW, 720);
    filters.push(`[${last}]${outScale}fps=${Math.min(15, opts.outFps || FPS)},scale=${even(gw)}:-2:flags=lanczos,split[gp1][gp2];[gp1]palettegen=stats_mode=diff[gpal];[gp2][gpal]paletteuse=dither=bayer:bayer_scale=4[vout]`);
  } else filters.push(`[${last}]${outScale}format=yuv420p[vout]`);

  if (audioLabels.length) {
    filters.push(`${audioLabels.map(l => `[${l}]`).join('')}amix=inputs=${audioLabels.length}:duration=longest:normalize=0,apad,atrim=0:${f3(total)}${opts.loudnorm ? ',loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000' : ''}[aout]`);
  } else {
    inputs.push('-f', 'lavfi', '-t', f3(total), '-i', 'anullsrc=r=48000:cl=stereo');
    filters.push(`[${idx++}:a]anull[aout]`);
  }

  const isAudioF = f => /^\[\d+:a\]/.test(f) || /\[aout\]$/.test(f) || /^\[a\d+\]/.test(f);
  const time = opts.range ? ['-ss', f3(opts.range.from), '-t', f3(opts.range.to - opts.range.from)] : ['-t', f3(total)];
  let out;
  if (fmt === 'mp3') {
    // 소리만: 영상 필터는 빼고 오디오만 계산
    const af = filters.filter(isAudioF);
    out = ['-filter_complex', af.join(';'), '-map', '[aout]', '-vn', '-c:a', 'libmp3lame', '-b:a', '192k', '-ar', '48000', ...time];
  } else if (fmt === 'gif') out = ['-filter_complex', filters.filter(f => !isAudioF(f)).join(';'), '-map', '[vout]', '-an', '-loop', '0', ...time];
  else if (fmt === 'png') out = ['-filter_complex', filters.filter(f => !isAudioF(f)).join(';'), '-map', '[vout]', '-an', '-ss', f3(opts.range ? opts.range.from : 0), '-frames:v', '1', '-update', '1'];
  else out = ['-filter_complex', filters.join(';'), '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', opts.preset || 'medium', '-crf', String(opts.crf || 20),
    '-r', String(opts.outFps || FPS), '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', ...time, '-movflags', '+faststart'];
  const args = ['-y', '-hide_banner', ...inputs, ...out, '-progress', 'pipe:1', '-nostats', opts.outPath];
  return { args, duration: fmt === 'png' ? 0.04 : (opts.range ? opts.range.to - opts.range.from : total) };
}

const VOICE_FILTERS = {
  echo: ['aecho=0.8:0.85:280:0.35'],
  cave: ['aecho=0.8:0.88:450|900:0.4|0.25'],
  phone: ['highpass=f=400', 'lowpass=f=3200', 'acompressor=threshold=0.1:ratio=4'],
  radio: ['highpass=f=250', 'lowpass=f=4500', 'acrusher=bits=10:mix=0.25'],
  chipmunk: ['asetrate=48000*1.45', 'aresample=48000', 'atempo=0.6897'],
  deep: ['asetrate=48000*0.75', 'aresample=48000', 'atempo=1.3333'],
  robot: ["afftfilt=real='hypot(re,im)*sin(0)':imag='hypot(re,im)*cos(0)':win_size=512:overlap=0.75"],
};
/** 음성 효과·잡음 제거 */
function voiceFilters(c) {
  const out = [];
  if (c.denoise) out.push(`afftdn=nr=${Math.round(10 + num(c.denoise === true ? 50 : c.denoise, 50) * 0.3)}:nf=-30`);
  if (c.voice && VOICE_FILTERS[c.voice]) out.push(...VOICE_FILTERS[c.voice]);
  return out;
}
function audioChain(filters, k, c, speed, dur, start) {
  const chain = [...(c.reverse ? ['areverse'] : []), 'asetpts=PTS-STARTPTS', 'aresample=48000', 'aformat=channel_layouts=stereo', ...atempoChain(speed), `atrim=0:${f3(dur)}`];
  chain.push(...voiceFilters(c));
  const vol = num(c.volume, 1);
  if (hasKf(c, 'volume')) chain.push(`volume='max(0,${kfExpr(c, 'volume', 't')})':eval=frame`);
  else if (Math.abs(vol - 1) > 1e-3) chain.push(`volume=${vol.toFixed(3)}`);
  const ai = Math.min(num(c.audioFadeIn ?? c.fadeIn), dur / 2), ao = Math.min(num(c.audioFadeOut ?? c.fadeOut), dur / 2);
  if (ai > 0) chain.push(`afade=t=in:st=0:d=${f3(ai)}`);
  if (ao > 0) chain.push(`afade=t=out:st=${f3(dur - ao)}:d=${f3(ao)}`);
  const ms = Math.round(start * 1000);
  if (ms > 0) chain.push(`adelay=${ms}:all=1`);
  filters.push(`[${k}:a]${chain.join(',')}[a${k}]`);
  return `a${k}`;
}

/** 음성 효과 미리 듣기용 짧은 소리 파일 명령 */
function voicePreviewArgs(c, mediaPath, outPath) {
  const len = Math.min(6, Math.max(0.5, num(c.out) - num(c.in)));
  const chain = ['aresample=48000', 'aformat=channel_layouts=stereo', ...voiceFilters(c), `atrim=0:${f3(len)}`];
  return ['-y', '-hide_banner', '-v', 'error', '-ss', f3(c.in), '-t', f3(len + 0.5), '-i', mediaPath, '-vn', '-af', chain.join(','), '-ar', '48000', outPath];
}

module.exports = { buildExportArgs, projectDuration, clipDuration, voicePreviewArgs, VOICE_FILTERS };
