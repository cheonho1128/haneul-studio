// FFmpeg 명령 생성기: 프로젝트(JSON)를 ffmpeg 인자 배열로 변환한다.
'use strict';
const core = require('./renderer/core.js');
const { clipDuration, projectDuration, transitionPlan, FILTER_PRESET_FFMPEG, hasColor, curvesFilter, hasKf, kfExpr, kfMax } = core;

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
    for (const c of clips) {
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

      if (c.type === 'adjust') {
        if (track.hidden) continue;
        const ch = [...colorFilters(c.filter)];
        if (hasColor(c.color)) { ch.push(curvesFilter(c.color)); if (num(c.color.vibrance)) ch.push(`vibrance=intensity=${(num(c.color.vibrance) / 100).toFixed(3)}`); }
        if (c.color && c.color.lut && c.color.lut.path) ch.push(`lut3d=file='${c.color.lut.path.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, '')}'`);
        if (hasEffect(c, 'invert')) ch.push('negate');
        if (hasEffect(c, 'grain')) ch.push(`noise=alls=${Math.round(8 + 40 * effectAmount(c, 'grain'))}:allf=t+u`);
        if (hasEffect(c, 'vignette')) ch.push(`vignette=a=${(0.25 + 0.6 * effectAmount(c, 'vignette')).toFixed(3)}`);
        if (hasEffect(c, 'pixelate')) { const kf = 4 + effectAmount(c, 'pixelate') * 40; ch.push(`scale=${even(W / kf)}:${even(H / kf)}`, `scale=${W}:${H}:flags=neighbor`); }
        if (hasEffect(c, 'rgbSplit')) ch.push('format=rgba', `rgbashift=rh=-${Math.max(1, Math.round((2 + 18 * effectAmount(c, 'rgbSplit')) * W / 1920))}:bh=${Math.max(1, Math.round((2 + 18 * effectAmount(c, 'rgbSplit')) * W / 1920))}`);
        if (!ch.length) continue;
        const a = `aj${ov}a`, b = `aj${ov}b`, cc = `aj${ov}c`;
        filters.push(`[${last}]split[${a}][${b}]`);
        filters.push(`[${b}]${ch.join(',')},format=rgba,trim=start=${f3(start)}:end=${f3(start + dur)}${fadeIn > 0 ? `,fade=t=in:st=${f3(start)}:d=${f3(fadeIn)}:alpha=1` : ''}${fadeOut > 0 ? `,fade=t=out:st=${f3(start + dur - fadeOut)}:d=${f3(fadeOut)}:alpha=1` : ''}[${cc}]`);
        filters.push(`[${a}][${cc}]overlay=eof_action=pass:enable='between(t,${f3(start)},${f3(start + dur)})'[o${ov}]`);
        last = `o${ov++}`;
        continue;
      }

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

      const m = mediaById[c.mediaId];
      if (!m) continue;
      const speed = num(c.speed, 1);
      const srcLen = num(c.out) - num(c.in);
      const vdur = dur + extend;
      if (m.kind === 'image') inputs.push('-loop', '1', '-framerate', String(FPS), '-t', f3(vdur), '-i', m.path);
      else {
        const avail = m.duration ? Math.max(srcLen, num(m.duration) - num(c.in)) : srcLen;
        inputs.push('-ss', f3(c.in), '-t', f3(Math.min(avail, srcLen + extend * speed)), '-i', m.path);
      }
      const k = idx++;

      if (!track.hidden && m.kind !== 'audio') {
        const tr = c.transform || {};
        const kfS = hasKf(c, 'scale'), kfR = hasKf(c, 'rotation'), kfO = hasKf(c, 'opacity');
        const sMax = kfS ? Math.min(Math.max(0.05, kfMax(c, 'scale')), 4) : num(tr.scale, 1);
        const scale = sMax;
        const mw = num(m.width, W), mh = num(m.height, H);
        const fit = Math.min(W / mw, H / mh) * scale;
        const w = even(mw * fit), h = even(mh * fit);
        const chain = [];
        if (m.kind !== 'image') chain.push(...(c.reverse ? ['reverse'] : []), `setpts=(PTS-STARTPTS)/${speed.toFixed(4)}`);
        chain.push(`fps=${FPS}`);
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
        filters.push(`[${k}:v]${chain.join(',')}[v${k}]`);
        const lt = `(t-${f3(start)})`;
        let x = `(main_w-overlay_w)/2+${hasKf(c, 'x') ? `(${kfExpr(c, 'x', lt, W)})` : (num(tr.x) * W).toFixed(1)}`;
        let y = `(main_h-overlay_h)/2+${hasKf(c, 'y') ? `(${kfExpr(c, 'y', lt, H)})` : (num(tr.y) * H).toFixed(1)}`;
        if (hasEffect(c, 'shake')) {
          const amp = ((0.004 + 0.03 * effectAmount(c, 'shake')) * W).toFixed(1);
          x += `+${amp}*sin(t*37)`; y += `+${amp}*cos(t*29)`;
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
      if (m.hasAudio && !track.muted && num(c.volume, 1) > 0 && m.kind !== 'image') {
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
  filters.push(`[${last}]${outScale}format=yuv420p[vout]`);

  if (audioLabels.length) {
    filters.push(`${audioLabels.map(l => `[${l}]`).join('')}amix=inputs=${audioLabels.length}:duration=longest:normalize=0,apad,atrim=0:${f3(total)}[aout]`);
  } else {
    inputs.push('-f', 'lavfi', '-t', f3(total), '-i', 'anullsrc=r=48000:cl=stereo');
    filters.push(`[${idx++}:a]anull[aout]`);
  }

  const args = ['-y', '-hide_banner', ...inputs,
    '-filter_complex', filters.join(';'),
    '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', opts.preset || 'medium', '-crf', String(opts.crf || 20),
    '-r', String(opts.outFps || FPS), '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
    ...(opts.range ? ['-ss', f3(opts.range.from), '-t', f3(opts.range.to - opts.range.from)] : ['-t', f3(total)]),
    '-movflags', '+faststart',
    '-progress', 'pipe:1', '-nostats',
    opts.outPath];
  return { args, duration: opts.range ? opts.range.to - opts.range.from : total };
}

function audioChain(filters, k, c, speed, dur, start) {
  const chain = [...(c.reverse ? ['areverse'] : []), 'asetpts=PTS-STARTPTS', 'aresample=48000', 'aformat=channel_layouts=stereo', ...atempoChain(speed), `atrim=0:${f3(dur)}`];
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

module.exports = { buildExportArgs, projectDuration, clipDuration };
