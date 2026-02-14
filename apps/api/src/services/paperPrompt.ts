import type { PaperSpec } from "./paperSchema.js";

export function buildPaperPrompt(spec: PaperSpec) {
  const chapters = spec.chapters.length ? spec.chapters.join(", ") : "Not specified";
  const topics = spec.topics.length ? spec.topics.join(", ") : "Not specified";
  const board = spec.board ? spec.board : "Not specified";
  const duration = spec.durationMinutes ? `${spec.durationMinutes} minutes` : "Not specified";

  const sectionLines = spec.sections
    .map((s) => `- ${s.title}: ${s.numQuestions} questions, ${s.marksEach} marks each (type: ${s.type})${s.notes ? `; ${s.notes}` : ""}`)
    .join("\n");

  const extraInstructions = spec.instructions.length
    ? "Additional instructions:\n" + spec.instructions.map((i) => `- ${i}`).join("\n")
    : "";

  return [
    "You are an exam question paper setter.",
    "Generate a complete, exam-ready paper as JSON only (no markdown).",
    "",
    `Class: ${spec.classLevel}`,
    `Subject: ${spec.subject}`,
    `Board: ${board}`,
    `Chapters: ${chapters}`,
    `Topics: ${topics}`,
    `Total marks: ${spec.totalMarks}`,
    `Duration: ${duration}`,
    `Difficulty: ${spec.difficulty}`,
    "",
    "Paper requirements:",
    sectionLines,
    "",
    "Rules:",
    "- All questions must be unique and aligned to the given class/board.",
    "- Keep language clear and exam-appropriate.",
    "- Ensure total marks matches exactly.",
    "- For MCQs: include 4 options and set correctOptionIndex.",
    "- For non-MCQs: set options=null and correctOptionIndex=null.",
    "- Always include header.board (string or null) and header.durationMinutes (number or null).",
    "- Always include answerKey.explanation (string or null) and markingScheme.marksBreakdown (array or null).",
    "- Provide answerKey for every questionId.",
    "- Provide markingScheme for every questionId (key points and marks).",
    extraInstructions
  ]
    .filter(Boolean)
    .join("\n");
}
