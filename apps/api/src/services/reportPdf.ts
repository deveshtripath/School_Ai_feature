import PDFDocument from "pdfkit";

import type { Evaluation } from "./gradingSchema.js";

export async function buildPdfReport(params: {
  evaluation: Evaluation;
  meta: { evaluationId: string; createdAtIso: string };
}): Promise<Buffer> {
  const doc = new PDFDocument({ margin: 48 });
  const chunks: Buffer[] = [];

  doc.on("data", (c) => chunks.push(c as Buffer));

  doc.fontSize(18).text("AI Copy Checking Report", { align: "left" });
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor("#555").text(`Evaluation ID: ${params.meta.evaluationId}`);
  doc.text(`Created: ${params.meta.createdAtIso}`);
  doc.moveDown();

  doc.fillColor("#000").fontSize(12).text(`Total: ${params.evaluation.totalMarks} / ${params.evaluation.maxTotalMarks}`);
  doc.moveDown();

  doc.fontSize(12).text("Weak Areas:");
  doc.fontSize(10).fillColor("#333").text(params.evaluation.weakAreas.length ? params.evaluation.weakAreas.join(", ") : "None detected");
  doc.moveDown();

  doc.fillColor("#000").fontSize(12).text("Per Question:");
  doc.moveDown(0.5);
  for (const q of params.evaluation.questions) {
    doc.fontSize(11).fillColor("#000").text(`Q${q.questionId}: ${q.marksAwarded} / ${q.maxMarks}`);
    doc.fontSize(10).fillColor("#333").text(q.feedback);
    if (q.deductions.length) {
      doc.fontSize(9).fillColor("#666").text(
        "Deductions: " + q.deductions.map((d) => `${d.marks}: ${d.reason}`).join(" | ")
      );
    }
    doc.moveDown(0.75);
  }

  doc.end();

  await new Promise<void>((resolve) => doc.on("end", () => resolve()));
  return Buffer.concat(chunks);
}

