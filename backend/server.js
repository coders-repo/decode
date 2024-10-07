const express = require('express');
const readline = require('readline');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');
require('dotenv').config({ path: '../.env' });


// environment variables access
const apiKey = process.env.OPENAI_API_KEY; // open api key
const origin = process.env.ORIGIN  // domain access

// Load config file
const SysPromtConfig = require('./config/sysPromptConfig.json');
const logConfig = require('./config/logConfig'); // Load the log configuration
const systemPrompt = SysPromtConfig.openai.policy.systemPrompt;

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const app = express();
app.use(cors({
  origin: origin,
  credentials: true,
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// In-memory vector store
let vectorStore = [];

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

// Function to calculate cosine similarity
function cosineSimilarity(vecA, vecB) {
  const dotProduct = vecA.reduce((acc, curr, idx) => acc + curr * vecB[idx], 0);
  const magnitudeA = Math.sqrt(vecA.reduce((acc, curr) => acc + curr * curr, 0));
  const magnitudeB = Math.sqrt(vecB.reduce((acc, curr) => acc + curr * curr, 0));
  return dotProduct / (magnitudeA * magnitudeB);
}

// Function to process and vectorize a batch of log lines
async function processBatch(batch) {
  const texts = batch.map(item => item.textChunk);  // Extract text for embeddings
  const embeddingResponse = await openai.embeddings.create({
    model: 'text-embedding-ada-002',
    input: texts,
  });

  // Iterate over the embedding response and store each embedding with its metadata
  embeddingResponse.data.forEach((embedding, index) => {
    const vector = embedding.embedding;
    const parsedLine = batch[index].parsedLine;  // Retrieve the metadata for the current log line

    vectorStore.push({
      vector: vector,
      metadata: {
        timestamp: parsedLine.timestamp,
        logLevel: parsedLine.logLevel,
        policyNumber: parsedLine.policyNumber,
        email: parsedLine.email,
        error: parsedLine.error,
      },
    });
  });
}

// Parse log lines based on regex patterns in logConfig
function parseLogLine(line) {
  const parsed = {};
  
  logConfig.mappings.forEach(mapping => {
    const match = line.match(mapping.regex);
    if (match) {
      parsed[mapping.name] = match[0];
    }
  });
  
  return parsed;
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

    const BATCH_SIZE = 1000;  // Batch size for log processing
    let batch = [];
    let logData = "";

    // Read log lines
    for await (const line of rl) {
      const parsedLine = parseLogLine(line);
      const textChunk = JSON.stringify(parsedLine);
      logData += textChunk + '\n';

      // Add parsed line and textChunk to the batch
      batch.push({ parsedLine, textChunk });

      // Process the batch once the size reaches the defined BATCH_SIZE
      if (batch.length >= BATCH_SIZE) {
        await processBatch(batch);
        batch = [];  // Reset batch after processing
      }
    }

    // Process any remaining lines that were not part of a full batch
    if (batch.length > 0) {
      await processBatch(batch);
    }
    
    res.json({ message: 'Log file processed and vectorized', vectorStore });
  } catch (error) {
    console.error("Error processing log file:", error);
    res.status(500).json({
      error: "An error occurred while processing your log file.",
      details: error.message,
    });
  }
});

// Endpoint for chat questions with similarity search
app.post('/api/chat-continue', async (req, res) => {
  try {
    const { question } = req.body;

    // Generate embedding for the question
    const queryEmbeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: question,
    });
    const queryVector = queryEmbeddingResponse.data[0].embedding;

    // Perform similarity search
    let bestMatch = null;
    let highestSimilarity = -1;

    vectorStore.forEach(item => {
      const similarity = cosineSimilarity(queryVector, item.vector);
      if (similarity > highestSimilarity) {
        highestSimilarity = similarity;
        bestMatch = item;
      }
    });
    
    // trigger the gpt only when we have the exact match
    if (bestMatch) {
      const chatPrompt = `${JSON.stringify(bestMatch.metadata)}\n\nQuestion: ${question}`;
      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [systemPrompt,{ role: 'user', content: chatPrompt }],
        max_tokens: 1500,
      });

      res.json({ answer: response.choices[0].message.content.trim() });
    } else {
      res.status(404).json({ error: 'No relevant log data found for the query.' });
    }
  } catch (error) {
    console.error('Error processing chat question:', error);
    res.status(500).json({ error: 'Error processing your question.', details: error.message });
  }
});

app.post("/api/fileurl", async (req, res) => {
  let { fileUrl } = req.body;

  try {
    // Check if the provided path exists and is accessible
    fs.readdir(fileUrl, (err, files) => {
      if (err) {
        // Error handling for inaccessible directory or wrong path
        return res
          .status(400)
          .json({ error: "Directory not found or inaccessible" });
      }

      // Prepare an array to hold file details
      const fileDetails = files.map((file) => {
        const filePath = path.join(fileUrl, file);
        const stats = fs.statSync(filePath); // Get file statistics
        const fileType = stats.isFile()
          ? path.extname(file) || "unknown"
          : "directory"; // Get file extension or mark as directory
        return {
          name: file,
          type: fileType, // .txt, .json, etc. for files
          size: stats.size, // File size in bytes
          modifiedDate: stats.mtime, // Date and time of last modification
        };
      });

      // Sort the file details by modifiedDate (including time) in ascending order
      // Tie-breaking based on the file name if modifiedDate is the same
      fileDetails.sort((a, b) => {
        const timeDiff = new Date(a.modifiedDate) - new Date(b.modifiedDate);
        if (timeDiff === 0) {
          return a.name.localeCompare(b.name); // Tie-breaker: sort by file name alphabetically
        }
        return timeDiff;
      });

      res.json({ fileDetails });
    });
  } catch (error) {
    // Catch any other unexpected errors
    console.log(error);
    console.error("Error reading directory: ", error);
    res.status(500).json({ error: "An unexpected error occurred" });
  }
});

const PORT = 5001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
