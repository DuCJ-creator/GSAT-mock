process.env.IS_SERVERLESS = "true";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, Type } from "@google/genai";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: "20mb" }));

const PORT = 3000;

// Lazy-initialized Gemini client to prevent app crash on startup
let aiInstance: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not defined in the environment.");
    }
    aiInstance = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiInstance;
}

// Lazy-initialized OpenAI client to prevent app crash on startup
let openaiInstance: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!openaiInstance) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not defined in the environment.");
    }
    openaiInstance = new OpenAI({ apiKey });
  }
  return openaiInstance;
}

function verifyApiKeys() {
  if (!process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY) {
    throw new Error(
      "API Configuration Error: Please configure either GEMINI_API_KEY or OPENAI_API_KEY in your server environment."
    );
  }
}

// Ensure database/JSON directory exists or is mocked locally in memory
// Since the platform runs in a Clound Run container, local memories or standard JSON is great for persistence.

// API endpoints
app.get("/api/health", async (req, res) => {
  const geminiKeyExists = !!process.env.GEMINI_API_KEY;
  const openaiKeyExists = !!process.env.OPENAI_API_KEY;
  let geminiTest = "Not tested";
  let geminiError = null;

  if (geminiKeyExists) {
    try {
      const ai = getGenAI();
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: "Respond with 'ok'",
      });
      geminiTest = response.text || "Empty response";
    } catch (e: any) {
      geminiError = e.message || String(e);
    }
  }

  res.json({
    status: "ok",
    message: "GSAT Buffet API is healthy.",
    env: {
      geminiKeyExists,
      geminiKeyLength: process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.length : 0,
      openaiKeyExists,
      openaiKeyLength: process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.length : 0,
      NODE_ENV: process.env.NODE_ENV,
    },
    geminiTest,
    geminiError,
  });
});

