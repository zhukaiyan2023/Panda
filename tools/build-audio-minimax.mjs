// tools/build-audio-minimax.mjs — synthesize every cue in one child voice.
//
// This is the builder that replaces the five provider-specific scripts. The
// cue list comes from tools/cue-manifest.mjs, which derives from data/pools.js,
// so this script has no pool math of its own to drift out of sync.
//
// Why one script and one voice: the assets had accumulated from four different
// providers, leaving ~536 cues in Edge's adult "Xiaoxiao" voice while the rest
// were Tencent's child voice. A child hears the narrator change mid-lesson.
// Rebuilding the whole manifest through a single provider is the only way to
// guarantee that can't happen again.
//
// Usage:
//   MINIMAX_API_KEY=... node tools/build-audio-minimax.mjs           # missing only
//   MINIMAX_API_KEY=... node tools/build-audio-minimax.mjs --force   # rebuild all
//   MINIMAX_API_KEY=... node tools/build-audio-minimax.mjs --only l2-s1-9-8
//   node tools/build-audio-minimax.mjs --dry-run
//
// Resumable by design: a cue whose mp3 already exists is skipped unless
// --force. A run interrupted at cue 700 of 1009 picks up where it stopped.

import { existsSync, mkdirSync, renameSync, statSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildManifest } from "./cue-manifest.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = resolve(ROOT, "assets/audio");

const API = "https://api.minimaxi.com/v1/t2a_v2";

// Voice tuning for the audience. `lovely_girl` is MiniMax's young-girl system
// voice. Speed is below 1.0 because these are arithmetic instructions for a
// 3-year-old: at default pace the digits run together and the child loses the
// number before the sentence ends.
const VOICE_ID = process.env.MINIMAX_VOICE_ID || "lovely_girl";
const MODEL = process.env.MINIMAX_TTS_MODEL || "speech-02-hd";
const SPEED = Number(process.env.MINIMAX_TTS_SPEED || 0.85);
const VOL = Number(process.env.MINIMAX_TTS_VOL || 5);

const CONCURRENCY = Number(process.env.MINIMAX_CONCURRENCY || 2);
// Speech-only mono cues at 24 kHz / 64 kbps stay clear while keeping the whole
// 1009-cue set to roughly 40 MB. The HD default (32 kHz / 128 kbps) sounds no
// better for a single voice reading digits but quadruples what ships to the
// iPad and what lands in git history.
const SAMPLE_RATE = Number(process.env.MINIMAX_TTS_SAMPLE_RATE || 24000);
const BITRATE = Number(process.env.MINIMAX_TTS_BITRATE || 64000);
const MAX_ATTEMPTS = 8;
// A truncated or error-page response can still be a few hundred bytes. Any
// real spoken cue is far larger, so this catches silent corruption that would
// otherwise only surface as a cue that plays nothing.
const MIN_BYTES = 2000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function synthesize(text) {
  const res = await fetch(API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.MINIMAX_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      text,
      stream: false,
      voice_setting: { voice_id: VOICE_ID, speed: SPEED, vol: VOL },
      audio_setting: { sample_rate: SAMPLE_RATE, bitrate: BITRATE, format: "mp3" },
    }),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();

  const hex = data?.data?.audio;
  if (hex) return Buffer.from(hex, "hex");

  const url = data?.data?.audio_url;
  if (url) {
    const audio = await fetch(url);
    if (!audio.ok) throw new Error(`audio_url HTTP ${audio.status}`);
    return Buffer.from(await audio.arrayBuffer());
  }

  // Surface MiniMax's own status message — it distinguishes a rate limit from
  // a bad voice id, which matters when 1000 cues are queued behind it.
  const msg = data?.base_resp?.status_msg || JSON.stringify(data).slice(0, 200);
  throw new Error(`no audio in response: ${msg}`);
}

async function writeCue(cue) {
  const finalPath = resolve(OUT_DIR, `${cue.id}.mp3`);
  // Write to a temp file and rename, so an interrupted run can never leave a
  // half-written mp3 that a later --skip-existing pass would treat as done.
  const tmpPath = `${finalPath}.part`;

  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const buf = await synthesize(cue.text);
      if (buf.length < MIN_BYTES) {
        throw new Error(`suspiciously small audio (${buf.length} bytes)`);
      }
      writeFileSync(tmpPath, buf);
      renameSync(tmpPath, finalPath);
      return buf.length;
    } catch (err) {
      lastErr = err;
      try { if (existsSync(tmpPath)) unlinkSync(tmpPath); } catch { /* best effort */ }
      if (attempt < MAX_ATTEMPTS) {
        // Back off harder on rate-limit errors: MiniMax's quota resets over
        // minutes, not seconds, so the exponential below gives a real cooldown
        // for the 429s while keeping transient blips cheap.
        const rateLimited = /429|rate|limit|quota/i.test(err.message);
        const delayMs = rateLimited
          ? 30000 * 2 ** (attempt - 1)
          : 600 * 2 ** (attempt - 1);
        await sleep(delayMs);
      }
    }
  }
  throw lastErr;
}

async function runPool(items, worker, concurrency) {
  let next = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await worker(items[i], i);
    }
  });
  await Promise.all(runners);
}

async function main() {
  const argv = process.argv.slice(2);
  const force = argv.includes("--force");
  const dryRun = argv.includes("--dry-run");
  const onlyIdx = argv.indexOf("--only");
  const only = onlyIdx !== -1 ? argv[onlyIdx + 1] : null;

  let manifest = buildManifest();
  if (only) {
    manifest = manifest.filter((c) => c.id === only);
    if (!manifest.length) {
      console.error(`ERROR: no cue with id "${only}"`);
      return 1;
    }
  }

  mkdirSync(OUT_DIR, { recursive: true });

  const todo = manifest.filter((c) => {
    if (force) return true;
    const p = resolve(OUT_DIR, `${c.id}.mp3`);
    return !existsSync(p) || statSync(p).size < MIN_BYTES;
  });

  console.log(`manifest: ${manifest.length} cues, to synthesize: ${todo.length}`);
  console.log(`voice: ${VOICE_ID}  model: ${MODEL}  speed: ${SPEED}`);

  if (dryRun) {
    for (const c of todo.slice(0, 10)) console.log(`  ${c.id}  ${c.text}`);
    if (todo.length > 10) console.log(`  ... and ${todo.length - 10} more`);
    return 0;
  }
  if (!todo.length) {
    console.log("nothing to do");
    return 0;
  }
  if (!process.env.MINIMAX_API_KEY) {
    console.error("ERROR: MINIMAX_API_KEY is not set");
    return 1;
  }

  const failures = [];
  let done = 0;

  await runPool(todo, async (cue) => {
    try {
      await writeCue(cue);
    } catch (err) {
      failures.push({ id: cue.id, error: err.message });
    }
    done++;
    if (done % 25 === 0 || done === todo.length) {
      console.log(`  ${done}/${todo.length} (${failures.length} failed)`);
    }
  }, CONCURRENCY);

  if (failures.length) {
    console.error(`\n${failures.length} cue(s) failed:`);
    for (const f of failures.slice(0, 20)) console.error(`  ${f.id}: ${f.error}`);
    console.error("\nRe-run without --force to retry only the missing ones.");
    return 1;
  }

  console.log(`\nOK — ${todo.length} cues written in ${VOICE_ID}`);
  return 0;
}

main().then((code) => process.exit(code)).catch((err) => {
  console.error(`FATAL: ${err.message}`);
  process.exit(1);
});
