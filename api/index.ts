process.env.IS_SERVERLESS = "true";

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, Type } from "@google/genai";
import OpenAI from "openai";
import dotenv from "dotenv";
import { randomInt } from "crypto";

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

// ------------------------------
// Question quality helpers
// ------------------------------
const ANSWER_LETTERS = ["A", "B", "C", "D"] as const;
type AnswerLetter = (typeof ANSWER_LETTERS)[number];

function normalizeAnswerLetter(ans: any): AnswerLetter {
  const letter = String(ans || "").replace(/[()]/g, "").trim().toUpperCase();
  if (!ANSWER_LETTERS.includes(letter as AnswerLetter)) {
    throw new Error(`Invalid correctAnswer: ${String(ans)}`);
  }
  return letter as AnswerLetter;
}

function stripOptionLabel(option: any): string {
  return String(option ?? "")
    .replace(/^\s*\(?[A-D]\)?[.、:\-]?\s*/i, "")
    .trim();
}

function normalizeOptionsArray(opts: any): string[] {
  let raw: any[] = [];

  if (Array.isArray(opts)) {
    raw = opts;
  } else if (typeof opts === "string") {
    const matches = opts.match(/\([A-D]\)\s*[\s\S]*?(?=\s*\([A-D]\)|$)/g);
    raw = matches || [];
  } else if (opts && typeof opts === "object") {
    raw = Object.entries(opts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, value]) => value);
  }

  const texts = raw.map((item: any) => {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const firstValue = Object.values(item)[0];
      return stripOptionLabel(firstValue);
    }
    return stripOptionLabel(item);
  });

  if (texts.length !== 4 || texts.some(text => !text)) {
    throw new Error("Every question must contain exactly four non-empty options.");
  }

  return texts.map((text, index) => `(${ANSWER_LETTERS[index]}) ${text}`);
}

