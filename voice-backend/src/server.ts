import "dotenv/config";
import express from "express";
import cors from "cors";
import voiceRouter from "./routes/voice.js";

const app = express();

// If your frontend is on a different origin:
app.use(cors({ origin: true, credentials: true }));
app.use(
  cors({
    origin: "http://localhost:4200", 
    credentials: true,
  })
);
// Health check
app.get("/health", (_req, res) => res.json({ ok: true }));

// Voice routes
app.use(voiceRouter);

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => {
  console.log(`[voice-backend] listening on http://localhost:${port}`);
});