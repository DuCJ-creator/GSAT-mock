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
    model: "gpt-4o",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user + "\n\nCRITICAL: Return ONLY a valid JSON object. No markdown, no preamble." }
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });
  return JSON.parse((response.choices[0].message.content || "").trim());
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
    temperature: 0.45,
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
      temperature: 0.45,
    },
  });
  if (!response.text) throw new Error("Empty response from Gemini.");
  return JSON.parse(response.text.trim());
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let j = copy.length - 1; j > 0; j--) {
    const k = Math.floor(Math.random() * (j + 1));
    [copy[j], copy[k]] = [copy[k], copy[j]];
  }
  return copy;
}

function makeAnswerKey(n: number, letters: string[]): string[] {
  const pool: string[] = [];
  const perLetter = Math.floor(n / letters.length);

  for (const l of letters) {
    for (let i = 0; i < perLetter; i++) pool.push(l);
  }

  let i = 0;
  while (pool.length < n) pool.push(letters[i++ % letters.length]);

  return shuffle(pool).slice(0, n);
}

function normalizeAnswer(answer: any): string {
  return String(answer || "").replace(/[()]/g, "").trim().toUpperCase();
}

function normalizeOptions(options: any): string[] {
  if (!options) return [];
  const letters = ["A", "B", "C", "D"];

  if (Array.isArray(options)) {
    return options.slice(0, 4).map((opt: any, idx: number) => {
      const raw = String(opt || "").trim();
      if (/^\([A-D]\)\s*/.test(raw)) return raw;
      if (/^[A-D][).]\s*/.test(raw)) return `(${raw[0]}) ${raw.substring(2).trim()}`;
      return `(${letters[idx]}) ${raw}`;
    });
  }

  if (typeof options === "string") {
    const parts = options.split(/\s*(?=\([A-D]\))/).filter(Boolean);
    return normalizeOptions(parts.length > 1 ? parts : [options]);
  }

  return [];
}

function optionWord(option: string): string {
  return option.replace(/^\([A-D]\)\s*/, "").trim();
}

