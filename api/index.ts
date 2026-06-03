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
      { role: "user", content: user + "\n\nCRITICAL: Return ONLY a valid JSON object. No markdown, no explanation outside JSON." }
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });
  return JSON.parse((response.choices[0].message.content || "").trim());
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

// ── Health ────────────────────────────────────────────────────
app.get("/api/health", (req, res) => res.json({ status: "ok" }));

// ── Vocab ─────────────────────────────────────────────────────
app.post("/api/generate-vocab", async (req, res) => {
  try {
    const { vocabList } = req.body;
    verifyApiKeys();

    const vocabString = vocabList?.length > 0
      ? vocabList.map((vw: any) => `"${vw.word}" (${vw.pos || ""})`).join(", ")
      : "standard GSAT Level 3-6 vocabulary";

    const system = `You are an expert GSAT English question writer for Taiwan high school students. You write precise, unambiguous multiple-choice vocabulary questions.`;

    const user = `Generate EXACTLY 10 GSAT-style vocabulary fill-in-the-blank questions using words from: ${vocabString}

QUALITY RULES — each question MUST pass all of these:
1. The sentence must have EXACTLY ONE word that correctly fills the blank. If two or more options could reasonably fit, rewrite the sentence with more context clues.
2. The sentence MUST NOT contain the answer word or any morphological variant of it.
3. The sentence must provide enough syntactic and semantic context to make the correct answer unambiguous.
4. Distractors must be plausible words of the same part of speech, but semantically wrong in context.
5. Each "question" is a complete natural English sentence with "______" (six underscores) as the blank.
6. "options": exactly 4 strings ["(A) word", "(B) word", "(C) word", "(D) word"] — single words only.
7. "correctAnswer": EXACTLY one bare letter with NO parentheses. 
8. ANSWER DISTRIBUTION IS MANDATORY: Across all 10 questions, the correct answers MUST be distributed as follows — exactly 2 or 3 questions with answer A, exactly 2 or 3 with answer B, exactly 2 or 3 with answer C, exactly 2 or 3 with answer D. Count and verify before responding. Do NOT put more than 3 answers on the same letter.
9. "explanation": Traditional Chinese explanation of why the answer is correct and why each distractor is wrong.

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

    const data = process.env.OPENAI_API_KEY ? await callOpenAI(system, user) : await callGemini(user, schema);
    res.json({ success: true, data });
  } catch (error: any) {
    console.error("Vocab error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── Cloze ─────────────────────────────────────────────────────
app.post("/api/generate-cloze", async (req, res) => {
  try {
    const { vocabList } = req.body;
    verifyApiKeys();

    const vocabString = vocabList?.length > 0
      ? vocabList.map((vw: any) => `"${vw.word}"`).join(", ")
      : "standard GSAT vocabulary";

    const system = `You are an expert GSAT English cloze passage writer for Taiwan high school exams.`;

    const user = `Generate 1 GSAT-style cloze passage (綜合測驗) referencing vocabulary: ${vocabString}

QUALITY RULES:
1. Write a natural, engaging 150-180 word article on an interesting topic (science, culture, nature, psychology, history). It must read like a real magazine article, NOT a textbook exercise.
2. Place EXACTLY 5 blanks numbered inline as: __ 11 __, __ 12 __, __ 13 __, __ 14 __, __ 15 __
3. Each blank tests ONE specific thing: vocabulary, grammar, collocation, discourse connector, or idiom.
4. For each blank, write 4 options. ONLY ONE option must be correct. The other 3 must be clearly wrong in context (wrong grammar, wrong collocation, or wrong meaning). Options may be words OR short phrases.
5. "correctAnswer": bare letter A/B/C/D — NO parentheses.
6. ANSWER DISTRIBUTION: across the 5 gaps, spread answers across A, B, C, D. Do NOT make all answers the same letter.
7. Verify: the passage has EXACTLY 5 inline blanks formatted as __ 11 __ through __ 15 __.
8. "explanation": Traditional Chinese explanation per gap.

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

    const data = process.env.OPENAI_API_KEY ? await callOpenAI(system, user) : await callGemini(user, schema);
    res.json({ success: true, data });
  } catch (error: any) {
    console.error("Cloze error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── Blank Matching ────────────────────────────────────────────
app.post("/api/generate-matching", async (req, res) => {
  try {
    const { vocabList } = req.body;
    verifyApiKeys();

    const vocabString = vocabList?.length > 0
      ? vocabList.map((vw: any) => `"${vw.word}"`).join(", ")
      : "standard GSAT vocabulary";

    const system = `You are an expert GSAT English blank-matching passage writer for Taiwan high school exams.`;

    const user = `Generate 1 GSAT-style blank matching passage (文意選填) referencing vocabulary: ${vocabString}

QUALITY RULES:
1. Write a natural, engaging 200-250 word article. Must read like a real article, NOT a textbook exercise.
2. Place EXACTLY 10 blanks numbered inline as __ 16 __, __ 17 __, __ 18 __, __ 19 __, __ 20 __, __ 21 __, __ 22 __, __ 23 __, __ 24 __, __ 25 __
3. Count the blanks in your passage before responding — there must be EXACTLY 10.
4. "options": EXACTLY 10 candidate strings (A) through (J). Mix single words and 2-3 word phrases. Make options deceptive by including similar parts of speech.
5. "answers": EXACTLY 10 letters (one per blank 16-25). Each letter A-J used EXACTLY once.
6. "explanations": EXACTLY 10 Traditional Chinese explanations (one per blank).
7. Each blank must have EXACTLY ONE correct answer from the options. The other 9 options must not fit that blank grammatically or semantically.
8. Verify counts: 10 blanks in passage, 10 options, 10 answers, 10 explanations.

Return JSON: { "blankMatchingSuite": { "passage": "...", "options": [...10...], "answers": [...10 letters A-J...], "explanations": [...10...] } }`;

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

    const data = process.env.OPENAI_API_KEY ? await callOpenAI(system, user) : await callGemini(user, schema);
    res.json({ success: true, data });
  } catch (error: any) {
    console.error("Matching error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── Reading ───────────────────────────────────────────────────
app.post("/api/generate-reading", async (req, res) => {
  try {
    const { vocabList, selectedReadingLevels } = req.body;
    verifyApiKeys();

    const levels = selectedReadingLevels?.length > 0 ? selectedReadingLevels : ["essential"];
    const vocabString = vocabList?.length > 0
      ? vocabList.map((vw: any) => `"${vw.word}"`).join(", ")
      : "standard GSAT vocabulary";

    const system = `You are an expert GSAT English reading comprehension writer for Taiwan high school exams.`;

    const user = `Generate reading comprehension passages for levels: ${levels.join(", ")} using vocabulary: ${vocabString}

QUALITY RULES:
1. For EACH level [${levels.join(", ")}], write exactly 1 passage (250-300 words) on a genuinely interesting topic.
2. The passage must read like a real magazine or academic article — engaging, natural, informative.
3. Each passage has EXACTLY 4 comprehension questions testing different skills: main idea, specific detail, vocabulary in context, inference or title.
4. "options": exactly 4 strings per question: ["(A) ...", "(B) ...", "(C) ...", "(D) ..."]. Options can be full sentences or short phrases.
5. "correctAnswer": bare letter A/B/C/D — NO parentheses.
6. ANSWER DISTRIBUTION: across all questions in a passage, spread answers across A, B, C, D. Do NOT cluster on one letter.
7. Each question must have EXACTLY ONE unambiguously correct answer supported by the passage text.
8. "explanation": Traditional Chinese explanation with the key evidence sentence from the passage translated.
9. Return EXACTLY ${levels.length} passage(s).

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

    const data = process.env.OPENAI_API_KEY ? await callOpenAI(system, user) : await callGemini(user, schema);
    res.json({ success: true, data });
  } catch (error: any) {
    console.error("Reading error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── Evaluate report ───────────────────────────────────────────
app.post("/api/evaluate-report", async (req, res) => {
  try {
    const { scoreSummary, selectedLevel } = req.body;
    verifyApiKeys();

    const system = `You are Tr. Shirley Du, a warm, encouraging GSAT English educator in Taiwan. Write in Traditional Chinese.`;
    const user = `Write a personalized progress report as Tr. Shirley Du.
Performance:
- Overall: ${scoreSummary.comprehensive.correct}/${scoreSummary.comprehensive.total} (${scoreSummary.comprehensive.score}%)
- Vocabulary: ${scoreSummary.vocab.correct}/${scoreSummary.vocab.total}
- Cloze: ${scoreSummary.cloze.correct}/${scoreSummary.cloze.total}
- Blank Matching: ${scoreSummary.blankMatching.correct}/${scoreSummary.blankMatching.total}
- Reading: ${scoreSummary.reading.correct}/${scoreSummary.reading.total}
- Level: ${selectedLevel || "Mixed"}

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

    const data = process.env.OPENAI_API_KEY ? await callOpenAI(system, user) : await callGemini(user, schema);
    res.json({ success: true, data });
  } catch (error: any) {
    console.error("Report error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default app;
