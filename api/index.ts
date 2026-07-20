process.env.IS_SERVERLESS = "true";

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

let aiInstance: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not defined in the environment.");
    aiInstance = new GoogleGenAI({ apiKey, httpOptions: { headers: { "User-Agent": "aistudio-build" } } });
  }
  return aiInstance;
}

let openaiInstance: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!openaiInstance) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not defined in the environment.");
    openaiInstance = new OpenAI({ apiKey });
  }
  return openaiInstance;
}

function verifyApiKeys() {
  if (!process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY) {
    throw new Error("API Configuration Error: Please configure either GEMINI_API_KEY or OPENAI_API_KEY.");
  }
}

// Normalize a single answer string to bare letter: "(A)" or "A" -> "A"
function normalizeAnswerLetter(ans: any): string {
  return String(ans || "A").replace(/[()]/g, "").trim().toUpperCase();
}

// Normalize options array to ["(A) text", "(B) text", "(C) text", "(D) text"]
function normalizeOptionsArray(opts: any): string[] {
  const letters = ["A", "B", "C", "D"];
  let arr: string[] = [];

  if (Array.isArray(opts)) {
    if (opts.length > 0 && typeof opts[0] === "object" && opts[0] !== null) {
      arr = opts.map((item: any) => {
        const entries = Object.entries(item);
        if (entries.length === 0) return "";
        const [key, val] = entries[0];
        const k = key.startsWith("(") ? key : `(${key})`;
        return `${k} ${String(val)}`;
      });
    } else {
      arr = opts.map((o: any) => String(o));
    }
  } else if (typeof opts === "string") {
    const matches = opts.match(/\([A-D]\)[^()]*(?=\([A-D]\)|$)/g);
    arr = matches ? matches.map(s => s.trim()) : ["(A)", "(B)", "(C)", "(D)"];
  } else if (opts && typeof opts === "object") {
    arr = Object.entries(opts).map(([key, val]) => {
      const k = key.startsWith("(") ? key : `(${key})`;
      return `${k} ${String(val)}`;
    });
  } else {
    return ["(A)", "(B)", "(C)", "(D)"];
  }

  return arr.map((opt, idx) => {
    const letter = letters[idx];
    const s = String(opt).trim();
    if (s.startsWith(`(${letter})`)) return s;
    if (s.match(/^\([A-D]\)/)) return s;
    return `(${letter}) ${s}`;
  });
}

// Shuffle options so correct answer lands on targetLetter, updating correctAnswer accordingly
function shuffleOptionsToTarget(
  options: string[],
  currentCorrect: string,
  targetLetter: string
): { options: string[]; correctAnswer: string } {
  const letters = ["A", "B", "C", "D"];
  const currentIdx = letters.indexOf(currentCorrect);
  const targetIdx = letters.indexOf(targetLetter);

  if (currentIdx === -1 || targetIdx === -1 || currentIdx === targetIdx) {
    return { options, correctAnswer: currentCorrect };
  }

  // Extract bare text from each option
  const texts = options.map(o => o.replace(/^\([A-D]\)\s*/, "").trim());

  // Swap the texts at currentIdx and targetIdx
  const temp = texts[currentIdx];
  texts[currentIdx] = texts[targetIdx];
  texts[targetIdx] = temp;

  // Re-prefix all options
  const newOptions = texts.map((text, idx) => `(${letters[idx]}) ${text}`);

  return { options: newOptions, correctAnswer: targetLetter };
}

// Force even distribution of correct answers across 10 vocab questions: A=3, B=3, C=2, D=2 (shuffled pattern)
function enforceVocabDistribution(questions: any[]): any[] {
  if (!questions || questions.length !== 10) return questions;

  const letters = ["A", "B", "C", "D"];
  // Target distribution pattern - spread evenly
  const targetSequence = ["A", "B", "C", "D", "A", "B", "C", "D", "A", "B"];

  return questions.map((q: any, idx: number) => {
    const targetLetter = targetSequence[idx];
    const currentCorrect = normalizeAnswerLetter(q.correctAnswer || q.answer);
    const normalizedOpts = normalizeOptionsArray(q.options || q.choices);
    const { options, correctAnswer } = shuffleOptionsToTarget(normalizedOpts, currentCorrect, targetLetter);
    return { ...q, options, correctAnswer };
  });
}

// Force each passage's 4 questions to have answers A, B, C, D exactly once
function enforceReadingDistribution(questions: any[]): any[] {
  if (!questions || questions.length !== 4) return questions;

  const targetSequence = ["A", "B", "C", "D"];

  return questions.map((q: any, idx: number) => {
    const targetLetter = targetSequence[idx];
    const currentCorrect = normalizeAnswerLetter(q.correctAnswer || q.answer);
    const normalizedOpts = normalizeOptionsArray(q.options || q.choices);
    const { options, correctAnswer } = shuffleOptionsToTarget(normalizedOpts, currentCorrect, targetLetter);
    return { ...q, options, correctAnswer };
  });
}

