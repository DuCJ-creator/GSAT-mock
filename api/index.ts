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

async function callOpenAIHighQuality(system: string, user: string): Promise<any> {
  const openai = getOpenAI();
  const response = await openai.chat.completions.create({
    model: "gpt-4o",  // Use full GPT-4o for question quality — mini cannot reliably produce unambiguous exam questions
    messages: [
      { role: "system", content: system },
      { role: "user", content: user + "\n\nCRITICAL: Return ONLY a valid JSON object. No markdown, no preamble." }
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
  });
  return JSON.parse((response.choices[0].message.content || "").trim());
}

// Standard quality calls — used for cloze, matching, reading, report
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

MANDATORY PROCESS — follow these steps for EACH question:

STEP 1: Identify the word to test and its part of speech (noun/verb/adjective/adverb).

STEP 2: Write a sentence where:
- The blank position REQUIRES that exact part of speech grammatically.
- The surrounding context (collocations, subject matter, grammar structure) makes ONLY the correct word fit.
- The sentence is factually accurate, professionally written, and natural academic English.
- The sentence could appear in a real GSAT exam paper without modification.
- CRITICAL: The correct answer word (or any of its morphological variants — e.g. if answer is "surrender", also exclude "surrendered", "surrendering") must NOT appear anywhere in the sentence.

STEP 3: Choose 3 distractors that are:
- The SAME part of speech as the correct answer.
- Plausible at first glance but clearly wrong when the full sentence context is considered.
- NOT interchangeable with the correct answer in this specific sentence.

STEP 4: Test every distractor by mentally substituting it into the blank:
- If ANY distractor produces a grammatically correct, meaningfully plausible sentence → the question FAILS.
- Rewrite the sentence with tighter collocational or contextual constraints until all distractors fail this test.

NATURALNESS STANDARDS — every sentence must pass ALL of these:
- Grammatically correct with NO errors.
- Factually accurate (e.g. do not say scientists "invade" cells; use "penetrate" or "infect").
- Contextually coherent — the sentence topic must logically call for the tested word.
- Free of awkward phrasing, unnatural word order, or implausible scenarios.
- Appropriate for academic use — no slang, colloquialisms, or culturally inappropriate content.

BAD example (fails multiple standards):
"The ______ of the project will determine its success." with options (A) economic (B) annual (C) eventual (D) flexible
— FAILS because: blank needs a noun but all options are adjectives; multiple options could arguably fit.

GOOD example (passes all standards):
"The marine biologist spent a decade documenting the ______ patterns of deep-sea creatures that had never been observed before."
with options (A) migration (B) flexible (C) evaluate (D) splendid
— PASSES because: blank clearly needs a noun (patterns of X); "migration patterns" is a natural collocation; "flexible/evaluate/splendid" are wrong POS or clearly don't collocate.

FORMAT:
- "question": complete sentence with exactly "______" (six underscores) as the blank.
- "options": ["(A) word", "(B) word", "(C) word", "(D) word"] — single words only, ALL same POS.
- "correctAnswer": the pre-assigned bare letter for that question number — NO parentheses.
- "wordTested": the correct answer word.
- "explanation": Traditional Chinese — explain why the correct word fits semantically and grammatically, and why each distractor specifically fails in this sentence.
- "id": "v1" through "v10".

FINAL CHECK: The array must contain EXACTLY 10 items. Count them before returning. Remove any item beyond 10.

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

    let data = process.env.OPENAI_API_KEY ? await callOpenAIHighQuality(system, user) : await callGemini(user, schema);

    // Server-side guards
    if (data.vocabQuestions) {
      // Hard cap at 10
      if (data.vocabQuestions.length > 10) {
        data.vocabQuestions = data.vocabQuestions.slice(0, 10);
      }
      // Flag any question where the answer word appears in the sentence
      data.vocabQuestions = data.vocabQuestions.map((q: any) => {
        const answerWord = (q.wordTested || "").toLowerCase();
        const questionText = (q.question || "").toLowerCase();
        if (answerWord && questionText.includes(answerWord)) {
          // Mark for client to show warning — don't silently drop
          q._warning = `Answer word "${q.wordTested}" appears in the question sentence.`;
        }
        return q;
      });
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

MANDATORY PROCESS:

STEP 1: Choose an engaging, specific topic (e.g. a scientific discovery, a cultural practice, a psychological finding, a historical event). Write a 150-180 word article that reads like a real magazine piece.

STEP 2: Identify 5 natural positions in the passage for blanks. Each blank should test a different linguistic category:
- 1-2 vocabulary items (specific word meaning in context)
- 1-2 grammar or collocation items (preposition, verb form, fixed phrase)
- 1 discourse connector (transition word or phrase connecting ideas)

STEP 3: For each blank, write 4 options and place the correct one at the pre-assigned letter position.
- Options may be single words OR short phrases (2-3 words).
- Test each distractor: substituting it must produce either a grammatically wrong or semantically implausible sentence.
- If any distractor passes the test, adjust the surrounding sentence context to eliminate the ambiguity.

STEP 4: Number blanks inline as __ 11 __, __ 12 __, __ 13 __, __ 14 __, __ 15 __ within the passage text.

NATURALNESS STANDARDS:
- The passage must be factually accurate and professionally written.
- Every sentence (including those with blanks filled in) must be natural English.
- The passage must flow coherently as a whole — ideas connect logically between sentences.
- No awkward phrasing, no implausible scenarios, no factual errors.

FORMAT per question: gapNumber (integer 11-15), options (4 strings), correctAnswer (bare letter), category, explanation (Traditional Chinese).

VERIFY before returning: passage contains EXACTLY 5 blank tokens __ 11 __ through __ 15 __.

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

MANDATORY PROCESS — follow these steps in order:

STEP 1: Plan your 10 blanks BEFORE writing the passage.
List exactly 10 words you will blank out, one for each position 16-25:
- Blank 16: [word] — part of speech: [POS]
- Blank 17: [word] — part of speech: [POS]
- Blank 18: [word] — part of speech: [POS]
- Blank 19: [word] — part of speech: [POS]
- Blank 20: [word] — part of speech: [POS]
- Blank 21: [word] — part of speech: [POS]
- Blank 22: [word] — part of speech: [POS]
- Blank 23: [word] — part of speech: [POS]
- Blank 24: [word] — part of speech: [POS]
- Blank 25: [word] — part of speech: [POS]

STEP 2: Write the passage (220-260 words) incorporating all 10 blanked words naturally.
- Replace each planned word with its blank token: __ 16 __, __ 17 __, ..., __ 25 __
- Every blank must fit naturally — the surrounding sentence must be grammatically correct and meaningful both with the answer and within the passage context.
- The passage must read like a real magazine article on an interesting topic (science, culture, nature, psychology, history, technology).
- Each sentence containing a blank must provide enough context to make the correct answer unambiguous, but not so obvious that the blank is trivial.

STEP 3: Create the 10 candidate options (A)-(J).
- Include all 10 answer words, each labeled (A) through (J) in random order.
- Add deceptive distractors only if you have fewer than 10 answer words — each distractor must be clearly wrong for all 10 blanks due to grammar or meaning.
- Mix single words and short 2-3 word phrases.
- Include similar-looking pairs to challenge students (e.g. two verbs with different collocations, two nouns from similar semantic fields).

STEP 4: Build the answers array.
- "answers": exactly 10 letters [A-J], one per blank in order from blank 16 to blank 25.
- Each letter A through J appears EXACTLY once.

STEP 5: Write 10 Traditional Chinese explanations, one per blank (16-25).

QUALITY STANDARDS:
- Every sentence must be natural, factually accurate, and professionally written English.
- No sentence should be awkward, implausible, or culturally inappropriate.
- The correct answer for each blank must be the ONLY option that fits — test each of the other 9 options against the blank to confirm they do not fit grammatically or semantically.
- FINAL COUNT CHECK: passage must contain exactly the tokens __ 16 __, __ 17 __, __ 18 __, __ 19 __, __ 20 __, __ 21 __, __ 22 __, __ 23 __, __ 24 __, __ 25 __ — all 10, no more, no less.

Return JSON: { "blankMatchingSuite": { "passage": "...", "options": [...exactly 10 strings (A)-(J)...], "answers": [...exactly 10 letters A-J...], "explanations": [...exactly 10 Traditional Chinese strings...] } }`;

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

MANDATORY PROCESS for each passage:

STEP 1: Choose a specific, genuinely interesting topic appropriate for the level. Write 250-300 words that read like a real academic or magazine article — engaging, informative, coherent.

STEP 2: Write 4 comprehension questions testing different skills:
- Q1: Main idea or title selection
- Q2: Specific detail (directly stated in the passage)
- Q3: Vocabulary in context (meaning of a word/phrase as used in the passage)
- Q4: Inference or author's purpose

STEP 3: For each question, write 4 options and place the correct one at the pre-assigned letter position.
- Each correct answer must be directly and unambiguously supported by the passage text.
- Each distractor must be clearly wrong — either contradicted by the passage, not mentioned, or a plausible-sounding misreading.
- Options can be full sentences or short phrases as appropriate.

NATURALNESS AND ACCURACY STANDARDS:
- Passage content must be factually accurate.
- Every sentence must be natural, professionally written English.
- Questions must be clearly worded with no ambiguity.
- Correct answers must be the ONLY defensible choice given the passage text.
- Distractors must not be accidentally correct due to general knowledge outside the passage.

FORMAT: level, title, passage (250-300 words), questions (exactly 4 per passage with id/question/options/correctAnswer/explanation in Traditional Chinese).

Return EXACTLY ${levels.length} passage(s).

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
- Vocabulary MCQ: ${scoreSummary.vocab.correct}/${scoreSummary.vocab.total}
- Reading Comprehension: ${scoreSummary.reading.correct}/${scoreSummary.reading.total}
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
