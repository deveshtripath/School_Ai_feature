import PDFDocument from "pdfkit";

import type { GeneratedPaper } from "./paperSchema.js";

export async function buildQuestionPaperPdf(params: { paper: GeneratedPaper; paperId?: string; createdAtIso?: string }) {
  const doc = new PDFDocument({ margin: 48 });
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c as Buffer));

  const { paper } = params;

  doc.fontSize(18).text(paper.title || "Question Paper");
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor("#555");
  if (params.paperId) doc.text(`Paper ID: ${params.paperId}`);
  if (params.createdAtIso) doc.text(`Created: ${params.createdAtIso}`);
  doc.fillColor("#000");
  doc.moveDown();

  doc.fontSize(11).text(`Class: ${paper.header.classLevel}    Subject: ${paper.header.subject}    Board: ${paper.header.board ?? "-"}`);
  doc.text(`Total Marks: ${paper.header.totalMarks}    Duration: ${paper.header.durationMinutes ?? "-"}    Difficulty: ${paper.header.difficulty}`);
  doc.moveDown();

  if (paper.instructions?.length) {
    doc.fontSize(12).text("Instructions:");
    doc.fontSize(10);
    for (const inst of paper.instructions) doc.text(`- ${inst}`);
    doc.moveDown();
  }

  for (const section of paper.sections) {
    doc.fontSize(13).text(section.title);
    doc.fontSize(10).fillColor("#333").text(`Type: ${section.type}    Marks each: ${section.marksEach}`);
    doc.fillColor("#000");
    doc.moveDown(0.4);

    for (let i = 0; i < section.questions.length; i++) {
      const q = section.questions[i];
      doc.fontSize(11).text(`${q.id}. (${q.marks}) ${q.question}`);
      if (q.options?.length) {
        doc.fontSize(10).fillColor("#333");
        const letters = ["A", "B", "C", "D", "E", "F"];
        q.options.slice(0, 6).forEach((opt, idx) => doc.text(`   ${letters[idx]}. ${opt}`));
        doc.fillColor("#000");
      }
      doc.moveDown(0.4);
    }

    doc.moveDown(0.6);
  }

  doc.end();
  await new Promise<void>((resolve) => doc.on("end", () => resolve()));
  return Buffer.concat(chunks);
}

export async function buildSolutionPdf(params: { paper: GeneratedPaper; paperId?: string; createdAtIso?: string }) {
  const doc = new PDFDocument({ margin: 48 });
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c as Buffer));

  const { paper } = params;

  doc.fontSize(18).text((paper.title ? `${paper.title} - Solutions` : "Solutions / Answer Key"));
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor("#555");
  if (params.paperId) doc.text(`Paper ID: ${params.paperId}`);
  if (params.createdAtIso) doc.text(`Created: ${params.createdAtIso}`);
  doc.fillColor("#000");
  doc.moveDown();

  const answers = new Map(paper.answerKey.map((a) => [a.questionId, a]));
  const schemes = new Map(paper.markingScheme.map((m) => [m.questionId, m]));

  for (const section of paper.sections) {
    doc.fontSize(13).text(section.title);
    doc.moveDown(0.4);

    for (const q of section.questions) {
      doc.fontSize(11).text(`${q.id}. (${q.marks}) ${q.question}`);

      const ans = answers.get(q.id);
      if (ans) {
        doc.fontSize(10).fillColor("#333").text(`Answer: ${ans.answer}`);
        if (ans.explanation) doc.text(`Explanation: ${ans.explanation}`);
      } else {
        doc.fontSize(10).fillColor("#a00").text("Answer: (missing)");
      }

      const ms = schemes.get(q.id);
      if (ms) {
        doc.fontSize(10).fillColor("#333").text("Marking scheme:");
        for (const p of ms.points) doc.text(`- ${p}`);
      }

      doc.fillColor("#000");
      doc.moveDown(0.6);
    }
    doc.moveDown(0.6);
  }

  doc.end();
  await new Promise<void>((resolve) => doc.on("end", () => resolve()));
  return Buffer.concat(chunks);
}

