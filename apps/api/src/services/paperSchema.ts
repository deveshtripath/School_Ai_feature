import { z } from "zod";

export const DifficultySchema = z.enum(["easy", "moderate", "hard", "mixed"]);

export const PaperSpecSchema = z.object({
  classLevel: z.coerce.number().int().min(1).max(12),
  subject: z.string().min(1),
  board: z.string().optional(),
  chapters: z.array(z.string()).default([]),
  topics: z.array(z.string()).default([]),
  totalMarks: z.coerce.number().int().min(1).max(1000),
  durationMinutes: z.coerce.number().int().min(10).max(600).optional(),
  difficulty: DifficultySchema.default("moderate"),
  instructions: z.array(z.string()).default([]),
  // Counts and marks per question for an MVP structure.
  sections: z
    .array(
      z.object({
        title: z.string().min(1),
        type: z.enum(["mcq", "short", "long", "case_based", "mixed"]),
        numQuestions: z.coerce.number().int().min(1).max(200),
        marksEach: z.coerce.number().int().min(1).max(50),
        notes: z.string().optional()
      })
    )
    .min(1)
});

export type PaperSpec = z.infer<typeof PaperSpecSchema>;

export const GeneratedQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  marks: z.number(),
  // For MCQ
  options: z.array(z.string()).nullable(),
  correctOptionIndex: z.number().int().min(0).max(10).nullable()
});

export const GeneratedSectionSchema = z.object({
  title: z.string(),
  type: z.enum(["mcq", "short", "long", "case_based", "mixed"]),
  marksEach: z.number(),
  questions: z.array(GeneratedQuestionSchema)
});

export const GeneratedPaperSchema = z.object({
  title: z.string(),
  header: z.object({
    classLevel: z.number(),
    subject: z.string(),
    board: z.string().nullable(),
    totalMarks: z.number(),
    durationMinutes: z.number().nullable(),
    difficulty: z.string()
  }),
  instructions: z.array(z.string()),
  sections: z.array(GeneratedSectionSchema),
  answerKey: z.array(
    z.object({
      questionId: z.string(),
      answer: z.string(),
      // For MCQ, answer can be "A/B/C/D" or the option text.
      explanation: z.string().nullable()
    })
  ),
  markingScheme: z.array(
    z.object({
      questionId: z.string(),
      points: z.array(z.string()),
      marksBreakdown: z.array(z.object({ point: z.string(), marks: z.number() })).nullable()
    })
  )
});

export type GeneratedPaper = z.infer<typeof GeneratedPaperSchema>;
