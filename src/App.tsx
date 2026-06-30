
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { 
  Plus, 
  Trash2, 
  Sparkles, 
  BookOpen, 
  GraduationCap, 
  Layers, 
  Settings, 
  CheckCircle, 
  Award, 
  Clock, 
  History, 
  RefreshCw, 
  AlertCircle, 
  Printer, 
  ArrowRight, 
  ListOrdered,
  HelpCircle,
  X,
  FileText
} from "lucide-react";
import { fetchAndParseCSV, padVocabularyIfNecessary } from "./utils/csvFetcher";
import { VocabWord, GeneratedExamSuite, PracticeSessionState, ProgressReport } from "./types";
import WorksheetExport from "./components/WorksheetExport";
import ProgressReportView from "./components/ProgressReportView";

const REASSURING_MESSAGES = [
  "正在剖析大數據：挑選最適合學測程度的精選搭配詞...",
  "杜老師正在為你研擬高擬真的學測字彙單選題...",
  "正在為你編寫多層次閱讀測驗：基本、精實、進階...",
  "正在由杜老師審對答案及 Traditional Chinese 專業詳解中..."
];

export default function App() {
  const [activeTab, setActiveTab] = useState<"lobby" | "player" | "worksheet" | "report">("lobby");
  
  const [vocabSource, setVocabSource] = useState<"system" | "self-input">("system");
  const [selectedLevel, setSelectedLevel] = useState<number>(4);
  const [availableWords, setAvailableWords] = useState<VocabWord[]>([]);
  const [loadingCSV, setLoadingCSV] = useState<boolean>(false);
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
  const [unitSearch, setUnitSearch] = useState<string>("");
  const [unitsDropdownOpen, setUnitsDropdownOpen] = useState<boolean>(false);

  const [selfInputText, setSelfInputText] = useState<string>(
    "accommodate v.\nvital adj.\nsystem n.\nalleviate v.\ncomprehensive adj.\ncoincide v.\ndevastate v.\nexaggerate v.\npersistent adj.\nversatile adj."
  );
  const [selfInputError, setSelfInputError] = useState<string | null>(null);

  const [selectedExerciseTypes, setSelectedExerciseTypes] = useState({
    vocab: true,
    reading: true
  });
  const [selectedReadingLevels, setSelectedReadingLevels] = useState<string[]>(["basic", "essential", "advanced"]);

  const [examSuite, setExamSuite] = useState<GeneratedExamSuite | null>(null);
  const [generationLoading, setGenerationLoading] = useState<boolean>(false);
  const [loadingStepMsg, setLoadingStepMsg] = useState<string>("");
  const [generationError, setGenerationError] = useState<string | null>(null);

  const [session, setSession] = useState<PracticeSessionState>({
    answers: { vocab: {}, cloze: {}, blankMatching: {}, reading: {} },
    submitted: false,
    startTime: 0
  });
  const [currentSection, setCurrentSection] = useState<"vocab" | "cloze" | "matching" | "reading">("vocab");

  const [studyHistory, setStudyHistory] = useState<ProgressReport[]>([]);
  const [activeReport, setActiveReport] = useState<ProgressReport | null>(null);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (generationLoading) {
      let idx = 0;
      setLoadingStepMsg(REASSURING_MESSAGES[0]);
      interval = setInterval(() => {
        idx = (idx + 1) % REASSURING_MESSAGES.length;
        setLoadingStepMsg(REASSURING_MESSAGES[idx]);
      }, 4000);
    }
    return () => clearInterval(interval);
  }, [generationLoading]);

  useEffect(() => {
    if (vocabSource === "system") {
      loadSystemWords(selectedLevel);
    }
  }, [selectedLevel, vocabSource]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("gsat_buffet_history");
      if (saved) {
        setStudyHistory(JSON.parse(saved));
      }
    } catch (e) {
      console.error("Error reading storage", e);
    }
  }, []);

  const loadSystemWords = async (level: number) => {
    setLoadingCSV(true);
    try {
      const words = await fetchAndParseCSV(level);
      setAvailableWords(words);
      const uniqueUnits = Array.from(new Set<string>(words.map(w => w.unit))).sort((a: string, b: string) => parseInt(a) - parseInt(b));
      setSelectedUnits(uniqueUnits.slice(0, 3));
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingCSV(false);
    }
  };

  const parseSelfInputList = (): { word: string; pos?: string; meaning?: string }[] => {
    const list: { word: string; pos?: string; meaning?: string }[] = [];
    const lines = selfInputText.split("\n");

    for (const line of lines) {
      const cleanLine = line.trim();
      if (!cleanLine) continue;

      const posRegex = /\b(v|adj|n|adv|prep|pron|conj|v\.|adj\.|n\.|adv\.|prep\.|pron\.|conj\.)\b|(?:\((v|adj|n|adv|prep|pron|conj|v\.|adj\.|n\.|adv\.|prep\.|pron\.|conj\.)\))/i;
      const matchPos = cleanLine.match(posRegex);
      
      let pos = undefined;
      if (matchPos) {
        pos = (matchPos[1] || matchPos[2] || "").trim().toLowerCase();
        if (pos.endsWith(".")) pos = pos.slice(0, -1);
      }

      let word = "";
      let remaining = "";

      if (matchPos && matchPos.index !== undefined) {
        const index = matchPos.index;
        const posText = matchPos[0];
        word = cleanLine.substring(0, index).trim();
        remaining = cleanLine.substring(index + posText.length).trim();
      } else {
        const delimMatch = cleanLine.match(/[-:]/);
        if (delimMatch && delimMatch.index !== undefined) {
          word = cleanLine.substring(0, delimMatch.index).trim();
          remaining = cleanLine.substring(delimMatch.index + 1).trim();
        } else {
          const tokens = cleanLine.split(/\s+/);
          let englishTokens: string[] = [];
          let otherTokens: string[] = [];
          let foundCh = false;
          for (const token of tokens) {
            if (foundCh) {
              otherTokens.push(token);
            } else if (/^[a-zA-Z\s-]+$/.test(token)) {
              englishTokens.push(token);
            } else {
              foundCh = true;
              otherTokens.push(token);
            }
          }
          if (englishTokens.length > 0) {
            word = englishTokens.join(" ").trim();
            remaining = otherTokens.join(" ").trim();
          } else {
            word = cleanLine.replace(/[^a-zA-Z\s-]/g, "").trim();
          }
        }
      }

      word = word.replace(/^[^a-zA-Z]+|[^a-zA-Z\s-]+$/g, "").trim();
      let meaning = remaining.replace(/^[-:\s~;]+/g, "").trim();

      if (word && word.length > 0) {
        list.push({ word, pos: pos || undefined, meaning: meaning || undefined });
      }
    }

    return list;
  };

  // Normalize options to always be arrays with (A)/(B)/(C)/(D) prefixes
  const normalizeOptions = (opts: any): string[] => {
    let arr: string[] = [];
    if (Array.isArray(opts)) {
      arr = opts;
    } else if (opts && typeof opts === "object") {
      // Handle object format like {"(A)": "text", "(B)": "text"}
      arr = Object.entries(opts).map(([key, val]) => `${key} ${val}`);
    } else {
      return ["(A)", "(B)", "(C)", "(D)"];
    }

    return arr.map((opt, idx) => {
      const letter = ["A", "B", "C", "D"][idx];
      const s = String(opt).trim();
      // Already has (A) prefix
      if (s.startsWith(`(${letter})`)) return s;
      // Has (A): or (A). prefix
      if (s.match(/^\([A-D]\)/)) return s;
      return `(${letter}) ${s}`;
    });
  };

  // Normalize correctAnswer to single letter: "(A)" -> "A"
  const normalizeAnswer = (ans: any): string => {
    return String(ans).replace(/[()]/g, "").trim();
  };

  const handleGenerateExam = async () => {
    setGenerationError(null);
    setGenerationLoading(true);

    try {
      let finalVocabList: { word: string; pos?: string; meaning?: string }[] = [];
      let sourceCount = 0;

      if (vocabSource === "system") {
        let filteredWords = availableWords;
        if (selectedUnits.length > 0) {
          filteredWords = availableWords.filter(w => selectedUnits.includes(w.unit));
        }
        finalVocabList = filteredWords.map(w => ({ word: w.word, pos: w.pos, meaning: w.meaning }));
        sourceCount = finalVocabList.length;
      } else {
        const list = parseSelfInputList();
        if (list.length === 0) throw new Error("請先在自主輸入區塊輸入單字列表喔！");
        if (list.length < 12) {
          const padded = await padVocabularyIfNecessary(list, selectedLevel, 12);
          finalVocabList = padded;
        } else {
          finalVocabList = list;
        }
        sourceCount = list.length;
      }

      if (finalVocabList.length === 0) throw new Error("找不到可用的單字。請嘗試重選字表級別或檢查輸入。");

      const hasAnySelected = Object.values(selectedExerciseTypes).some(v => v === true);
      if (!hasAnySelected) throw new Error("請至少勾選一種想練習或列印的學測大題型！");

      const getErrorMsg = async (response: Response) => {
        let errorMsg = "";
        try {
          const text = await response.text();
          try {
            const errorData = JSON.parse(text);
            errorMsg = errorData.error || "";
          } catch {
            if (text.includes("Action required to load your app") || text.includes("security cookie")) {
              errorMsg = "瀏覽器第三方 Cookie 遭到阻擋，請開啟瀏覽器 Cookie 存取權限，或點選右上角『在新分頁中開啟』本程式。";
            } else {
              errorMsg = text.slice(0, 300);
            }
          }
        } catch (e) {
          errorMsg = `狀態碼: ${response.status}`;
        }
        if (response.status === 500 && (!errorMsg || errorMsg.includes("API Configuration Error") || errorMsg.includes("Status: 500") || errorMsg.includes("Internal Server Error"))) {
          errorMsg = "API 金鑰未設定或已失效。請至左上角或右上角 Settings > Secrets 檢查是否設定了『GEMINI_API_KEY』並重新整理。";
        }
        return errorMsg || "大腦生成模組失敗，請稍後再試。";
      };

      const finalSuiteData: any = { vocabQuestions: [], readingPassages: [] };

      // 1. Generate Vocab Questions if checked
      if (selectedExerciseTypes.vocab) {
        setLoadingStepMsg("正在為您精心設計學測字彙單選題 (10 題)...");
        const resVocab = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vocabList: finalVocabList,
            selectedExerciseTypes: { vocab: true, reading: false },
            selectedReadingLevels: [],
            selectedLevel
          })
        });

        if (!resVocab.ok) throw new Error(await getErrorMsg(resVocab));

       const resVocabData = await resVocab.json();
