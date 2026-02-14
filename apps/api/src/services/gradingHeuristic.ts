import type { QaPair } from "./extractQaPairs.js";
import type { Evaluation } from "./gradingSchema.js";

const STOP_WORDS = new Set([
  "a","an","the","and","or","but","if","then","else","when","while","of","to","in","on","at","by","for","from","with",
  "is","are","was","were","be","been","being","as","it","this","that","these","those","we","you","they","i","he","she",
  "not","no","yes","do","does","did","done","can","could","should","would","may","might","must","will","shall",
  "there","here","than","so","such","also","into","over","under","between","within","without"
]);

export function gradeSubmissionHeuristic(params: {
  modelQa: QaPair[];
  studentQa: QaPair[];
  maxMarksPerQuestion: number;
}): Evaluation {
  const modelById = new Map(params.modelQa.map((q) => [q.questionId, q.text]));
  const studentById = new Map(params.studentQa.map((q) => [q.questionId, q.text]));

  const questionIds = [...new Set([...modelById.keys(), ...studentById.keys()])].sort(
    (a, b) => Number(a) - Number(b)
  );

  const questions = questionIds.map((id) => {
    const modelAnswer = (modelById.get(id) ?? "").trim();
    const studentAnswer = (studentById.get(id) ?? "").trim();
    const maxMarks = params.maxMarksPerQuestion;

    if (!studentAnswer) {
      return {
        questionId: id,
        marksAwarded: 0,
        maxMarks,
        feedback: "No answer detected for this question.",
        deductions: [{ reason: "Blank or unreadable answer", marks: maxMarks }],
        weakAreas: modelAnswer ? extractKeyPhrases(modelAnswer, 6) : []
      };
    }

    if (!modelAnswer) {
      // If the model key is missing for this qid, we can't compare; give 0 with explanation.
      return {
        questionId: id,
        marksAwarded: 0,
        maxMarks,
        feedback: "Model answer for this question was not detected; cannot grade reliably.",
        deductions: [{ reason: "Missing model answer", marks: maxMarks }],
        weakAreas: []
      };
    }

    const sim = cosineSimilarity(modelAnswer, studentAnswer);
    const raw = sim * maxMarks;
    const marksAwarded = clamp(Math.round(raw * 2) / 2, 0, maxMarks); // nearest 0.5

    const missing = missingKeywords(modelAnswer, studentAnswer, 6);
    const deductions =
      marksAwarded === maxMarks
        ? []
        : [
            {
              reason: missing.length ? `Missing key points: ${missing.join(", ")}` : "Answer differs from model key",
              marks: clamp(maxMarks - marksAwarded, 0, maxMarks)
            }
          ];

    const feedback =
      marksAwarded === maxMarks
        ? "Matches the model answer closely."
        : missing.length
          ? `Partially correct. Improve coverage of: ${missing.join(", ")}.`
          : "Partially correct. Add more specific points from the model answer.";

    return {
      questionId: id,
      marksAwarded,
      maxMarks,
      feedback,
      deductions,
      weakAreas: missing
    };
  });

  const maxTotalMarks = questions.reduce((acc, q) => acc + q.maxMarks, 0);
  const totalMarks = questions.reduce((acc, q) => acc + q.marksAwarded, 0);

  const weakAreasAgg = aggregateWeakAreas(questions.flatMap((q) => q.weakAreas));

  return {
    totalMarks,
    maxTotalMarks,
    overallFeedback:
      "Heuristic grading used (free, no LLM). For best accuracy and richer feedback, enable OpenAI billing or use a local LLM.",
    weakAreas: weakAreasAgg,
    confidence: 0.35,
    questions
  };
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
}

function termFreq(tokens: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of tokens) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}

function cosineSimilarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.length === 0 || tb.length === 0) return 0;

  const fa = termFreq(ta);
  const fb = termFreq(tb);

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (const v of fa.values()) normA += v * v;
  for (const v of fb.values()) normB += v * v;

  for (const [k, va] of fa.entries()) {
    const vb = fb.get(k) ?? 0;
    dot += va * vb;
  }

  if (normA === 0 || normB === 0) return 0;
  return clamp(dot / (Math.sqrt(normA) * Math.sqrt(normB)), 0, 1);
}

function extractKeyPhrases(modelAnswer: string, limit: number): string[] {
  const tokens = tokenize(modelAnswer).filter((t) => t.length >= 5);
  const freq = termFreq(tokens);
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([w]) => w);
}

function missingKeywords(modelAnswer: string, studentAnswer: string, limit: number): string[] {
  const modelTokens = tokenize(modelAnswer).filter((t) => t.length >= 5);
  const studentSet = new Set(tokenize(studentAnswer));
  const freq = termFreq(modelTokens);

  const missing = [...freq.entries()]
    .filter(([w]) => !studentSet.has(w))
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([w]) => w);

  return missing;
}

function aggregateWeakAreas(areas: string[]): string[] {
  const freq = new Map<string, number>();
  for (const a of areas) freq.set(a, (freq.get(a) ?? 0) + 1);
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([w]) => w);
}