app.get("/api/health", async (req, res) => {
  const geminiKeyExists = !!process.env.GEMINI_API_KEY;
  const openaiKeyExists = !!process.env.OPENAI_API_KEY;
  let geminiTest = "Not tested";
  let geminiError = null;
  if (geminiKeyExists) {
    try {
      const ai = getGenAI();
      const response = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: "Respond with 'ok'" });
      geminiTest = response.text || "Empty response";
    } catch (e: any) {
      geminiError = e.message || String(e);
    }
  }
  res.json({
    status: "ok",
    message: "GSAT Buffet API is healthy.",
    env: { geminiKeyExists, openaiKeyExists, NODE_ENV: process.env.NODE_ENV },
    geminiTest,
    geminiError,
  });
});

app.post("/api/generate", async (req, res) => {
  try {
    const { vocabList, selectedExerciseTypes, selectedReadingLevels, selectedLevel } = req.body;
    verifyApiKeys();

    const vocabString = vocabList && vocabList.length > 0
      ? vocabList.map((vw: any) => `Word: "${vw.word}" (POS: ${vw.pos || "unspecified"}, meaning: ${vw.meaning || ""})`).join("\n")
      : "use standard GSAT Level 3-6 academic vocabulary.";

    let sectionsGuidelines = "";
    const activeSections: string[] = [];

    if (selectedExerciseTypes.vocab) {
      activeSections.push("vocabQuestions");
      sectionsGuidelines += `
1. "vocabQuestions": Create EXACTLY 10 GSAT-level English vocabulary multiple-choice questions.
   - Ensure the structure and complexity are aligned with Taiwan's GSAT (General Scholastic Ability Test).
   - For EACH question, provide exactly four choices prefixed with (A), (B), (C), (D).
   - Distractors must not repeat within a question and should be high-frequency academic vocabulary.
   - Provide a precise Traditional Chinese explanation containing translation and grammar notes.
   - The correct answer must match one of the four options provided.
`;
    }

    if (selectedExerciseTypes.reading && selectedReadingLevels && selectedReadingLevels.length > 0) {
      activeSections.push("readingPassages");
      sectionsGuidelines += `
2. "readingPassages": Create EXACTLY ONE reading comprehension passage for the level: ${selectedReadingLevels.join(", ")}.
   - CRITICAL: The passage text MUST be written in English only. Do NOT write passages in Chinese.
   - Create ONLY 1 passage total. Do NOT create multiple passages.
   - The single passage MUST be 200-250 words.
   - It MUST be followed by EXACTLY 4 questions.
   - The questions should test global reading skills (main idea, detail lookup, tone analysis, context-clue inferring).
   - Provide 4 options for each question, each prefixed with (A), (B), (C), (D).
   - The correct answer must match one of the four options provided.
   - Provide complete Traditional Chinese explanations. Keep explanations clear and concise.
`;
    }

    const systemPrompt = `You are Tr. Shirley Du, an elite high school English educator in Taiwan specializing in GSAT (English exam) preparation.
Your tone is encouraging, academically precise, and deeply knowledgeable about Taiwan's testing patterns.
You will generate high-quality interactive exercises based on the vocabulary words provided.
Ensure that:
1. Every generated question and option is 100% grammatically and contextually correct.
   - For vocabulary questions, ensure the blank can only be filled by the correct option.
   - NEVER use "cost" with a person as the subject to mean spending money.
   - NEVER use "spend" with an item as the subject.
   - Ensure correct preposition pairings and grammatical structures.
2. Every generated question has no ambiguity. There is exactly one correct answer.
3. The vocabulary level fits the Taiwan GSAT syllabus (levels 3 to 6).
4. The explanations are written in elegant Traditional Chinese following the Taiwanese teaching style.
5. ALL passage text must be in English only. Never write passages in Chinese.
6. The correctAnswer field must always be a single bare letter: A, B, C, or D (no parentheses).`;

    const instructionsPrompt = `Please generate the requested GSAT exam exercises based on the following input vocabulary:
${vocabString}

Active Sections to generate: ${activeSections.join(", ")}.

Guidelines for sections to generate:
${sectionsGuidelines}

You MUST follow the specified JSON schema strictly. Make sure all strings are correctly closed and the response is clean JSON. Keep explanations concise to ensure fast API responses and prevent serverless timeouts.`;

    const responseSchema: any = { type: Type.OBJECT, properties: {}, required: [] };

    if (selectedExerciseTypes.vocab) {
      responseSchema.properties.vocabQuestions = {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            question: { type: Type.STRING, description: "Sentence with blank '__________'. GSAT-level complexity." },
            options: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Exactly 4 options, each prefixed with (A), (B), (C), (D)."
            },
            correctAnswer: { type: Type.STRING, description: "Single bare letter: A, B, C, or D" },
            wordTested: { type: Type.STRING, description: "The target word tested" },
            explanation: { type: Type.STRING, description: "Detailed Traditional Chinese explanation." }
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
            title: { type: Type.STRING, description: "Title of the passage in English" },
            passage: { type: Type.STRING, description: "English passage ~200-250 words. MUST be in English only." },
            questions: {
              type: Type.ARRAY,
              description: "Exactly 4 reading comprehension questions",
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  question: { type: Type.STRING, description: "GSAT-level comprehension question in English" },
                  options: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "Exactly 4 options each prefixed with (A), (B), (C), (D)."
                  },
                  correctAnswer: { type: Type.STRING, description: "Single bare letter: A, B, C, or D" },
                  explanation: { type: Type.STRING, description: "Traditional Chinese detailed analysis." }
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

    let outputText = "";
    if (process.env.OPENAI_API_KEY) {
      const openai = getOpenAI();
      const model = process.env.OPENAI_API_MODEL || "gpt-4o-mini";
      const response = await openai.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: instructionsPrompt + "\n\nCRITICAL: Return a single valid JSON object. All passage and question text must be in English. correctAnswer must always be a single bare letter A, B, C, or D." }
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

    if (!outputText) throw new Error("Empty response from AI generation model.");

    const examData = JSON.parse(outputText);

    // Post-process: enforce even answer distribution by shuffling options to match target sequence
    // This guarantees correctAnswer matches the actual correct option text
    if (examData.vocabQuestions) {
      examData.vocabQuestions = enforceVocabDistribution(examData.vocabQuestions);
    }

    // Handle both readingPassages (array/object) and readingPassage (singular)
    if (examData.readingPassages || examData.readingPassage) {
      let passages = examData.readingPassages || examData.readingPassage;
      if (!Array.isArray(passages)) passages = [passages];
      examData.readingPassages = passages.map((p: any) => ({
        ...p,
        questions: enforceReadingDistribution(p.questions || [])
      }));
    }

    res.json({ success: true, data: examData });
  } catch (error: any) {
    console.error("GSAT Buffet Generation Error:", error);
    res.status(500).json({ success: false, error: error.message || "An unexpected error occurred during exam generation." });
  }
});

app.post("/api/evaluate-report", async (req, res) => {
  try {
    const { scoreSummary, details, selectedLevel } = req.body;
    verifyApiKeys();

    const systemPrompt = `You are Tr. Shirley Du, an English educator in Taiwan specializing in GSAT preparation.
Your style is extremely warm, caring, humorous, encouraging, and deeply professional.
You talk in Traditional Chinese (using Taiwan idioms like 衝刺, 奠定基礎, 答對率, 魔鬼細節, 學測大關, 備考 etc.).`;

    const userPrompt = `Please write a highly supportive, personalized progress commentary report as Tr. Shirley Du.
The user's exam performance:
- Overall Score: ${scoreSummary.comprehensive.correct}/${scoreSummary.comprehensive.total} (Accuracy: ${scoreSummary.comprehensive.score}%)
- Vocabulary section: ${scoreSummary.vocab.correct}/${scoreSummary.vocab.total}
- Reading comprehension: ${scoreSummary.reading.correct}/${scoreSummary.reading.total}
- Practiced Level: GSAT Level ${selectedLevel || "Mixed"}

Provide:
1. "greeting": A warm greeting addressing the student's status.
2. "analysis": A highly professional yet heartening section review of what they did well and where their blindspots are.
3. "tips": 3 actionable, highly tactical GSAT English study tips tailored to their score.
4. "encouragement": A powerful, inspirational closing quote/sentence designed to boost their spirits!

Return structured JSON with exactly these fields: greeting, analysis, tips (array of 3 strings), encouragement.`;

    let outputText = "";
    if (process.env.OPENAI_API_KEY) {
      const openai = getOpenAI();
      const model = process.env.OPENAI_API_MODEL || "gpt-4o-mini";
      const response = await openai.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt + "\n\nCRITICAL: Return a single valid JSON object with exactly 'greeting', 'analysis', 'tips' (array of 3 strings), and 'encouragement'." }
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
              tips: { type: Type.ARRAY, items: { type: Type.STRING } },
              encouragement: { type: Type.STRING }
            },
            required: ["greeting", "analysis", "tips", "encouragement"]
          },
          temperature: 0.8,
        },
      });
      outputText = response.text || "";
    }

    if (!outputText) throw new Error("No response received from evaluation model.");
    const reportData = JSON.parse(outputText);
    res.json({ success: true, data: reportData });
  } catch (error: any) {
    console.error("GSAT Evaluation Report Error:", error);
    res.status(500).json({ success: false, error: error.message || "An unexpected error occurred during progress evaluation." });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => { res.sendFile(path.join(distPath, "index.html")); });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Back-End Services] Running smoothly on http://localhost:${PORT}`);
  });
}

if (!process.env.VERCEL && process.env.IS_SERVERLESS !== "true") {
  startServer();
}

export default app;
