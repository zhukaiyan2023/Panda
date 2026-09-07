// components/mathEngine.js — single source of truth for question validation and choices.
// Keeps learning logic independent from Kaplay rendering.

export function validateAdditionRound(round) {
  if (!round || !Number.isInteger(round.a) || !Number.isInteger(round.b)) return false;
  if (!Number.isInteger(round.answer) || round.a + round.b !== round.answer) return false;
  if (round.missing != null && round.missing !== round.b) return false;
  if (round.need != null && round.a + round.need !== 10) return false;
  if (round.rest != null && round.need != null && round.need + round.rest !== round.b) return false;
  return true;
}

export function getCorrectAnswer(round, mode = "missing") {
  if (mode === "make-ten") return round.need ?? (10 - round.a);
  return round.missing ?? round.b;
}

export function makeChoices(correct, { min = 0, max = 20, distractors = [] } = {}) {
  const candidates = [
    ...distractors,
    correct + 1,
    correct - 1,
    correct + 2,
    correct - 2,
    correct + 3,
  ];
  const unique = [];
  for (const value of candidates) {
    if (!Number.isInteger(value) || value < min || value > max || value === correct) continue;
    if (!unique.includes(value)) unique.push(value);
    if (unique.length === 3) break;
  }
  return shuffle([correct, ...unique]);
}

export function getHint(round, mode = "missing") {
  if (mode === "make-ten") {
    const need = getCorrectAnswer(round, mode);
    return `Start at ${round.a}. Count ${need} more to make 10.`;
  }
  return `Start with ${round.a}. Count ${round.b} more.`;
}

export function shuffle(values) {
  const copy = values.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
