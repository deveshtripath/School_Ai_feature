import { randomUUID } from "crypto";

import { getFirestoreIfConfigured } from "./persistFirebase.js";

export async function maybePersistManualScore(params: {
  obtained: number | null;
  outOf: number | null;
  confidence: number;
  ocrText: string;
}): Promise<{ id: string; createdAtIso: string }> {
  const id = randomUUID();
  const createdAtIso = new Date().toISOString();

  const db = getFirestoreIfConfigured();
  if (!db) return { id, createdAtIso };

  await db.collection("manual_scores").doc(id).set({
    createdAtIso,
    obtained: params.obtained,
    outOf: params.outOf,
    confidence: params.confidence,
    ocrText: params.ocrText
  });

  return { id, createdAtIso };
}

