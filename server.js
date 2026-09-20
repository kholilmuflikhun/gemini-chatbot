require("dotenv").config();

const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { GoogleGenAI } = require("@google/genai");

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

if (!process.env.GEMINI_API_KEY) {
  console.error(
    "ERROR: GEMINI_API_KEY is not set. Create a .env file (see .env.example) " +
      "and set GEMINI_API_KEY=your_key_here before starting the server."
  );
  process.exit(1);
}

const MODEL_NAME = "gemini-3.5-flash";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Uploaded files are written to a temp dir just long enough to stream them
// to the Gemini File API, then deleted (see the `finally` block below).
const upload = multer({
  dest: path.join(os.tmpdir(), "gemini-chatbot-uploads"),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB, generous for demo purposes
  fileFilter: (req, file, cb) => {
    const allowed = [
      "image/png",
      "image/jpeg",
      "image/webp",
      "application/pdf",
      "text/plain",
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Uploads a local file to the Gemini File API and waits until it's ACTIVE
 * (large files are processed asynchronously; small ones are usually instant).
 */
async function uploadFileToGemini(filePath, mimeType, displayName) {
  let file = await ai.files.upload({
    file: filePath,
    config: { mimeType, displayName },
  });

  // Poll until the file finishes processing.
  let attempts = 0;
  while (file.state === "PROCESSING" && attempts < 30) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    file = await ai.files.get({ name: file.name });
    attempts += 1;
  }

  if (file.state === "FAILED") {
    throw new Error("Gemini File API failed to process the uploaded file.");
  }

  return file;
}

/**
 * Converts the chat history sent by the frontend into the `contents` array
 * expected by the Gemini API.
 */
function buildContentsFromHistory(historyJson) {
  if (!historyJson) return [];
  let history;
  try {
    history = JSON.parse(historyJson);
  } catch {
    return [];
  }
  if (!Array.isArray(history)) return [];

  return history
    .filter((turn) => turn && (turn.role === "user" || turn.role === "model"))
    .map((turn) => ({
      role: turn.role,
      parts: [{ text: String(turn.text || "") }],
    }));
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.post("/api/chat", upload.single("file"), async (req, res) => {
  const uploadedTempPath = req.file ? req.file.path : null;

  try {
    const userMessage = (req.body.message || "").trim();
    const historyContents = buildContentsFromHistory(req.body.history);

    if (!userMessage && !req.file) {
      return res.status(400).json({ error: "Send a message or attach a file." });
    }

    // Build the parts for this turn: text (if any) + file (if any).
    const currentParts = [];
    if (userMessage) {
      currentParts.push({ text: userMessage });
    }

    if (req.file) {
      const geminiFile = await uploadFileToGemini(
        req.file.path,
        req.file.mimetype,
        req.file.originalname
      );
      currentParts.push({
        fileData: {
          fileUri: geminiFile.uri,
          mimeType: geminiFile.mimeType,
        },
      });
    }

    const contents = [
      ...historyContents,
      { role: "user", parts: currentParts },
    ];

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents,
    });

    const replyText = response.text || "(No response text was returned.)";

    res.json({ reply: replyText });
  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({
      error: err.message || "Something went wrong talking to Gemini.",
    });
  } finally {
    // Always clean up the temp upload, whether the request succeeded or not.
    if (uploadedTempPath) {
      fs.unlink(uploadedTempPath, () => {});
    }
  }
});

// Friendly error handler for multer errors (bad file type, too large, etc.)
app.use((err, req, res, next) => {
  if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
});

app.listen(PORT, () => {
  console.log(`Gemini chatbot server running at http://localhost:${PORT}`);
});
