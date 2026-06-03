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
1. "vocabQuestions": Create 10 GSAT-level English vocabulary multiple-choice questions.

   STRICT FORMAT RULES (模仿真實學測格式):
   - The "question" field MUST be a complete English sentence containing exactly one blank written as "______" (six underscores).
     Example: "The mayor has such a ______ schedule that it takes weeks to arrange an interview with her."
   - The "options" field MUST be an array of exactly 4 strings, each a single vocabulary word (no phrases), formatted as:
     ["(A) hasty", "(B) tight", "(C) diligent", "(D) routine"]
   - The "correctAnswer" field MUST be exactly one letter: "A", "B", "C", or "D" — no parentheses, no extra text.
   - The "wordTested" field is the correct answer word itself (e.g. "tight").
   - Correct answers MUST be evenly distributed: roughly 2-3 questions each for A, B, C, D.
   - Distractors must be plausible GSAT-level single-word vocabulary that fits grammatically but not semantically.
   - The "explanation" field: detailed Traditional Chinese explanation of why the correct word fits and why the others do not.
   - Focus questions on the provided vocabulary words. Use standard GSAT Level 3-6 words if more are needed.
`;
    }

    if (selectedExerciseTypes.cloze) {
      activeSections.push("clozeSuite");
      sectionsGuidelines += `
2. "clozeSuite": Create 1 authentic GSAT-style cloze passage (綜合測驗).

   STRICT FORMAT RULES (模仿真實學測格式):
   - The "passage" field: a natural, engaging English passage of 150-180 words.
     Blanks MUST appear inline as "__ 11 __", "__ 12 __", "__ 13 __", "__ 14 __", "__ 15 __" (numbered 11-15, with spaces and underscores around the number).
     Example passage excerpt: "White rhinoceroses, __ 11 __, do the same thing—only their choice of meeting place is a giant pile of poop."
   - The passage must feel like a real article (science, culture, psychology, history, nature — NOT a textbook exercise).
   - Exactly 5 blanks numbered 11 through 15 inline in the passage.
   - The "questions" array: exactly 5 items, one per blank.
     - "gapNumber": the integer (11, 12, 13, 14, or 15).
     - "options": array of exactly 4 strings. Options MAY be phrases (not just single words), formatted as:
       ["(A) what is more", "(B) it turns out", "(C) in other words", "(D) all in all"]
       OR single words: ["(A) demonstrate", "(B) immigrate", "(C) communicate", "(D) manipulate"]
     - "correctAnswer": exactly one letter "A", "B", "C", or "D" — no parentheses.
     - "category": one of: vocabulary, grammar, collocation, idiom, discourse connector.
     - "explanation": detailed Traditional Chinese explanation for why the correct option fits and why others do not.
   - Correct answers must be balanced across A, B, C, D — do NOT cluster on one letter.
`;
    }

    if (selectedExerciseTypes.blankMatching) {
      activeSections.push("blankMatchingSuite");
      sectionsGuidelines += `
3. "blankMatchingSuite": Create 1 authentic GSAT-style blank matching passage (文意選填).

   STRICT FORMAT RULES (模仿真實學測格式):
   - The "passage" field: a natural, engaging English passage of 200-250 words.
     Blanks MUST appear inline as "__ 21 __", "__ 22 __", ... "__ 30 __" (numbered 21-30, with spaces and underscores around the number).
     Example: "Taking a nap in the middle of the day is by no means __ 21 __. In fact, you are giving your brain and your body some time to recharge."
   - The passage must read like a real article — NOT a textbook exercise.
   - Exactly 10 blanks numbered 21 through 30 inline in the passage.
   - The "options" field: exactly 10 candidate strings labeled (A) through (J).
     Mix of single words AND short phrases (2-3 words), formatted as:
     ["(A) retain", "(B) depend on", "(C) atmosphere", "(D) delay", "(E) unproductive", "(F) risk", "(G) function", "(H) minimal", "(I) dramatic", "(J) point to"]
     Make options deceptive: include pairs with similar grammar (e.g. two nouns, two verbs) to challenge students.
   - The "answers" field: array of exactly 10 strings, each a single letter A-J, corresponding to blanks 21-30 in order.
     Example: ["E", "G", "F", "J", "A", "B", "D", "I", "H", "C"]
   - The "explanations" field: array of exactly 10 Traditional Chinese explanation strings, one per blank (21-30).
   - Each blank must have exactly ONE correct answer. All 10 options must be used exactly once.
`;
    }

    if (selectedExerciseTypes.reading && selectedReadingLevels && selectedReadingLevels.length > 0) {
      activeSections.push("readingPassages");
      sectionsGuidelines += `
4. "readingPassages": Create reading comprehension passages for levels: ${selectedReadingLevels.join(", ")}.

   STRICT FORMAT RULES (模仿真實學測格式):
   - For EACH requested level, create one distinct, high-quality passage of 250-300 words on an engaging topic.
   - The passage must feel like a real article — NOT a textbook exercise.
   - Each passage is followed by exactly 4 comprehension questions.
   - Question types must vary: main idea, specific detail, vocabulary in context, inference, or title selection.
   - The "options" field for each question: array of exactly 4 strings formatted as:
     ["(A) option text here", "(B) option text here", "(C) option text here", "(D) option text here"]
     Options may be full sentences or short phrases as appropriate.
   - "correctAnswer": exactly one letter "A", "B", "C", or "D" — no parentheses.
   - Correct answers must be balanced across A, B, C, D across all questions.
   - "explanation": detailed Traditional Chinese explanation with key sentence translation and reasoning.
