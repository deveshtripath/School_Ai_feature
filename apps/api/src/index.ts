import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

import { evaluateRouter } from "./routes/evaluate.js";

// Load `apps/api/.env` regardless of where the process is started from (repo root vs apps/api).
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiRoot = path.resolve(__dirname, "..", "..");
dotenv.config({ path: path.join(apiRoot, ".env") });
dotenv.config(); // fallback to cwd `.env` if present

const port = Number(process.env.PORT || 8787);
const webOrigin = process.env.WEB_ORIGIN || "http://localhost:5173";

const app = express();
app.use(cors({ origin: webOrigin }));
app.use(express.json({ limit: "10mb" }));

app.get("/healthz", (_req, res) => res.json({ ok: true }));
app.use("/api", evaluateRouter);

app.listen(port, () => {
  // Keep logs minimal; user runs locally.
  console.log(`[api] listening on http://localhost:${port}`);
});
