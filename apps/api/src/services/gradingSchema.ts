import { z } from "zod";

export const EvaluationSchema = z.object({
  totalMarks: z.number(),
  maxTotalMarks: z.number(),
  overallFeedback: z.string(),
  weakAreas: z.array(z.string()),
  confidence: z.number(),
  questions: z.array(
    z.object({
      questionId: z.string(),
      marksAwarded: z.number(),
      maxMarks: z.number(),
      feedback: z.string(),
      deductions: z.array(z.object({ reason: z.string(), marks: z.number() })),
      weakAreas: z.array(z.string())
    })
  )
});

export type Evaluation = z.infer<typeof EvaluationSchema>;

