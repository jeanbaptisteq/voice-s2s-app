import dotenv from "dotenv";
import express from "express";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Prefer environment variables; fall back to .env in the app root or repo root.
dotenv.config();
if (!process.env.OPENAI_API_KEY) {
  dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });
}

const DATA_PATH = path.join(__dirname, "data", "situations.json");
const LOG_DIR = path.join(__dirname, "..", "..", ".tmp", "conversations");
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const REALTIME_MODEL =
  process.env.REALTIME_MODEL || "gpt-4o-realtime-preview-2024-12-17";
const REALTIME_VOICE = process.env.REALTIME_VOICE || "alloy";
const TRANSCRIBE_MODEL =
  process.env.REALTIME_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe";
const PORT = process.env.PORT || 3030;

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

async function readSituations() {
  const raw = await fs.readFile(DATA_PATH, "utf8");
  return JSON.parse(raw);
}

async function writeSituations(situations) {
  await fs.writeFile(DATA_PATH, JSON.stringify(situations, null, 2));
}

function buildInstructions(situation, promptOverride) {
  const base = [
    "You are a friendly French conversation tutor for native Portuguese speakers.",
    "Use simple, clear French. If the learner makes mistakes, correct them gently in Portuguese.",
    "Ask short questions, keep the pace natural, and encourage the learner to respond aloud.",
    "Stay inside the situation and keep role-play going.",
  ].join(" ");

  const blocks = [
    base,
    `Situation: ${situation.title}`,
    `Theme: ${situation.theme}`,
    `Scenario: ${situation.prompt}`,
  ];

  if (promptOverride && promptOverride.trim()) {
    blocks.push(`Custom instructions: ${promptOverride.trim()}`);
  }

  return blocks.join("\n\n");
}

app.get("/api/situations", async (_req, res) => {
  try {
    const situations = await readSituations();
    res.json({ situations });
  } catch (error) {
    res.status(500).json({ error: "Failed to load situations." });
  }
});

app.put("/api/situations/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { title, theme, prompt, links, accent, ambience } = req.body || {};
    const situations = await readSituations();
    const index = situations.findIndex((item) => item.id === id);

    if (index === -1) {
      res.status(404).json({ error: "Situation not found." });
      return;
    }

    const updated = {
      ...situations[index],
      title: title ?? situations[index].title,
      theme: theme ?? situations[index].theme,
      prompt: prompt ?? situations[index].prompt,
      links: Array.isArray(links) ? links : situations[index].links,
      accent: accent ?? situations[index].accent,
      ambience: ambience ?? situations[index].ambience,
      updatedAt: new Date().toISOString(),
    };

    situations[index] = updated;
    await writeSituations(situations);
    res.json({ situation: updated });
  } catch (error) {
    res.status(500).json({ error: "Failed to update situation." });
  }
});

app.post("/api/session", async (req, res) => {
  try {
    if (!OPENAI_API_KEY) {
      res.status(400).json({ error: "Missing OPENAI_API_KEY in environment." });
      return;
    }

    const { situationId, promptOverride } = req.body || {};
    const situations = await readSituations();
    const situation = situations.find((item) => item.id === situationId);

    if (!situation) {
      res.status(404).json({ error: "Situation not found." });
      return;
    }

    const instructions = buildInstructions(situation, promptOverride);
    const payload = {
      model: REALTIME_MODEL,
      voice: REALTIME_VOICE,
      instructions,
      turn_detection: { type: "server_vad" },
      input_audio_transcription: { model: TRANSCRIBE_MODEL },
    };

    const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const message = await response.text();
      res.status(500).json({ error: message });
      return;
    }

    const session = await response.json();
    res.json({
      sessionId: session.id,
      clientSecret: session.client_secret?.value,
      model: REALTIME_MODEL,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to create realtime session." });
  }
});

app.post("/api/log", async (req, res) => {
  try {
    const { sessionId, situationId, events } = req.body || {};
    if (!sessionId || !Array.isArray(events)) {
      res.status(400).json({ error: "Invalid log payload." });
      return;
    }

    await fs.mkdir(LOG_DIR, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 10);
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      sessionId,
      situationId,
      events,
    });

    await fs.appendFile(path.join(LOG_DIR, `${stamp}.jsonl`), `${line}\n`);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to save log." });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`French S2S app running on http://localhost:${PORT}`);
});
