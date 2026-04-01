import { Router } from "express";
import multer from "multer";
import { Readable } from "stream";
import { OpenAIVoice } from "@mastra/voice-openai";
// Optional (future-proof): CompositeVoice lets you mix providers for STT/TTS
// import { CompositeVoice } from "@mastra/core/voice";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

function inferFiletype(mimetype?: string, filename?: string): string | null {
  const mt = (mimetype ?? "").toLowerCase();

  if (mt.includes("webm")) return "webm";
  if (mt.includes("wav")) return "wav";
  if (mt.includes("mpeg") || mt.includes("mp3")) return "mp3";
  if (mt.includes("mp4") || mt.includes("m4a")) return "m4a";
  if (mt.includes("ogg")) return "ogg";

  const ext = (filename ?? "").split(".").pop()?.toLowerCase();
  if (!ext || ext === filename) return null;

  // common audio extensions
  if (["webm", "wav", "mp3", "m4a", "ogg"].includes(ext)) return ext;
  return ext; // allow others if provider supports
}

// Mastra OpenAI voice uses Whisper for STT by default (listeningModel: whisper-1) :contentReference[oaicite:2]{index=2}
const voice = new OpenAIVoice({
  listeningModel: {
    name: "whisper-1",
    apiKey: process.env.OPENAI_API_KEY, // or omit to use env default
  },
});

// If you want “unified voice” now (STT + later TTS), you can do:
// const voice = new CompositeVoice({ input: new OpenAIVoice(), output: new PlayAIVoice() }); :contentReference[oaicite:3]{index=3}

router.post("/api/voice/stt", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ transcript: "", error: 'Missing "audio" file' });
    }

    const { buffer, mimetype, originalname } = req.file;
    const filetype = inferFiletype(mimetype, originalname);

    if (!filetype) {
      return res.status(400).json({
        transcript: "",
        error: `Cannot infer audio filetype from mimetype="${mimetype}" filename="${originalname}"`,
      });
    }

    // Multer also parses text fields from multipart into req.body
    const language = typeof req.body?.language === "string" ? req.body.language : "en";
    const prompt = typeof req.body?.prompt === "string" ? req.body.prompt : undefined;

    // Convert Buffer -> Node ReadableStream for Mastra voice.listen() :contentReference[oaicite:4]{index=4}
    const audioStream = Readable.from(buffer);

    const transcript = await voice.listen(audioStream as any, {
      filetype,       // e.g. 'webm', 'wav', 'mp3' :contentReference[oaicite:5]{index=5}
      language,       // e.g. 'en' :contentReference[oaicite:6]{index=6}
      ...(prompt ? { prompt } : {}),
    });

    return res.json({ transcript: (transcript ?? "").trim() });
  } catch (err: any) {
    const status = err?.status ?? 500;
    const code = err?.code ?? err?.error?.code;
    const type = err?.type ?? err?.error?.type;

    // Surface common OpenAI billing/rate errors cleanly
    if (status === 429) {
      return res.status(429).json({
        transcript: "",
        error:
          code === "insufficient_quota" || type === "insufficient_quota"
            ? "OpenAI quota/credits exceeded. Check Billing/limits."
            : "Rate limited. Try again in a moment.",
      });
    }

    console.error("[stt] error:", err);
    return res.status(500).json({ transcript: "", error: err?.message ?? "STT failed" });
  }
});

export default router;