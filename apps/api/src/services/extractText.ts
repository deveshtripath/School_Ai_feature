import { fileTypeFromBuffer } from "file-type";
import pdf from "pdf-parse";

import { extractTextWithGoogleVision } from "./ocrGoogleVision.js";
import { extractTextWithTesseract } from "./ocrTesseract.js";

type UploadedFile = { buffer: Buffer; mimetype: string; originalname: string };

export type TextExtractionResult = { text: string; warnings: string[]; mime: string };

export async function extractTextFromUpload(file: UploadedFile): Promise<TextExtractionResult> {
  const ocrProvider = process.env.OCR_PROVIDER || "pdf_text";
  const detected = await fileTypeFromBuffer(file.buffer).catch(() => null);
  const mime = detected?.mime || file.mimetype || "application/octet-stream";

  if (mime === "application/pdf") {
    // Best-effort: if PDF contains text, parse it. (Handwritten PDFs will need OCR.)
    try {
      const parsed = await pdf(file.buffer);
      if (parsed.text && parsed.text.trim()) return { text: normalizeText(parsed.text), warnings: [], mime };
    } catch (err: any) {
      const msg = String(err?.message || "");
      const details = String(err?.details || "");
      const isBadXref = /xref/i.test(msg) || /xref/i.test(details) || /bad xref entry/i.test(msg);
      const warning = isBadXref
        ? "PDF parsing failed (bad XRef entry). The PDF is likely corrupted or non-standard. Re-save/print-to-PDF and retry, or upload images."
        : `PDF parsing failed. ${msg || details || "Unknown PDF error"}`;
      return { text: "", warnings: [warning], mime };
    }

    // No embedded text. OCR of PDFs requires converting pages to images or using Google Vision async batch with GCS.
    const warnings: string[] = [];
    warnings.push("PDF has no extractable text. If this is a scanned/handwritten PDF, upload page images or paste text.");
    if (ocrProvider === "google_vision") {
      warnings.push("Google Vision OCR for PDFs is not enabled in this MVP (needs GCS async batch). Use images or paste text.");
    }
    if (ocrProvider === "tesseract") {
      warnings.push("Tesseract OCR for PDFs is not enabled in this MVP (needs PDF->image conversion). Use images or paste text.");
    }
    return { text: "", warnings, mime };
  }

  // Images: use OCR provider.
  const warnings: string[] = [];

  if (mime === "application/octet-stream") {
    warnings.push("Unknown file type. If this is an iPhone HEIC photo, convert to JPG/PNG and retry.");
  }
  if (mime === "image/heic" || mime === "image/heif") {
    warnings.push("HEIC/HEIF images are not supported by this OCR pipeline. Convert to JPG/PNG and retry.");
    return { text: "", warnings, mime };
  }

  if (ocrProvider === "google_vision") {
    const text = normalizeText(await extractTextWithGoogleVision(file.buffer));
    if (!text) warnings.push("OCR produced empty text. For handwriting, ensure the photo is sharp and well-lit.");
    return { text, warnings, mime };
  }
  if (ocrProvider === "tesseract") {
    const text = normalizeText(await extractTextWithTesseract(file.buffer));
    if (!text) {
      warnings.push(
        "Tesseract returned empty text. This often happens with handwriting, low contrast, or rotated images. " +
          "Try a clearer photo or use OCR_PROVIDER=google_vision for handwriting."
      );
    }
    return { text, warnings, mime };
  }

  // MVP fallback: no OCR configured.
  warnings.push("No OCR provider configured for images. Set OCR_PROVIDER=tesseract or OCR_PROVIDER=google_vision.");
  return { text: "", warnings, mime };
}

function normalizeText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
}
