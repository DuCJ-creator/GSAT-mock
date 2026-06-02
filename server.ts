/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
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
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "GSAT Buffet API is healthy." });
});

// Post endpoint to generate GSAT exercises
app.post("/api/generate", async (req, res) => {
  try {
    const {
      vocabList, // array of VocabWord or custom strings
      selectedExerciseTypes, // e.g. { vocab: true, cloze: true, blankMatching: true, reading: true }
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
1. "vocabQuestions": Create 10 GSAT-level English vocabulary multiple-choice questions focusing on the provided vocabulary words or suitable GSAT academic words (if not enough vocab).
   - Ensure the structure and complexity are aligned with Taiwan's GSAT (General Scholastic Ability Test).
   - The correct answers MUST be evenly distributed among the options (A), (B), (C), (D) without cluttering.
   - For EACH question, provide exactly four choices, and they must be formatted on a single line prefixing (A), (B), (C), (D).
   - Distractors in the options must not repeat within a question and should be standard high-frequency academic vocabulary.
   - Provide a detailed Traditional Chinese explanation containing translation and grammar notes.
`;
    }

    if (selectedExerciseTypes.cloze) {
      activeSections.push("clozeSuite");
      sectionsGuidelines += `
2. "clozeSuite": Create 1 GSAT-level English cloze passage (綜合測驗) of 150-180 words, containing exactly 5 numbered blanks: (1) to (5).
   - The blanks must test a comprehensive scope: 1-2 for vocabulary, 1-2 for grammar, collocations, connectives, or idioms.
   - Each blank must have exactly four multiple-choice options.
   - Ensure a authentic, engaging passage theme (e.g., historical events, scientific discoveries, psychological findings, culture, or technology).
   - Correct answers must not cluster on a single option character.
   - Provide detailed Traditional Chinese explanation for each gap, explaining why it is correct and why other choices are incorrect.
`;
    }

    if (selectedExerciseTypes.blankMatching) {
      activeSections.push("blankMatchingSuite");
      sectionsGuidelines += `
3. "blankMatchingSuite": Create 1 GSAT "文意選填" (blank matching / passage completion) containing exactly 10 numbered blanks: (1) to (10).
   - The passage should be around 200-250 words.
   - Provide exactly 10 candidate words labeled (A) through (J) to fill in these 10 blanks.
   - The candidate words must be deceptive (e.g., including pairs of nouns, verbs, adjectives, prepositions, or participles (-ed / -ing forms)).
   - Each blank must have exactly ONE unique mathematically and grammatically correct option; other options must be highly plausible but strictly incorrect or grammatically invalid.
   - Maintain perfect traditional scholarly readability.
   - Provide a clean mapping of blanks 1 to 10 to letters (e.g., ["C", "F", "A"...]) and corresponding Traditional Chinese explanations.
`;
    }

    if (selectedExerciseTypes.reading && selectedReadingLevels && selectedReadingLevels.length > 0) {
      activeSections.push("readingPassages");
      sectionsGuidelines += `
4. "readingPassages": Create reading comprehension passages for the selected levels: ${selectedReadingLevels.join(", ")}.
   - For EACH selected level, create a distinct, high-quality, interesting passage of 250-300 words.
   - Each passage MUST be followed by exactly 4 reading comprehension questions.
   - The questions should test global reading skills (e.g., main idea, detail lookup, tone analysis, context-clue inferring, title selection).
   - The correct answers must be distributed evenly without clustering.
   - Provide 4 options for each question.
   - Provide complete, detailed Traditional Chinese explanations and translate key sentences.
`;
    }

    const systemPrompt = `You are Tr. Shirley Du, an elite high school English educator in Taiwan specializing in GSAT (英語學測) exam preparation. 
Your tone is encouraging, academically precise, and deeply knowledgeable about Taiwan's testing patterns.
You will generate high-quality interactive exercises based on the vocabulary words provided.
Ensure that:
1. Every generated question has no ambiguity. There is exactly one correct answer.
2. The vocabulary level fits the Taiwan GSAT syllabus (levels 3 to 6).
3. The explanations are written in elegant Traditional Chinese (繁體中文) following the Taiwanese teaching style, with rich analyses of grammar, vocabulary collocations, and translation.
4. Correct answers are balanced among choices (A, B, C, D) without clustering.`;

    const instructionsPrompt = `Please generate the requested GSAT exam exercises based on the following input vocabulary:
${vocabString}

Active Sections to generate: ${activeSections.join(", ")}.

Guidelines for sections to generate:
${sectionsGuidelines}

You MUST follow the specified JSON schema strictly. Make sure all strings are correctly closed and the response is clean JSON.`;

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

    if (selectedExerciseTypes.cloze) {
      responseSchema.properties.clozeSuite = {
        type: Type.OBJECT,
        properties: {
          passage: { type: Type.STRING, description: "Passage of ~150-180 words, with numbered gaps like (1) __________, (2) __________..." },
          questions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                gapNumber: { type: Type.INTEGER, description: "The number of the blank, 1 to 5" },
                question: { type: Type.STRING, description: "Which choice is the best fit for gap (gapNumber)?" },
                options: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "Exactly 4 option strings, e.g. ['(A) word1', '(B) word2', '(C) word3', '(D) word4']"
                },
                correctAnswer: { type: Type.STRING, description: "Must be 'A', 'B', 'C', or 'D'" },
                category: { type: Type.STRING, description: "One of: vocabulary, grammar, collocation, idiom, discourse" },
                explanation: { type: Type.STRING, description: "Detailed Traditional Chinese explanation." }
              },
              required: ["gapNumber", "question", "options", "correctAnswer", "category", "explanation"]
            }
          }
        },
        required: ["passage", "questions"]
      };
      responseSchema.required.push("clozeSuite");
    }

    if (selectedExerciseTypes.blankMatching) {
      responseSchema.properties.blankMatchingSuite = {
        type: Type.OBJECT,
        properties: {
          passage: { type: Type.STRING, description: "A ~200-250 word passage with blanks marked as (1) __________, (2) __________ up to (10) __________." },
          options: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Exactly 10 options, each representing a single vocabulary or phrasal candidate. E.g. ['(A) beneficial', '(B) consistently', '(C) consequence' ...]"
          },
          answers: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Exactly 10 items representing the answer letter corresponding to gaps 1 to 10. E.g. ['C', 'A', 'J'...]"
          },
          explanations: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Exactly 10 items, each explaining why that candidate fits that blank in Traditional Chinese."
          }
        },
        required: ["passage", "options", "answers", "explanations"]
      };
      responseSchema.required.push("blankMatchingSuite");
    }

    if (selectedExerciseTypes.reading && selectedReadingLevels && selectedReadingLevels.length > 0) {
      responseSchema.properties.readingPassages = {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            level: { type: Type.STRING, description: "Must be one of: basic, essential, advanced" },
            title: { type: Type.STRING, description: "Title of the passage" },
            passage: { type: Type.STRING, description: "The content passage (~250-300 words)" },
            questions: {
              type: Type.ARRAY,
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
        model: "gemini-3.5-flash",
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
- cloze (綜合測驗): ${scoreSummary.cloze.correct}/${scoreSummary.cloze.total}
- Blank matching (文意選填): ${scoreSummary.blankMatching.correct}/${scoreSummary.blankMatching.total}
- Reading comprehension: ${scoreSummary.reading.correct}/${scoreSummary.reading.total}
- Practiced Level: GSAT Level ${selectedLevel || "Mixed"}

Provide:
1. "greeting": A warm greeting addressing the student's status.
2. "analysis": A highly professional yet heartening section review of what they did well and where their blindspots/demon-in-the-details are (e.g. grammar collocations vs vocab retention vs reading pacing).
3. "tips": 3 actionable, highly tactical GSAT English study tips tailored to their score (e.g., if vocabulary is low, advise on memorizing collocation prefixes; if cloze is low, advise parsing transitive verbs or connector transitions).
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
        model: "gemini-3.5-flash",
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

if (!process.env.VERCEL) {
  startServer();
}

export default app;
