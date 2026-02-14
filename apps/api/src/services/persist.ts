import { randomUUID } from "crypto";

import type { Evaluation } from "./gradingSchema.js";
import { getFirestoreIfConfigured } from "./persistFirebase.js";

export async function maybePersistEvaluation(params: {
  evaluation: Evaluation;
  modelText: string;
  studentText: string;
}): Promise<{ evaluationId: string; createdAtIso: string }> {
  const evaluationId = randomUUID();
  const createdAtIso = new Date().toISOString();

  const db = getFirestoreIfConfigured();
  if (!db) return { evaluationId, createdAtIso };

  await db.collection("evaluations").doc(evaluationId).set({
    createdAtIso,
    evaluation: params.evaluation,
    modelText: params.modelText,
    studentText: params.studentText
  });

  return { evaluationId, createdAtIso };
}

export async function getEvaluationIfConfigured(
  evaluationId: string
): Promise<{ createdAtIso: string; evaluation: Evaluation } | null> {
  const db = getFirestoreIfConfigured();
  if (!db) return null;
  const snap = await db.collection("evaluations").doc(evaluationId).get();
  if (!snap.exists) return null;
  const data = snap.data() as any;
  if (!data?.evaluation || !data?.createdAtIso) return null;
  return { createdAtIso: String(data.createdAtIso), evaluation: data.evaluation as Evaluation };
}
