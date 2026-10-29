/**
 * Cuts the rendered scene frames and recorded voiceover into finished videos.
 *
 * Each shot is held for the length of its narration plus a short tail, with a
 * slow push-in so the cut has movement. Captions (SRT) are written alongside
 * every cut and the first frame is copied out as the video poster.
 *
 * Run:  node build-video.mjs            (builds every video that has audio)
 *       node build-video.mjs promo      (one concept)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, execSync } from 'node:child_process';
import { COPY } from './bizora.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '..', '06-video');
const FRAMES = path.join(HERE, 'frames');
const AUDIO = path.join(HERE, 'audio');
const TMP = path.join(HERE, 'frames', 'tmp');
const FF = process.env.FFMPEG
  || path.join(HERE, 'node_modules', '@ffmpeg-installer', 'linux-x64', 'ffmpeg');

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

const CUTS = {
  promo: [{ tag: 'land', w: 1920, h: 1080, name: 'bizora-promo-60s-16x9' }, { tag: 'vert', w: 1080, h: 1920, name: 'bizora-promo-60s-9x16' }],
  reel: [{ tag: 'vert', w: 1080, h: 1920, name: 'bizora-reel-30s-9x16' }],
  explainer: [{ tag: 'land', w: 1920, h: 1080, name: 'bizora-explainer-45s-16x9' }],
};

const TAIL = 0.45;   // seconds of breathing room after each line
const FPS = 30;

const duration = (file) => {
  const out = execSync(`"${FF}" -hide_banner -i "${file}" -f null - 2>&1`, { encoding: 'utf8' });
  const m = out.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/);
  if (!m) throw new Error(`no duration for ${file}`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
};

const run = (args) => {
  try {
    execFileSync(FF, ['-hide_banner', '-y', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (err) {
    const log = String(err.stderr || err.message);
    throw new Error(`ffmpeg failed: ${args.slice(0, 8).join(' ')}\n${log.split('\n').slice(-12).join('\n')}`);
  }
};

const srtTime = (t) => {
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = Math.floor(t % 60);
  const ms = Math.round((t - Math.floor(t)) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
};

const keys = process.argv[2] ? [process.argv[2]] : Object.keys(CUTS);
let built = 0;

for (const key of keys) {
  const video = COPY.video[key];
  const lines = video.scenes.map((_, i) => path.join(AUDIO, `${key}-${String(i + 1).padStart(2, '0')}.mp3`));
  if (!lines.every((f) => fs.existsSync(f))) { console.log(`${key}: waiting for voiceover (${lines.filter((f) => !fs.existsSync(f)).length} clips missing)`); continue; }

  // Decode first so shot lengths come from the real decoded audio, not the
  // mp3 header, then pad each line so video and voice stay frame-accurate.
  const raws = lines.map((f, i) => {
    const wav = path.join(TMP, `${key}-raw${i}.wav`);
    run(['-i', f, '-ar', '48000', '-ac', '2', wav]);
    return wav;
  });
  const durs = raws.map(duration);
  const shots = durs.map((d) => d + TAIL);
  const total = shots.reduce((a, b) => a + b, 0);
  const audios = raws.map((wav, i) => {
    const padded = path.join(TMP, `${key}-a${i}.wav`);
    run(['-i', wav,
      '-filter_complex', `aevalsrc=0|0:d=${TAIL}:s=48000[sil];[0:a][sil]concat=n=2:v=0:a=1[a]`,
      '-map', '[a]', '-ar', '48000', '-ac', '2', padded]);
    return padded;
  });

  for (const cut of CUTS[key]) {
    const clips = [];
    shots.forEach((d, i) => {
      const frame = path.join(FRAMES, `${key}-${cut.tag}-${String(i + 1).padStart(2, '0')}.png`);
      if (!fs.existsSync(frame)) throw new Error(`missing frame ${frame}`);
      const frames = Math.round(d * FPS);
      const clip = path.join(TMP, `${key}-${cut.tag}-v${i}.mp4`);
      if (!fs.existsSync(clip)) {
      // gentle 6% push-in, held for the length of the line
      run(['-loop', '1', '-i', frame,
        '-filter_complex', `[0:v]zoompan=z='min(1+0.06*on/${frames},1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${cut.w}x${cut.h}:fps=${FPS},format=yuv420p[v]`,
        '-map', '[v]', '-t', String(d), '-r', String(FPS), '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-an', clip]);
      }
      clips.push(clip);
    });

    const listFile = path.join(TMP, `${key}-${cut.tag}-v.txt`);
    fs.writeFileSync(listFile, clips.map((c) => `file '${c}'`).join('\n'));
    const silent = path.join(TMP, `${key}-${cut.tag}-silent.mp4`);
    run(['-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', silent]);

    const aListFile = path.join(TMP, `${key}-a.txt`);
    fs.writeFileSync(aListFile, audios.map((c) => `file '${c}'`).join('\n'));
    const voice = path.join(TMP, `${key}-voice.wav`);
    run(['-f', 'concat', '-safe', '0', '-i', aListFile, '-c', 'copy', voice]);

    const finalPath = path.join(OUT, `${cut.name}.mp4`);
    run(['-i', silent, '-i', voice, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
      '-movflags', '+faststart', '-shortest', finalPath]);
    console.log(`${cut.name}.mp4  ${total.toFixed(1)}s  ${cut.w}x${cut.h}  ${(fs.statSync(finalPath).size / 1e6).toFixed(1)} MB`);
    built += 1;
  }

  // captions (one cue per shot, from the real narration timings)
  const srt = path.join(OUT, `${CUTS[key][0].name}.srt`);
  let t = 0;
  fs.writeFileSync(srt, video.scenes.map((scene, i) => {
    const start = t;
    t += shots[i];
    return `${i + 1}\n${srtTime(start)} --> ${srtTime(t)}\n${scene.onScreen.replace(/\s*·\s*/g, ' — ')}\n`;
  }).join('\n'));
  console.log(`${path.basename(srt)}  ${video.scenes.length} cues`);

  // poster = first frame
  const poster = path.join(OUT, `${CUTS[key][0].name}-poster.png`);
  fs.copyFileSync(path.join(FRAMES, `${key}-${CUTS[key][0].tag}-01.png`), poster);
}

console.log(built ? `\nbuilt ${built} video file(s)` : '\nno video built — voiceover clips missing');
