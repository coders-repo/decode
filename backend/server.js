const express = require("express");
const session = require("express-session");
const MemoryStore = require("memorystore")(session);
const readline = require("readline");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { OpenAI } = require("openai");
require("dotenv").config({ path: "../.env" });

// Now you can access your environment variables
const apiKey = process.env.OPENAI_API_KEY;

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const app = express();
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);

// Session setup with MemoryStore
app.use(
  session({
    store: new MemoryStore({
      checkPeriod: 86400000, // 24 hours
    }),
    secret: process.env.SESSION_SECRET || "secret_key", // Use your session secret
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }, // Set to true if using HTTPS
  })
);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Multer setup
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB file size limit
});

function splitIntoChunks(text, chunkSize = 1000) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    chunks.push(text.slice(start, start + chunkSize));
    start += chunkSize;
  }
  return chunks;
}

app.post("/api/upload-log", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const filePath = req.file.path;
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    let logData = "";
    for await (const line of rl) {
      logData += `${line}\n`;
    }

    // Split logData into smaller chunks
    const logChunks = splitIntoChunks(logData, 2000); // Example: 2000 characters per chunk
    let analysis = "";
    for (const chunk of logChunks) {
      const summaryPrompt = `Summarize the following log file and identify anomalies, errors, and warnings:\n\n${chunk}`;

      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: summaryPrompt }],
        max_tokens: 1500,
      });

      analysis += response.choices[0].message.content.trim() + "\n";
    }

    // Store the analysis in the session
    req.session.logAnalysis = analysis;

    // Ensure session is saved before responding
    req.session.save((err) => {
      if (err) {
        console.error("Session save error:", err);
        return res.status(500).json({ error: "Failed to save session data." });
      }
      console.log("saving", analysis);
      res.json({ analysis });
    });
  } catch (error) {
    console.error("Error processing log file:", error);
    res
      .status(500)
      .json({
        error: "An error occurred while processing your log file.",
        details: error.message,
      });
  }
});

// New endpoint for chat questions about the log file
app.post("/api/chat-continue", async (req, res) => {
  try {
    const { question } = req.body;
    console.log("*****log is,", req.session);
    // Retrieve log analysis from the session
    const logAnalysis = req.session.logAnalysis;
    if (!logAnalysis) {
      return res
        .status(400)
        .json({
          error: "No log analysis available. Please upload a log file first.",
        });
    }

    const chatPrompt = `Based on the following log analysis, answer the question:\n\nAnalysis:\n${logAnalysis}\n\nQuestion: ${question}`;

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: chatPrompt }],
      max_tokens: 1500,
    });

    if (!response || !response.choices || !response.choices[0]) {
      throw new Error("OpenAI response is incomplete or missing");
    }

    res.json({ answer: response.choices[0].message.content.trim() });
  } catch (error) {
    console.error("Error processing chat question:", error);
    res
      .status(500)
      .json({
        error: "Error processing your question.",
        details: error.message,
      });
  }
});

const PORT = 5001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