function getOptionTexts(options: any): string[] {
  return normalizeOptionsArray(options).map(stripOptionLabel);
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function hasThreeConsecutive(pattern: AnswerLetter[]): boolean {
  return pattern.some((letter, index) =>
    index >= 2 && letter === pattern[index - 1] && letter === pattern[index - 2]
  );
}

function hasObviousCycle(pattern: AnswerLetter[]): boolean {
  const text = pattern.join("");
  const cycles = ["ABCD", "BCDA", "CDAB", "DABC", "DCBA", "CBAD", "BADC", "ADCB"];
  return cycles.some(cycle => text.includes(cycle + cycle.slice(0, Math.max(0, text.length - 4))));
}

function makeBalancedUnpredictablePattern(count: number): AnswerLetter[] {
  if (count <= 0) return [];

  const base = Math.floor(count / ANSWER_LETTERS.length);
  const remainder = count % ANSWER_LETTERS.length;
  const extraLetters = shuffle([...ANSWER_LETTERS]).slice(0, remainder);
  const pool: AnswerLetter[] = [];

  for (const letter of ANSWER_LETTERS) {
    const copies = base + (extraLetters.includes(letter) ? 1 : 0);
    for (let i = 0; i < copies; i++) pool.push(letter);
  }

  // Four-question reading sets contain one of each answer, but never use the
  // conspicuous ABCD or DCBA ordering. Larger sets are balanced within one.
  for (let attempt = 0; attempt < 500; attempt++) {
    const candidate = shuffle(pool);
    const text = candidate.join("");
    const tooObviousFour = count === 4 && (text === "ABCD" || text === "DCBA");
    if (!tooObviousFour && !hasThreeConsecutive(candidate) && !hasObviousCycle(candidate)) {
      return candidate;
    }
  }

  // The fallback is still balanced. Rotate a shuffled pool to avoid a fixed
  // deterministic sequence if the stricter search is exhausted.
  const fallback = shuffle(pool);
  const shift = fallback.length > 1 ? randomInt(fallback.length) : 0;
  return [...fallback.slice(shift), ...fallback.slice(0, shift)];
}

/**
 * Repositions the actual keyed option. The answer letter is derived only after
 * the option text has been moved; it is never changed independently.
 */
function placeCorrectAnswerAt(q: any, desired: AnswerLetter): any {
  const options = getOptionTexts(q.options || q.choices);
  const originalAnswer = normalizeAnswerLetter(q.correctAnswer || q.answer);
  const originalIndex = ANSWER_LETTERS.indexOf(originalAnswer);
  const correctText = options[originalIndex];

  if (!correctText) {
    throw new Error("The original answer key does not point to a valid option.");
  }

  const distractors = shuffle(options.filter((_, index) => index !== originalIndex));
  const desiredIndex = ANSWER_LETTERS.indexOf(desired);
  const reordered = [...distractors];
  reordered.splice(desiredIndex, 0, correctText);

  const keyedTextAfterMove = reordered[desiredIndex];
  if (keyedTextAfterMove !== correctText) {
    throw new Error("Answer-key integrity check failed while repositioning options.");
  }

  return {
    ...q,
    options: reordered.map((text, index) => `(${ANSWER_LETTERS[index]}) ${text}`),
    correctAnswer: ANSWER_LETTERS[desiredIndex],
    answerText: correctText,
  };
}

function validateQuestion(q: any, kind: "vocab" | "reading"): string[] {
  const errors: string[] = [];
  const options = getOptionTexts(q.options || q.choices);
  const answer = normalizeAnswerLetter(q.correctAnswer || q.answer);
  const answerIndex = ANSWER_LETTERS.indexOf(answer);

  if (!String(q.question || "").trim()) errors.push("missing question text");
  if (kind === "vocab" && !/_{3,}|\bblank\b/i.test(String(q.question || ""))) {
    errors.push("vocabulary sentence has no visible blank");
  }
  if (new Set(options.map(o => o.toLocaleLowerCase())).size !== 4) {
    errors.push("duplicate options");
  }
  if (!options[answerIndex]) errors.push("correctAnswer does not point to an option");
  if (!String(q.explanation || "").trim()) errors.push("missing explanation");
  return errors;
}

function validateExamData(data: any, wantsVocab: boolean, wantsReading: boolean): void {
  const errors: string[] = [];

  if (wantsVocab) {
    if (!Array.isArray(data.vocabQuestions) || data.vocabQuestions.length !== 10) {
      errors.push("vocabQuestions must contain exactly 10 questions");
    } else {
      data.vocabQuestions.forEach((q: any, i: number) => {
        validateQuestion(q, "vocab").forEach(e => errors.push(`Vocabulary Q${i + 1}: ${e}`));
      });
    }
  }

  if (wantsReading) {
    if (!Array.isArray(data.readingPassages) || data.readingPassages.length !== 1) {
      errors.push("readingPassages must contain exactly one passage");
    } else {
      const passage = data.readingPassages[0];
      if (!String(passage.passage || "").trim()) errors.push("reading passage is empty");
      if (!Array.isArray(passage.questions) || passage.questions.length !== 4) {
        errors.push("reading passage must contain exactly four questions");
      } else {
        passage.questions.forEach((q: any, i: number) => {
          validateQuestion(q, "reading").forEach(e => errors.push(`Reading Q${i + 1}: ${e}`));
        });
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Generated content failed validation: ${errors.join("; ")}`);
  }
}

async function callJsonModel(
  systemPrompt: string,
  userPrompt: string,
  responseSchema?: any,
  temperature = 0.25
): Promise<any> {
  let outputText = "";

  if (process.env.OPENAI_API_KEY) {
    const openai = getOpenAI();
    const model = process.env.OPENAI_API_MODEL || "gpt-4o-mini";
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature,
    });
    outputText = response.choices[0].message.content || "";
  } else {
    const ai = getGenAI();
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_API_MODEL || "gemini-2.5-flash",
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        ...(responseSchema ? { responseSchema } : {}),
        temperature,
      },
    });
    outputText = response.text || "";
  }

  if (!outputText) throw new Error("Empty response from AI model.");
  return JSON.parse(outputText);
}

function normalizeGeneratedData(data: any): any {
  const normalized = { ...data };

  if (normalized.vocabQuestions) {
    normalized.vocabQuestions = normalized.vocabQuestions.map((q: any) => {
      const options = normalizeOptionsArray(q.options || q.choices);
      const correctAnswer = normalizeAnswerLetter(q.correctAnswer || q.answer);
      const correctIndex = ANSWER_LETTERS.indexOf(correctAnswer);
      return {
        ...q,
        options,
        correctAnswer,
        wordTested: String(q.wordTested || "").trim(),
        answerText: stripOptionLabel(options[correctIndex]),
      };
    });
  }

  if (normalized.readingPassage && !normalized.readingPassages) {
    normalized.readingPassages = [normalized.readingPassage];
  }
  if (normalized.readingPassages && !Array.isArray(normalized.readingPassages)) {
    normalized.readingPassages = [normalized.readingPassages];
  }
  if (normalized.readingPassages) {
    normalized.readingPassages = normalized.readingPassages.map((p: any) => ({
      ...p,
      questions: (p.questions || []).map((q: any) => ({
        ...q,
        options: normalizeOptionsArray(q.options || q.choices),
        correctAnswer: normalizeAnswerLetter(q.correctAnswer || q.answer),
      })),
    }));
  }

  return normalized;
}

function balanceAnswerPositions(data: any): any {
  const balanced = { ...data };

  if (Array.isArray(balanced.vocabQuestions)) {
    const pattern = makeBalancedUnpredictablePattern(balanced.vocabQuestions.length);
    balanced.vocabQuestions = balanced.vocabQuestions.map((q: any, index: number) =>
      placeCorrectAnswerAt(q, pattern[index])
    );
  }

  if (Array.isArray(balanced.readingPassages)) {
    balanced.readingPassages = balanced.readingPassages.map((passage: any) => {
      const questions = passage.questions || [];
      const pattern = makeBalancedUnpredictablePattern(questions.length);
      return {
        ...passage,
        questions: questions.map((q: any, index: number) =>
          placeCorrectAnswerAt(q, pattern[index])
        ),
      };
    });
  }

  return balanced;
}

function addStableIds(data: any): any {
  const ts = Date.now();
  return {
    ...data,
    ...(Array.isArray(data.vocabQuestions)
      ? {
          vocabQuestions: data.vocabQuestions.map((q: any, index: number) => ({
            ...q,
            id: `vocab-${index}-${ts}`,
          })),
        }
      : {}),
    ...(Array.isArray(data.readingPassages)
      ? {
          readingPassages: data.readingPassages.map((p: any, pIndex: number) => ({
            ...p,
            questions: (p.questions || []).map((q: any, qIndex: number) => ({
              ...q,
              id: `reading-${pIndex}-${qIndex}-${ts}`,
            })),
          })),
        }
      : {}),
  };
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

    const wantsVocab = !!selectedExerciseTypes?.vocab;
    const wantsReading = !!selectedExerciseTypes?.reading && Array.isArray(selectedReadingLevels) && selectedReadingLevels.length > 0;
    if (!wantsVocab && !wantsReading) {
      return res.status(400).json({ success: false, error: "Please select at least one exercise type." });
    }

    const vocabString = Array.isArray(vocabList) && vocabList.length > 0
      ? vocabList
          .map((vw: any) => `Word: "${vw.word}" (POS: ${vw.pos || "unspecified"}, meaning: ${vw.meaning || "not supplied"})`)
          .join("\n")
      : "Use standard GSAT Level 3-6 academic vocabulary.";

    const responseSchema: any = { type: Type.OBJECT, properties: {}, required: [] };
    const activeSections: string[] = [];
    let sectionInstructions = "";

    if (wantsVocab) {
      activeSections.push("vocabQuestions");
      sectionInstructions += `
VOCABULARY SECTION
- Create exactly 10 single-sentence vocabulary multiple-choice questions.
- Each question must contain one visible blank written as __________.
- All four options must be the same part of speech and use the grammatical form required by the sentence.
- Subject-verb agreement, tense, number, articles, prepositions, collocations, and punctuation must all be correct.
- Do not create a sentence in which the intended answer needs inflection but the option is shown in its base form. Example: write "sounds" rather than "sound" after a singular subject in the simple present.
- Do not use "too" to mean "also" before a main verb. Use "also" in that position, or place "too" naturally at the end of the clause.
- Exactly one option must be semantically and grammatically possible. Avoid near-synonyms that could both fit.
- The Traditional Chinese explanation must state the same meaning, direction, polarity, and comparison as the selected option. Never explain "more important" when the option says "less important," or vice versa.
- wordTested must remain the base vocabulary entry from the supplied word list.
- The correct option may use the grammatically required inflected or derived form of wordTested, such as sound → sounds, study → studied, create → creating, or careful → carefully.
- answerText must contain the exact option text shown to the student. Do not force the dictionary form when grammar requires a different form.
`;

      responseSchema.properties.vocabQuestions = {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            question: { type: Type.STRING },
            options: { type: Type.ARRAY, items: { type: Type.STRING } },
            correctAnswer: { type: Type.STRING },
            wordTested: { type: Type.STRING },
            answerText: { type: Type.STRING },
            explanation: { type: Type.STRING },
          },
          required: ["id", "question", "options", "correctAnswer", "wordTested", "explanation"],
        },
      };
      responseSchema.required.push("vocabQuestions");
    }

    if (wantsReading) {
      activeSections.push("readingPassages");
      sectionInstructions += `
READING SECTION
- Create exactly one English passage for level ${selectedReadingLevels.join(", ")}.
- The passage must contain 200-250 English words.
- Create exactly four questions: main idea, detail, inference or tone, and vocabulary in context.
- Every answer must be directly supported by the passage or by a necessary inference from it.
- Each distractor must be clearly false, unsupported, too broad, too narrow, or opposite to the passage.
- Do not write an option whose wording contradicts its own explanation.
- The Traditional Chinese explanation must identify the relevant passage evidence and preserve the exact direction and polarity of the correct option.
`;

      responseSchema.properties.readingPassages = {
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
                  explanation: { type: Type.STRING },
                },
                required: ["id", "question", "options", "correctAnswer", "explanation"],
              },
            },
          },
          required: ["level", "title", "passage", "questions"],
        },
      };
      responseSchema.required.push("readingPassages");
    }

    const writerSystemPrompt = `You are Tr. Shirley Du, a meticulous Taiwan GSAT English item writer.
Write natural, standard English and academically precise Traditional Chinese explanations.

NON-NEGOTIABLE QUALITY RULES
1. Silently solve every question before assigning correctAnswer.
2. correctAnswer must be one bare letter: A, B, C, or D.
3. Options must be returned in A-B-C-D order and prefixed with (A), (B), (C), and (D).
4. Exactly one option must be correct. Reject any item with two defensible answers.
5. Grammar must be correct after the selected option is inserted into the sentence.
6. The explanation must agree with the option text and with the source passage. Check negation, comparison, quantity, cause/effect, and time reference.
7. Avoid awkward textbook English, dangling modifiers, unclear pronouns, and unsupported inferences.
8. Do not manipulate content to create a particular answer-letter pattern. The server will reposition the actual correct option after validation.
9. For vocabulary items, keep wordTested as the source-list lemma and allow the correct option to use the grammatical form required by the sentence.
10. Return JSON only.`;

    const writerUserPrompt = `Generate these sections: ${activeSections.join(", ")}.
Target GSAT level: ${selectedLevel || "mixed"}.

Vocabulary source:
${vocabString}

${sectionInstructions}
Before returning JSON, silently perform a complete grammar, ambiguity, answer-key, and explanation-consistency check.`;

    const auditorSystemPrompt = `You are the final senior editor for a Taiwan GSAT English examination.
Your job is to REPAIR the supplied draft, not merely comment on it.
Return a complete corrected JSON object in exactly the same structure.

For every item, silently do all of the following:
- Insert each option into the sentence and check grammar and natural usage.
- Verify subject-verb agreement, tense, number, articles, prepositions, collocation, and word form.
- Confirm that exactly one option is defensible.
- Independently solve the item and set correctAnswer to the truly correct option.
- Rewrite the question or distractors when ambiguity exists.
- Compare the explanation against the exact option wording. Correct any reversal such as less/more, increase/decrease, can/cannot, before/after, or positive/negative.
- For reading items, verify the answer against explicit passage evidence or a necessary inference.
- Keep explanations in Traditional Chinese and all passage text in English.
- Keep exactly 10 vocabulary questions when present, exactly one passage, and exactly four reading questions.
Return JSON only.`;

    let finalData: any = null;
    let lastError: any = null;

    // A fresh draft plus a separate editorial pass is much more reliable than a
    // single prompt. Retry once if structural validation still fails.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const draft = await callJsonModel(writerSystemPrompt, writerUserPrompt, responseSchema, 0.35);
        const normalizedDraft = normalizeGeneratedData(draft);

        const auditPrompt = `Audit and repair this draft. Do not discuss your changes. Return the complete corrected JSON only:\n${JSON.stringify(normalizedDraft)}`;
        const audited = await callJsonModel(auditorSystemPrompt, auditPrompt, responseSchema, 0.1);
        const normalizedAudited = normalizeGeneratedData(audited);

        validateExamData(normalizedAudited, wantsVocab, wantsReading);
        finalData = addStableIds(balanceAnswerPositions(normalizedAudited));
        validateExamData(finalData, wantsVocab, wantsReading);
        break;
      } catch (error) {
        lastError = error;
        console.warn(`Generation quality attempt ${attempt + 1} failed:`, error);
      }
    }

    if (!finalData) {
      throw lastError || new Error("Unable to generate a fully validated exam.");
    }

    const answerDistribution = (questions: any[] = []) =>
      questions.reduce((acc: Record<string, number>, q: any) => {
        const key = normalizeAnswerLetter(q.correctAnswer);
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, { A: 0, B: 0, C: 0, D: 0 });

    res.json({
      success: true,
      data: finalData,
      qualityAssurance: {
        editorialPassCompleted: true,
        structuralValidationPassed: true,
        vocabAnswerDistribution: answerDistribution(finalData.vocabQuestions),
        readingAnswerDistributions: (finalData.readingPassages || []).map((p: any) => answerDistribution(p.questions)),
        vocabAnswerSequence: (finalData.vocabQuestions || []).map((q: any) => q.correctAnswer).join(""),
        readingAnswerSequences: (finalData.readingPassages || []).map((p: any) =>
          (p.questions || []).map((q: any) => q.correctAnswer).join("")
        ),
      },
    });
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
