import { randomUUID } from "crypto";

import type { GeneratedPaper, PaperSpec } from "./paperSchema.js";
import { getFirestoreIfConfigured } from "./persistFirebase.js";

export async function maybePersistPaper(params: {
  spec: PaperSpec;
  paper: GeneratedPaper;
}): Promise<{ paperId: string; createdAtIso: string }> {
  const paperId = randomUUID();
  const createdAtIso = new Date().toISOString();

  const db = getFirestoreIfConfigured();
  if (!db) return { paperId, createdAtIso };

  await db.collection("papers").doc(paperId).set({
    createdAtIso,
    spec: params.spec,
    paper: params.paper
  });

  return { paperId, createdAtIso };
}

export async function getPaperIfConfigured(paperId: string): Promise<{ createdAtIso: string; spec: PaperSpec; paper: GeneratedPaper } | null> {
  const db = getFirestoreIfConfigured();
  if (!db) return null;
  const snap = await db.collection("papers").doc(paperId).get();
  if (!snap.exists) return null;
  const data = snap.data() as any;
  if (!data?.paper || !data?.spec || !data?.createdAtIso) return null;
  return { createdAtIso: String(data.createdAtIso), spec: data.spec as PaperSpec, paper: data.paper as GeneratedPaper };
}

