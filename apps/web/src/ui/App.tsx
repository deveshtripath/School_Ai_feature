import { useMemo, useState } from "react";

type Deduction = { reason: string; marks: number };
type QuestionResult = {
  questionId: string;
  marksAwarded: number;
  maxMarks: number;
  feedback: string;
  deductions: Deduction[];
  weakAreas: string[];
};
type Evaluation = {
  totalMarks: number;
  maxTotalMarks: number;
  overallFeedback: string;
  weakAreas: string[];
  confidence: number;
  questions: QuestionResult[];
};

type PaperSectionType = "mcq" | "short" | "long" | "case_based" | "mixed";

function marksEachForType(t: PaperSectionType): number {
  if (t === "mcq") return 1;
  if (t === "short") return 3;
  if (t === "long") return 5;
  if (t === "case_based") return 4;
  return 2;
}

export default function App() {
  const [mode, setMode] = useState<"evaluate" | "scanScore" | "generatePaper">("evaluate");

  const [modelFile, setModelFile] = useState<File | null>(null);
  const [studentFile, setStudentFile] = useState<File | null>(null);
  const [modelText, setModelText] = useState("");
  const [studentText, setStudentText] = useState("");
  const [maxMarksPerQuestion, setMaxMarksPerQuestion] = useState(5);
  const [strictness, setStrictness] = useState<"lenient" | "balanced" | "strict">("strict");
  const [subject, setSubject] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [evaluationId, setEvaluationId] = useState<string | null>(null);

  const [scoreImage, setScoreImage] = useState<File | null>(null);
  const [expectedOutOf, setExpectedOutOf] = useState<number>(30);
  const [labelHint, setLabelHint] = useState<string>("marks");
  const [extractedScore, setExtractedScore] = useState<any | null>(null);
  const [paperSpec, setPaperSpec] = useState({
    classLevel: 8,
    subject: "Mathematics",
    board: "CBSE",
    chapters: "Algebra, Linear Equations",
    topics: "",
    durationMinutes: 90,
    difficulty: "moderate" as "easy" | "moderate" | "hard" | "mixed",
    sections: [
      { title: "Section A (MCQ)", type: "mcq" as PaperSectionType, numQuestions: 10 },
      { title: "Section B (Short Answer)", type: "short" as PaperSectionType, numQuestions: 5 },
      { title: "Section C (Long Answer)", type: "long" as PaperSectionType, numQuestions: 5 }
    ]
  });
  const [generatedPaper, setGeneratedPaper] = useState<any | null>(null);
  const [paperPdfBase64, setPaperPdfBase64] = useState<string | null>(null);
  const [solutionPdfBase64, setSolutionPdfBase64] = useState<string | null>(null);
  const [paperId, setPaperId] = useState<string | null>(null);

  const computedPaperTotals = useMemo(() => {
    const sections = paperSpec.sections.map((s) => {
      const marksEach = marksEachForType(s.type);
      const numQuestions = Number.isFinite(s.numQuestions) ? s.numQuestions : 0;
      const sectionMarks = Math.max(0, Math.floor(numQuestions)) * marksEach;
      return { ...s, marksEach, sectionMarks };
    });
    const totalMarks = sections.reduce((acc, s) => acc + s.sectionMarks, 0);
    return { sections, totalMarks };
  }, [paperSpec]);

  const canSubmit = useMemo(() => {
    if (mode === "scanScore") return !!scoreImage && !loading;
    if (mode === "generatePaper") {
      const hasSections = computedPaperTotals.sections.length > 0;
      const validCounts = computedPaperTotals.sections.every((s) => Number.isFinite(s.numQuestions) && s.numQuestions > 0);
      return paperSpec.subject.trim().length > 0 && hasSections && validCounts && !loading;
    }
    const hasModel = modelText.trim().length > 0 || !!modelFile;
    const hasStudent = studentText.trim().length > 0 || !!studentFile;
    return hasModel && hasStudent && !loading;
  }, [mode, scoreImage, paperSpec.subject, computedPaperTotals, modelText, modelFile, studentText, studentFile, loading]);

  async function onSubmit() {
    setLoading(true);
    setError(null);
    setWarnings([]);
    setEvaluation(null);
    setPdfBase64(null);
    setEvaluationId(null);
    setExtractedScore(null);
    setGeneratedPaper(null);
    setPaperPdfBase64(null);
    setSolutionPdfBase64(null);
    setPaperId(null);

    try {
      const form = new FormData();
      let url = "/api/evaluate";

      if (mode === "scanScore") {
        url = "/api/extract-score";
        if (scoreImage) form.append("pageImage", scoreImage);
        if (expectedOutOf) form.append("expectedOutOf", String(expectedOutOf));
        if (labelHint.trim()) form.append("labelHint", labelHint.trim());
      } else if (mode === "generatePaper") {
        // JSON API
        const spec = {
          classLevel: paperSpec.classLevel,
          subject: paperSpec.subject.trim(),
          board: paperSpec.board.trim() || undefined,
          chapters: paperSpec.chapters
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          topics: paperSpec.topics
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          totalMarks: computedPaperTotals.totalMarks,
          durationMinutes: paperSpec.durationMinutes || undefined,
          difficulty: paperSpec.difficulty,
          instructions: [],
          sections: computedPaperTotals.sections.map((s) => ({
            title: s.title,
            type: s.type,
            numQuestions: s.numQuestions,
            marksEach: s.marksEach
          }))
        };

        const res = await fetch("/api/generate-paper", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(spec)
        });
        const json = await res.json();
        if (!res.ok) {
          setWarnings(Array.isArray(json?.warnings) ? json.warnings : []);
          throw new Error(json?.error || "Request failed");
        }

        setGeneratedPaper(json.paper);
        setPaperPdfBase64(json.paperPdfBase64);
        setSolutionPdfBase64(json.solutionPdfBase64);
        setPaperId(json.paperId);
        setWarnings(Array.isArray(json?.warnings) ? json.warnings : []);
        return;
      } else {
        if (modelFile) form.append("modelFile", modelFile);
        if (studentFile) form.append("studentFile", studentFile);
        if (modelText.trim()) form.append("modelText", modelText.trim());
        if (studentText.trim()) form.append("studentText", studentText.trim());
        form.append("maxMarksPerQuestion", String(maxMarksPerQuestion));
        form.append("strictness", strictness);
        if (subject.trim()) form.append("subject", subject.trim());
      }

      const res = await fetch(url, { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) {
        setWarnings(Array.isArray(json?.warnings) ? json.warnings : []);
        throw new Error(json?.error || "Request failed");
      }

      if (mode === "scanScore") {
        setExtractedScore(json);
        setWarnings(Array.isArray(json?.warnings) ? json.warnings : []);
      } else {
        setEvaluation(json.evaluation as Evaluation);
        setPdfBase64(json.pdfBase64 as string);
        setEvaluationId(json.evaluationId as string);
        setWarnings(Array.isArray(json?.warnings) ? json.warnings : []);
      }
    } catch (e: any) {
      setError(e?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function downloadPdf() {
    if (!pdfBase64) return;
    const bytes = Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `evaluation-${evaluationId || "report"}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadBase64Pdf(base64: string, name: string) {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="page">
      <div className="bg" aria-hidden="true" />
      <header className="header">
        <div className="brand">
          <div className="mark" />
          <div>
            <div className="title">AI Copy Checking</div>
            <div className="subtitle">OCR + rubric grading + weak area detection</div>
          </div>
          <div className="switcher" role="tablist" aria-label="Mode selector">
            <button
              className={mode === "evaluate" ? "tab tabActive" : "tab"}
              onClick={() => setMode("evaluate")}
              type="button"
            >
              Evaluate
            </button>
            <button
              className={mode === "scanScore" ? "tab tabActive" : "tab"}
              onClick={() => setMode("scanScore")}
              type="button"
            >
              Scan First Page
            </button>
            <button
              className={mode === "generatePaper" ? "tab tabActive" : "tab"}
              onClick={() => setMode("generatePaper")}
              type="button"
            >
              Generate Paper
            </button>
          </div>
        </div>
      </header>

      <main className="main">
        <section className="card">
          <div className="cardHeader">
            <h2>
              {mode === "generatePaper"
                ? "AI Question Paper Generator"
                : mode === "scanScore"
                  ? "Scan First Page Marks"
                  : "Evaluate Paper"}
            </h2>
            <p>
              {mode === "generatePaper"
                ? "Enter paper settings, generate a full-length test PDF plus a separate solutions PDF."
                : mode === "scanScore"
                ? "Teacher checks the full copy manually, then upload only the first page photo to capture marks like 23/30."
                : "Upload PDFs/images or paste text. For handwriting, enable Google Vision OCR in the API."}
            </p>
          </div>

          {mode === "generatePaper" ? (
            <div className="grid">
              <div className="field">
                <label>Class</label>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={paperSpec.classLevel}
                  onChange={(e) => setPaperSpec((p) => ({ ...p, classLevel: Number(e.target.value) }))}
                />
              </div>
              <div className="field">
                <label>Subject</label>
                <input value={paperSpec.subject} onChange={(e) => setPaperSpec((p) => ({ ...p, subject: e.target.value }))} />
              </div>
              <div className="field">
                <label>Board</label>
                <input value={paperSpec.board} onChange={(e) => setPaperSpec((p) => ({ ...p, board: e.target.value }))} placeholder="CBSE / ICSE / State" />
              </div>
              <div className="field">
                <label>Chapters (comma separated)</label>
                <input value={paperSpec.chapters} onChange={(e) => setPaperSpec((p) => ({ ...p, chapters: e.target.value }))} />
              </div>
              <div className="field">
                <label>Topics (comma separated)</label>
                <input value={paperSpec.topics} onChange={(e) => setPaperSpec((p) => ({ ...p, topics: e.target.value }))} placeholder="optional" />
              </div>
              <div className="field">
                <label>Duration (minutes)</label>
                <input
                  type="number"
                  min={10}
                  max={600}
                  value={paperSpec.durationMinutes}
                  onChange={(e) => setPaperSpec((p) => ({ ...p, durationMinutes: Number(e.target.value) }))}
                />
              </div>
              <div className="field">
                <label>Difficulty</label>
                <select value={paperSpec.difficulty} onChange={(e) => setPaperSpec((p) => ({ ...p, difficulty: e.target.value as any }))}>
                  <option value="easy">Easy</option>
                  <option value="moderate">Moderate</option>
                  <option value="hard">Hard</option>
                  <option value="mixed">Mixed</option>
                </select>
              </div>

              <div className="field fullRow">
                <label>Question types and counts</label>
                <div className="miniNote">
                  Total marks (auto): <b>{computedPaperTotals.totalMarks}</b>
                </div>
              </div>

              <div className="field fullRow">
                <div className="sectionEditor">
                  {computedPaperTotals.sections.map((s, idx) => (
                    <div key={idx} className="sectionRow">
                      <div className="field">
                        <label>Section title</label>
                        <input
                          value={s.title}
                          onChange={(e) =>
                            setPaperSpec((p) => ({
                              ...p,
                              sections: p.sections.map((x, i) => (i === idx ? { ...x, title: e.target.value } : x))
                            }))
                          }
                        />
                      </div>
                      <div className="field">
                        <label>Type</label>
                        <select
                          value={s.type}
                          onChange={(e) =>
                            setPaperSpec((p) => ({
                              ...p,
                              sections: p.sections.map((x, i) => (i === idx ? { ...x, type: e.target.value as PaperSectionType } : x))
                            }))
                          }
                        >
                          <option value="mcq">MCQ</option>
                          <option value="short">Short</option>
                          <option value="long">Long</option>
                          <option value="case_based">Case-based</option>
                          <option value="mixed">Mixed</option>
                        </select>
                      </div>
                      <div className="field">
                        <label>Questions</label>
                        <input
                          type="number"
                          min={1}
                          max={200}
                          value={s.numQuestions}
                          onChange={(e) =>
                            setPaperSpec((p) => ({
                              ...p,
                              sections: p.sections.map((x, i) => (i === idx ? { ...x, numQuestions: Number(e.target.value) } : x))
                            }))
                          }
                        />
                      </div>
                      <div className="field">
                        <label>Marks each</label>
                        <input value={String(s.marksEach)} disabled />
                      </div>
                      <div className="field">
                        <label>Section marks</label>
                        <input value={String(s.sectionMarks)} disabled />
                      </div>
                      <div className="sectionActions">
                        <button
                          className="btnSecondary"
                          type="button"
                          onClick={() =>
                            setPaperSpec((p) => ({ ...p, sections: p.sections.filter((_, i) => i !== idx) }))
                          }
                          disabled={paperSpec.sections.length <= 1}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="sectionAdd">
                    <button
                      className="btnSecondary"
                      type="button"
                      onClick={() =>
                        setPaperSpec((p) => ({
                          ...p,
                          sections: [...p.sections, { title: `Section ${String.fromCharCode(65 + p.sections.length)}`, type: "mcq", numQuestions: 5 }]
                        }))
                      }
                    >
                      Add section
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : mode === "scanScore" ? (
            <div className="grid">
              <div className="field">
                <label>Expected out of (optional)</label>
                <input type="number" min={1} max={1000} value={expectedOutOf} onChange={(e) => setExpectedOutOf(Number(e.target.value))} />
              </div>
              <div className="field">
                <label>Label hint (optional)</label>
                <input value={labelHint} onChange={(e) => setLabelHint(e.target.value)} placeholder="marks / score / total" />
              </div>
              <div className="field">
                <label>Upload first page image</label>
                <input type="file" accept="image/*" onChange={(e) => setScoreImage(e.target.files?.[0] || null)} />
              </div>
            </div>
          ) : (
            <div className="grid">
              <div className="field">
                <label>Subject (optional)</label>
                <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g., Biology, History, Math" />
              </div>
              <div className="field">
                <label>Strictness</label>
                <select value={strictness} onChange={(e) => setStrictness(e.target.value as any)}>
                  <option value="strict">Strict</option>
                  <option value="balanced">Balanced</option>
                  <option value="lenient">Lenient</option>
                </select>
              </div>
              <div className="field">
                <label>Max marks per question</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={maxMarksPerQuestion}
                  onChange={(e) => setMaxMarksPerQuestion(Number(e.target.value))}
                />
              </div>
            </div>
          )}

          {mode === "evaluate" ? (
            <div className="twoCol">
            <div className="pane">
              <div className="paneTitle">Model Answer Key</div>
              <div className="field">
                <label>Upload (PDF/image)</label>
                <input type="file" accept="application/pdf,image/*" onChange={(e) => setModelFile(e.target.files?.[0] || null)} />
              </div>
              <div className="field">
                <label>Or paste text</label>
                <textarea
                  value={modelText}
                  onChange={(e) => setModelText(e.target.value)}
                  placeholder={"Preferred format:\nQ1: ...\nQ2: ...\nQ3: ..."}
                />
              </div>
            </div>

            <div className="pane">
              <div className="paneTitle">Student Answer Sheet</div>
              <div className="field">
                <label>Upload (PDF/image)</label>
                <input type="file" accept="application/pdf,image/*" onChange={(e) => setStudentFile(e.target.files?.[0] || null)} />
              </div>
              <div className="field">
                <label>Or paste text</label>
                <textarea
                  value={studentText}
                  onChange={(e) => setStudentText(e.target.value)}
                  placeholder={"Preferred format:\nQ1: ...\nQ2: ...\nQ3: ..."}
                />
              </div>
            </div>
          </div>
          ) : null}

          {error ? <div className="error">{error}</div> : null}
          {warnings.length ? (
            <div className="warn">
              {warnings.map((w, idx) => (
                <div key={idx} className="warnItem">
                  {w}
                </div>
              ))}
            </div>
          ) : null}

          <div className="actions">
            <button className="btn" disabled={!canSubmit} onClick={onSubmit}>
              {loading ? "Processing..." : mode === "generatePaper" ? "Generate" : mode === "scanScore" ? "Scan" : "Evaluate"}
            </button>
            {mode === "evaluate" ? (
              <button className="btnSecondary" disabled={!pdfBase64} onClick={downloadPdf}>
                Download PDF
              </button>
            ) : null}
          </div>
        </section>

        {mode === "scanScore" && extractedScore ? (
          <section className="card">
            <div className="cardHeader">
              <h2>Detected Marks</h2>
              <p>
                Found:{" "}
                <b>
                  {extractedScore?.score?.obtained ?? "?"}/{extractedScore?.score?.outOf ?? "?"}
                </b>{" "}
                <span className="pill">
                  confidence {Math.round((extractedScore?.score?.confidence ?? 0) * 100)}%
                </span>
              </p>
            </div>
            <div className="summary">
              <div className="summaryBlock">
                <div className="summaryLabel">Method</div>
                <div className="summaryText">{extractedScore?.score?.method}</div>
              </div>
              <div className="summaryBlock">
                <div className="summaryLabel">Candidates</div>
                <div className="summaryText">
                  {(extractedScore?.score?.candidates || []).length
                    ? extractedScore.score.candidates.map((c: any) => (c.outOf ? `${c.obtained}/${c.outOf}` : `${c.obtained}`)).join(", ")
                    : "None"}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {mode === "evaluate" && evaluation ? (
          <section className="card">
            <div className="cardHeader">
              <h2>Results</h2>
              <p>
                Total: <b>{evaluation.totalMarks}</b> / {evaluation.maxTotalMarks}{" "}
                <span className="pill">confidence {Math.round(evaluation.confidence * 100)}%</span>
              </p>
            </div>

            <div className="summary">
              <div className="summaryBlock">
                <div className="summaryLabel">Weak areas</div>
                <div className="summaryText">{evaluation.weakAreas.length ? evaluation.weakAreas.join(", ") : "None detected"}</div>
              </div>
              <div className="summaryBlock">
                <div className="summaryLabel">Overall feedback</div>
                <div className="summaryText">{evaluation.overallFeedback}</div>
              </div>
            </div>

            <div className="qList">
              {evaluation.questions.map((q) => (
                <div key={q.questionId} className="qRow">
                  <div className="qTop">
                    <div className="qTitle">Q{q.questionId}</div>
                    <div className="qScore">
                      {q.marksAwarded} / {q.maxMarks}
                    </div>
                  </div>
                  <div className="qFeedback">{q.feedback}</div>
                  {q.deductions.length ? (
                    <div className="qDeductions">
                      {q.deductions.map((d, idx) => (
                        <div key={idx} className="deduction">
                          <span className="deductionMarks">-{d.marks}</span>
                          <span>{d.reason}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {q.weakAreas.length ? <div className="qWeak">Weak: {q.weakAreas.join(", ")}</div> : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {mode === "generatePaper" && generatedPaper ? (
          <section className="card">
            <div className="cardHeader">
              <h2>Generated</h2>
              <p>
                Paper ID: <b>{paperId}</b>
              </p>
            </div>
            <div className="summary">
              <div className="summaryBlock">
                <div className="summaryLabel">Title</div>
                <div className="summaryText">{generatedPaper.title}</div>
              </div>
              <div className="summaryBlock">
                <div className="summaryLabel">Sections</div>
                <div className="summaryText">{(generatedPaper.sections || []).map((s: any) => s.title).join(", ")}</div>
              </div>
              <div className="summaryBlock">
                <div className="summaryLabel">Downloads</div>
                <div className="downloadRow">
                  <button
                    className="btnSecondary"
                    disabled={!paperPdfBase64}
                    onClick={() => paperPdfBase64 && downloadBase64Pdf(paperPdfBase64, `paper-${paperId || "generated"}.pdf`)}
                  >
                    Question Paper PDF
                  </button>
                  <button
                    className="btnSecondary"
                    disabled={!solutionPdfBase64}
                    onClick={() =>
                      solutionPdfBase64 && downloadBase64Pdf(solutionPdfBase64, `paper-${paperId || "generated"}-solutions.pdf`)
                    }
                  >
                    Solutions PDF
                  </button>
                </div>
              </div>
            </div>
          </section>
        ) : null}
      </main>

      <footer className="footer">
        <div>
          Tip: If your scans are handwritten and OCR returns empty text, set `OCR_PROVIDER=google_vision` in `apps/api/.env`.
        </div>
      </footer>
    </div>
  );
}