// Post endpoint to generate GSAT exercises
app.post("/api/generate", async (req, res) => {
  try {
    const {
      vocabList, // array of VocabWord or custom strings
      selectedExerciseTypes, // e.g. { vocab: true, reading: true }
      selectedReadingLevels, // e.g. ["basic", "essential", "advanced"]
      selectedLevel, // 1 to 6
    } = req.body;

    verifyApiKeys();

    // Prepare dynamic list of vocabulary words to guide generation
    const vocabString = vocabList && vocabList.length > 0 
      ? vocabList.map((vw: any) => `Word: "${vw.word}" (POS: ${vw.pos || "unspecified"}, meaning: ${vw.meaning || ""})`).join("\n")
      : "use standard GSAT Level 3-6 academic vocabulary.";

    // Construct prompt based on checked sections
    let sectionsGuidelines = "";
    const activeSections: string[] = [];

    if (selectedExerciseTypes.vocab) {
      activeSections.push("vocabQuestions");
      sectionsGuidelines += `
1. "vocabQuestions": Create EXACTLY 10 GSAT-level English vocabulary multiple-choice questions focusing on the provided vocabulary words or suitable GSAT academic words (if not enough vocab).
   - Ensure the structure and complexity are aligned with Taiwan's GSAT (General Scholastic Ability Test).
   - The correct answers MUST be evenly distributed among the options (A), (B), (C), (D) without clustering.
   - For EACH question, provide exactly four choices, and they must be formatted on a single line prefixing (A), (B), (C), (D).
   - Distractors in the options must not repeat within a question and should be standard high-frequency academic vocabulary.
   - Provide a precise and concise Traditional Chinese explanation containing translation and grammar notes.
`;
    }

    if (selectedExerciseTypes.reading && selectedReadingLevels && selectedReadingLevels.length > 0) {
      activeSections.push("readingPassages");
sectionsGuidelines += `
2. "readingPassages": Create EXACTLY ONE reading comprehension passage for the level: ${selectedReadingLevels.join(", ")}.
   - CRITICAL: The passage text MUST be written in English only. Do NOT write passages in Chinese or any other language.
   - The passage must be appropriate for Taiwan GSAT (學測) English exam.
   - Create ONLY 1 passage total. Do NOT create multiple passages.
   - The single passage MUST be 200-250 words.
   - It MUST be followed by EXACTLY 4 questions.
   - The questions should test global reading skills (e.g., main idea, detail lookup, tone analysis, context-clue inferring, title selection).
   - The correct answers must be distributed evenly without clustering.
   - Provide 4 options for each question.
   - Provide complete, concise Traditional Chinese explanations and translate key sentences. Keep explanations clear and high-impact.
`;
    }

    const systemPrompt = `You are Tr. Shirley Du, an elite high school English educator in Taiwan specializing in GSAT (英語學測) exam preparation. 
Your tone is encouraging, academically precise, and deeply knowledgeable about Taiwan's testing patterns.
You will generate high-quality interactive exercises based on the vocabulary words provided.
Ensure that:
1. Every generated question and option is 100% grammatically and contextually correct.
   - For vocabulary questions, ensure the blank can only be filled by the correct option, resulting in a natural, idiomatic, and grammatically perfect English sentence.
   - Crucial Grammar Rules & High-Frequency Pitfalls to avoid:
     * NEVER use "cost" with a person ("you", "I", "we", "he", "she", etc.) as the subject to mean spending money (e.g., "you need to cost a lot of money" is WRONG; use "spend" or "pay" instead). "Cost" must take the item/activity/trip as its subject (e.g., "The ticket costs a lot of money").
     * NEVER use "spend" with an item as the subject (e.g., "The ticket spent me 100 dollars" is WRONG; use "cost" instead).
     * Ensure correct preposition pairings for English verbs (e.g., "spend [time/money] on/in doing something", "pay for something", "charge someone for something").
     * Check that passive voice, transitive/intransitive classifications, and participle phrases are perfectly grammatical.
   - Carefully verify the syntax, grammar, and naturalness of all options and sentence frames.
2. Every generated question has no ambiguity. There is exactly one correct answer.
3. The vocabulary level fits the Taiwan GSAT syllabus (levels 3 to 6).
4. The explanations are written in elegant Traditional Chinese (繁體中文) following the Taiwanese teaching style, with rich analyses of grammar, vocabulary collocations, and translation.
5. Correct answers are balanced among choices (A, B, C, D) without clustering.`;

    const instructionsPrompt = `Please generate the requested GSAT exam exercises based on the following input vocabulary:
${vocabString}

Active Sections to generate: ${activeSections.join(", ")}.

Guidelines for sections to generate:
${sectionsGuidelines}

You MUST follow the specified JSON schema strictly. Make sure all strings are correctly closed and the response is clean JSON. Keep explanations concise to ensure fast API responses and prevent serverless timeouts.`;

    // Define JSON schema for structured output to ensure 100% parse rate without errors
    const responseSchema: any = {
      type: Type.OBJECT,
      properties: {},
      required: [],
    };

    if (selectedExerciseTypes.vocab) {
      responseSchema.properties.vocabQuestions = {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            question: { type: Type.STRING, description: "The sentence containing a blank '__________'. Structure must be GSAT-level complexity." },
            options: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Exactly 4 options, formatted in a single line style. E.g. ['(A) alleviate', '(B) exaggerate', '(C) devastate', '(D) initiate']"
            },
            correctAnswer: { type: Type.STRING, description: "Must be 'A', 'B', 'C', or 'D'" },
            wordTested: { type: Type.STRING, description: "The target word tested" },
            explanation: { type: Type.STRING, description: "Detailed Traditional Chinese explanation mapping grammar, meaning, and translation." }
          },
          required: ["id", "question", "options", "correctAnswer", "wordTested", "explanation"]
        }
      };
      responseSchema.required.push("vocabQuestions");
    }

    if (selectedExerciseTypes.reading && selectedReadingLevels && selectedReadingLevels.length > 0) {
      responseSchema.properties.readingPassages = {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            level: { type: Type.STRING, description: "Must be one of: basic, essential, advanced" },
            title: { type: Type.STRING, description: "Title of the passage" },
            passage: { type: Type.STRING, description: "The content passage (~200-250 words)" },
            questions: {
              type: Type.ARRAY,
              description: "Exactly 4 reading comprehension questions",
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  question: { type: Type.STRING, description: "GSAT-level comprehension question" },
                  options: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "Exactly 4 options, displayed in separate lines, e.g. ['(A) opt1', '(B) opt2', '(C) opt3', '(D) opt4']"
                  },
                  correctAnswer: { type: Type.STRING, description: "Must be 'A', 'B', 'C', or 'D'" },
                  explanation: { type: Type.STRING, description: "Traditional Chinese detailed analysis of logic, clue tracking, and overall meaning." }
                },
                required: ["id", "question", "options", "correctAnswer", "explanation"]
              }
            }
          },
          required: ["level", "title", "passage", "questions"]
        }
      };
      responseSchema.required.push("readingPassages");
    }

    // Call AI Model (OpenAI or Gemini depending on key availability)
    let outputText = "";
    if (process.env.OPENAI_API_KEY) {
      const openai = getOpenAI();
      const model = process.env.OPENAI_API_MODEL || "gpt-4o-mini";
      const response = await openai.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: instructionsPrompt + "\n\nCRITICAL: You MUST return a single valid JSON object containing only the requested properties." }
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
      });
      outputText = response.choices[0].message.content || "";
    } else {
      const ai = getGenAI();
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: instructionsPrompt,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
          responseSchema: responseSchema,
          temperature: 0.7,
        },
      });
      outputText = response.text || "";
    }

    if (!outputText) {
      throw new Error("Empty response from AI generation model.");
    }

    const examData = JSON.parse(outputText);
    res.json({
      success: true,
      data: examData,
    });
  } catch (error: any) {
    console.error("GSAT Buffet Generation Error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "An unexpected error occurred during exam generation.",
    });
  }
});

