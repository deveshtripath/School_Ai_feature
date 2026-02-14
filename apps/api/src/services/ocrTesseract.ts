export async function extractTextWithTesseract(fileBytes: Buffer): Promise<string> {
  // Tesseract.js downloads traineddata on first run unless cached; prefer Google Vision for handwriting.
  const lang = process.env.TESSERACT_LANG || "eng";

  const { createWorker } = await import("tesseract.js");
  // tesseract.js v5 types expose `reinitialize` rather than `initialize`.
  const worker = await createWorker(lang);
  try {
    await worker.reinitialize(lang);
    // Focus on marks-like strings: digits and slash.
    // This improves extraction when the page has lots of text/noise.
    await (worker as any).setParameters?.({
      tessedit_char_whitelist: "0123456789/",
      preserve_interword_spaces: "1"
    });
    const { data } = await worker.recognize(fileBytes);
    return data?.text || "";
  } finally {
    await worker.terminate();
  }
}
