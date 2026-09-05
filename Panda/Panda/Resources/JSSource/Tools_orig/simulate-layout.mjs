// tools/simulate-layout.mjs — code-level simulation of expression.js's
// slot layout math, applied to every box→digit reveal path across L1/L2/L3/L4.
// Verifies that the slotCenters are stable across the "?" → digit (and
// "?" → 2-digit) reveals that occur in each level.
//
// We don't need to drive the browser — just run the slot-width math from
// components/expression.js (extracted to a local helper here so we don't
// pull in kaplay) and assert slotCenters are stable across every reveal.

const OP_SCALE = 0.7;
function estimateWidth(text, nodeSize, isBox) {
  if (isBox) return nodeSize * 0.9;
  if (text === "+" || text === "-" || text === "=" || text === "×" ||
      text === "÷" || text === "(" || text === ")" || text === ">" || text === "<") {
    return nodeSize * 0.4;
  }
  return nodeSize * (0.62 + (String(text).length - 1) * 0.62);
}
function isBox(text, boxMode) {
  if (!boxMode) return false;
  return text === "?" || text === "□";
}
function layout(slots, x, size, boxMode = false, reserve = []) {
  const widths = slots.map((slot, i) => {
    const isB = isBox(slot, boxMode);
    const op = !isB && (slot === "+" || slot === "-" || slot === "=" || slot === "×" ||
                         slot === "÷" || slot === "(" || slot === ")" || slot === ">" || slot === "<");
    const nodeSize = isB ? size : (op ? Math.round(size * OP_SCALE) : size);
    const own = isB ? estimateWidth(slot, nodeSize, true) : estimateWidth(slot, nodeSize);
    return reserve[i] == null ? own : Math.max(own, isBox(reserve[i], boxMode) ? estimateWidth(reserve[i], nodeSize, true) : estimateWidth(reserve[i], nodeSize));
  });
  const MIN_EDGE_GAP = size * 0.22;
  const totalWidth = widths.reduce((a, b) => a + b, 0) + MIN_EDGE_GAP * Math.max(0, slots.length - 1);
  let cursor = x - totalWidth / 2;
  const centers = widths.map((w) => {
    const center = cursor + w / 2;
    cursor += w + MIN_EDGE_GAP;
    return center;
  });
  return { widths, centers, totalWidth };
}

const barX = 748;

// Helper to test a single layout transition.
function checkTransition(label, before, after, targetSlot = null) {
  const size = before.size || 90;
  const x = before.x || barX;
  const beforeLayout = layout(before.slots, x, size, before.boxMode || false, before.reserve || []);
  const afterLayout = layout(after.slots, x, size, after.boxMode || false, after.reserve || []);
  const slotCount = Math.min(beforeLayout.centers.length, afterLayout.centers.length);
  const drifts = [];
  for (let i = 0; i < slotCount; i++) {
    drifts.push(afterLayout.centers[i] - beforeLayout.centers[i]);
  }
  const maxDrift = Math.max(...drifts.map(Math.abs));
  const status = maxDrift > 0.01 ? "❌ SHIFT" : "✅ locked";
  const focusStr = targetSlot != null ? `, slot ${targetSlot} drift=${drifts[targetSlot].toFixed(3)}` : "";
  console.log(`  ${status} ${label}: maxDrift=${maxDrift.toFixed(3)}px${focusStr}`);
  return maxDrift;
}

console.log("\n=== L1 (三数相加, sum ≤ 10) ===");
// L1 anchor "a + b + c = ?" → "a + b + c = answer"
// Size=90, anchor at y=360
// Reserve = [null, null, null, null, null, null, "10"] (max content 2 digits)
checkTransition("L1 anchor 1+1+8=□ → 1+1+8=10",
  { slots: [1, "+", 1, "+", 8, "=", "□"], reserve: [null, null, null, null, null, null, "10"], size: 90 },
  { slots: [1, "+", 1, "+", 8, "=", "10"], reserve: [null, null, null, null, null, null, "10"], size: 90 },
  6,
);
checkTransition("L1 anchor 9+1+0=□ → 9+1+0=10 (max)",
  { slots: [9, "+", 1, "+", 0, "=", "□"], reserve: [null, null, null, null, null, null, "10"], size: 90 },
  { slots: [9, "+", 1, "+", 0, "=", "10"], reserve: [null, null, null, null, null, null, "10"], size: 90 },
  6,
);
// Simplified preview "□ + c = □" → "pairSum + c = answer"
// Size=82, boxMode=true, reserve=["10", null, null, null, "10"]
checkTransition("L1 simplified preview □+2=□ → 4+2=6",
  { slots: ["□", "+", 2, "=", "□"], reserve: ["10", null, null, null, "10"], size: 82, boxMode: true },
  { slots: [4, "+", 2, "=", "6"], reserve: ["10", null, null, null, "10"], size: 82, boxMode: true },
);
// Pair-sum eq "a + b = ?" → "a + b = pairSum" (1-digit pairSum max 9, reserved to "10")
checkTransition("L1 pair-sum eq 7+2=□ → 7+2=9",
  { slots: [7, "+", 2, "=", "□"], reserve: [null, null, null, null, "10"], size: 82 },
  { slots: [7, "+", 2, "=", 9], reserve: [null, null, null, null, "10"], size: 82 },
  4,
);

