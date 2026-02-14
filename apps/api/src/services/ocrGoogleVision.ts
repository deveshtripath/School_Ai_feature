import vision from "@google-cloud/vision";

export async function extractTextWithGoogleVision(fileBytes: Buffer): Promise<string> {
  // Requires GOOGLE_APPLICATION_CREDENTIALS env var to point to a service account JSON.
  const client = new vision.ImageAnnotatorClient();
  const [result] = await client.documentTextDetection({ image: { content: fileBytes } });
  const text = result.fullTextAnnotation?.text || "";
  return text;
}

