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
   - MANDATORY ANSWER DISTRIBUTION: Distribute the 10 correct answers so each letter appears 2-3 times: A appears 2-3 times, B appears 2-3 times, C appears 2-3 times, D appears 2-3 times. Count and verify before outputting. Rewrite questions if needed.
   - NEVER have more than 2 consecutive questions with the same correct answer.
   - For EACH question, provide exactly four choices prefixed with (A), (B), (C), (D).
   - Distractors must not repeat within a question and should be high-frequency academic vocabulary.
   - Provide a precise Traditional Chinese explanation containing translation and grammar notes.
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
   - MANDATORY ANSWER DISTRIBUTION for the 4 questions: use each letter exactly once — one question with answer A, one with B, one with C, one with D. Verify this before outputting.
   - The questions should test global reading skills (main idea, detail lookup, tone analysis, context-clue inferring).
   - Provide 4 options for each question, each prefixed with (A), (B), (C), (D).
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
5. CRITICAL ANSWER DISTRIBUTION RULE: You MUST distribute correct answers evenly across A, B, C, D.
   - For 10 vocabulary questions: use each letter at least 2 times. No letter more than 3 times.
   - For 4 reading questions per passage: use all 4 different letters, one question each for A, B, C, D.
   - Before finalizing, COUNT your answer distribution and REWRITE any questions needed to fix clustering.
   - NEVER have more than 2 consecutive questions with the same correct answer.
   - This rule is NON-NEGOTIABLE. Verify distribution before outputting.
6. ALL passage text must be in English only. Never write passages in Chinese.`;

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
              description: "Exactly 4 options, each prefixed with (A), (B), (C), (D). E.g. ['(A) alleviate', '(B) exaggerate', '(C) devastate', '(D) initiate']"
            },
            correctAnswer: { type: Type.STRING, description: "Must be 'A', 'B', 'C', or 'D' — a single letter only" },
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
              description: "Exactly 4 reading comprehension questions with answers distributed A, B, C, D one each",
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
                  correctAnswer: { type: Type.STRING, description: "Must be 'A', 'B', 'C', or 'D' — a single letter only" },
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
          { role: "user", content: instructionsPrompt + "\n\nCRITICAL: Return a single valid JSON object. All passage and question text must be in English. Distribute correct answers evenly across A, B, C, D — verify before outputting." }
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
    // Force even answer distribution for reading passages
if (examData.readingPassages) {
  const passages = Array.isArray(examData.readingPassages) 
    ? examData.readingPassages 
    : [examData.readingPassages];
  
  passages.forEach((p: any) => {
    if (p.questions && p.questions.length === 4) {
      const letters = ["A", "B", "C", "D"];
      const used = new Set<string>();
      p.questions.forEach((q: any) => {
        // Normalize answer first
        const ans = String(q.correctAnswer || q.answer || "A").replace(/[()]/g, "").trim().toUpperCase();
        if (!used.has(ans) && letters.includes(ans)) {
          q.correctAnswer = ans;
          used.add(ans);
        } else {
          // Assign an unused letter
          const unused = letters.find(l => !used.has(l)) || "A";
          q.correctAnswer = unused;
          used.add(unused);
        }
      });
    }
  });
  examData.readingPassages = passages;
}
    // Force even answer distribution for vocab questions
if (examData.vocabQuestions && examData.vocabQuestions.length === 10) {
  const letters = ["A", "B", "C", "D"];
  // Target: each letter appears 2-3 times across 10 questions
  const targetCounts: Record<string, number> = { A: 3, B: 3, C: 2, D: 2 };
  const used: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };

  examData.vocabQuestions.forEach((q: any) => {
    const ans = String(q.correctAnswer || q.answer || "A").replace(/[()]/g, "").trim().toUpperCase();
    if (letters.includes(ans) && used[ans] < targetCounts[ans]) {
      q.correctAnswer = ans;
      used[ans]++;
    } else {
      // Find a letter that still has quota
      const available = letters.find(l => used[l] < targetCounts[l]);
      if (available) {
        q.correctAnswer = available;
        used[available]++;
      } else {
        q.correctAnswer = ans;
      }
    }
  });
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
  app.listen(PORT, "0.0.0.0", () => { console.log(`[Back-End Services] Running smoothly on http://localhost:${PORT}`); });
}

if (!process.env.VERCEL && process.env.IS_SERVERLESS !== "true") {
  startServer();
}

export default app;
