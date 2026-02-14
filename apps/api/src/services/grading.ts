import OpenAI from "openai";
import { z } from "zod";

import type { QaPair } from "./extractQaPairs.js";
import { EvaluationSchema, type Evaluation } from "./gradingSchema.js";
import { gradeSubmissionHeuristic } from "./gradingHeuristic.js";

export async function gradeSubmission(params: {
  modelQa: QaPair[];
  studentQa: QaPair[];
  maxMarksPerQuestion: number;
  strictness: "lenient" | "balanced" | "strict";
  subject?: string;
}): Promise<Evaluation> {
  const provider = (process.env.GRADER_PROVIDER || "openai").toLowerCase();
  if (provider === "heuristic") {
    return gradeSubmissionHeuristic({
      modelQa: params.modelQa,
      studentQa: params.studentQa,
      maxMarksPerQuestion: params.maxMarksPerQuestion
    });
  }

  try {
    return await gradeSubmissionWithOpenAI(params);
  } catch (err: any) {
    const status = Number(err?.status || err?.response?.status || 0);
    const code = String(err?.code || err?.error?.code || "");
    const type = String(err?.type || err?.error?.type || "");
    if (status === 429 && (code === "insufficient_quota" || type === "insufficient_quota")) {
      // Auto-fallback to keep the MVP usable even without billing.
      return gradeSubmissionHeuristic({
        modelQa: params.modelQa,
        studentQa: params.studentQa,
        maxMarksPerQuestion: params.maxMarksPerQuestion
      });
    }
    throw err;
  }
}

async function gradeSubmissionWithOpenAI(params: {
  modelQa: QaPair[];
  studentQa: QaPair[];
  maxMarksPerQuestion: number;
  strictness: "lenient" | "balanced" | "strict";
  subject?: string;
}): Promise<Evaluation> {
  const apiKey = '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';
  if (!apiKey) throw new Error("OPENAI_API_KEY is required");

  const modelPrimary = process.env.OPENAI_MODEL_PRIMARY || "gpt-4.1";
  const modelFallback = process.env.OPENAI_MODEL_FALLBACK || "gpt-4.1-mini";
  const client = new OpenAI({ apiKey });

  const modelById = new Map(params.modelQa.map((q) => [q.questionId, q.text]));
  const studentById = new Map(params.studentQa.map((q) => [q.questionId, q.text]));

  const questionIds = [...new Set([...modelById.keys(), ...studentById.keys()])].sort(
    (a, b) => Number(a) - Number(b)
  );

  const questions = questionIds.map((id) => ({
    questionId: id,
    maxMarks: params.maxMarksPerQuestion,
    modelAnswer: modelById.get(id) ?? "",
    studentAnswer: studentById.get(id) ?? ""
  }));

  const strictnessHint =
    params.strictness === "strict"
      ? "Be fair but strict. Do not reward vague answers."
      : params.strictness === "balanced"
        ? "Be fair and consistent. Reward partial credit when clearly earned."
        : "Be lenient but still accurate. Reward partial credit generously when plausible.";

  const subjectHint = params.subject ? `Subject: ${params.subject}\n` : "";

  const input = [
    {
      role: "system" as const,
      content:
        "You are an exam evaluator. Grade strictly to the rubric.\n" +
        "Output must be valid JSON matching the provided schema.\n" +
        "Never include markdown, code fences, or extra keys.\n"
    },
    {
      role: "user" as const,
      content:
        subjectHint +
        strictnessHint +
        "\n\n" +
        "For each question, compare the student's answer with the model answer.\n" +
        "Give marks out of maxMarks. Explain deductions clearly.\n" +
        "Return weak areas based on patterns of mistakes.\n\n" +
        JSON.stringify({ questions }, null, 2)
    }
  ];

  const request = {
    input,
    text: {
      // Structured output: keep it strict so parsing is reliable.
      format: {
        type: "json_schema" as const,
        name: "evaluation",
        strict: true,
        schema: zodToJsonSchema(EvaluationSchema)
      }
    },
    temperature: 0.2
  };

  const response = await (async () => {
    try {
      return await client.responses.create({ model: modelPrimary, ...request });
    } catch (err: any) {
      const msg = String(err?.message || "");
      const status = Number(err?.status || err?.response?.status || 0);
      const shouldFallback =
        status === 400 ||
        status === 404 ||
        /model/i.test(msg) ||
        /not found/i.test(msg) ||
        /does not exist/i.test(msg);
      if (!shouldFallback || modelFallback === modelPrimary) throw err;
      return await client.responses.create({ model: modelFallback, ...request });
    }
  })();

  const text = response.output_text;
  const parsed = safeJsonParse(text);
  const validated = EvaluationSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(`OpenAI response did not match schema: ${validated.error.message}`);
  }

  // Ensure totals are consistent even if the model makes minor arithmetic errors.
  const maxTotal = validated.data.questions.reduce((acc, q) => acc + q.maxMarks, 0);
  const total = validated.data.questions.reduce((acc, q) => acc + q.marksAwarded, 0);
  return {
    ...validated.data,
    totalMarks: clamp(total, 0, maxTotal),
    maxTotalMarks: maxTotal,
    confidence: clamp(validated.data.confidence, 0, 1)
  };
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function safeJsonParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    throw new Error("Failed to parse OpenAI JSON output");
  }
}

// Minimal Zod -> JSON Schema for this MVP (enough for the fixed schemas below).
function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  // Instead of bringing in a dependency, build a schema based on the known shape.
  // If you expand the schema significantly, consider adding zod-to-json-schema.
  const inferred = schema._def;
  if (inferred.typeName !== z.ZodFirstPartyTypeKind.ZodObject) {
    throw new Error("zodToJsonSchema: only supports ZodObject at the root for this MVP");
  }
  const shape = (schema as z.ZodObject<any>).shape;
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [key, value] of Object.entries(shape)) {
    properties[key] = zodFieldToSchema(value as z.ZodTypeAny);
    required.push(key);
  }
  return {
    type: "object",
    additionalProperties: false,
    properties,
    required
  };
}

function zodFieldToSchema(field: z.ZodTypeAny): Record<string, unknown> {
  if (field instanceof z.ZodString) return { type: "string" };
  if (field instanceof z.ZodNumber) return { type: "number" };
  if (field instanceof z.ZodArray) return { type: "array", items: zodFieldToSchema(field.element) };
  if (field instanceof z.ZodEnum) return { type: "string", enum: field.options };
  if (field instanceof z.ZodObject) {
    const shape = field.shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [k, v] of Object.entries(shape)) {
      properties[k] = zodFieldToSchema(v as z.ZodTypeAny);
      required.push(k);
    }
    return { type: "object", additionalProperties: false, properties, required };
  }
  if (field instanceof z.ZodOptional) return zodFieldToSchema(field.unwrap());
  if (field instanceof z.ZodDefault) return zodFieldToSchema(field._def.innerType);
  if (field instanceof z.ZodUnion) {
    return { anyOf: field.options.map((opt: z.ZodTypeAny) => zodFieldToSchema(opt)) };
  }
  // Fallback: treat as string to avoid hard failure.
  return { type: "string" };
}
