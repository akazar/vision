import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";

/** Lazy clients (read process.env on first use, after .env is loaded). */
let _openai = undefined;
let _gemini = undefined;
function getOpenAI() {
  if (_openai !== undefined) return _openai;
  const key = process.env.OPENAI_API_KEY;
  _openai = key ? new OpenAI({ apiKey: key }) : null;
  return _openai;
}
function getGemini() {
  if (_gemini !== undefined) return _gemini;
  const key = process.env.GEMINI_API_KEY;
  _gemini = key ? new GoogleGenAI({ apiKey: key }) : null;
  return _gemini;
}

/**
 * Accepts:
 * - raw base64: "/9j/4AAQSkZJRgABAQ..."
 * - data URL:  "data:image/png;base64,iVBORw0KGgo..."
 *
 * Returns: { mimeType, base64Data, dataUrl }
 */
function normalizeBase64Image(imageBase64) {
  if (typeof imageBase64 !== "string" || imageBase64.trim().length === 0) {
    throw new Error("imageBase64 must be a non-empty string");
  }

  const trimmed = imageBase64.trim();

  // data URL?
  const match = trimmed.match(/^data:([^;]+);base64,(.*)$/i);
  if (match) {
    const mimeType = match[1] || "image/jpeg";
    const base64Data = match[2] || "";
    if (!base64Data) throw new Error("Invalid data URL (missing base64 payload)");
    return {
      mimeType,
      base64Data,
      dataUrl: `data:${mimeType};base64,${base64Data}`,
    };
  }

  // raw base64 -> assume jpeg by default
  const mimeType = "image/jpeg";
  return {
    mimeType,
    base64Data: trimmed,
    dataUrl: `data:${mimeType};base64,${trimmed}`,
  };
}

/**
 * model field can be:
 * - "chatgpt" / "gemini"
 * - "gpt-4.1-mini" / "gemini-3-flash-preview"
 * - "chatgpt:gpt-4.1-mini" / "gemini:gemini-3-flash-preview"
 */
function parseModelSelector(model) {
  if (typeof model !== "string" || !model.trim()) {
    throw new Error("model must be a non-empty string");
  }
  const m = model.trim();

  // provider:model
  const pm = m.match(/^(chatgpt|openai|gemini)\s*:\s*(.+)$/i);
  if (pm) {
    const provider = pm[1].toLowerCase() === "openai" ? "chatgpt" : pm[1].toLowerCase();
    const modelId = pm[2].trim();
    return { provider, modelId };
  }

  // provider only
  if (/^(chatgpt|openai)$/i.test(m)) return { provider: "chatgpt", modelId: "gpt-4.1-mini" };
  if (/^gemini$/i.test(m)) return { provider: "gemini", modelId: "gemini-3-flash-preview" };

  // infer by prefix
  if (/^(gpt-|o\d|o-)/i.test(m)) return { provider: "chatgpt", modelId: m };
  if (/^gemini/i.test(m)) return { provider: "gemini", modelId: m };

  // fallback (treat as OpenAI model id)
  return { provider: "chatgpt", modelId: m };
}

async function reasonWithOpenAI({ modelId, prompt, dataUrl }) {
  const openai = getOpenAI();
  if (!openai) throw new Error("OPENAI_API_KEY is not set. Add it to v4/.env or the project root .env.");

  // NOTE: This returns an explanation, not hidden chain-of-thought.
  const response = await openai.responses.create({
    model: modelId,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_image", image_url: dataUrl },
        ],
      },
    ],
  });

  // JS SDK convenience field (recommended).
  return response.output_text ?? "";
}

async function reasonWithGemini({ modelId, prompt, mimeType, base64Data }) {
  const gemini = getGemini();
  if (!gemini) throw new Error("GEMINI_API_KEY is not set. Add it to v4/.env or the project root .env.");

  const result = await gemini.models.generateContent({
    model: modelId,
    contents: [
      {
        inlineData: {
          mimeType,
          data: base64Data,
        },
      },
      { text: prompt },
    ],
  });

  return result.text ?? "";
}

/**
 * Registers the reasoning API on the given Express app.
 * POST /api/reasoning — body: { model, prompt, imageBase64 }
 * @param {import('express').Application} app - Express application instance
 */
export function setupReasoningServer(app) {
  app.post("/api/reasoning", async (req, res) => {
    try {
      const { model, prompt, imageBase64 } = req.body ?? {};

      if (typeof prompt !== "string" || !prompt.trim()) {
        return res.status(400).json({ error: "prompt must be a non-empty string" });
      }

      const { provider, modelId } = parseModelSelector(model);
      const { mimeType, base64Data, dataUrl } = normalizeBase64Image(imageBase64);

      let reasoning = "";
      if (provider === "chatgpt") {
        reasoning = await reasonWithOpenAI({ modelId, prompt, dataUrl });
      } else if (provider === "gemini") {
        reasoning = await reasonWithGemini({ modelId, prompt, mimeType, base64Data });
      } else {
        return res.status(400).json({ error: `Unsupported provider: ${provider}` });
      }

      return res.json({
        provider,
        model: modelId,
        reasoning,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ error: message });
    }
  });
}