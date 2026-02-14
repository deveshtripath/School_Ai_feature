export type QaPair = { questionId: string; text: string };

export function extractQaPairs(rawText: string): QaPair[] {
  const text = rawText.replace(/\r\n/g, "\n").trim();
  if (!text) return [];

  const markers: Array<{ idx: number; qid: string; markerLen: number }> = [];

  // Matches: "Q1:", "Question 1 -", "1.", "1)"
  const re = /(^|\n)\s*(?:Q(?:uestion)?\s*)?(\d{1,3})\s*[:.)-]\s*/gi;
  for (;;) {
    const m = re.exec(text);
    if (!m) break;
    const full = m[0];
    const qid = String(m[2]);
    const idx = (m.index ?? 0) + (m[1]?.length ?? 0);
    markers.push({ idx, qid, markerLen: full.length - (m[1]?.length ?? 0) });
  }

  if (markers.length === 0) return [{ questionId: "1", text }];

  const pairs: QaPair[] = [];
  for (let i = 0; i < markers.length; i++) {
    const start = markers[i].idx + markers[i].markerLen;
    const end = i + 1 < markers.length ? markers[i + 1].idx : text.length;
    const chunk = text.slice(start, end).trim();
    pairs.push({ questionId: markers[i].qid, text: chunk });
  }

  // De-dup question ids by keeping the last occurrence (common in scanned pages with repeated headers).
  const byId = new Map<string, QaPair>();
  for (const p of pairs) byId.set(p.questionId, p);
  return [...byId.values()].sort((a, b) => Number(a.questionId) - Number(b.questionId));
}

