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
      { role: "user", content: user + "\n\nCRITICAL: Return ONLY a valid JSON object. No markdown, no preamble." }
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
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
      temperature: 0.7,
    },
  });
  if (!response.text) throw new Error("Empty response from Gemini.");
  return JSON.parse(response.text.trim());
}

// Randomly shuffle a small answer key for pre-assignment
function makeAnswerKey(n: number, letters: string[]): string[] {
  const key: string[] = [];
  const perLetter = Math.floor(n / letters.length);
  const pool: string[] = [];
  for (const l of letters) {
    for (let i = 0; i < perLetter; i++) pool.push(l);
  }
  // Fill remainder
  let i = 0;
  while (pool.length < n) { pool.push(letters[i++ % letters.length]); }
  // Fisher-Yates shuffle
  for (let j = pool.length - 1; j > 0; j--) {
    const k = Math.floor(Math.random() * (j + 1));
    [pool[j], pool[k]] = [pool[k], pool[j]];
  }
  return pool.slice(0, n);
}

// ── Health ────────────────────────────────────────────────────
app.get("/api/health", (req, res) => res.json({ status: "ok" }));

// ── Vocab ─────────────────────────────────────────────────────
app.post("/api/generate-vocab", async (req, res) => {
  try {
    const { vocabList } = req.body;
    verifyApiKeys();

    const vocabString = vocabList?.length > 0
      ? vocabList.map((vw: any) => `"${vw.word}" (POS: ${vw.pos || "unspecified"})`).join(", ")
      : "standard GSAT Level 3-6 vocabulary";

    // Pre-assign answer positions server-side so AI cannot default to A
    const answerKey = makeAnswerKey(10, ["A","B","C","D"]);
    const assignmentList = answerKey.map((ans, i) => `Q${i+1} → ${ans}`).join(", ");

    const system = `You are an expert GSAT English question writer for Taiwan high school students. You write precise, professional, unambiguous multiple-choice vocabulary questions at GSAT difficulty level.`;

    const user = `Generate EXACTLY 10 GSAT-style vocabulary fill-in-the-blank questions using words from: ${vocabString}

The correct answer positions have been pre-assigned for you. You MUST place the correct answer at exactly these positions:
${assignmentList}

This means for Q1 the correct word goes in position ${answerKey[0]}, for Q2 in position ${answerKey[1]}, etc.

QUALITY RULES for each question:

RULE 1 — PART OF SPEECH MUST MATCH:
- Identify the POS of the correct answer word (noun, verb, adjective, adverb).
- The sentence structure MUST grammatically require that exact POS at the blank position.
- BAD: "The ______ of the project will determine its success." with options (A) economic (B) annual (C) eventual (D) flexible — all options are adjectives but the blank needs a noun (outcome/quality/etc.).
- GOOD: "The scientist published her ______ findings in a leading academic journal." — blank needs an adjective; options are all adjectives but only one fits the meaning.
- Before writing the sentence, decide: what POS does the blank require? Then make sure ALL 4 options are that same POS.

RULE 2 — EXACTLY ONE CORRECT ANSWER:
- After writing the sentence, mentally test every distractor: can it fill the blank and still produce a grammatically correct, meaningful sentence? If yes, rewrite the sentence with tighter constraints.
- BAD: "The detective was determined to catch the ______ who committed the crime." — criminal/suspect/murderer/gangster all work.
- GOOD: "The biologist's ______ of the newly discovered species took three years of field research to complete." — only "identification" or similar specific noun fits; generic words like "study" or "work" are blocked by the collocation "of the newly discovered species."

RULE 3 — PROFESSIONAL STANDARD:
- Every sentence must be factually accurate, natural English, and appropriate for academic use.
- No slang, no culturally inappropriate content, no absurd or implausible scenarios.
- Sentences should reflect real-world academic, professional, or scientific contexts.

RULE 4 — PLACE CORRECT ANSWER AT PRE-ASSIGNED POSITION:
- For Q1, the correct word must appear as option ${answerKey[0]} in the options array.
- For Q2, the correct word must appear as option ${answerKey[1]}. And so on.
- "correctAnswer" field must exactly match the pre-assigned letter for that question number.

FORMAT:
- "question": complete sentence with exactly "______" (six underscores) as the blank.
- "options": ["(A) word", "(B) word", "(C) word", "(D) word"] — single words only, all same POS.
- "correctAnswer": bare letter matching the pre-assigned position — NO parentheses.
- "wordTested": the correct answer word.
- "explanation": Traditional Chinese — why the correct word fits, why each distractor does not.
- "id": "v1" through "v10".

FINAL CHECK before returning: the array must have EXACTLY 10 items, no more, no less. Count them.

Return JSON: { "vocabQuestions": [ ...EXACTLY 10 items... ] }`;

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

    let data = process.env.OPENAI_API_KEY ? await callOpenAI(system, user) : await callGemini(user, schema);

    // Hard cap: never return more than 10 questions
    if (data.vocabQuestions && data.vocabQuestions.length > 10) {
      data.vocabQuestions = data.vocabQuestions.slice(0, 10);
    }

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

    const answerKey = makeAnswerKey(5, ["A","B","C","D"]);
    const assignmentList = answerKey.map((ans, i) => `Gap ${11+i} → ${ans}`).join(", ");

    const system = `You are an expert GSAT English cloze passage writer for Taiwan high school exams.`;

    const user = `Generate 1 GSAT-style cloze passage (綜合測驗) referencing vocabulary: ${vocabString}

Pre-assigned correct answer positions: ${assignmentList}

QUALITY RULES:
1. Write a natural, engaging 150-180 word article on an interesting topic (science, culture, nature, psychology, history). It must read like a real magazine article, NOT a textbook exercise.
2. Place EXACTLY 5 blanks inline as: __ 11 __, __ 12 __, __ 13 __, __ 14 __, __ 15 __
3. Each blank tests ONE specific linguistic item: vocabulary, grammar, collocation, discourse connector, or idiom.
4. For each blank, write 4 options. ONLY ONE option is correct. The other 3 must be clearly wrong in context.
5. Options may be single words OR short phrases (2-3 words).
6. Place the correct option at the pre-assigned letter position for each gap.
7. "correctAnswer": the pre-assigned bare letter (A/B/C/D) — NO parentheses.
8. "explanation": Traditional Chinese explanation per gap.
9. VERIFY before returning: count the blanks in the passage — must be EXACTLY 5, numbered __ 11 __ through __ 15 __.

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

CRITICAL COUNTING REQUIREMENT:
- The passage MUST contain EXACTLY 10 blanks. Not 7, not 8, not 9 — EXACTLY 10.
- The blanks MUST be numbered inline as: __ 16 __, __ 17 __, __ 18 __, __ 19 __, __ 20 __, __ 21 __, __ 22 __, __ 23 __, __ 24 __, __ 25 __
- Before writing the passage, plan 10 specific positions where blanks will appear.
- After writing the passage, count every blank token (__ N __) — if the count is not exactly 10, rewrite.

QUALITY RULES:
1. Write a natural, engaging 220-260 word article. Must read like a real article, NOT a textbook exercise.
2. "options": EXACTLY 10 candidate strings labeled (A) through (J). Mix single words and 2-3 word phrases. Include deceptive pairs (e.g. two similar verbs, two similar nouns) to challenge students.
3. "answers": EXACTLY 10 letters, one per blank in order from blank 16 to blank 25. Each letter A through J used EXACTLY once.
4. "explanations": EXACTLY 10 Traditional Chinese explanation strings, one per blank (16 through 25).
5. Each blank must have EXACTLY ONE correct answer. The other 9 options must not fit that blank grammatically or semantically.
6. SELF-CHECK before returning:
   - Count blanks in passage: must equal 10.
   - Count options array: must equal 10.
   - Count answers array: must equal 10.
   - Count explanations array: must equal 10.
   - Verify each letter A-J appears exactly once in answers.

Return JSON: { "blankMatchingSuite": { "passage": "...", "options": [...exactly 10...], "answers": [...exactly 10 letters A-J...], "explanations": [...exactly 10...] } }`;

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

    // Pre-assign answer positions for each passage
    const passageKeys = levels.map(() => makeAnswerKey(4, ["A","B","C","D"]));
    const keyDescriptions = levels.map((lvl: string, i: number) =>
      `${lvl} passage: Q1→${passageKeys[i][0]}, Q2→${passageKeys[i][1]}, Q3→${passageKeys[i][2]}, Q4→${passageKeys[i][3]}`
    ).join("; ");

    const system = `You are an expert GSAT English reading comprehension writer for Taiwan high school exams.`;

    const user = `Generate reading comprehension passages for levels: ${levels.join(", ")} using vocabulary: ${vocabString}

Pre-assigned correct answer positions: ${keyDescriptions}

QUALITY RULES:
1. For EACH level [${levels.join(", ")}], write exactly 1 passage (250-300 words) on a genuinely interesting topic.
2. The passage must read like a real magazine or academic article — engaging, natural, informative.
3. Each passage has EXACTLY 4 comprehension questions testing different skills: main idea, specific detail, vocabulary in context, inference or title.
4. "options": exactly 4 strings per question. Options can be full sentences or short phrases.
   Format: ["(A) ...", "(B) ...", "(C) ...", "(D) ..."]
5. "correctAnswer": bare letter matching the pre-assigned position — NO parentheses.
6. Place each correct answer at the pre-assigned position for that question number.
7. Each question must have EXACTLY ONE unambiguously correct answer supported directly by the passage text.
8. "explanation": Traditional Chinese explanation citing the key evidence sentence from the passage.
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