// Post endpoint to evaluate and generate dynamic commentary report from Tr. Shirley Du
app.post("/api/evaluate-report", async (req, res) => {
  try {
    const { scoreSummary, details, selectedLevel } = req.body;
    verifyApiKeys();

    const systemPrompt = `You are Tr. Shirley Du, an English educator in Taiwan specializing in GSAT (學測英文) preparation.
Your style is extremely warm, caring, humorous, encouraging, and deeply professional.
You talk in Traditional Chinese (using Taiwan idioms like 衝刺, 奠定基礎, 答對率, 魔鬼細節, 學測大關, 備考 etc.). `;

    const userPrompt = `Please write a highly supportive, personalized progress commentary report as Tr. Shirley Du.
The user's exam performance:
- Overall Score: ${scoreSummary.comprehensive.correct}/${scoreSummary.comprehensive.total} (Accuracy: ${scoreSummary.comprehensive.score}%)
- Vocabulary section: ${scoreSummary.vocab.correct}/${scoreSummary.vocab.total}
- Reading comprehension: ${scoreSummary.reading.correct}/${scoreSummary.reading.total}
- Practiced Level: GSAT Level ${selectedLevel || "Mixed"}

Provide:
1. "greeting": A warm greeting addressing the student's status.
2. "analysis": A highly professional yet heartening section review of what they did well and where their blindspots/demon-in-the-details are (e.g. grammar collocations vs vocab retention vs reading pacing).
3. "tips": 3 actionable, highly tactical GSAT English study tips tailored to their score (e.g., if vocabulary is low, advise on memorizing collocation prefixes; if reading comprehension is low, advise on topic sentence locating, skimming, and clue parsing).
4. "encouragement": A powerful, inspirational closing quote/sentence designed to boost their spirits for the final GSAT battle!

Keep the response in structured JSON matching this schema:
{
  "greeting": "string",
  "analysis": "string",
  "tips": ["tip1", "tip2", "tip3"],
  "encouragement": "string"
}`;

    let outputText = "";
    if (process.env.OPENAI_API_KEY) {
      const openai = getOpenAI();
      const model = process.env.OPENAI_API_MODEL || "gpt-4o-mini";
      const response = await openai.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt + "\n\nCRITICAL: You MUST return a single valid JSON object containing exactly 'greeting', 'analysis', 'tips' (an array of 3 strings), and 'encouragement'." }
        ],
        response_format: { type: "json_object" },
        temperature: 0.8,
      });
      outputText = response.choices[0].message.content || "";
    } else {
      const ai = getGenAI();
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: userPrompt,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              greeting: { type: Type.STRING },
              analysis: { type: Type.STRING },
              tips: { 
                type: Type.ARRAY, 
                items: { type: Type.STRING } 
              },
              encouragement: { type: Type.STRING }
            },
            required: ["greeting", "analysis", "tips", "encouragement"]
          },
          temperature: 0.8,
        },
      });
      outputText = response.text || "";
    }
    if (!outputText) {
      throw new Error("No response received from evaluation model.");
    }

    const reportData = JSON.parse(outputText);
    res.json({
      success: true,
      data: reportData,
    });
  } catch (error: any) {
    console.error("GSAT Evaluation Report Error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "An unexpected error occurred during progress evaluation.",
    });
  }
});

// Setup Vite Dev server or production static distribution
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Back-End Services] Running smoothly on http://localhost:${PORT}`);
  });
}

if (!process.env.VERCEL && process.env.IS_SERVERLESS !== "true") {
  startServer();
}

export default app;
