import OpenAI from "openai";

import { GeneratedPaperSchema, type GeneratedPaper, type PaperSpec } from "./paperSchema.js";
import { buildPaperPrompt } from "./paperPrompt.js";

export async function generatePaper(spec: PaperSpec): Promise<GeneratedPaper> {
  const provider = (process.env.PAPER_PROVIDER || "openai").toLowerCase();
  if (provider === "ollama") return generateWithOllama(spec);
  return generateWithOpenAI(spec);
}

async function generateWithOpenAI(spec: PaperSpec): Promise<GeneratedPaper> {
  const apiKey = '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';
  if (!apiKey) throw new Error("OPENAI_API_KEY is required for PAPER_PROVIDER=openai");

  const modelPrimary = process.env.PAPER_MODEL_PRIMARY || process.env.OPENAI_MODEL_PRIMARY || "gpt-4.1";
  const modelFallback = process.env.PAPER_MODEL_FALLBACK || process.env.OPENAI_MODEL_FALLBACK || "gpt-4.1-mini";
  const client = new OpenAI({ apiKey });

  const prompt = buildPaperPrompt(spec);
  const input = [
    {
      role: "system" as const,
      content:
        "You generate exam papers.\n" +
        "Output must be valid JSON matching the schema; no markdown, no extra keys.\n" +
        "Ensure total marks matches exactly.\n"
    },
    { role: "user" as const, content: prompt }
  ];

  const request = {
    input,
    text: {
      format: {
        type: "json_schema" as const,
        name: "generated_paper",
        strict: true,
        schema: zodSchemaToJsonSchema()
      }
    },
    temperature: 0.4
  };

  const response = await (async () => {
    try {
      return await client.responses.create({ model: modelPrimary, ...request });
    } catch (err: any) {
      const msg = String(err?.message || "");
      const status = Number(err?.status || err?.response?.status || 0);
      const shouldFallback =
        status === 400 || status === 404 || /model/i.test(msg) || /not found/i.test(msg) || /does not exist/i.test(msg);
      if (!shouldFallback || modelFallback === modelPrimary) throw err;
      return await client.responses.create({ model: modelFallback, ...request });
    }
  })();

  const parsed = safeJsonParse(response.output_text);
  const validated = GeneratedPaperSchema.safeParse(parsed);
  if (!validated.success) throw new Error(`Generated paper did not match schema: ${validated.error.message}`);

  validateMarks(spec, validated.data);
  return validated.data;
}

async function generateWithOllama(spec: PaperSpec): Promise<GeneratedPaper> {
  const baseUrl = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
  const model = process.env.OLLAMA_MODEL || "llama3.1:8b";

  const prompt = buildPaperPrompt(spec);
  const body = {
    model,
    messages: [
      {
        role: "system",
        content:
          "Return JSON only. No markdown. The JSON must match the required schema exactly, with all required keys."
      },
      { role: "user", content: prompt }
    ],
    stream: false,
    options: { temperature: 0.4 }
  };

  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Ollama error: ${res.status} ${text}`);
  }

  const json = (await res.json()) as any;
  const outText = String(json?.message?.content || "");
  const parsed = safeJsonParse(outText);
  const validated = GeneratedPaperSchema.safeParse(parsed);
  if (!validated.success) throw new Error(`Ollama paper did not match schema: ${validated.error.message}`);

  validateMarks(spec, validated.data);
  return validated.data;
}

function safeJsonParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    // Try to extract the first JSON object from the text.
    const firstBrace = s.indexOf("{");
    const lastBrace = s.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(s.slice(firstBrace, lastBrace + 1));
      } catch {
        // fall through
      }
    }
    throw new Error("Failed to parse JSON from LLM output");
  }
}

function validateMarks(spec: PaperSpec, paper: GeneratedPaper) {
  const sum = paper.sections.reduce((acc, s) => acc + s.questions.reduce((a, q) => a + q.marks, 0), 0);
  if (sum !== spec.totalMarks) {
    throw new Error(`Total marks mismatch. Spec=${spec.totalMarks} Generated=${sum}`);
  }
}

function zodSchemaToJsonSchema(): Record<string, unknown> {
  // Minimal JSON schema that matches GeneratedPaperSchema.
  return {
    type: "object",
    additionalProperties: false,
    required: ["title", "header", "instructions", "sections", "answerKey", "markingScheme"],
    properties: {
      title: { type: "string" },
      header: {
        type: "object",
        additionalProperties: false,
        required: ["classLevel", "subject", "board", "totalMarks", "durationMinutes", "difficulty"],
        properties: {
          classLevel: { type: "number" },
          subject: { type: "string" },
          board: { anyOf: [{ type: "string" }, { type: "null" }] },
          totalMarks: { type: "number" },
          durationMinutes: { anyOf: [{ type: "number" }, { type: "null" }] },
          difficulty: { type: "string" }
        }
      },
      instructions: { type: "array", items: { type: "string" } },
      sections: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "type", "marksEach", "questions"],
          properties: {
            title: { type: "string" },
            type: { type: "string", enum: ["mcq", "short", "long", "case_based", "mixed"] },
            marksEach: { type: "number" },
            questions: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["id", "question", "marks", "options", "correctOptionIndex"],
                properties: {
                  id: { type: "string" },
                  question: { type: "string" },
                  marks: { type: "number" },
                  options: { anyOf: [{ type: "array", items: { type: "string" } }, { type: "null" }] },
                  correctOptionIndex: { anyOf: [{ type: "number" }, { type: "null" }] }
                }
              }
            }
          }
        }
      },
      answerKey: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["questionId", "answer", "explanation"],
          properties: {
            questionId: { type: "string" },
            answer: { type: "string" },
            explanation: { anyOf: [{ type: "string" }, { type: "null" }] }
          }
        }
      },
      markingScheme: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["questionId", "points", "marksBreakdown"],
          properties: {
            questionId: { type: "string" },
            points: { type: "array", items: { type: "string" } },
            marksBreakdown: {
              anyOf: [
                {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["point", "marks"],
                    properties: { point: { type: "string" }, marks: { type: "number" } }
                  }
                },
                { type: "null" }
              ]
            }
          }
        }
      }
    }
  };
}
