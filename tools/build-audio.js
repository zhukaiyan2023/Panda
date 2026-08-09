#!/usr/bin/env node
// tools/build-audio.js — generate the 54 pre-baked audio cues via Azure Speech F0.
//
// Usage:
//   node tools/build-audio.js            # generate all cues
//   node tools/build-audio.js --dry-run  # list what would be generated, write nothing
//
// Required env (loaded from .env if present):
//   AZURE_SPEECH_KEY       — Azure Speech resource key (F0 free tier works)
//   AZURE_SPEECH_REGION    — Azure region, e.g. eastasia
//   AZURE_SPEECH_VOICE     — voice short name, default zh-CN-XiaoxiaoNeural
//   AZURE_SPEECH_LANG      — SSML xml:lang, default zh-CN
//   AZURE_SPEECH_FORMAT    — output format, default audio-24khz-48kbitrate-mono-mp3
//
// The voice + lang defaults are tuned for the Chinese-language cues in
// tools/cues.cjs. Override via env if you want to point at a different voice
// (e.g. zh-CN-YunxiNeural for a male voice, or en-US-JennyNeural with lang
// en-US for an English voiceover pass).

const fs = require("fs");
const path = require("path");

const CUES = require("./cues.cjs");

function loadDotenv() {
  const envPath = path.resolve(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

async function synthesizeOne({ key, region, voice, lang, format }, cue) {
  const url = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
  const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${lang}'>
    <voice name='${voice}'>${escapeXml(cue.text)}</voice>
  </speak>`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": key,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": format,
      "User-Agent": "panda-build-audio",
    },
    body: ssml,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Azure TTS failed for ${cue.id}: ${res.status} ${res.statusText}\n${detail}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const out = path.resolve(__dirname, "..", "assets", "audio", `${cue.id}.mp3`);
  fs.writeFileSync(out, buf);
}

function escapeXml(s) {
  return s.replace(/[<>&'"]/g, c => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;",
  }[c]));
}

(async () => {
  loadDotenv();
  const dryRun = process.argv.includes("--dry-run");

  if (dryRun) {
    console.log(`Would generate ${CUES.length} cues to assets/audio/: ${CUES.map(c => c.id).join(", ")}`);
    return;
  }

  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION || "eastasia";
  const voice = process.env.AZURE_SPEECH_VOICE || "zh-CN-XiaoxiaoNeural";
  const lang = process.env.AZURE_SPEECH_LANG || "zh-CN";
  const format = process.env.AZURE_SPEECH_FORMAT || "audio-24khz-48kbitrate-mono-mp3";

  if (!key) {
    console.error("AZURE_SPEECH_KEY is required. Copy .env.example to .env and fill it in.");
    process.exit(2);
  }

  const cfg = { key, region, voice, lang, format };
  let ok = 0;
  for (const cue of CUES) {
    try {
      await synthesizeOne(cfg, cue);
      ok++;
      console.log(`ok  ${cue.id} (${cue.text})`);
    } catch (err) {
      console.error(`FAIL ${cue.id}: ${err.message}`);
    }
  }
  console.log(`Generated ${ok}/${CUES.length} cues (voice=${voice}, lang=${lang}).`);
})();