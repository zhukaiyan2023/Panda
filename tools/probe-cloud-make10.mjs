// tools/probe-cloud-make10.mjs — verify every cloud-game make10 round has
// at least one pair of addends that sums to exactly 10, the resolved sum
// equals 10 + decoy, and all answer choices are in [9, 21].
//
// Mirrors buildMake10Round / buildMakeSmallRound / pickWrongs from
// scenes/gameCloud.js inline so the probe stays self-contained (the real
// file imports kaplay components that don't run under node). Keep the
// logic in sync — drift here is silent.

const PAIRS_EQ10 = [
  [1, 9], [2, 8], [3, 7], [4, 6], [5, 5],
  [9, 1], [8, 2], [7, 3], [6, 4],
];

function pickWrongs(correct, count, lo, hi, offsets) {
  const wrongs = [];
  let attempts = 0;
  while (wrongs.length < count && attempts < 120) {
    const offset = offsets[Math.floor(Math.random() * offsets.length)];
    const w = correct + offset;
    if (w >= lo && w <= hi && w !== correct && !wrongs.includes(w)) {
      wrongs.push(w);
    }
    attempts++;
  }
  if (wrongs.length < count) {
    for (let d = 1; d <= 5 && wrongs.length < count; d++) {
      for (const sign of [-1, 1]) {
        const w = correct + sign * d;
        if (w >= lo && w <= hi && w !== correct && !wrongs.includes(w)) {
          wrongs.push(w);
          if (wrongs.length >= count) break;
        }
      }
    }
  }
  return wrongs.slice(0, count);
}

function buildMake10Round() {
  const pair = PAIRS_EQ10[Math.floor(Math.random() * PAIRS_EQ10.length)];
  const decoy = 1 + Math.floor(Math.random() * 9);
  const correct = 10 + decoy;
  const addends = [pair[0], pair[1], decoy];
  const wrongs = pickWrongs(correct, 3, 9, 21, [-2, -1, 1, 2, 3]);
  return {
    type: "make10",
    pair: [pair[0], pair[1]],
    decoy,
    addends,
    answerChoices: [correct, ...wrongs],
    correct,
  };
}

function buildMakeSmallRound() {
  let a, b, c;
  let attempts = 0;
  do {
    a = 1 + Math.floor(Math.random() * 5);
    b = 1 + Math.floor(Math.random() * 5);
    c = 1 + Math.floor(Math.random() * 5);
    attempts++;
    if (attempts > 60) break;
  } while (a + b + c > 10 || a + b === 10 || a + c === 10 || b + c === 10);
  const correct = a + b + c;
  const addends = [a, b, c];
  const wrongs = pickWrongs(correct, 3, 1, 11, [-2, -1, 1, 2]);
  return { type: "makeSmall", addends, answerChoices: [correct, ...wrongs], correct };
}

const ROUND_TYPES = ["make10", "makeSmall", "make10", "makeSmall", "make10"];

const N = 10000;
const failures = [];
const samples = [];

for (let i = 0; i < N; i++) {
  for (let r = 0; r < ROUND_TYPES.length; r++) {
    const round = ROUND_TYPES[r] === "make10" ? buildMake10Round() : buildMakeSmallRound();
    if (round.type !== "make10") continue;
    const [a, b, c] = round.addends;
    const sums = [a + b, a + c, b + c];
    const hasFriendOf10 = sums.some((s) => s === 10);
    const totalIs10PlusDecoy = round.correct === 10 + round.decoy;
    const allChoicesInRange = round.answerChoices.every((v) => v >= 9 && v <= 21);
    const oneCorrectAmongChoices = round.answerChoices.filter((v) => v === round.correct).length === 1;
    const exactlyFourChoices = round.answerChoices.length === 4;
    if (!hasFriendOf10 || !totalIs10PlusDecoy || !allChoicesInRange
        || !oneCorrectAmongChoices || !exactlyFourChoices) {
      failures.push({
        idx: i, round: r, addends: round.addends, decoy: round.decoy,
        correct: round.correct, sums, hasFriendOf10, totalIs10PlusDecoy,
        allChoicesInRange, oneCorrectAmongChoices, exactlyFourChoices,
        choices: round.answerChoices,
      });
    }
    if (i < 6 && r === 0) samples.push(round);  // show first make10 from each first 6 sessions
  }
}

console.log(`Sampled ${N * 3} make10 rounds.`);
console.log(`Failures: ${failures.length}`);
if (failures.length > 0) {
  console.log("\nFirst few failures:");
  for (const f of failures.slice(0, 5)) console.log(JSON.stringify(f, null, 2));
  process.exit(1);
}

console.log("\nSample of 6 rounds (session 0, round 0):");
for (const s of samples) console.log(JSON.stringify(s));
console.log("\nAll assertions pass. ✓");