function normalizePos(pos: any): string {
  const p = String(pos || "").toLowerCase().replace(/\./g, "").trim();
  if (["n", "noun", "名詞"].includes(p)) return "noun";
  if (["v", "verb", "vi", "vt", "動詞"].includes(p)) return "verb";
  if (["adj", "adjective", "形容詞"].includes(p)) return "adjective";
  if (["adv", "adverb", "副詞"].includes(p)) return "adverb";
  if (["prep", "preposition", "介系詞"].includes(p)) return "preposition";
  if (["conj", "conjunction", "連接詞"].includes(p)) return "conjunction";
  return p || "unspecified";
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function answerLeaksIntoQuestion(question: string, word: string): boolean {
  const q = String(question || "").toLowerCase();
  const w = String(word || "").toLowerCase().trim();
  if (!q || !w) return true;

  const exact = new RegExp(`\\b${escapeRegExp(w)}\\b`, "i");
  if (exact.test(q)) return true;

  const suffixes = ["s", "es", "ed", "ing", "er", "est", "ly", "ion", "ions", "ment", "ments", "ity", "ities", "al", "ally"];
  for (const suffix of suffixes) {
    const form = `${w}${suffix}`;
    const re = new RegExp(`\\b${escapeRegExp(form)}\\b`, "i");
    if (re.test(q)) return true;
  }

  return false;
}

function pickTargetWords(vocabList: any[], count: number = 10) {
  const clean = (Array.isArray(vocabList) ? vocabList : [])
    .map((vw: any) => ({
      word: String(vw.word || "").trim(),
      pos: normalizePos(vw.pos),
      rawPos: String(vw.pos || "").trim(),
      meaning: String(vw.meaning || "").trim(),
      level: vw.level,
      unit: vw.unit
    }))
    .filter((vw: any) => vw.word.length > 0);

  const seen = new Set<string>();
  const unique = clean.filter((vw: any) => {
    const key = vw.word.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return shuffle(unique).slice(0, count);
}

function buildTargetWordList(targetWords: any[], answerKey: string[]): string {
  return targetWords.map((vw: any, i: number) => {
    return `Q${i + 1}
- Target word: ${vw.word}
- POS from CSV: ${vw.rawPos || vw.pos || "unspecified"} (${vw.pos || "unspecified"})
- Chinese meaning from CSV: ${vw.meaning || "未提供"}
- Correct answer position: ${answerKey[i]}`;
  }).join("\n\n");
}

function validateVocabQuestion(q: any, expected: any, expectedAnswer: string, index: number): string[] {
  const issues: string[] = [];
  const id = `Q${index + 1}`;

  if (!q || typeof q !== "object") {
    return [`${id}: question item is missing or invalid.`];
  }

  const question = String(q.question || "").trim();
  const expectedWord = String(expected.word || "").trim();
  const wordTested = String(q.wordTested || "").trim();
  const correctAnswer = normalizeAnswer(q.correctAnswer);
  const options = normalizeOptions(q.options);

  if (!/^v\d+$/.test(String(q.id || ""))) issues.push(`${id}: id must be v1 through v10.`);
  if (!question.includes("______")) issues.push(`${id}: question must contain exactly ______ as the blank.`);
  if ((question.match(/______/g) || []).length !== 1) issues.push(`${id}: question must contain exactly one blank.`);
  if (!wordTested) issues.push(`${id}: wordTested is missing.`);
  if (wordTested.toLowerCase() !== expectedWord.toLowerCase()) {
    issues.push(`${id}: wordTested must be exactly "${expectedWord}" from the CSV target list.`);
  }
  if (answerLeaksIntoQuestion(question, expectedWord)) {
    issues.push(`${id}: target word "${expectedWord}" appears in or leaks into the sentence.`);
  }
  if (options.length !== 4) issues.push(`${id}: options must contain exactly 4 choices.`);
  if (!["A", "B", "C", "D"].includes(correctAnswer)) issues.push(`${id}: correctAnswer must be A, B, C, or D.`);
  if (correctAnswer !== expectedAnswer) issues.push(`${id}: correctAnswer must be the pre-assigned letter ${expectedAnswer}.`);

  if (options.length === 4 && ["A", "B", "C", "D"].includes(correctAnswer)) {
    const correctIndex = ["A", "B", "C", "D"].indexOf(correctAnswer);
    const correctOptionWord = optionWord(options[correctIndex] || "");

    if (correctOptionWord.toLowerCase() !== expectedWord.toLowerCase()) {
      issues.push(`${id}: the option at (${expectedAnswer}) must exactly be "${expectedWord}".`);
    }

    const bareWords = options.map(optionWord).map(w => w.toLowerCase());
    if (new Set(bareWords).size !== 4) issues.push(`${id}: options must be four distinct words or phrases.`);
    if (bareWords.some(w => !w)) issues.push(`${id}: all options must be non-empty.`);
  }

  if (!String(q.explanation || "").trim()) issues.push(`${id}: explanation is missing.`);

  return issues;
}

function validateVocabSuite(data: any, targetWords: any[], answerKey: string[]): string[] {
  const questions = data?.vocabQuestions;
  const issues: string[] = [];

  if (!Array.isArray(questions)) {
    return [`vocabQuestions must be an array.`];
  }

  if (questions.length !== targetWords.length) {
    issues.push(`vocabQuestions must contain exactly ${targetWords.length} items; received ${questions.length}.`);
  }

  questions.slice(0, targetWords.length).forEach((q: any, i: number) => {
    issues.push(...validateVocabQuestion(q, targetWords[i], answerKey[i], i));
  });

  return issues;
}

function buildVocabPrompt(targetWords: any[], answerKey: string[], previousIssues: string[] = []) {
  const targetList = buildTargetWordList(targetWords, answerKey);

  const correctionBlock = previousIssues.length > 0
    ? `
PREVIOUS ATTEMPT FAILED SERVER VALIDATION.
You MUST fix every issue below:
${previousIssues.map((x, i) => `${i + 1}. ${x}`).join("\n")}
`
    : "";

  const system = `You are a senior GSAT English test writer with 20+ years of experience creating official Taiwanese GSAT-style vocabulary questions. You are strict about part of speech, semantic field, collocation, and natural English.`;

  const user = `${correctionBlock}

Generate EXACTLY ${targetWords.length} high-quality GSAT-style vocabulary multiple-choice questions.

You MUST use the target words below exactly.
Each question must test the assigned word from the CSV.
Do not skip any target word.
Do not repeat any target word.
Do not replace the target word with a synonym.

TARGET WORDS FROM CSV:
${targetList}

CORE PRINCIPLE:
The CSV provides the target word, its part of speech, and its Chinese meaning.
You MUST use all three:
1. Use the target word as the correct answer.
2. Use the CSV POS to control grammar and all options.
3. Use the Chinese meaning to infer the semantic field and create professional distractors.

MANDATORY PROCESS FOR EACH QUESTION:

STEP 1 — Understand the target word.
For each assigned word:
- Read its English word.
- Read its POS from CSV.
- Read its Chinese meaning from CSV.
- Infer a semantic category from the meaning.
Examples:
testimony / n. / 證詞 → legal communication
durability / n. / 耐久性 → product quality
visual / adj. / 視覺的 → perception / presentation mode
alleviate / v. / 減輕 → reduce a problem, pain, or burden

STEP 2 — Write a natural GSAT-level sentence.
- The sentence must contain exactly one blank: ______
- The blank must require the CSV POS grammatically.
- The context must fit the Chinese meaning.
- The sentence must sound like authentic academic or formal English.
- The sentence must be realistic, natural, and factually reasonable.
- Avoid artificial phrases, childish examples, and strange situations.

STEP 3 — Create high-quality distractors.
The 3 distractors must:
- Have the SAME POS as the CSV POS.
- Be similar in difficulty.
- Belong to the SAME or closely related semantic field inferred from the Chinese meaning.
- Be plausible enough that students must read the sentence carefully.
- Be wrong because of meaning, collocation, usage, or context.

FORBIDDEN DISTRACTORS:
- Random unrelated words.
- Random scientific terms, weather words, food names, animals, or objects.
- Words from totally different semantic fields.
- Extremely rare or obscure words.
- Mixed part-of-speech options.
- Options that make the question absurdly easy.

BAD:
Target: testimony / n. / 證詞
Options: testimony / rainfall / hydrogen / smog
Reason: all are nouns, but they are semantically unrelated and unprofessional.

GOOD:
Target: testimony / n. / 證詞
Options: testimony / allegation / confession / statement
Reason: all are legal or communication-related nouns.

BAD:
Target: visual / adj. / 視覺的
Sentence: With visual aids, the professor...
Reason: the answer word appears in the question.

GOOD:
Target: visual / adj. / 視覺的
Sentence: The lecturer used ______ aids to help students understand the complex structure of the human eye.
Options: visual / verbal / auditory / textual
Reason: all are adjective options related to modes of communication or perception.

ANTI-LEAK RULE:
The target word MUST NOT appear anywhere in the question sentence.
Do not include direct morphological variants either.
If the target word appears in the sentence, the item fails.

ANSWER POSITION RULE:
The correct answer must be placed at the exact pre-assigned answer position for that question.
The correct option text must exactly match the assigned target word.

QUALITY CHECK BEFORE RETURNING:
For every question, verify:
1. It tests the exact assigned CSV word.
2. The answer is placed at the assigned letter.
3. The sentence contains exactly one blank.
4. The target word does not appear in the sentence.
5. All options have the same POS as the CSV POS.
6. Distractors are semantically related to the Chinese meaning.
7. The sentence is natural and GSAT-appropriate.
8. Only one answer is defensible.
9. The explanation teaches the semantic and grammatical reason.

FORMAT:
- id: "v1" through "v${targetWords.length}"
- question: one complete sentence with exactly "______"
- options: ["(A) word", "(B) word", "(C) word", "(D) word"]
- correctAnswer: bare letter only: "A", "B", "C", or "D"
- wordTested: exact CSV target word
- explanation: Traditional Chinese. Explain:
  1. why the correct answer fits the sentence,
  2. how it relates to the CSV Chinese meaning,
  3. why each distractor is not the best answer.

Return ONLY this JSON shape:
{
  "vocabQuestions": [
    {
      "id": "v1",
      "question": "... ______ ...",
      "options": ["(A) ...", "(B) ...", "(C) ...", "(D) ..."],
      "correctAnswer": "A",
      "wordTested": "...",
      "explanation": "..."
    }
  ]
}`;

  return { system, user };
}

// ── Health ────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

// ── Vocab: strict CSV word/POS/meaning-based GSAT generator ────
app.post("/api/generate-vocab", async (req, res) => {
  try {
    const { vocabList } = req.body;
    verifyApiKeys();

    const targetWords = pickTargetWords(vocabList || [], 10);
    if (targetWords.length === 0) {
      throw new Error("No usable vocabulary words were provided.");
    }

    const answerKey = makeAnswerKey(targetWords.length, ["A", "B", "C", "D"]);

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

    let lastIssues: string[] = [];
    let data: any = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      const { system, user } = buildVocabPrompt(targetWords, answerKey, lastIssues);
      data = process.env.OPENAI_API_KEY
        ? await callOpenAIHighQuality(system, user)
        : await callGemini(user, schema);

      if (data?.vocabQuestions?.length > targetWords.length) {
        data.vocabQuestions = data.vocabQuestions.slice(0, targetWords.length);
      }

      lastIssues = validateVocabSuite(data, targetWords, answerKey);
      if (lastIssues.length === 0) break;
    }

    if (lastIssues.length > 0) {
      console.error("Vocab validation failed:", lastIssues);
      return res.status(422).json({
        success: false,
        error: "The generated vocabulary questions did not pass quality validation. Please try generating again.",
        details: lastIssues.slice(0, 15)
      });
    }

    data.vocabQuestions = data.vocabQuestions.map((q: any, idx: number) => ({
      ...q,
      id: `v${idx + 1}`,
      options: normalizeOptions(q.options),
      correctAnswer: normalizeAnswer(q.correctAnswer),
      wordTested: targetWords[idx].word
    }));

    res.json({ success: true, data });
  } catch (error: any) {
    console.error("Vocab error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Old endpoints intentionally disabled because the current app supports only vocab + reading.
app.post("/api/generate-cloze", async (_req, res) => {
  res.status(410).json({
    success: false,
    error: "Cloze generation has been disabled. This app now supports Vocabulary MCQ and Reading Comprehension only."
  });
});

app.post("/api/generate-matching", async (_req, res) => {
  res.status(410).json({
    success: false,
    error: "Blank matching generation has been disabled. This app now supports Vocabulary MCQ and Reading Comprehension only."
  });
});

// ── Reading ───────────────────────────────────────────────────
app.post("/api/generate-reading", async (req, res) => {
  try {
    const { vocabList, selectedReadingLevels } = req.body;
    verifyApiKeys();

    const levels = selectedReadingLevels?.length > 0 ? selectedReadingLevels : ["essential"];
    const cleanWords = (Array.isArray(vocabList) ? vocabList : [])
      .filter((vw: any) => vw?.word)
      .slice(0, 60)
      .map((vw: any) => `"${vw.word}" (POS: ${vw.pos || "unspecified"}; Meaning: ${vw.meaning || "unspecified"})`);

    const vocabString = cleanWords.length > 0
      ? cleanWords.join(", ")
      : "standard GSAT vocabulary";

    const passageKeys = levels.map(() => makeAnswerKey(4, ["A", "B", "C", "D"]));
    const keyDescriptions = levels.map((lvl: string, i: number) =>
      `${lvl} passage: Q1→${passageKeys[i][0]}, Q2→${passageKeys[i][1]}, Q3→${passageKeys[i][2]}, Q4→${passageKeys[i][3]}`
    ).join("; ");

    const system = `You are a senior GSAT English reading comprehension writer for Taiwan high school exams. Your passages and questions must be natural, precise, and unambiguous.`;

    const user = `Generate reading comprehension passages for levels: ${levels.join(", ")} using vocabulary references below:
${vocabString}

Pre-assigned correct answer positions: ${keyDescriptions}

MANDATORY PROCESS for each passage:

STEP 1: Choose a specific, genuinely interesting topic appropriate for the level.
Write 250-300 words that read like a real academic or magazine article.

STEP 2: Naturally incorporate some vocabulary from the reference list when appropriate.
Use the CSV meanings to avoid misusing words.

STEP 3: Write 4 comprehension questions:
- Q1: Main idea or best title
- Q2: Specific detail directly supported by the passage
- Q3: Vocabulary or phrase in context
- Q4: Inference, author's purpose, or implication

STEP 4: For each question, write 4 options and place the correct one at the pre-assigned letter.
- Each correct answer must be directly and unambiguously supported by the passage.
- Each distractor must be clearly wrong: contradicted, not mentioned, too broad, too narrow, or a plausible misreading.
- Avoid choices that are correct due to outside general knowledge.

QUALITY STANDARDS:
- Natural academic English.
- Factually reasonable content.
- No ambiguous questions.
- No two options can both be defensible.
- Traditional Chinese explanations must cite the relevant idea from the passage.

FORMAT:
level, title, passage, questions.
Each question must include id, question, options, correctAnswer, explanation.

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

    if (Array.isArray(data?.readingPassages)) {
      data.readingPassages = data.readingPassages.map((p: any, pIdx: number) => ({
        ...p,
        questions: Array.isArray(p.questions)
          ? p.questions.slice(0, 4).map((q: any, qIdx: number) => ({
              ...q,
              id: q.id || `r${pIdx + 1}_${qIdx + 1}`,
              options: normalizeOptions(q.options),
              correctAnswer: normalizeAnswer(q.correctAnswer)
            }))
          : []
      }));
    }

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

The feedback should be specific, warm, and practical. Mention vocabulary discrimination, collocation awareness, semantic-field distractors, and reading strategy when relevant.

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
