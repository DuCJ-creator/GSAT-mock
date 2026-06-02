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
    if (!apiKey) throw new Error("GEMINI_API_KEY is not defined in the environment.");
    aiInstance = new GoogleGenAI({ apiKey });
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

// ── Health check ─────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "GSAT Buffet API is healthy." });
});

// ── Generate GSAT exercises ───────────────────────────────────
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
1. "vocabQuestions": Create 10 GSAT-level English vocabulary multiple-choice questions focusing on the provided vocabulary words or suitable GSAT academic words (if not enough vocab).
   - Ensure the structure and complexity are aligned with Taiwan's GSAT.
   - The correct answers MUST be evenly distributed among the options (A), (B), (C), (D).
   - For EACH question, provide exactly four choices prefixed (A), (B), (C), (D).
   - Distractors must be standard high-frequency academic vocabulary.
   - Provide a detailed Traditional Chinese explanation containing translation and grammar notes.
`;
    }

    if (selectedExerciseTypes.cloze) {
      activeSections.push("clozeSuite");
      sectionsGuidelines += `
2. "clozeSuite": Create 1 GSAT-level English cloze passage (綜合測驗) of 150-180 words, containing exactly 5 numbered blanks: (1) to (5).
   - The blanks must test vocabulary, grammar, collocations, connectives, or idioms.
   - Each blank must have exactly four multiple-choice options.
   - Correct answers must not cluster on a single option character.
   - Provide detailed Traditional Chinese explanation for each gap.
`;
    }

    if (selectedExerciseTypes.blankMatching) {
      activeSections.push("blankMatchingSuite");
      sectionsGuidelines += `
3. "blankMatchingSuite": Create 1 GSAT "文意選填" containing exactly 10 numbered blanks: (1) to (10).
   - The passage should be around 200-250 words.
   - Provide exactly 10 candidate words labeled (A) through (J).
   - Each blank must have exactly ONE unique correct option.
   - Provide a clean mapping of blanks 1-10 to letters and Traditional Chinese explanations.
`;
    }

    if (selectedExerciseTypes.reading && selectedReadingLevels && selectedReadingLevels.length > 0) {
      activeSections.push("readingPassages");
      sectionsGuidelines += `
4. "readingPassages": Create reading comprehension passages for levels: ${selectedReadingLevels.join(", ")}.
   - For EACH level, create a distinct passage of 250-300 words with exactly 4 comprehension questions.
   - Questions test global reading skills (main idea, detail, tone, inference, title).
   - Correct answers must be distributed evenly. Provide 4 options per question.
   - Provide complete Traditional Chinese explanations.
`;
    }

    const systemPrompt = `You are Tr. Shirley Du, an elite high school English educator in Taiwan specializing in GSAT (英語學測) exam preparation. 
Your tone is encouraging, academically precise, and deeply knowledgeable about Taiwan's testing patterns.
You will generate high-quality interactive exercises based on the vocabulary words provided.
Ensure that:
1. Every generated question has no ambiguity. There is exactly one correct answer.
2. The vocabulary level fits the Taiwan GSAT syllabus (levels 3 to 6).
3. The explanations are written in elegant Traditional Chinese (繁體中文) following the Taiwanese teaching style.
4. Correct answers are balanced among choices (A, B, C, D) without clustering.`;

    const instructionsPrompt = `Please generate the requested GSAT exam exercises based on the following input vocabulary:
${vocabString}

Active Sections to generate: ${activeSections.join(", ")}.

Guidelines for sections to generate:
${sectionsGuidelines}

You MUST follow the specified JSON schema strictly. Make sure all strings are correctly closed and the response is clean JSON.`;

    const responseSchema: any = { type: Type.OBJECT, properties: {}, required: [] };

    if (selectedExerciseTypes.vocab) {
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
            explanation: { type: Type.STRING }
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
          passage: { type: Type.STRING },
          questions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                gapNumber: { type: Type.INTEGER },
                question: { type: Type.STRING },
                options: { type: Type.ARRAY, items: { type: Type.STRING } },
                correctAnswer: { type: Type.STRING },
                category: { type: Type.STRING },
                explanation: { type: Type.STRING }
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
          passage: { type: Type.STRING },
          options: { type: Type.ARRAY, items: { type: Type.STRING } },
          answers: { type: Type.ARRAY, items: { type: Type.STRING } },
          explanations: { type: Type.ARRAY, items: { type: Type.STRING } }
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
          { role: "user", content: instructionsPrompt + "\n\nCRITICAL: You MUST return a single valid JSON object containing only the requested properties." }
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
      });
      outputText = response.choices[0].message.content || "";
    } else {
      const ai = getGenAI();
      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash", // ✅ Fixed: was "gemini-3.5-flash"
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
    res.json({ success: true, data: examData });
  } catch (error: any) {
    console.error("GSAT Buffet Generation Error:", error);
    res.status(500).json({ success: false, error: error.message || "An unexpected error occurred during exam generation." });
  }
});

// ── Evaluate and generate commentary report ───────────────────
app.post("/api/evaluate-report", async (req, res) => {
  try {
    const { scoreSummary, details, selectedLevel } = req.body;
    verifyApiKeys();

    const systemPrompt = `You are Tr. Shirley Du, an English educator in Taiwan specializing in GSAT (學測英文) preparation.
Your style is extremely warm, caring, humorous, encouraging, and deeply professional.
You talk in Traditional Chinese (using Taiwan idioms like 衝刺, 奠定基礎, 答對率, 魔鬼細節, 學測大關, 備考 etc.).`;

    const userPrompt = `Please write a highly supportive, personalized progress commentary report as Tr. Shirley Du.
The user's exam performance:
- Overall Score: ${scoreSummary.comprehensive.correct}/${scoreSummary.comprehensive.total} (Accuracy: ${scoreSummary.comprehensive.score}%)
- Vocabulary section: ${scoreSummary.vocab.correct}/${scoreSummary.vocab.total}
- Cloze (綜合測驗): ${scoreSummary.cloze.correct}/${scoreSummary.cloze.total}
- Blank matching (文意選填): ${scoreSummary.blankMatching.correct}/${scoreSummary.blankMatching.total}
- Reading comprehension: ${scoreSummary.reading.correct}/${scoreSummary.reading.total}
- Practiced Level: GSAT Level ${selectedLevel || "Mixed"}

Provide:
1. "greeting": A warm greeting addressing the student's status.
2. "analysis": A professional yet heartening section review of strengths and blindspots.
3. "tips": 3 actionable, highly tactical GSAT English study tips tailored to their score.
4. "encouragement": A powerful, inspirational closing sentence for the final GSAT battle!

Return structured JSON matching: { "greeting": string, "analysis": string, "tips": [string, string, string], "encouragement": string }`;

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
        model: "gemini-2.0-flash", // ✅ Fixed: was "gemini-3.5-flash"
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

export default app;
