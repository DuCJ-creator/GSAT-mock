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

// Normalize options to ["(A) text", "(B) text", ...]
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

// Normalize answer to bare letter: "(A)" -> "A"
function normalizeAnswerLetter(ans: any): string {
  return String(ans || "A").replace(/[()]/g, "").trim().toUpperCase();
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
   - Ensure complexity is aligned with Taiwan's GSAT (General Scholastic Ability Test).
   - For EACH question, provide exactly four choices prefixed with (A), (B), (C), (D).
   - The correctAnswer must be the letter (A, B, C, or D) of the option that actually answers the question correctly.
   - Distractors must not repeat within a question and should be plausible academic vocabulary.
   - Provide a precise Traditional Chinese explanation containing translation and grammar notes.
   - The explanation must reference the correct word and explain why it fits the sentence.
`;
    }

    if (selectedExerciseTypes.reading && selectedReadingLevels && selectedReadingLevels.length > 0) {
      activeSections.push("readingPassages");
      sectionsGuidelines += `
2. "readingPassages": Create EXACTLY ONE reading comprehension passage for the level: ${selectedReadingLevels.join(", ")}.
   - CRITICAL: The passage text MUST be written in English only. Do NOT write passages in Chinese.
   - Create ONLY 1 passage. Do NOT create multiple passages.
   - The passage MUST be 200-250 words.
   - It MUST be followed by EXACTLY 4 comprehension questions.
   - The questions should test: main idea, detail lookup, tone/attitude, and vocabulary-in-context.
   - Provide 4 options for each question, each prefixed with (A), (B), (C), (D).
   - The correctAnswer must be the letter of the option that actually answers the question correctly based on the passage.
   - Provide Traditional Chinese explanations explaining why the correct answer is right.
`;
    }

    const systemPrompt = `You are Tr. Shirley Du, an elite high school English educator in Taiwan specializing in GSAT (English exam) preparation.
Your tone is encouraging, academically precise, and deeply knowledgeable about Taiwan's testing patterns.
Generate high-quality exam exercises based on the vocabulary words provided.

CRITICAL RULES:
1. Every question must be 100% grammatically and contextually correct.
2. For vocabulary questions, the blank can ONLY be correctly filled by the correct option — the other three options must be clearly wrong in context.
3. The correctAnswer field must be the letter (A, B, C, or D) of the option that is ACTUALLY correct for that question. Never assign a wrong letter.
4. The explanation must match the correctAnswer — it should explain why that specific letter/word is correct.
5. NEVER use "cost" with a person as subject. NEVER use "spend" with an item as subject.
6. Vocabulary level must fit Taiwan GSAT syllabus (levels 3-6).
7. Explanations must be in Traditional Chinese (繁體中文).
8. ALL passage text must be in English only.
9. correctAnswer must be a single bare letter with no parentheses: A, B, C, or D.`;

    const instructionsPrompt = `Please generate the requested GSAT exam exercises based on the following input vocabulary:
${vocabString}

Active Sections to generate: ${activeSections.join(", ")}.

Guidelines:
${sectionsGuidelines}

Return clean valid JSON following the schema exactly. Keep explanations concise.`;

    const responseSchema: any = { type: Type.OBJECT, properties: {}, required: [] };

    if (selectedExerciseTypes.vocab) {
      responseSchema.properties.vocabQuestions = {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            question: { type: Type.STRING, description: "Sentence with blank '__________'." },
            options: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Exactly 4 options, each prefixed with (A), (B), (C), (D)."
            },
            correctAnswer: { type: Type.STRING, description: "The letter (A, B, C, or D) of the actually correct option." },
            wordTested: { type: Type.STRING, description: "The correct answer word." },
            explanation: { type: Type.STRING, description: "Traditional Chinese explanation of why the correct answer is right." }
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
            level: { type: Type.STRING, description: "One of: basic, essential, advanced" },
            title: { type: Type.STRING, description: "English title of the passage." },
            passage: { type: Type.STRING, description: "English passage, 200-250 words." },
            questions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  question: { type: Type.STRING },
                  options: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "4 options each prefixed with (A), (B), (C), (D)."
                  },
                  correctAnswer: { type: Type.STRING, description: "The letter (A, B, C, or D) of the actually correct option." },
                  explanation: { type: Type.STRING, description: "Traditional Chinese explanation." }
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
          { role: "user", content: instructionsPrompt + "\n\nIMPORTANT: The correctAnswer must match the option that is actually correct for the question. Double-check every correctAnswer before outputting." }
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
          responseSchema,
          temperature: 0.7,
        },
      });
      outputText = response.text || "";
    }

    if (!outputText) throw new Error("Empty response from AI generation model.");

    const examData = JSON.parse(outputText);

    // Only normalize format — do NOT change correctAnswer or swap options
    if (examData.vocabQuestions) {
      examData.vocabQuestions = examData.vocabQuestions.map((q: any, idx: number) => ({
        ...q,
        id: `vocab-${idx}-${Date.now()}`,
        options: normalizeOptionsArray(q.options || q.choices),
        correctAnswer: normalizeAnswerLetter(q.correctAnswer || q.answer)
      }));
    }

    if (examData.readingPassages || examData.readingPassage) {
      let passages = examData.readingPassages || examData.readingPassage;
      if (!Array.isArray(passages)) passages = [passages];
      const ts = Date.now();
      examData.readingPassages = passages.map((p: any, pIdx: number) => ({
        ...p,
        questions: (p.questions || []).map((q: any, qIdx: number) => ({
          ...q,
          id: `reading-${pIdx}-${qIdx}-${ts}`,
          options: normalizeOptionsArray(q.options || q.choices),
          correctAnswer: normalizeAnswerLetter(q.correctAnswer || q.answer)
        }))
      }));
    }

    res.json({ success: true, data: examData });
  } catch (error: any) {
    console.error("GSAT Buffet Generation Error:", error);
    res.status(500).json({ success: false, error: error.message || "An unexpected error occurred." });
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
2. "analysis": A professional yet heartening review of strengths and blindspots.
3. "tips": 3 actionable GSAT English study tips tailored to their score.
4. "encouragement": An inspirational closing sentence.

Return JSON with exactly: greeting, analysis, tips (array of 3 strings), encouragement.`;

    let outputText = "";
    if (process.env.OPENAI_API_KEY) {
      const openai = getOpenAI();
      const model = process.env.OPENAI_API_MODEL || "gpt-4o-mini";
      const response = await openai.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
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
    res.status(500).json({ success: false, error: error.message || "An unexpected error occurred." });
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
