export type ExtractedScore = {
  obtained: number | null;
  outOf: number | null;
  confidence: number; // 0..1
  method: "fraction" | "out_of" | "label" | "fallback";
  candidates: Array<{ obtained: number; outOf: number | null; raw: string }>;
};

export function extractScoreFromText(params: {
  text: string;
  expectedOutOf?: number;
  labelHint?: string; // e.g. "marks", "score", "total"
}): ExtractedScore {
  const text = normalize(params.text);
  const expectedOutOf = Number.isFinite(params.expectedOutOf) ? params.expectedOutOf : undefined;
  const labelHint = (params.labelHint || "marks").toLowerCase();

  const candidates: ExtractedScore["candidates"] = [];

  // 1) Strong signal: fraction like 23/30
  for (const m of text.matchAll(/\b(\d{1,3})\s*\/\s*(\d{1,3})\b/g)) {
    const obtained = Number(m[1]);
    const outOf = Number(m[2]);
    if (!isFinite(obtained) || !isFinite(outOf)) continue;
    if (outOf <= 0) continue;
    if (obtained < 0 || obtained > outOf) continue;
    candidates.push({ obtained, outOf, raw: m[0] });
  }

  // 2) "out of" phrasing like 23 out of 30
  for (const m of text.matchAll(/\b(\d{1,3})\s*(?:out\s*of)\s*(\d{1,3})\b/g)) {
    const obtained = Number(m[1]);
    const outOf = Number(m[2]);
    if (!isFinite(obtained) || !isFinite(outOf)) continue;
    if (outOf <= 0) continue;
    if (obtained < 0 || obtained > outOf) continue;
    candidates.push({ obtained, outOf, raw: m[0] });
  }

  // Choose the best fraction/out-of candidate first.
  const bestPair = pickBestPair(candidates, expectedOutOf);
  if (bestPair) {
    const method: ExtractedScore["method"] = bestPair.raw.includes("/") ? "fraction" : "out_of";
    return {
      obtained: bestPair.obtained,
      outOf: bestPair.outOf,
      confidence: expectedOutOf && bestPair.outOf === expectedOutOf ? 0.95 : 0.85,
      method,
      candidates
    };
  }

  // 3) If teacher supplies expected outOf, find a single number near a label.
  if (expectedOutOf !== undefined) {
    const obtained = findNearLabelNumber(text, labelHint, expectedOutOf);
    if (obtained !== null) {
      candidates.push({ obtained, outOf: expectedOutOf, raw: `${labelHint}: ${obtained}` });
      return {
        obtained,
        outOf: expectedOutOf,
        confidence: 0.65,
        method: "label",
        candidates
      };
    }
  }

  // 4) Fallback: pick any plausible 0-100 number (low confidence).
  const nums = [...text.matchAll(/\b(\d{1,3})\b/g)].map((m) => Number(m[1])).filter((n) => n >= 0 && n <= 100);
  if (nums.length) {
    const obtained = nums[0];
    candidates.push({ obtained, outOf: expectedOutOf ?? null, raw: String(obtained) });
    return {
      obtained,
      outOf: expectedOutOf ?? null,
      confidence: 0.25,
      method: "fallback",
      candidates
    };
  }

  return { obtained: null, outOf: expectedOutOf ?? null, confidence: 0, method: "fallback", candidates };
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
}

function pickBestPair(
  candidates: Array<{ obtained: number; outOf: number | null; raw: string }>,
  expectedOutOf?: number
) {
  if (!candidates.length) return null;
  const scored = candidates.map((c) => {
    let score = 0;
    if (c.outOf !== null) score += c.outOf; // prefer larger totals
    if (expectedOutOf !== undefined && c.outOf === expectedOutOf) score += 1000;
    if (c.raw.includes("/")) score += 5;
    return { c, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].c;
}

function findNearLabelNumber(text: string, labelHint: string, expectedOutOf: number): number | null {
  // Look for "marks" / "score" / "total" and grab a number within the next 40 chars.
  const labelRe = new RegExp(`\\b${escapeRe(labelHint)}\\b`, "g");
  for (const m of text.matchAll(labelRe)) {
    const start = m.index ?? 0;
    const window = text.slice(start, Math.min(text.length, start + 60));
    const nm = window.match(/\b(\d{1,3})\b/);
    if (!nm) continue;
    const obtained = Number(nm[1]);
    if (obtained >= 0 && obtained <= expectedOutOf) return obtained;
  }
  return null;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

