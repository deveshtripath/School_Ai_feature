import express from "express";
import multer from "multer";
import { z } from "zod";

import { extractTextFromUpload } from "../services/extractText.js";
import { extractQaPairs } from "../services/extractQaPairs.js";
import { gradeSubmission } from "../services/grading.js";
import { extractScoreFromText } from "../services/extractScore.js";
import { generatePaper } from "../services/paperGenerator.js";
import { GeneratedPaperSchema, PaperSpecSchema } from "../services/paperSchema.js";
import { buildQuestionPaperPdf, buildSolutionPdf } from "../services/paperPdf.js";
import { getEvaluationIfConfigured, maybePersistEvaluation } from "../services/persist.js";
import { maybePersistManualScore } from "../services/persistManualScore.js";
import { getPaperIfConfigured, maybePersistPaper } from "../services/persistPaper.js";
import { buildPdfReport } from "../services/reportPdf.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

export const evaluateRouter = express.Router();

const EvaluateBodySchema = z.object({
  modelText: z.string().optional(),
  studentText: z.string().optional(),
  maxMarksPerQuestion: z.coerce.number().int().min(1).max(50).default(5),
  strictness: z.enum(["lenient", "balanced", "strict"]).default("strict"),
  subject: z.string().optional(),
});

evaluateRouter.post(
  "/evaluate",
  upload.fields([
    { name: "modelFile", maxCount: 1 },
    { name: "studentFile", maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const parsed = EvaluateBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
      }

      const files = req.files as Record<string, Express.Multer.File[]> | undefined;
      const modelFile = files?.modelFile?.[0];
      const studentFile = files?.studentFile?.[0];

      const modelTextOverride = parsed.data.modelText && parsed.data.modelText.trim();
      const studentTextOverride = parsed.data.studentText && parsed.data.studentText.trim();

      const modelExtraction = modelFile ? await extractTextFromUpload(modelFile) : null;
      const studentExtraction = studentFile ? await extractTextFromUpload(studentFile) : null;

      const modelText = modelTextOverride || modelExtraction?.text || "";
      const studentText = studentTextOverride || studentExtraction?.text || "";

      const extractionWarnings = [
        ...(modelExtraction?.warnings ?? []).map((w) => `Model file: ${w}`),
        ...(studentExtraction?.warnings ?? []).map((w) => `Student file: ${w}`)
      ];

      if (!modelText.trim()) {
        return res.status(400).json({
          error: "Model answer text is empty. Paste text or upload images for OCR.",
          warnings: extractionWarnings
        });
      }
      if (!studentText.trim()) {
        return res.status(400).json({
          error: "Student answer text is empty. Paste text or upload images for OCR.",
          warnings: extractionWarnings
        });
      }

      const modelQa = extractQaPairs(modelText);
      const studentQa = extractQaPairs(studentText);

      const evaluation = await gradeSubmission({
        modelQa,
        studentQa,
        maxMarksPerQuestion: parsed.data.maxMarksPerQuestion,
        strictness: parsed.data.strictness,
        subject: parsed.data.subject
      });

      const persisted = await maybePersistEvaluation({
        evaluation,
        modelText,
        studentText
      });

      // Optional: include PDF bytes as base64 for the UI to download.
      const pdfBuffer = await buildPdfReport({
        evaluation,
        meta: {
          evaluationId: persisted.evaluationId,
          createdAtIso: persisted.createdAtIso
        }
      });

      return res.json({
        evaluationId: persisted.evaluationId,
        createdAtIso: persisted.createdAtIso,
        evaluation,
        pdfBase64: pdfBuffer.toString("base64")
      });
    } catch (err: any) {
      const status = Number(err?.status || err?.response?.status || 0);
      const code = String(err?.code || err?.error?.code || "");
      const type = String(err?.type || err?.error?.type || "");
      const requestId = String(err?.request_id || err?.requestId || "");
      const message = String(err?.error?.message || err?.message || "Internal error");

      // If OpenAI rejects before processing, dashboards can show "0 tokens used".
      if (status === 429 && (code === "insufficient_quota" || type === "insufficient_quota")) {
        return res.status(402).json({
          error:
            "OpenAI API rejected the request due to insufficient quota for the project/org tied to this API key. " +
            "Enable billing for that project/org or generate a key under a billed project, then retry.",
          details: { status, code, type, requestId, message }
        });
      }

      if (status === 429) {
        return res.status(429).json({
          error: "OpenAI rate limit exceeded. Slow down requests or add retry/backoff.",
          details: { status, code, type, requestId, message }
        });
      }

      if (status === 401 || status === 403) {
        return res.status(401).json({
          error: "OpenAI authentication/authorization failed. Check OPENAI_API_KEY and project permissions.",
          details: { status, code, type, requestId, message }
        });
      }

      console.error(err);
      return res.status(500).json({ error: "Internal error", details: { status, code, type, requestId, message } });
    }
  }
);

const ExtractScoreBodySchema = z.object({
  expectedOutOf: z.coerce.number().int().min(1).max(1000).optional(),
  labelHint: z.string().optional()
});