`;
    }

    const systemPrompt = `You are Tr. Shirley Du, an elite high school English educator in Taiwan specializing in GSAT (英語學測) exam preparation.
Your tone is encouraging, academically precise, and deeply knowledgeable about Taiwan's GSAT testing patterns and official format.
You will generate high-quality exam exercises that precisely replicate the authentic GSAT format.
Critical rules:
1. Every question has exactly one unambiguous correct answer.
2. Vocabulary fits Taiwan GSAT syllabus levels 3-6.
3. All explanations are in elegant Traditional Chinese (繁體中文).
4. Correct answers are balanced across A, B, C, D — never cluster more than 3 on the same letter.
5. Passages read like real articles, not textbook exercises.
6. "correctAnswer" fields contain ONLY a single letter: A, B, C, D, E, F, G, H, I, or J — never "(A)" with parentheses.`;

   const instructionsPrompt = `Please generate the requested GSAT exam exercises based on the following vocabulary:
${vocabString}

Active sections to generate: ${activeSections.join(", ")}.

CRITICAL QUANTITY REQUIREMENTS — these are HARD minimums, not suggestions:
- vocabQuestions: EXACTLY 10 questions, no fewer. Count them before responding.
- clozeSuite: EXACTLY 5 blanks (gaps 11, 12, 13, 14, 15), no fewer.
- blankMatchingSuite: EXACTLY 10 blanks (gaps 21–30) with EXACTLY 10 options (A)–(J).
- readingPassages: EXACTLY 1 passage per requested level with EXACTLY 4 questions each.

Detailed guidelines per section:
${sectionsGuidelines}

CRITICAL: Follow the JSON schema exactly. Count every array before finalizing. "correctAnswer" must always be a bare letter (e.g. "A" not "(A)"). All "options" arrays must be properly formed string arrays.`;
 
    const responseSchema: any = { type: Type.OBJECT, properties: {}, required: [] };

    if (selectedExerciseTypes.vocab) {
      responseSchema.properties.vocabQuestions = {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING, description: "Unique question ID e.g. 'v1', 'v2'" },
            question: { type: Type.STRING, description: "Full sentence with exactly one '______' blank" },
            options: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Exactly 4 single-word options: ['(A) word', '(B) word', '(C) word', '(D) word']"
            },
            correctAnswer: { type: Type.STRING, description: "Single letter only: A, B, C, or D" },
            wordTested: { type: Type.STRING, description: "The correct answer word" },
            explanation: { type: Type.STRING, description: "Traditional Chinese explanation" }
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
          passage: {
            type: Type.STRING,
            description: "150-180 word passage with blanks written as '__ 11 __' through '__ 15 __' inline"
          },
          questions: {
            type: Type.ARRAY,
            description: "Exactly 5 items for gaps 11-15",
            items: {
              type: Type.OBJECT,
              properties: {
                gapNumber: { type: Type.INTEGER, description: "11, 12, 13, 14, or 15" },
                options: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "Exactly 4 options, may be words or phrases: ['(A) ...', '(B) ...', '(C) ...', '(D) ...']"
                },
                correctAnswer: { type: Type.STRING, description: "Single letter only: A, B, C, or D" },
                category: { type: Type.STRING, description: "vocabulary / grammar / collocation / idiom / discourse connector" },
                explanation: { type: Type.STRING, description: "Traditional Chinese explanation" }
              },
              required: ["gapNumber", "options", "correctAnswer", "category", "explanation"]
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
          passage: {
            type: Type.STRING,
            description: "200-250 word passage with blanks written as '__ 21 __' through '__ 30 __' inline"
          },
          options: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Exactly 10 candidate strings: ['(A) word/phrase', '(B) ...', ..., '(J) ...']"
          },
          answers: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Exactly 10 single letters (A-J) for blanks 21-30 in order. Each letter used exactly once."
          },
          explanations: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Exactly 10 Traditional Chinese explanations, one per blank 21-30"
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
            level: { type: Type.STRING, description: "basic, essential, or advanced" },
            title: { type: Type.STRING },
            passage: { type: Type.STRING, description: "250-300 word article-style passage" },
            questions: {
              type: Type.ARRAY,
              description: "Exactly 4 comprehension questions",
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  question: { type: Type.STRING },
                  options: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "Exactly 4 options: ['(A) ...', '(B) ...', '(C) ...', '(D) ...']"
                  },
                  correctAnswer: { type: Type.STRING, description: "Single letter only: A, B, C, or D" },
                  explanation: { type: Type.STRING, description: "Traditional Chinese explanation with key sentence translation" }
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
          { role: "user", content: instructionsPrompt + "\n\nCRITICAL: Return a single valid JSON object. All correctAnswer fields must be bare letters (A/B/C/D/E/F/G/H/I/J) with NO parentheses. All options arrays must be properly formed string arrays." }
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      });
      outputText = response.choices[0].message.content || "";
    } else {
      const ai = getGenAI();
      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: instructionsPrompt,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
          responseSchema,
          temperature: 0.3,
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

Return structured JSON: { "greeting": string, "analysis": string, "tips": [string, string, string], "encouragement": string }`;

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
        model: "gemini-2.0-flash",
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
