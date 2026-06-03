import express from "express";
import { GoogleGenAI, Type } from "@google/genai";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json({ limit: "20mb" }));

let aiInstance: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not defined.");
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

let openaiInstance: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!openaiInstance) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not defined.");
    openaiInstance = new OpenAI({ apiKey });
  }
  return openaiInstance;
}

function verifyApiKeys() {
  if (!process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY) {
    throw new Error("Please configure GEMINI_API_KEY or OPENAI_API_KEY.");
  }
}

async function callOpenAI(system: string, user: string): Promise<any> {
  const openai = getOpenAI();
  const model = process.env.OPENAI_API_MODEL || "gpt-4o-mini";
  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user + "\n\nCRITICAL: Return ONLY a valid JSON object. No markdown, no explanation." }
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });
  const content = response.choices[0].message.content || "";
  return JSON.parse(content.trim());
}

async function callGemini(prompt: string, schema: any): Promise<any> {
  const ai = getGenAI();
  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: prompt,
    config: {
      systemInstruction: "You are Tr. Shirley Du, an elite GSAT English educator in Taiwan. Return ONLY valid JSON matching the schema exactly.",
      responseMimeType: "application/json",
      responseSchema: schema,
      temperature: 0.3,
    },
  });
  if (!response.text) throw new Error("Empty response from Gemini.");
  return JSON.parse(response.text.trim());
}