evaluateRouter.post("/extract-score", upload.single("pageImage"), async (req, res) => {
  try {
    const parsed = ExtractScoreBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    }

    const file = req.file;
    if (!file) return res.status(400).json({ error: "Missing pageImage upload" });

    const extracted = await extractTextFromUpload(file);
    if (!extracted.text.trim()) {
      return res.status(400).json({
        error: "OCR returned empty text for this image. Try a clearer photo or switch OCR_PROVIDER.",
        warnings: extracted.warnings,
        debug: {
          detectedMime: extracted.mime,
          uploadMime: file.mimetype,
          filename: file.originalname,
          ocrProvider: process.env.OCR_PROVIDER || "pdf_text"
        }
      });
    }

    const score = extractScoreFromText({
      text: extracted.text,
      expectedOutOf: parsed.data.expectedOutOf,
      labelHint: parsed.data.labelHint
    });

    const persisted = await maybePersistManualScore({
      obtained: score.obtained,
      outOf: score.outOf,
      confidence: score.confidence,
      ocrText: extracted.text
    });

    return res.json({
      id: persisted.id,
      createdAtIso: persisted.createdAtIso,
      score,
      warnings: extracted.warnings,
      debug: {
        detectedMime: extracted.mime,
        ocrProvider: process.env.OCR_PROVIDER || "pdf_text"
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal error" });
  }
});

evaluateRouter.get("/evaluation/:id", async (req, res) => {
  const id = req.params.id;
  const doc = await getEvaluationIfConfigured(id);
  if (!doc) return res.status(404).json({ error: "Not found (or Firebase not configured)" });
  return res.json(doc);
});

evaluateRouter.get("/evaluation/:id/pdf", async (req, res) => {
  const id = req.params.id;
  const doc = await getEvaluationIfConfigured(id);
  if (!doc) return res.status(404).json({ error: "Not found (or Firebase not configured)" });

  const pdfBuffer = await buildPdfReport({
    evaluation: doc.evaluation,
    meta: { evaluationId: id, createdAtIso: doc.createdAtIso }
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename=\"evaluation-${id}.pdf\"`);
  return res.send(pdfBuffer);
});

evaluateRouter.post("/generate-paper", async (req, res) => {
  try {
    const parsed = PaperSpecSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid paper spec", details: parsed.error.flatten() });
    }

    const paper = await generatePaper(parsed.data);
    const validated = GeneratedPaperSchema.safeParse(paper);
    if (!validated.success) {
      return res.status(500).json({ error: "Generated paper validation failed", details: validated.error.flatten() });
    }

    const persisted = await maybePersistPaper({ spec: parsed.data, paper: validated.data });
    const paperPdf = await buildQuestionPaperPdf({ paper: validated.data, paperId: persisted.paperId, createdAtIso: persisted.createdAtIso });
    const solutionPdf = await buildSolutionPdf({ paper: validated.data, paperId: persisted.paperId, createdAtIso: persisted.createdAtIso });

    return res.json({
      paperId: persisted.paperId,
      createdAtIso: persisted.createdAtIso,
      spec: parsed.data,
      paper: validated.data,
      paperPdfBase64: paperPdf.toString("base64"),
      solutionPdfBase64: solutionPdf.toString("base64")
    });
  } catch (err: any) {
    const status = Number(err?.status || err?.response?.status || 0);
    const code = String(err?.code || err?.error?.code || "");
    const type = String(err?.type || err?.error?.type || "");
    const requestId = String(err?.request_id || err?.requestId || "");
    const message = String(err?.error?.message || err?.message || "Internal error");
    const openaiProject = String(err?.headers?.["openai-project"] || "");
    const openaiOrganization = String(err?.headers?.["openai-organization"] || "");

    if (status === 429 && (code === "insufficient_quota" || type === "insufficient_quota")) {
      return res.status(402).json({
        error:
          "Paper generation requires an LLM. OpenAI quota/billing is not enabled for this API key/project. " +
          "Enable billing or set PAPER_PROVIDER=ollama to use a local model.",
        details: { status, code, type, requestId, message, openaiProject, openaiOrganization }
      });
    }

    console.error(err);
    return res.status(500).json({
      error: "Internal error",
      details: { status, code, type, requestId, message, openaiProject, openaiOrganization }
    });
  }
});

evaluateRouter.get("/paper/:id", async (req, res) => {
  const id = req.params.id;
  const doc = await getPaperIfConfigured(id);
  if (!doc) return res.status(404).json({ error: "Not found (or Firebase not configured)" });
  return res.json({ paperId: id, ...doc });
});

evaluateRouter.get("/paper/:id/pdf", async (req, res) => {
  const id = req.params.id;
  const type = String(req.query.type || "paper");
  const doc = await getPaperIfConfigured(id);
  if (!doc) return res.status(404).json({ error: "Not found (or Firebase not configured)" });

  const pdfBuffer =
    type === "solution"
      ? await buildSolutionPdf({ paper: doc.paper, paperId: id, createdAtIso: doc.createdAtIso })
      : await buildQuestionPaperPdf({ paper: doc.paper, paperId: id, createdAtIso: doc.createdAtIso });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename=\"paper-${id}-${type}.pdf\"`);
  return res.send(pdfBuffer);
});