console.log("RAW Q1 options:", JSON.stringify(resVocabData.data?.vocabQuestions?.[0]?.options));
if (resVocabData.success && resVocabData.data && resVocabData.data.vocabQuestions) {
  finalSuiteData.vocabQuestions = resVocabData.data.vocabQuestions.map((q: any) => ({
    ...q,
    options: normalizeOptions(q.options || q.choices),
    correctAnswer: normalizeAnswer(q.correctAnswer || q.answer)
  }));
  console.log("NORMALIZED VOCAB Q1:", JSON.stringify(finalSuiteData.vocabQuestions[0], null, 2));
} else {
  throw new Error("生成學測字彙題失敗，請重試。");
}
        }

      // 2. Generate Reading passages per level if checked
      if (selectedExerciseTypes.reading && selectedReadingLevels && selectedReadingLevels.length > 0) {
        for (const lvl of selectedReadingLevels) {
          const lvlLabel = lvl === "basic" ? "基礎級 (Basic)" : lvl === "essential" ? "核心級 (Essential)" : "進階級 (Advanced)";
          setLoadingStepMsg(`正在精心撰寫 ${lvlLabel} 閱讀測驗及 4 題多類別題目...`);

          const resReading = await fetch("/api/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              vocabList: finalVocabList,
              selectedExerciseTypes: { vocab: false, reading: true },
              selectedReadingLevels: [lvl],
              selectedLevel
            })
          });

          if (!resReading.ok) throw new Error(await getErrorMsg(resReading));

          const resReadingData = await resReading.json();
          if (resReadingData.success && resReadingData.data) {
            let passages = resReadingData.data.readingPassages;

            // Handle both array and single object responses from AI
            if (passages && !Array.isArray(passages)) {
              passages = [passages];
            }

            if (passages && passages.length > 0 && passages[0]) {
              const passage = {
                ...passages[0],
                questions: (passages[0].questions || []).map((q: any) => ({
                  ...q,
                  options: normalizeOptions(q.options),
                  correctAnswer: normalizeAnswer(q.correctAnswer)
                }))
              };
              finalSuiteData.readingPassages.push(passage);
            } else {
              throw new Error(`生成 ${lvlLabel} 閱讀測驗失敗，請重試。`);
            }
          } else {
            throw new Error(resReadingData.error || `生成 ${lvlLabel} 閱讀測驗失敗，請重試。`);
          }
        }
      }

      // Final filter to remove any malformed passages
      finalSuiteData.readingPassages = finalSuiteData.readingPassages
        .filter((p: any) => p && p.questions && Array.isArray(p.questions) && p.questions.length > 0);

      const suite: GeneratedExamSuite = {
        ...finalSuiteData,
        timestamp: Date.now(),
        metadata: {
          vocabCount: sourceCount,
          sourceType: vocabSource,
          selectedLevel,
          selectedUnits: vocabSource === "system" ? selectedUnits : ["Self Input"]
        }
      };

      setExamSuite(suite);
      setSession({
        answers: { vocab: {}, cloze: {}, blankMatching: {}, reading: {} },
        submitted: false,
        startTime: Date.now()
      });

      if (suite.vocabQuestions && suite.vocabQuestions.length > 0) setCurrentSection("vocab");
      else if (suite.readingPassages && suite.readingPassages.length > 0) setCurrentSection("reading");

      setActiveTab("player");
    } catch (err: any) {
      console.error(err);
      setGenerationError(err.message || "生卷失敗，請檢查網路連線或稍等後再試。");
    } finally {
      setGenerationLoading(false);
    }
  };

  const handleInteractiveSubmitAnswers = async () => {
    if (!examSuite) return;

    const reportDetails: any[] = [];
    const summary = {
      vocab: { correct: 0, total: 0, score: 0 },
      cloze: { correct: 0, total: 0, score: 0 },
      blankMatching: { correct: 0, total: 0, score: 0 },
      reading: { correct: 0, total: 0, score: 0 },
      comprehensive: { correct: 0, total: 0, score: 0 }
    };

    if (examSuite.vocabQuestions) {
      examSuite.vocabQuestions.forEach((q) => {
        const userAns = session.answers.vocab[q.id] || "";
        const isCorrect = userAns === q.correctAnswer;
        if (isCorrect) summary.vocab.correct++;
        summary.vocab.total++;
        reportDetails.push({
          section: "vocab",
          questionNumberOrName: q.id,
          isCorrect,
          userAnswer: userAns,
          correctAnswer: q.correctAnswer,
          questionText: q.question
        });
      });
      summary.vocab.score = summary.vocab.total > 0 ? Math.round((summary.vocab.correct / summary.vocab.total) * 100) : 0;
    }

    if (examSuite.readingPassages) {
      examSuite.readingPassages.forEach((p, pIdx) => {
        p.questions.forEach((q: any, qIdx: number) => {
          const userKey = `${pIdx}-${qIdx}`;
          const userAns = session.answers.reading[userKey] || "";
          const isCorrect = userAns === q.correctAnswer;
          if (isCorrect) summary.reading.correct++;
          summary.reading.total++;
          reportDetails.push({
            section: "reading",
            questionNumberOrName: `P${pIdx + 1}-Q${qIdx + 1}`,
            isCorrect,
            userAnswer: userAns,
            correctAnswer: q.correctAnswer,
            questionText: `[Passage: ${p.title}] ${q.question}`
          });
        });
      });
      summary.reading.score = summary.reading.total > 0 ? Math.round((summary.reading.correct / summary.reading.total) * 100) : 0;
    }

    const totalCorrect = summary.vocab.correct + summary.reading.correct;
    const totalQuestions = summary.vocab.total + summary.reading.total;
    summary.comprehensive = {
      correct: totalCorrect,
      total: totalQuestions,
      score: totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0
    };

    const duration = Date.now() - session.startTime;

    const report: ProgressReport = {
      sessionId: `session-${Date.now()}`,
      timestamp: Date.now(),
      durationMs: duration,
      scoreSummary: summary,
      details: reportDetails,
      expertFeedback: "杜老師正在奮力評語中..."
    };

    setActiveReport(report);

    const updatedHistory = [report, ...studyHistory].slice(0, 50);
    setStudyHistory(updatedHistory);
    try {
      localStorage.setItem("gsat_buffet_history", JSON.stringify(updatedHistory));
    } catch (e) {
      console.error(e);
    }

    setSession(prev => ({ ...prev, submitted: true, endTime: Date.now() }));
    setActiveTab("report");
  };

  const handleClearHistory = () => {
    if (confirm("確定要清除所有備考研究紀錄與學習成績嗎？")) {
      setStudyHistory([]);
      localStorage.removeItem("gsat_buffet_history");
    }
  };

  const uniqueUnits = Array.from(new Set<string>(availableWords.map(w => w.unit)))
    .sort((a: string, b: string) => parseInt(a) - parseInt(b));

  const filteredUnits = uniqueUnits.filter((u: string) => 
    u.toLowerCase().includes(unitSearch.toLowerCase())
  );

  return (
    <div className="min-h-screen flex flex-col font-sans bg-[#FBFBFA]">
      <header className="no-print bg-white border-b border-stone-200/80 sticky top-0 z-50 shadow-xs transition duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 cursor-pointer select-none" onClick={() => setActiveTab("lobby")}>
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-700 to-amber-900 text-stone-100 flex items-center justify-center font-bold text-xl shadow-md border border-amber-950/20">
              TS
            </div>
            <div>
              <h1 className="text-md sm:text-lg font-black tracking-tight text-stone-900 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span>GSAT English Mock Paper Creator</span>
                <span className="text-amber-800 font-semibold text-sm sm:text-base">學測英文模考創建器</span>
              </h1>
              <p className="text-[11px] text-stone-500 font-sans mt-0.5 tracking-wide font-medium flex items-center gap-1.5">
                <span className="text-amber-800">★</span> <span className="underline decoration-amber-600/40 decoration-2">Designed by Tr. Shirley Du</span>
              </p>
            </div>
          </div>

          <nav className="flex items-center gap-1 sm:gap-2 text-xs">
            {examSuite && (
              <>
                <button onClick={() => setActiveTab("player")} className={`px-3 py-2 rounded-lg font-semibold transition duration-150 flex items-center gap-1.5 ${activeTab === "player" ? "bg-teal-50 text-teal-850" : "text-stone-600 hover:bg-stone-50"}`} id="nav-player-btn">
                  <GraduationCap className="w-4 h-4 text-teal-700" />
                  Test Player (模擬練題)
                </button>
                <button onClick={() => setActiveTab("worksheet")} className={`px-3 py-2 rounded-lg font-semibold transition duration-150 flex items-center gap-1.5 ${activeTab === "worksheet" ? "bg-amber-50 text-amber-900" : "text-stone-600 hover:bg-stone-50"}`} id="nav-worksheet-btn">
                  <Printer className="w-4 h-4 text-amber-800" />
                  Worksheet (列印考卷)
                </button>
              </>
            )}
            {activeReport && (
              <button onClick={() => setActiveTab("report")} className={`px-3 py-2 rounded-lg font-semibold transition duration-150 flex items-center gap-1.5 ${activeTab === "report" ? "bg-stone-850 text-white" : "text-stone-600 hover:bg-stone-50"}`} id="nav-report-btn">
                <Award className="w-4 h-4 text-amber-400" />
                Report (成績單)
              </button>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {activeTab === "lobby" && (
          <div className="space-y-8 animate-fade-in" id="lobby-panel">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              
              <div className="lg:col-span-8 bg-white border border-stone-200/90 rounded-2xl p-6 md:p-8 shadow-xs space-y-6">
                <div className="border-b border-stone-150 pb-4">
                  <h3 className="text-lg font-bold font-display text-stone-900 flex items-center gap-2">
                    <Layers className="w-5 h-5 text-amber-800" />
                    Step 1: Choose Vocabulary Source / 設定學測候選字彙來源
                  </h3>
                  <p className="text-xs text-stone-500 mt-1">Select the core target vocabulary levels/units, or paste your custom word list.</p>
                </div>

                <div className="grid grid-cols-2 gap-3 p-1.5 bg-stone-100 rounded-xl" id="vocab-source-container">
                  <button onClick={() => setVocabSource("system")} className={`py-2 rounded-lg text-xs font-bold transition duration-200 flex items-center justify-center gap-1.5 ${vocabSource === "system" ? "bg-white text-stone-900 shadow-xs" : "text-stone-500 hover:text-stone-800"}`} id="source-system-btn">
                    System Database 系統內建單字庫
                  </button>
                  <button onClick={() => setVocabSource("self-input")} className={`py-2 rounded-lg text-xs font-bold transition duration-200 flex items-center justify-center gap-1.5 ${vocabSource === "self-input" ? "bg-white text-stone-900 shadow-xs" : "text-stone-500 hover:text-stone-800"}`} id="source-self-btn">
                    Self-Input List 自訂單字輸入
                  </button>
                </div>

                {vocabSource === "system" ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-stone-50/50 p-4 rounded-xl border border-stone-100">
                    <div className="space-y-1.5" id="level-select-container">
                      <label className="text-xs font-bold font-sans uppercase text-stone-500 flex items-center gap-1">Syllabus Level (篩選學測字級)</label>
                      <select value={selectedLevel} onChange={(e) => setSelectedLevel(parseInt(e.target.value))} className="w-full bg-white border border-stone-300 hover:border-stone-400 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-teal-700 transition" id="level-selector-dropdown">
                        <option value={1}>Level 1 (Basic / 基礎級)</option>
                        <option value={2}>Level 2 (Basic / 基礎級)</option>
                        <option value={3}>Level 3 (Essential / 核心級)</option>
                        <option value={4}>Level 4 (Essential / 核心級)</option>
                        <option value={5}>Level 5 (Advanced / 進階級)</option>
                        <option value={6}>Level 6 (Advanced / 進階級)</option>
                      </select>
                    </div>

                    <div className="space-y-1.5 relative" id="unit-select-container">
                      <label className="text-xs font-bold font-sans uppercase text-stone-500">Filter Units (篩選單元)</label>
                      <div className="relative">
                        <button type="button" onClick={() => setUnitsDropdownOpen(!unitsDropdownOpen)} className="w-full bg-white border border-stone-300 hover:border-stone-400 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none flex items-center justify-between transition cursor-pointer" id="unit-dropdown-trigger">
                          <span className="truncate">{selectedUnits.length === 0 ? "All Units" : `Selected ${selectedUnits.length} Units`}</span>
                          <span className="text-stone-400 text-[10px]">▼</span>
                        </button>

                        {unitsDropdownOpen && (
                          <div className="absolute top-10 right-0 left-0 bg-white border border-stone-200 rounded-xl shadow-md p-3 z-30 max-h-56 overflow-y-auto space-y-2">
                            <div className="flex items-center gap-2 border-b border-stone-100 pb-2">
                              <input type="text" placeholder="Search unit..." value={unitSearch} onChange={(e) => setUnitSearch(e.target.value)} className="w-full border border-stone-200 rounded-md p-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-teal-700" />
                            </div>
                            <div className="flex justify-between items-center text-[10px] text-teal-800 font-bold border-b border-stone-100 pb-1 px-1">
                              <button type="button" onClick={() => setSelectedUnits(uniqueUnits)} className="hover:underline">Select All</button>
                              <button type="button" onClick={() => setSelectedUnits([])} className="hover:underline text-rose-800">Clear All</button>
                            </div>
                            <div className="space-y-1 pt-1 max-h-36 overflow-y-auto">
                              {loadingCSV ? (
                                <p className="text-[10px] text-stone-500 text-center py-2 animate-pulse">Loading lists...</p>
                              ) : filteredUnits.length === 0 ? (
                                <p className="text-[10px] text-stone-400 text-center py-2">No units found</p>
                              ) : (
                                filteredUnits.map((unit) => {
                                  const isChecked = selectedUnits.includes(unit);
                                  return (
                                    <label key={unit} className="flex items-center gap-2 p-1 hover:bg-stone-50 rounded cursor-pointer text-xs">
                                      <input type="checkbox" checked={isChecked} onChange={() => { if (isChecked) { setSelectedUnits(selectedUnits.filter(u => u !== unit)); } else { setSelectedUnits([...selectedUnits, unit]); } }} className="rounded border-stone-300 text-teal-700 focus:ring-teal-700 w-3.5 h-3.5" />
                                      <span>Unit {unit}</span>
                                    </label>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1.5 sm:col-span-2 border-t border-stone-100 pt-3 mt-1">
                      <p className="text-xs text-stone-600 font-medium">
                        <span className="text-amber-800 font-bold">{selectedUnits.length === 0 ? availableWords.length : availableWords.filter(w => selectedUnits.includes(w.unit)).length} words</span>{" "}
                        available from selected units — all will be passed to the AI for question generation.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 bg-stone-50/50 p-4 rounded-xl border border-stone-100" id="self-input-container">
                    <div className="flex justify-between items-start gap-4 flex-wrap">
                      <label className="text-xs font-bold font-sans uppercase text-stone-500">Paste Word List (貼上自訂單字表)</label>
                      <span className="text-[10px] text-amber-900 font-bold bg-amber-50 px-2 py-1 rounded">Format: word POS (one per line) / 格式：單字 詞性 (一行一組)</span>
                    </div>
                    <textarea value={selfInputText} onChange={(e) => { setSelfInputText(e.target.value); setSelfInputError(null); }} rows={6} className="w-full bg-white border border-stone-300 hover:border-stone-400 rounded-xl p-3 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-teal-700 transition" placeholder="accommodate v.&#10;vital adj.&#10;system n." id="self-input-textarea" />
                    <div className="flex justify-between items-center text-[10px] text-stone-500 pt-1 flex-wrap gap-2">
                      <span>Detected: {parseSelfInputList().length} words / 已偵測: {parseSelfInputList().length} 個單字</span>
                      <span className="text-stone-400 font-sans">(If list &lt; 12, system will automatically pad with matching vocab.)</span>
                    </div>
                  </div>
                )}

                <div className="border-t border-stone-150 pt-6 space-y-4">
                  <div className="pb-1">
                    <h3 className="text-md font-bold font-display text-stone-900 flex items-center gap-2">
                      <Settings className="w-5 h-5 text-amber-800" />
                      Step 2: Choose Mock Quiz Modules / 選擇擬真試卷大題
                    </h3>
                    <p className="text-xs text-stone-500 mt-1">Select the specific exam sections you wish to compile in your mock worksheet.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4" id="quiz-types-checklist">
                    <label className={`border rounded-xl p-4 flex items-center gap-3 cursor-pointer transition ${selectedExerciseTypes.vocab ? "border-teal-400 bg-teal-50/20" : "border-stone-200 hover:border-stone-300 bg-white"}`}>
                      <input type="checkbox" checked={selectedExerciseTypes.vocab} onChange={() => setSelectedExerciseTypes(prev => ({ ...prev, vocab: !prev.vocab }))} className="rounded border-stone-300 text-teal-700 focus:ring-teal-700 w-4 h-4 shrink-0" id="checkbox-vocab-mcq" />
                      <span className="text-xs font-bold text-stone-900 font-sans">GSAT Vocabulary MCQs (10 Qs) / 詞彙單選題 (10 題)</span>
                    </label>

                    <div className={`border rounded-xl p-4 space-y-3 transition ${selectedExerciseTypes.reading ? "border-teal-400 bg-teal-50/20" : "border-stone-200 hover:border-stone-300 bg-white"}`}>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" checked={selectedExerciseTypes.reading} onChange={() => setSelectedExerciseTypes(prev => ({ ...prev, reading: !prev.reading }))} className="rounded border-stone-300 text-teal-700 focus:ring-teal-700 w-4 h-4 shrink-0" id="checkbox-reading-comprehension" />
                        <span className="text-xs font-bold text-stone-900 font-sans">GSAT Reading Comprehension (4 Qs per level) / 閱讀測驗 (每級 4 題)</span>
                      </label>
                      {selectedExerciseTypes.reading && (
                        <div className="pl-7 grid grid-cols-3 gap-2" id="reading-levels-container">
                          {["basic", "essential", "advanced"].map(lvl => {
                            const isLvlChecked = selectedReadingLevels.includes(lvl);
                            return (
                              <button key={lvl} type="button" onClick={() => { if (isLvlChecked) { setSelectedReadingLevels(selectedReadingLevels.filter(l => l !== lvl)); } else { setSelectedReadingLevels([...selectedReadingLevels, lvl]); } }} className={`py-1.5 px-2 rounded-lg text-[10px] border font-bold capitalize transition duration-150 ${isLvlChecked ? "bg-teal-800 text-white border-teal-800" : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50"}`} id={`reading-lvl-${lvl}-btn`}>
                                {lvl === "basic" ? "Basic (L1-2)" : lvl === "essential" ? "Essential (L3-4)" : "Advanced (L5-6)"}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="border-t border-stone-150 pt-6">
                  {generationError && (
                    <div className="bg-rose-50 border border-rose-200 p-4 rounded-xl text-rose-800 flex items-start gap-3 mb-4 text-xs">
                      <AlertCircle className="w-5 h-5 shrink-0" />
                      <div className="space-y-1">
                        <p className="font-bold">生卷模組發現錯誤 Error:</p>
                        <p>{generationError}</p>
                      </div>
                    </div>
                  )}

                  {generationLoading ? (
                    <div className="space-y-4 bg-stone-50 border border-stone-200 rounded-2xl p-6 text-center shadow-inner">
                      <div className="flex justify-center items-center gap-2">
                        <RefreshCw className="w-6 h-6 text-teal-800 animate-spin" />
                        <span className="font-bold text-stone-900 font-display text-base">Mock Paper Creator Engine Operating</span>
                      </div>
                      <p className="text-xs font-mono font-medium text-amber-900 tracking-wide animate-pulse" id="loading-message-box">{loadingStepMsg}</p>
                      <p className="text-[10px] text-stone-400">*由 AI 引擎全速分析語料並製作最貼合學測規範的高水準試題，通常約需數秒。</p>
                    </div>
                  ) : (
                    <button onClick={handleGenerateExam} className="w-full bg-teal-800 hover:bg-teal-900 text-white rounded-2xl py-4 font-semibold text-sm flex items-center justify-center gap-2 shadow-md hover:shadow-teal-800/10 active:scale-[0.99] transition duration-200" id="generate-exam-suite-btn">
                      <Sparkles className="w-4 h-4 text-amber-300" />
                      一鍵完美生卷 (Generate Exam)
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="lg:col-span-4 space-y-6 no-print">
                <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-xs space-y-4">
                  <div className="flex justify-between items-center border-b border-stone-100 pb-3">
                    <h3 className="text-xs font-bold font-display uppercase tracking-wider text-stone-900 flex items-center gap-2">
                      <History className="w-4 h-4 text-amber-800" />
                      Study History Board (累積備考成就)
                    </h3>
                    {studyHistory.length > 0 && (
                      <button onClick={handleClearHistory} className="text-[10px] text-rose-800 hover:underline font-bold" id="clear-logs-btn">Clear All</button>
                    )}
                  </div>

                  {studyHistory.length === 0 ? (
                    <div className="text-center py-8 text-stone-400 space-y-2">
                      <Layers className="w-8 h-8 mx-auto stroke-1" />
                      <p className="text-[11px] font-sans">目前尚未有練習任務歷史。<br />快在左側勾選單字與題型開始寫考卷吧！</p>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-64 overflow-y-auto" id="history-logs-shelf">
                      {studyHistory.map((log) => (
                        <div key={log.sessionId} className="bg-stone-50 border border-stone-150 p-3 rounded-xl hover:border-amber-300 hover:bg-stone-100/50 transition duration-200 cursor-pointer flex justify-between items-center" onClick={() => { setActiveReport(log); setActiveTab("report"); }} id={`history-log-${log.sessionId}`}>
                          <div className="space-y-0.5">
                            <span className="text-[10px] text-stone-500 font-mono">{new Date(log.timestamp).toLocaleDateString()} Completer</span>
                            <p className="text-xs font-bold font-display text-stone-900">Comprehensive Accuracy: {log.scoreSummary.comprehensive.score}%</p>
                            <span className="text-[10px] text-stone-500 font-sans block">Total correct: {log.scoreSummary.comprehensive.correct}/{log.scoreSummary.comprehensive.total}</span>
                          </div>
                          <span className={`w-8 h-8 rounded-full flex items-center justify-center font-mono text-[10px] font-bold shrink-0 ${log.scoreSummary.comprehensive.score >= 80 ? "bg-teal-100 text-teal-800" : log.scoreSummary.comprehensive.score >= 60 ? "bg-amber-100 text-amber-900" : "bg-rose-100 text-rose-900"}`}>
                            {log.scoreSummary.comprehensive.score}%
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "player" && examSuite && (
          <div className="space-y-6 animate-fade-in" id="quiz-player-dashboard">
            <div className="bg-white border border-stone-200 rounded-2xl p-4 md:p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="bg-amber-100 font-mono text-[9px] px-2 py-0.5 rounded font-bold uppercase tracking-wider text-amber-900">Level {examSuite.metadata.selectedLevel} Practice</span>
                <h2 className="text-xl font-bold font-display text-stone-900">英語學測仿真複習卷 (Buffet Practice Mode)</h2>
                <p className="text-xs text-stone-500 font-sans">Active words: {examSuite.metadata.vocabCount} reference terms</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                <button onClick={() => setActiveTab("worksheet")} className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 hover:text-stone-900 rounded-xl text-xs font-semibold flex items-center gap-1.5 border border-stone-200/80 transition" id="player-to-worksheet-tab-btn">
                  <Printer className="w-4 h-4" />
                  Print Exam Worksheet
                </button>
                <button onClick={handleInteractiveSubmitAnswers} className="px-4 py-2 bg-teal-800 hover:bg-teal-900 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition duration-200" id="submit-exam-suite-btn">
                  <CheckCircle className="w-4 h-4" />
                  Submit Answers & Diagnose
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-3 flex flex-col gap-2 bg-white p-3 border border-stone-200 rounded-2xl shadow-xs" id="player-sections-nav">
                <span className="text-[10px] font-bold font-mono uppercase text-stone-500 px-3 py-1.5 select-none text-center">Sections Checklist</span>
                {examSuite.vocabQuestions && (
                  <button onClick={() => setCurrentSection("vocab")} className={`px-3 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between transition ${currentSection === "vocab" ? "bg-teal-700 text-white" : "text-stone-600 hover:bg-stone-50"}`} id="section-nav-vocab">
                    <span>Part I: MCQ字彙題</span>
                    <span className="bg-black/10 text-[9px] px-2 py-0.5 rounded-full font-mono">10 Qs</span>
                  </button>
                )}
                {examSuite.readingPassages && examSuite.readingPassages.length > 0 && (
                  <button onClick={() => setCurrentSection("reading")} className={`px-3 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between transition ${currentSection === "reading" ? "bg-teal-700 text-white" : "text-stone-600 hover:bg-stone-50"}`} id="section-nav-reading">
                    <span>Part II: Reading 閱讀測驗</span>
                    <span className="bg-black/10 text-[9px] px-2 py-0.5 rounded-full font-mono">{examSuite.readingPassages.length * 4} Qs</span>
                  </button>
                )}
                <div className="border-t border-stone-100 pt-3 mt-4 flex flex-col gap-2">
                  <button onClick={handleInteractiveSubmitAnswers} className="w-full bg-teal-800 hover:bg-teal-900 text-white text-xs font-semibold py-2 rounded-xl transition shadow-xs" id="sbmit-side-btn">
                    Diagnose Grade Now
                  </button>
                </div>
              </div>

              <div className="lg:col-span-9 bg-white border border-stone-200 p-6 md:p-8 rounded-2xl shadow-xs" id="player-exercise-viewport">
                
                {currentSection === "vocab" && examSuite.vocabQuestions && (
                  <div className="space-y-6" id="player-vocab-section">
                    <div className="border-b border-stone-100 pb-3 flex justify-between items-center">
                      <h3 className="text-base font-bold font-display text-stone-900">Part I: Multiple-Choice Questions (10 學測模擬字彙單選)</h3>
                      <span className="text-[10px] font-mono font-bold text-stone-500">Progress: {Object.keys(session.answers.vocab).length}/10 answered</span>
                    </div>
                    <div className="space-y-8">
                      {examSuite.vocabQuestions.map((q, qIndex) => {
                        const userSelectedChoice = session.answers.vocab[q.id] || "";
                        return (
                          <div key={q.id} className="space-y-3 text-sm p-4 hover:bg-stone-50/50 rounded-xl transition duration-150 border border-transparent hover:border-stone-150">
                            <span className="font-mono text-xs font-bold text-amber-800 bg-amber-50 rounded-lg px-2 py-0.5">Question {qIndex + 1}</span>
                            <p className="font-semibold text-stone-900 text-base leading-relaxed">{q.question}</p>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5 mt-4">
                              {["A", "B", "C", "D"].map((letter) => {
                                const optString = q.options.find((o: string) => o.startsWith(`(${letter})`)) || `(${letter})`;
                                const isSelected = userSelectedChoice === letter;
                                return (
                                  <button key={letter} type="button" onClick={() => { setSession(prev => ({ ...prev, answers: { ...prev.answers, vocab: { ...prev.answers.vocab, [q.id]: letter } } })); }} className={`py-3 px-4 rounded-xl text-xs text-left font-semibold transition border ${isSelected ? "bg-teal-700 text-white border-teal-700 shadow-sm" : "bg-white text-stone-700 border-stone-200 hover:bg-stone-50"}`} id={`player-vocab-q-${qIndex}-opt-${letter}`}>
                                    {optString}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {currentSection === "reading" && examSuite.readingPassages && (
                  <div className="space-y-8" id="player-reading-section">
                    <div className="border-b border-stone-100 pb-3">
                      <h3 className="text-base font-bold font-display text-stone-900">Part II: Reading Comprehension (學測分級閱讀測驗)</h3>
                      <p className="text-xs text-stone-500 mt-0.5">挑戰精選學測難點，請仔細閱讀文章後作答 4 題多類別單題設計。</p>
                    </div>
                    {examSuite.readingPassages.map((p, pIdx) => (
                      <div key={pIdx} className="space-y-6 border-b border-stone-200 pb-8 last:border-none">
                        <div className="flex items-center gap-2">
                          <span className="bg-amber-100 text-amber-900 font-mono text-[9px] px-2.5 py-0.5 rounded font-bold uppercase">Level: {p.level}</span>
                          <h4 className="text-md font-bold font-serif text-stone-950">{p.title}</h4>
                        </div>
                        <p className="bg-[#FAF9F5]/70 border border-stone-150 p-6 rounded-2xl text-stone-850 text-base leading-relaxed font-serif whitespace-pre-wrap">{p.passage}</p>
                        <div className="space-y-6 pt-4">
                          {p.questions.map((q: any, qIdx: number) => {
                            const userKey = `${pIdx}-${qIdx}`;
                            const userAns = session.answers.reading[userKey] || "";
                            return (
                              <div key={`${pIdx}-${qIdx}`} className="bg-stone-50/50 p-4 rounded-xl border border-stone-150/50 space-y-3">
                                <span className="font-mono text-[11px] font-bold text-stone-500 uppercase tracking-wider block">Question {qIdx + 1}</span>
                                <p className="font-semibold text-stone-900 text-sm leading-relaxed">{q.question}</p>
                                <div className="flex flex-col gap-2 mt-3 pl-1">
                                  {["A", "B", "C", "D"].map((letter) => {
                                    const optStr = q.options.find((o: string) => o.startsWith(`(${letter})`)) || `(${letter})`;
                                    const isSelected = userAns === letter;
                                    return (
                                      <button key={letter} type="button" onClick={() => { setSession(prev => ({ ...prev, answers: { ...prev.answers, reading: { ...prev.answers.reading, [userKey]: letter } } })); }} className={`py-2 px-4 rounded-lg text-xs text-left font-semibold border transition ${isSelected ? "bg-teal-700 text-white border-teal-700" : "bg-white text-stone-700 border-stone-300 hover:bg-stone-50"}`} id={`player-reading-p-${pIdx}-q-${qIdx}-opt-${letter}`}>
                                        {optStr}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="border-t border-stone-150 pt-6 mt-12 flex justify-between items-center text-xs">
                  <span className="text-stone-400 font-serif italic">Have faith in your English intuition!</span>
                  <button onClick={handleInteractiveSubmitAnswers} className="px-6 py-3 bg-teal-800 hover:bg-teal-900 text-white font-semibold rounded-2xl flex items-center gap-1.5 shadow-sm transition duration-200" id="submit-answers-footer">
                    <CheckCircle className="w-4 h-4" />
                    Submit Final Assessment
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "worksheet" && examSuite && (
          <WorksheetExport suite={examSuite} onBack={() => setActiveTab("player")} />
        )}

        {activeTab === "report" && activeReport && examSuite && (
          <ProgressReportView
            report={activeReport}
            suite={examSuite}
            onRestart={() => { setExamSuite(null); setActiveTab("lobby"); }}
            onGoToWorksheet={() => { setActiveTab("worksheet"); }}
          />
        )}

      </main>

      <footer className="no-print bg-white border-t border-stone-200 mt-16 py-6 text-center text-[11px] text-stone-500 font-sans">
        <p className="font-semibold text-stone-700">GSAT English Mock Paper Creator • 學測英文模考創建器</p>
        <p className="mt-1 text-[10px] text-amber-800 font-medium">Designed by Tr. Shirley Du</p>
        <p className="mt-2 text-[9px] text-stone-400">© 2026. All rights reserved. Taiwan High School Scholastic Preparation.</p>
      </footer>
    </div>
  );
}