// ── Health check ──────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// ── Generate vocab questions only ────────────────────────────
app.post("/api/generate-vocab", async (req, res) => {
  try {
    const { vocabList } = req.body;
    verifyApiKeys();

    const vocabString = vocabList?.length > 0
      ? vocabList.map((vw: any) => `"${vw.word}" (${vw.pos || ""}, meaning: ${vw.meaning || ""})`).join(", ")
      : "standard GSAT Level 3-6 vocabulary";

    const system = `You are Tr. Shirley Du, an elite GSAT English educator in Taiwan. Generate exactly 10 vocabulary MCQ questions in JSON.`;

    const user = `Generate EXACTLY 10 GSAT vocabulary multiple-choice questions using these words: ${vocabString}

STRICT RULES:
- EXACTLY 10 questions in the array — count before responding.
- Each "question" is a complete sentence with exactly one "______" (six underscores) blank.
- CRITICAL: Do NOT use the correct answer word anywhere in the question sentence itself.
- "options": exactly 4 strings: ["(A) word", "(B) word", "(C) word", "(D) word"] — single words only.
- "correctAnswer": EXACTLY one bare letter: "A", "B", "C", or "D" — NO parentheses.
- Correct answers MUST be distributed: roughly A×2-3, B×2-3, C×2-3, D×2-3. Do NOT put all answers as "A".
- "wordTested": the correct answer word.
- "explanation": Traditional Chinese explanation.

Return JSON: { "vocabQuestions": [ ...exactly 10 items... ] }`;

    const schema = {
      type: Type.OBJECT,
      properties: {
        vocabQuestions: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              question: { type: Type.STRING },
              options: { type: Type.ARRAY, items: { type: Type.STRING } },
              correctAnswer: { type: Type.STRING },
              wordTested: { type: Type.STRING },
              explanation: { type: Type.STRING }
            },
            required: ["id", "question", "options", "correctAnswer", "wordTested", "explanation"]
          }
        }
      },
      required: ["vocabQuestions"]
    };

    const data = process.env.OPENAI_API_KEY
      ? await callOpenAI(system, user)
      : await callGemini(user, schema);

    res.json({ success: true, data });
  } catch (error: any) {
    console.error("Vocab generation error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── Generate cloze only ───────────────────────────────────────
app.post("/api/generate-cloze", async (req, res) => {
  try {
    const { vocabList } = req.body;
    verifyApiKeys();

    const vocabString = vocabList?.length > 0
      ? vocabList.map((vw: any) => `"${vw.word}"`).join(", ")
      : "standard GSAT vocabulary";

    const system = `You are Tr. Shirley Du, an elite GSAT English educator in Taiwan. Generate a cloze passage in JSON.`;

    const user = `Generate 1 GSAT-style cloze passage (綜合測驗) with EXACTLY 5 blanks using vocabulary: ${vocabString}

STRICT RULES:
- "passage": 150-180 word natural article. Blanks MUST be written as "__ 11 __", "__ 12 __", "__ 13 __", "__ 14 __", "__ 15 __" inline.
- "questions": EXACTLY 5 items for gaps 11, 12, 13, 14, 15.
- Each question: "gapNumber" (integer 11-15), "options" (exactly 4 strings as phrases or words: ["(A)...", "(B)...", "(C)...", "(D)..."]), "correctAnswer" (bare letter A/B/C/D only — NO parentheses), "category", "explanation" (Traditional Chinese).
- Correct answers MUST be distributed: not all the same letter. Spread across A, B, C, D.
- CRITICAL: The passage must have EXACTLY 5 blanks — count them before responding.

Return JSON: { "clozeSuite": { "passage": "...", "questions": [...exactly 5 items...] } }`;

    const schema = {
      type: Type.OBJECT,
      properties: {
        clozeSuite: {
          type: Type.OBJECT,
          properties: {
            passage: { type: Type.STRING },
            questions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  gapNumber: { type: Type.INTEGER },
                  options: { type: Type.ARRAY, items: { type: Type.STRING } },
                  correctAnswer: { type: Type.STRING },
                  category: { type: Type.STRING },
                  explanation: { type: Type.STRING }
                },
                required: ["gapNumber", "options", "correctAnswer", "category", "explanation"]
              }
            }
          },
          required: ["passage", "questions"]
        }
      },
      required: ["clozeSuite"]
    };

    const data = process.env.OPENAI_API_KEY
      ? await callOpenAI(system, user)
      : await callGemini(user, schema);

    res.json({ success: true, data });
  } catch (error: any) {
    console.error("Cloze generation error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── Generate blank matching only ──────────────────────────────
app.post("/api/generate-matching", async (req, res) => {
  try {
    const { vocabList } = req.body;
    verifyApiKeys();

    const vocabString = vocabList?.length > 0
      ? vocabList.map((vw: any) => `"${vw.word}"`).join(", ")
      : "standard GSAT vocabulary";

    const system = `You are Tr. Shirley Du, an elite GSAT English educator in Taiwan. Generate a blank matching passage in JSON.`;

    const user = `Generate 1 GSAT-style blank matching passage (文意選填) with EXACTLY 10 blanks using vocabulary: ${vocabString}

STRICT RULES:
- "passage": 200-250 word natural article. Blanks MUST be written as "__ 21 __", "__ 22 __", ..., "__ 30 __" inline. EXACTLY 10 blanks — count before responding.
- "options": EXACTLY 10 strings labeled (A) through (J): ["(A) word/phrase", "(B)...", ..., "(J)..."]. Mix single words and short phrases.
- "answers": EXACTLY 10 single letters (A-J) for blanks 21-30 in order. Each letter used EXACTLY once.
- "explanations": EXACTLY 10 Traditional Chinese explanation strings.
- Correct answers must use ALL 10 letters A through J exactly once each.
- CRITICAL: Count blanks in passage (must be 10), count options (must be 10), count answers (must be 10).

Return JSON: { "blankMatchingSuite": { "passage": "...", "options": [...10...], "answers": [...10...], "explanations": [...10...] } }`;

    const schema = {
      type: Type.OBJECT,
      properties: {
        blankMatchingSuite: {
          type: Type.OBJECT,
          properties: {
            passage: { type: Type.STRING },
            options: { type: Type.ARRAY, items: { type: Type.STRING } },
            answers: { type: Type.ARRAY, items: { type: Type.STRING } },
            explanations: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["passage", "options", "answers", "explanations"]
        }
      },
      required: ["blankMatchingSuite"]
    };

    const data = process.env.OPENAI_API_KEY
      ? await callOpenAI(system, user)
      : await callGemini(user, schema);

    res.json({ success: true, data });
  } catch (error: any) {
    console.error("Matching generation error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── Generate reading only ─────────────────────────────────────
app.post("/api/generate-reading", async (req, res) => {
  try {
    const { vocabList, selectedReadingLevels } = req.body;
    verifyApiKeys();

    const levels = selectedReadingLevels?.length > 0 ? selectedReadingLevels : ["essential"];
    const vocabString = vocabList?.length > 0
      ? vocabList.map((vw: any) => `"${vw.word}"`).join(", ")
      : "standard GSAT vocabulary";

    const system = `You are Tr. Shirley Du, an elite GSAT English educator in Taiwan. Generate reading comprehension passages in JSON.`;

    const user = `Generate GSAT reading comprehension passages for these levels: ${levels.join(", ")}.
Vocabulary reference: ${vocabString}

STRICT RULES:
- For EACH level in [${levels.join(", ")}], generate exactly 1 passage with EXACTLY 4 questions.
- "level": must match the requested level exactly ("basic", "essential", or "advanced").
- "title": engaging article title.
- "passage": 250-300 word natural article (NOT a textbook exercise).
- "questions": EXACTLY 4 comprehension questions per passage.
- Each question: "id" (unique), "question" (string), "options" (exactly 4: ["(A)...", "(B)...", "(C)...", "(D)..."]), "correctAnswer" (bare letter A/B/C/D — NO parentheses), "explanation" (Traditional Chinese with key sentence translation).
- Correct answers MUST be distributed across A, B, C, D — do NOT cluster on one letter.
- CRITICAL: Return EXACTLY ${levels.length} passage(s) in the array.

Return JSON: { "readingPassages": [...exactly ${levels.length} passage(s)...] }`;

    const schema = {
      type: Type.OBJECT,
      properties: {
        readingPassages: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              level: { type: Type.STRING },
              title: { type: Type.STRING },
              passage: { type: Type.STRING },
              questions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    question: { type: Type.STRING },
                    options: { type: Type.ARRAY, items: { type: Type.STRING } },
                    correctAnswer: { type: Type.STRING },
                    explanation: { type: Type.STRING }
                  },
                  required: ["id", "question", "options", "correctAnswer", "explanation"]
                }
              }
            },
            required: ["level", "title", "passage", "questions"]
          }
        }
      },
      required: ["readingPassages"]
    };

    const data = process.env.OPENAI_API_KEY
      ? await callOpenAI(system, user)
      : await callGemini(user, schema);

    res.json({ success: true, data });
  } catch (error: any) {
    console.error("Reading generation error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── Evaluate and generate commentary report ───────────────────
app.post("/api/evaluate-report", async (req, res) => {
  try {
    const { scoreSummary, selectedLevel } = req.body;
    verifyApiKeys();

    const system = `You are Tr. Shirley Du, an English educator in Taiwan specializing in GSAT (學測英文) preparation. Your style is warm, caring, humorous, encouraging, and deeply professional. Write in Traditional Chinese.`;

    const user = `Write a personalized progress commentary report as Tr. Shirley Du.
Performance:
- Overall: ${scoreSummary.comprehensive.correct}/${scoreSummary.comprehensive.total} (${scoreSummary.comprehensive.score}%)
- Vocabulary: ${scoreSummary.vocab.correct}/${scoreSummary.vocab.total}
- Cloze: ${scoreSummary.cloze.correct}/${scoreSummary.cloze.total}
- Blank Matching: ${scoreSummary.blankMatching.correct}/${scoreSummary.blankMatching.total}
- Reading: ${scoreSummary.reading.correct}/${scoreSummary.reading.total}
- Level: GSAT Level ${selectedLevel || "Mixed"}

Return JSON: { "greeting": string, "analysis": string, "tips": [string, string, string], "encouragement": string }`;

    const schema = {
      type: Type.OBJECT,
      properties: {
        greeting: { type: Type.STRING },
        analysis: { type: Type.STRING },
        tips: { type: Type.ARRAY, items: { type: Type.STRING } },
        encouragement: { type: Type.STRING }
      },
      required: ["greeting", "analysis", "tips", "encouragement"]
    };

    const data = process.env.OPENAI_API_KEY
      ? await callOpenAI(system, user)
      : await callGemini(user, schema);

    res.json({ success: true, data });
  } catch (error: any) {
    console.error("Evaluate report error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default app;