console.log("\n=== L2 (凑十, sum 11-17) ===");
// L2 anchor "a + b + c = ?" → "a + b + c = answer" (2-digit)
// Size=100, reserve=[null, null, null, null, null, null, round.answer]
checkTransition("L2 anchor 3+2+8=□ → 3+2+8=13",
  { slots: [3, "+", 2, "+", 8, "=", "?"], reserve: [null, null, null, null, null, null, "13"], size: 100 },
  { slots: [3, "+", 2, "+", 8, "=", 13], reserve: [null, null, null, null, null, null, "13"], size: 100 },
  6,
);
checkTransition("L2 anchor 1+9+7=□ → 1+9+7=17 (max)",
  { slots: [1, "+", 9, "+", 7, "=", "?"], reserve: [null, null, null, null, null, null, "17"], size: 100 },
  { slots: [1, "+", 9, "+", 7, "=", 17], reserve: [null, null, null, null, null, null, "17"], size: 100 },
  6,
);
// L2 step 1 sub "? + ? = 10" — boxMode, reserve=["10", null, "10", null, null]
// Stays as "? + ? = 10" throughout step 1, no box→digit reveal in step 1 sub itself.
checkTransition("L2 step-1 sub ?+?=10 (no reveal)",
  { slots: ["?", "+", "?", "=", 10], reserve: ["10", null, "10", null, null], size: 82, boxMode: true },
  { slots: ["?", "+", "?", "=", 10], reserve: ["10", null, "10", null, null], size: 82, boxMode: true },
);
// L2 step 2 sub "10 + a = ?" → "10 + a = answer" (2-digit)
checkTransition("L2 step-2 sub 10+3=? → 10+3=13",
  { slots: [10, "+", 3, "=", "?"], reserve: [null, null, null, null, "13"], size: 82 },
  { slots: [10, "+", 3, "=", 13], reserve: [null, null, null, null, "13"], size: 82 },
  4,
);

console.log("\n=== L3 (凑十法, sum 11-18) ===");
// L3 anchor "a + b = ?" → "a + b = answer" (5 slots, 2-digit)
checkTransition("L3 anchor 9+8=? → 9+8=17",
  { slots: [9, "+", 8, "=", "□"], reserve: [null, null, null, null, "17"], size: 100, boxMode: true },
  { slots: [9, "+", 8, "=", 17], reserve: [null, null, null, null, "17"], size: 100 },
  4,
);
// L3 compare sub (step 1): "□  □  □" with reserve=[null, "□", null] — aIsBig or aIsSmall box → digit
// Step 1 reveal: middle "□" → "<" or ">". The "□" is reserved to "□" so width stays.
checkTransition("L3 compare sub □□□ → □<□ (a<b)",
  { slots: [9, "<", 5], reserve: [null, "□", null], size: 82 },
  { slots: [9, "<", 5], reserve: [null, "□", null], size: 82 }, // no reveal of boxes here
);
// L3 step 2 sub1: "[10] + [□] + [c] = [answer]" — slot 2 reserved to "10"
// 7 slots, size=82
checkTransition("L3 step2-sub1 10+□+5=? → 10+5+5=15 (aIsSmall)",
  { slots: [10, "+", "□", "+", 5, "=", "?"], reserve: ["10", null, "10", null, null, null, "15"], size: 82, boxMode: true },
  { slots: [10, "+", 5, "+", 5, "=", 15], reserve: ["10", null, "10", null, null, null, "15"], size: 82 },
);
// L3 step 2 sub2: "[10] + [□] = [10]" (5 slots) — slot 2 reserved to "10"
checkTransition("L3 step2-sub2 10+□=10 → 10+0=10 (aIsSmall)",
  { slots: [10, "+", "□", "=", 10], reserve: [null, null, "10", null, null], size: 82, boxMode: true },
  { slots: [10, "+", 0, "=", 10], reserve: [null, null, "10", null, null], size: 82 },
);

console.log("\n=== L4 (二十以内, sum 11-20) ===");
// L4 anchor "a + b = ?" → "a + b = answer" (5 slots, 2-digit answer)
// reserve=[a, "+", b, "=", answer]
checkTransition("L4 anchor 8+5=? → 8+5=13",
  { slots: [8, "+", 5, "=", "?"], reserve: [8, "+", 5, "=", 13], size: 90 },
  { slots: [8, "+", 5, "=", 13], reserve: [8, "+", 5, "=", 13], size: 90 },
  4,
);
checkTransition("L4 anchor 9+9=? → 9+9=18",
  { slots: [9, "+", 9, "=", "?"], reserve: [9, "+", 9, "=", 18], size: 90 },
  { slots: [9, "+", 9, "=", 18], reserve: [9, "+", 9, "=", 18], size: 90 },
  4,
);
// L4 split "10 + □ + b = ?" → "10 + ones + b = answer" (7 slots)
// reserve=[TEN, "+", "□", "+", b, "=", answer]. Note: expression.js
// auto-detects boxMode from slots/reserve, so it's true in BOTH states.
checkTransition("L4 split 10+□+5=? → 10+3+5=13",
  { slots: [10, "+", "□", "+", 5, "=", "?"], reserve: [10, "+", "□", "+", 5, "=", 13], size: 82, boxMode: true },
  { slots: [10, "+", 3, "+", 5, "=", 13], reserve: [10, "+", "□", "+", 5, "=", 13], size: 82, boxMode: true },
);
// L4 bottom "10 + □ = ?" → "10 + onesSum = answer" (5 slots)
checkTransition("L4 bottom 10+□=? → 10+3=13",
  { slots: [10, "+", "□", "=", "?"], reserve: [10, "+", "□", "=", 13], size: 82, boxMode: true },
  { slots: [10, "+", 3, "=", 13], reserve: [10, "+", "□", "=", 13], size: 82, boxMode: true },
);

console.log("\n=== Done ===");