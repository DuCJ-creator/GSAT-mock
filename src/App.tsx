/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import {
  Sparkles, GraduationCap, Layers, Settings, CheckCircle, Award,
  History, RefreshCw, AlertCircle, Printer, ArrowRight
} from "lucide-react";
import { fetchAndParseCSV, padVocabularyIfNecessary } from "./utils/csvFetcher";
import { normalizeOptions, normalizeAnswer } from "./utils/helpers";
import { VocabWord, GeneratedExamSuite, PracticeSessionState, ProgressReport } from "./types";
import WorksheetExport from "./components/WorksheetExport";
import ProgressReportView from "./components/ProgressReportView";

const REASSURING_MESSAGES = [
  "正在剖析大數據：挑選最適合學測程度的精選搭配詞...",
  "杜老師正在為你研擬高擬真的學測字彙單選題...",
  "正在架構『綜合測驗』克漏字：融入文法、介系詞、轉折詞巧思...",
  "正在撰寫『文意選填』：配置 10 組極具欺騙性的高級字彙選項...",
  "正在為你編寫多層次閱讀測驗：基本、精實、進階...",
  "正在由杜老師審對答案及 Traditional Chinese 專業詳解中..."
];

export default function App() {
  const [activeTab, setActiveTab] = useState<"lobby" | "player" | "worksheet" | "report">("lobby");
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

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

  const [selectedExerciseTypes, setSelectedExerciseTypes] = useState({
    vocab: true, cloze: true, blankMatching: true, reading: true
  });
  const [selectedReadingLevels, setSelectedReadingLevels] = useState<string[]>(["essential"]);

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
    if (vocabSource === "system") loadSystemWords(selectedLevel);
  }, [selectedLevel, vocabSource]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("gsat_buffet_history");
      if (saved) setStudyHistory(JSON.parse(saved));
    } catch (e) { console.error(e); }
  }, []);

  const loadSystemWords = async (level: number) => {
    setLoadingCSV(true);
    try {
      const words = await fetchAndParseCSV(level);
      setAvailableWords(words);
      const uniqueUnits = Array.from(new Set<string>(words.map(w => w.unit)))
        .sort((a, b) => parseInt(a) - parseInt(b));
      setSelectedUnits(uniqueUnits.slice(0, 3));
    } catch (err) { console.error(err); }
    finally { setLoadingCSV(false); }
  };

  const parseSelfInputList = (): { word: string; pos?: string; meaning?: string }[] => {
    const list: { word: string; pos?: string; meaning?: string }[] = [];
    for (const line of selfInputText.split("\n")) {
      const cleanLine = line.trim();
      if (!cleanLine) continue;
      const posRegex = /\b(v|adj|n|adv|prep|pron|conj|v\.|adj\.|n\.|adv\.|prep\.|pron\.|conj\.)\b/i;
      const matchPos = cleanLine.match(posRegex);
      let pos: string | undefined;
      let word = "";
      let remaining = "";
      if (matchPos && matchPos.index !== undefined) {
        pos = matchPos[1].replace(".", "").toLowerCase();
        word = cleanLine.substring(0, matchPos.index).trim();
        remaining = cleanLine.substring(matchPos.index + matchPos[0].length).trim();
      } else {
        const tokens = cleanLine.split(/\s+/);
        const englishTokens = tokens.filter(t => /^[a-zA-Z\s-]+$/.test(t));
        word = englishTokens.join(" ").trim();
        remaining = "";
      }
      word = word.replace(/^[^a-zA-Z]+|[^a-zA-Z\s-]+$/g, "").trim();
      const meaning = remaining.replace(/^[-:\s~;]+/g, "").trim();
      if (word) list.push({ word, pos, meaning: meaning || undefined });
    }
    return list;
  };

  // Calls a single section endpoint and returns its data
  const fetchSection = async (endpoint: string, body: object): Promise<any> => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `${endpoint} failed`);
    }
    const res = await response.json();
    if (!res.success) throw new Error(res.error || `${endpoint} returned failure`);
    return res.data;
  };

  const handleGenerateExam = async () => {
    setGenerationError(null);
    setGenerationLoading(true);

    try {
      let finalVocabList: { word: string; pos?: string; meaning?: string; level?: number; unit?: string }[] = [];
      let sourceCount = 0;

      if (vocabSource === "system") {
        let filteredWords = availableWords;
        if (selectedUnits.length > 0) {
          filteredWords = availableWords.filter(w => selectedUnits.includes(w.unit));
        }
        const shuffled = [...filteredWords].sort(() => 0.5 - Math.random());
        finalVocabList = shuffled.map(w => ({
          word: w.word, pos: w.pos, meaning: w.meaning,
          level: selectedLevel, unit: w.unit
        }));
        sourceCount = finalVocabList.length;
      } else {
        const list = parseSelfInputList();
        if (list.length === 0) throw new Error("請先在自主輸入區塊輸入單字列表喔！");
        const padded = list.length < 12 ? await padVocabularyIfNecessary(list, selectedLevel, 12) : list;
        finalVocabList = padded.map(w => ({ ...w, level: selectedLevel }));
        sourceCount = list.length;
      }

      if (finalVocabList.length === 0) throw new Error("找不到可用的單字，請重選字表級別或檢查輸入。");
      if (!Object.values(selectedExerciseTypes).some(v => v)) throw new Error("請至少勾選一種題型！");

      // Fire all selected sections in parallel
      const promises: Promise<any>[] = [];
      const sectionKeys: string[] = [];

      if (selectedExerciseTypes.vocab) {
        promises.push(fetchSection("/api/generate-vocab", { vocabList: finalVocabList }));
        sectionKeys.push("vocab");
      }
      if (selectedExerciseTypes.cloze) {
        promises.push(fetchSection("/api/generate-cloze", { vocabList: finalVocabList }));
        sectionKeys.push("cloze");
      }
      if (selectedExerciseTypes.blankMatching) {
        promises.push(fetchSection("/api/generate-matching", { vocabList: finalVocabList }));
        sectionKeys.push("matching");
      }
      if (selectedExerciseTypes.reading) {
        promises.push(fetchSection("/api/generate-reading", {
          vocabList: finalVocabList,
          selectedReadingLevels: selectedReadingLevels.length > 0 ? selectedReadingLevels : ["essential"]
        }));
        sectionKeys.push("reading");
      }

      const results = await Promise.all(promises);

      // Merge results into one suite
      const merged: any = {};
      sectionKeys.forEach((key, i) => {
        Object.assign(merged, results[i]);
      });

      const suite: GeneratedExamSuite = {
        ...merged,
        timestamp: Date.now(),
        metadata: {
          vocabCount: sourceCount,
          sourceType: vocabSource,
          selectedLevel,
          selectedUnits: vocabSource === "system" ? selectedUnits : ["Self Input"],
          vocabList: finalVocabList
        }
      };

      setExamSuite(suite);
      setSession({
        answers: { vocab: {}, cloze: {}, blankMatching: {}, reading: {} },
        submitted: false,
        startTime: Date.now()
      });

      if (suite.vocabQuestions?.length > 0) setCurrentSection("vocab");
      else if (suite.clozeSuite) setCurrentSection("cloze");
      else if (suite.blankMatchingSuite) setCurrentSection("matching");
      else if (suite.readingPassages?.length > 0) setCurrentSection("reading");

      setActiveTab("player");
    } catch (err: any) {
      console.error(err);
      setGenerationError(err.message || "生卷失敗，請稍後再試。");
    } finally {
      setGenerationLoading(false);
    }
  };

  const handleInteractiveSubmitAnswers = () => {
    setShowSubmitConfirm(true);
  };

  const handleConfirmedSubmit = () => {
    setShowSubmitConfirm(false);
    if (!examSuite) return;

    const reportDetails: any[] = [];
    const summary = {
      vocab: { correct: 0, total: 0, score: 0 },
      cloze: { correct: 0, total: 0, score: 0 },
      blankMatching: { correct: 0, total: 0, score: 0 },
      reading: { correct: 0, total: 0, score: 0 },
      comprehensive: { correct: 0, total: 0, score: 0 }
    };

    // Vocab — use index-based keys
    if (examSuite.vocabQuestions) {
      examSuite.vocabQuestions.forEach((q, qIndex) => {
        const userAns = session.answers.vocab[`vocab_${qIndex}`] || "";
        const correctAns = normalizeAnswer(q.correctAnswer);
        const isCorrect = userAns === correctAns;
        if (isCorrect) summary.vocab.correct++;
        summary.vocab.total++;
        reportDetails.push({
          section: "vocab", questionNumberOrName: `vocab_${qIndex}`,
          isCorrect, userAnswer: userAns, correctAnswer: correctAns,
          questionText: q.question,
          wordTested: q.wordTested,
          wordMeta: examSuite.metadata?.vocabList?.find((v: any) => v.word === q.wordTested)
        });
      });
      summary.vocab.score = summary.vocab.total > 0 ? Math.round((summary.vocab.correct / summary.vocab.total) * 100) : 0;
    }

    // Cloze
    if (examSuite.clozeSuite?.questions) {
      examSuite.clozeSuite.questions.forEach((q, idx) => {
        const gapNum = q.gapNumber ?? (11 + idx);
        const userAns = session.answers.cloze[gapNum] || "";
        const correctAns = normalizeAnswer(q.correctAnswer);
        const isCorrect = userAns === correctAns;
        if (isCorrect) summary.cloze.correct++;
        summary.cloze.total++;
        reportDetails.push({
          section: "cloze", questionNumberOrName: String(gapNum),
          isCorrect, userAnswer: userAns, correctAnswer: correctAns,
          questionText: `綜合測驗第(${gapNum})格 [${q.category || ""}]`
        });
      });
      summary.cloze.score = summary.cloze.total > 0 ? Math.round((summary.cloze.correct / summary.cloze.total) * 100) : 0;
    }

    // Blank Matching
    if (examSuite.blankMatchingSuite) {
      examSuite.blankMatchingSuite.answers.forEach((ans, idx) => {
        const userAns = session.answers.blankMatching[idx] || "";
        const correctAns = normalizeAnswer(ans);
        const isCorrect = userAns === correctAns;
        if (isCorrect) summary.blankMatching.correct++;
        summary.blankMatching.total++;
        reportDetails.push({
          section: "blankMatching", questionNumberOrName: String(idx + 16),
          isCorrect, userAnswer: userAns, correctAnswer: correctAns,
          questionText: `文意選填第 __ ${idx + 16} __ 格`
        });
      });
      summary.blankMatching.score = summary.blankMatching.total > 0 ? Math.round((summary.blankMatching.correct / summary.blankMatching.total) * 100) : 0;
    }

    // Reading
    if (examSuite.readingPassages) {
      examSuite.readingPassages.forEach((p, pIdx) => {
        p.questions.forEach((q, qIdx) => {
          const userKey = `${pIdx}_${qIdx}`;
          const userAns = session.answers.reading[userKey] || "";
          const correctAns = normalizeAnswer(q.correctAnswer);
          const isCorrect = userAns === correctAns;
          if (isCorrect) summary.reading.correct++;
          summary.reading.total++;
          reportDetails.push({
            section: "reading", questionNumberOrName: userKey,
            isCorrect, userAnswer: userAns, correctAnswer: correctAns,
            questionText: `[${p.title}] ${q.question}`
          });
        });
      });
      summary.reading.score = summary.reading.total > 0 ? Math.round((summary.reading.correct / summary.reading.total) * 100) : 0;
    }

    const totalCorrect = summary.vocab.correct + summary.cloze.correct + summary.blankMatching.correct + summary.reading.correct;
    const totalQuestions = summary.vocab.total + summary.cloze.total + summary.blankMatching.total + summary.reading.total;
    summary.comprehensive = {
      correct: totalCorrect, total: totalQuestions,
      score: totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0
    };

    const report: ProgressReport = {
      sessionId: `session-${Date.now()}`,
      timestamp: Date.now(),
      durationMs: Date.now() - session.startTime,
      scoreSummary: summary,
      details: reportDetails,
      expertFeedback: "杜老師正在奮力評語中...",
      selectedLevel
    };

    setActiveReport(report);
    const updatedHistory = [report, ...studyHistory].slice(0, 50);
    setStudyHistory(updatedHistory);
    try { localStorage.setItem("gsat_buffet_history", JSON.stringify(updatedHistory)); } catch (e) { console.error(e); }

    setSession(prev => ({ ...prev, submitted: true }));
    setActiveTab("report");
  };

  const handleClearHistory = () => {
    if (confirm("確定要清除所有備考研究紀錄嗎？")) {
      setStudyHistory([]);
      localStorage.removeItem("gsat_buffet_history");
    }
  };

  const uniqueUnits = Array.from(new Set<string>(availableWords.map(w => w.unit)))
    .sort((a, b) => parseInt(a) - parseInt(b));
  const filteredUnits = uniqueUnits.filter(u => u.toLowerCase().includes(unitSearch.toLowerCase()));

  return (
    <div className="min-h-screen flex flex-col font-sans bg-[#FBFBFA]">
      {/* Header */}
      <header className="no-print bg-white border-b border-stone-200/80 sticky top-0 z-50 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 cursor-pointer select-none" onClick={() => setActiveTab("lobby")}>
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-700 to-amber-900 text-stone-100 flex items-center justify-center font-bold text-xl shadow-md border border-amber-950/20">TS</div>
            <div>
              <h1 className="text-md sm:text-lg font-black tracking-tight text-stone-900 flex flex-wrap items-center gap-x-2">
                <span>GSAT English Mock Paper Creator</span>
                <span className="text-amber-800 font-semibold text-sm sm:text-base">學測英文模考創建器</span>
              </h1>
              <p className="text-[11px] text-stone-500 mt-0.5">
                <span className="text-amber-800">★</span> <span className="underline decoration-amber-600/40">Designed by Tr. Shirley Du</span>
              </p>
            </div>
          </div>
          <nav className="flex items-center gap-1 sm:gap-2 text-xs">
            {examSuite && (
              <>
                <button onClick={() => setActiveTab("player")} className={`px-3 py-2 rounded-lg font-semibold transition flex items-center gap-1.5 ${activeTab === "player" ? "bg-teal-50 text-teal-900" : "text-stone-600 hover:bg-stone-50"}`}>
                  <GraduationCap className="w-4 h-4 text-teal-700" /> Test Player
                </button>
                <button onClick={() => setActiveTab("worksheet")} className={`px-3 py-2 rounded-lg font-semibold transition flex items-center gap-1.5 ${activeTab === "worksheet" ? "bg-amber-50 text-amber-900" : "text-stone-600 hover:bg-stone-50"}`}>
                  <Printer className="w-4 h-4 text-amber-800" /> Worksheet
                </button>
              </>
            )}
            {activeReport && (
              <button onClick={() => setActiveTab("report")} className={`px-3 py-2 rounded-lg font-semibold transition flex items-center gap-1.5 ${activeTab === "report" ? "bg-stone-800 text-white" : "text-stone-600 hover:bg-stone-50"}`}>
                <Award className="w-4 h-4 text-amber-400" /> Report
              </button>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* ── LOBBY ── */}
        {activeTab === "lobby" && (
          <div className="space-y-8" id="lobby-panel">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

              {/* Config panel */}
              <div className="lg:col-span-8 bg-white border border-stone-200 rounded-2xl p-6 md:p-8 shadow-xs space-y-6">
                <div className="border-b border-stone-150 pb-4">
                  <h3 className="text-lg font-bold text-stone-900 flex items-center gap-2">
                    <Layers className="w-5 h-5 text-amber-800" /> Step 1: Choose Vocabulary Source
                  </h3>
                </div>

                {/* Vocab source toggle */}
                <div className="grid grid-cols-2 gap-3 p-1.5 bg-stone-100 rounded-xl">
                  <button onClick={() => setVocabSource("system")} className={`py-2 rounded-lg text-xs font-bold transition ${vocabSource === "system" ? "bg-white text-stone-900 shadow-xs" : "text-stone-500 hover:text-stone-800"}`}>
                    System Database 系統內建單字庫
                  </button>
                  <button onClick={() => setVocabSource("self-input")} className={`py-2 rounded-lg text-xs font-bold transition ${vocabSource === "self-input" ? "bg-white text-stone-900 shadow-xs" : "text-stone-500 hover:text-stone-800"}`}>
                    Self-Input List 自訂單字輸入
                  </button>
                </div>

                {vocabSource === "system" ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-stone-50/50 p-4 rounded-xl border border-stone-100">
                    {/* Level */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase text-stone-500">Syllabus Level (字級)</label>
                      <select value={selectedLevel} onChange={(e) => setSelectedLevel(parseInt(e.target.value))}
                        className="w-full bg-white border border-stone-300 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-teal-700">
                        {[1,2,3,4,5,6].map(l => (
                          <option key={l} value={l}>Level {l} ({l <= 2 ? "Basic" : l <= 4 ? "Essential" : "Advanced"})</option>
                        ))}
                      </select>
                    </div>

                    {/* Units */}
                    <div className="space-y-1.5 relative">
                      <label className="text-xs font-bold uppercase text-stone-500">Filter Units (篩選單元)</label>
                      <button type="button" onClick={() => setUnitsDropdownOpen(!unitsDropdownOpen)}
                        className="w-full bg-white border border-stone-300 rounded-xl px-3 py-2 text-xs font-semibold flex items-center justify-between cursor-pointer">
                        <span>{selectedUnits.length === 0 ? "All Units" : `${selectedUnits.length} Units selected`}</span>
                        <span className="text-stone-400">▼</span>
                      </button>
                      {unitsDropdownOpen && (
                        <div className="absolute top-10 right-0 left-0 bg-white border border-stone-200 rounded-xl shadow-md p-3 z-30 max-h-56 overflow-y-auto space-y-2">
                          <input type="text" placeholder="Search unit..." value={unitSearch} onChange={(e) => setUnitSearch(e.target.value)}
                            className="w-full border border-stone-200 rounded-md p-1.5 text-xs focus:outline-none" />
                          <div className="flex justify-between text-[10px] text-teal-800 font-bold pb-1">
                            <button type="button" onClick={() => setSelectedUnits(uniqueUnits)}>Select All</button>
                            <button type="button" onClick={() => setSelectedUnits([])} className="text-rose-800">Clear</button>
                          </div>
                          {loadingCSV ? <p className="text-[10px] text-center py-2 animate-pulse">Loading...</p> :
                            filteredUnits.map(unit => {
                              const isChecked = selectedUnits.includes(unit);
                              return (
                                <label key={unit} className="flex items-center gap-2 p-1 hover:bg-stone-50 rounded cursor-pointer text-xs">
                                  <input type="checkbox" checked={isChecked}
                                    onChange={() => isChecked ? setSelectedUnits(selectedUnits.filter(u => u !== unit)) : setSelectedUnits([...selectedUnits, unit])}
                                    className="rounded border-stone-300 text-teal-700 w-3.5 h-3.5" />
                                  Unit {unit}
                                </label>
                              );
                            })}
                        </div>
                      )}
                    </div>

                    {/* Word count info — no slider, just show count */}
                    <div className="sm:col-span-2 border-t border-stone-100 pt-3 mt-1">
                      <p className="text-xs text-stone-500 font-sans">
                        <span className="font-bold text-amber-800">{availableWords.filter(w => selectedUnits.includes(w.unit)).length} words</span> available from selected units — all will be passed to the AI for question generation.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 bg-stone-50/50 p-4 rounded-xl border border-stone-100">
                    <label className="text-xs font-bold uppercase text-stone-500">Paste Word List</label>
                    <textarea value={selfInputText} onChange={(e) => setSelfInputText(e.target.value)} rows={6}
                      className="w-full bg-white border border-stone-300 rounded-xl p-3 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-teal-700"
                      placeholder="accommodate v.&#10;vital adj." />
                    <p className="text-[10px] text-stone-500">Detected: {parseSelfInputList().length} words</p>
                  </div>
                )}

                {/* Exercise types */}
                <div className="border-t border-stone-150 pt-6 space-y-4">
                  <h3 className="text-md font-bold text-stone-900 flex items-center gap-2">
                    <Settings className="w-5 h-5 text-amber-800" /> Step 2: Choose Sections
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      { key: "vocab", label: "Vocabulary MCQ (10 Qs) / 字彙單選題" },
                      { key: "cloze", label: "Cloze Test (5 gaps 11–15) / 綜合測驗" },
                      { key: "blankMatching", label: "Blank Matching (10 gaps 16–25) / 文意選填" },
                    ].map(({ key, label }) => (
                      <label key={key} className={`border rounded-xl p-4 flex items-center gap-3 cursor-pointer transition ${(selectedExerciseTypes as any)[key] ? "border-teal-400 bg-teal-50/20" : "border-stone-200 bg-white hover:border-stone-300"}`}>
                        <input type="checkbox" checked={(selectedExerciseTypes as any)[key]}
                          onChange={() => setSelectedExerciseTypes(prev => ({ ...prev, [key]: !(prev as any)[key] }))}
                          className="rounded border-stone-300 text-teal-700 w-4 h-4 shrink-0" />
                        <span className="text-xs font-bold text-stone-900">{label}</span>
                      </label>
                    ))}

                    {/* Reading with levels */}
                    <div className={`border rounded-xl p-4 space-y-3 transition ${selectedExerciseTypes.reading ? "border-teal-400 bg-teal-50/20" : "border-stone-200 bg-white hover:border-stone-300"}`}>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" checked={selectedExerciseTypes.reading}
                          onChange={() => setSelectedExerciseTypes(prev => ({ ...prev, reading: !prev.reading }))}
                          className="rounded border-stone-300 text-teal-700 w-4 h-4 shrink-0" />
                        <span className="text-xs font-bold text-stone-900">Reading Comprehension (4 Qs) / 閱讀測驗</span>
                      </label>
                      {selectedExerciseTypes.reading && (
                        <div className="pl-7 grid grid-cols-3 gap-2">
                          {["basic", "essential", "advanced"].map(lvl => (
                            <button key={lvl} type="button"
                              onClick={() => selectedReadingLevels.includes(lvl)
                                ? setSelectedReadingLevels(selectedReadingLevels.filter(l => l !== lvl))
                                : setSelectedReadingLevels([...selectedReadingLevels, lvl])}
                              className={`py-1.5 px-2 rounded-lg text-[10px] border font-bold capitalize transition ${selectedReadingLevels.includes(lvl) ? "bg-teal-800 text-white border-teal-800" : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50"}`}>
                              {lvl === "basic" ? "Basic" : lvl === "essential" ? "Essential" : "Advanced"}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Generate button */}
                <div className="border-t border-stone-150 pt-6">
                  {generationError && (
                    <div className="bg-rose-50 border border-rose-200 p-4 rounded-xl text-rose-800 flex items-start gap-3 mb-4 text-xs">
                      <AlertCircle className="w-5 h-5 shrink-0" />
                      <div><p className="font-bold">Error:</p><p>{generationError}</p></div>
                    </div>
                  )}
                  {generationLoading ? (
                    <div className="bg-stone-50 border border-stone-200 rounded-2xl p-6 text-center">
                      <div className="flex justify-center items-center gap-2 mb-3">
                        <RefreshCw className="w-6 h-6 text-teal-800 animate-spin" />
                        <span className="font-bold text-stone-900">Generating all sections in parallel...</span>
                      </div>
                      <p className="text-xs font-mono text-amber-900 animate-pulse">{loadingStepMsg}</p>
                    </div>
                  ) : (
                    <button onClick={handleGenerateExam}
                      className="w-full bg-teal-800 hover:bg-teal-900 text-white rounded-2xl py-4 font-semibold text-sm flex items-center justify-center gap-2 shadow-md transition">
                      <Sparkles className="w-4 h-4 text-amber-300" />
                      一鍵完美生卷 (Generate Exam)
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* History panel */}
              <div className="lg:col-span-4 no-print">
                <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-xs space-y-4">
                  <div className="flex justify-between items-center border-b border-stone-100 pb-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-stone-900 flex items-center gap-2">
                      <History className="w-4 h-4 text-amber-800" /> Study History
                    </h3>
                    {studyHistory.length > 0 && (
                      <button onClick={handleClearHistory} className="text-[10px] text-rose-800 hover:underline font-bold">Clear All</button>
                    )}
                  </div>
                  {studyHistory.length === 0 ? (
                    <div className="text-center py-8 text-stone-400 space-y-2">
                      <Layers className="w-8 h-8 mx-auto stroke-1" />
                      <p className="text-[11px]">尚未有練習紀錄。快開始備考吧！</p>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-64 overflow-y-auto">
                      {studyHistory.map(log => (
                        <div key={log.sessionId} onClick={() => { setActiveReport(log); setActiveTab("report"); }}
                          className="bg-stone-50 border p-3 rounded-xl hover:border-amber-300 cursor-pointer flex justify-between items-center transition">
                          <div>
                            <span className="text-[10px] text-stone-500 font-mono">{new Date(log.timestamp).toLocaleDateString()}</span>
                            <p className="text-xs font-bold text-stone-900">Accuracy: {log.scoreSummary.comprehensive.score}%</p>
                            <span className="text-[10px] text-stone-500">{log.scoreSummary.comprehensive.correct}/{log.scoreSummary.comprehensive.total} correct</span>
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

        {/* ── PLAYER ── */}
        {activeTab === "player" && examSuite && (
          <div className="space-y-6" id="quiz-player-dashboard">
            <div className="bg-white border border-stone-200 rounded-2xl p-4 md:p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <span className="bg-amber-100 font-mono text-[9px] px-2 py-0.5 rounded font-bold uppercase text-amber-900">Level {examSuite.metadata.selectedLevel}</span>
                <h2 className="text-xl font-bold text-stone-900 mt-1">英語學測仿真複習卷</h2>
                <p className="text-xs text-stone-500">{examSuite.metadata.vocabCount} reference words</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setActiveTab("worksheet")} className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition">
                  <Printer className="w-4 h-4" /> Print Worksheet
                </button>
                <button onClick={handleInteractiveSubmitAnswers} className="px-4 py-2 bg-teal-800 hover:bg-teal-900 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition">
                  <CheckCircle className="w-4 h-4" /> Submit & Diagnose
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Section nav */}
              <div className="lg:col-span-3 flex flex-col gap-2 bg-white p-3 border border-stone-200 rounded-2xl shadow-xs">
                <span className="text-[10px] font-bold font-mono uppercase text-stone-500 text-center py-1">Sections</span>
                {examSuite.vocabQuestions && (
                  <button onClick={() => setCurrentSection("vocab")} className={`px-3 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between transition ${currentSection === "vocab" ? "bg-teal-700 text-white" : "text-stone-600 hover:bg-stone-50"}`}>
                    <span>Part I: MCQ字彙題</span><span className="bg-black/10 text-[9px] px-2 py-0.5 rounded-full">10 Qs</span>
                  </button>
                )}
                {examSuite.clozeSuite && (
                  <button onClick={() => setCurrentSection("cloze")} className={`px-3 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between transition ${currentSection === "cloze" ? "bg-teal-700 text-white" : "text-stone-600 hover:bg-stone-50"}`}>
                    <span>Part II: Cloze</span><span className="bg-black/10 text-[9px] px-2 py-0.5 rounded-full">5 Gaps</span>
                  </button>
                )}
                {examSuite.blankMatchingSuite && (
                  <button onClick={() => setCurrentSection("matching")} className={`px-3 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between transition ${currentSection === "matching" ? "bg-teal-700 text-white" : "text-stone-600 hover:bg-stone-50"}`}>
                    <span>Part III: 文意選填</span><span className="bg-black/10 text-[9px] px-2 py-0.5 rounded-full">10 Gaps</span>
                  </button>
                )}
                {examSuite.readingPassages?.length > 0 && (
                  <button onClick={() => setCurrentSection("reading")} className={`px-3 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between transition ${currentSection === "reading" ? "bg-teal-700 text-white" : "text-stone-600 hover:bg-stone-50"}`}>
                    <span>Part IV: Reading</span><span className="bg-black/10 text-[9px] px-2 py-0.5 rounded-full">{(examSuite.readingPassages?.length || 0) * 4} Qs</span>
                  </button>
                )}
                <div className="border-t border-stone-100 pt-3 mt-2 text-center">
                  <p className="text-[10px] text-stone-400 font-sans leading-relaxed">完成所有題目後，<br />點擊右上角「Submit」提交。</p>
                </div>
              </div>

              {/* Viewport */}
              <div className="lg:col-span-9 bg-white border border-stone-200 p-6 md:p-8 rounded-2xl shadow-xs">

                {/* 1. VOCAB — uses vocab_${qIndex} as key */}
                {currentSection === "vocab" && examSuite.vocabQuestions && (
                  <div className="space-y-6">
                    <div className="border-b border-stone-100 pb-3 flex justify-between items-center">
                      <h3 className="text-base font-bold text-stone-900">Part I: Vocabulary MCQ (字彙單選題 1–10)</h3>
                      <span className="text-[10px] font-mono text-stone-500">
                        {Object.keys(session.answers.vocab).length}/10 answered
                      </span>
                    </div>
                    <div className="space-y-8">
                      {examSuite.vocabQuestions.map((q, qIndex) => {
                        const answerKey = `vocab_${qIndex}`;
                        const userSelectedChoice = session.answers.vocab[answerKey] || "";
                        const questionText = q.question || q.prompt || q.sentence || q.stem || "";
                        return (
                          <div key={answerKey} className="space-y-3 p-4 hover:bg-stone-50/50 rounded-xl border border-transparent hover:border-stone-150">
                            <span className="font-mono text-xs font-bold text-amber-800 bg-amber-50 rounded-lg px-2 py-0.5">Question {qIndex + 1}</span>
                            {questionText ? (
                              <p className="font-semibold text-stone-900 text-base leading-relaxed">{questionText}</p>
                            ) : (
                              <p className="text-xs text-rose-500 italic">⚠ Question text missing — please regenerate.</p>
                            )}
                            {q._warning && (
                              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1">⚠ {q._warning}</p>
                            )}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5 mt-4">
                              {normalizeOptions(q.options).map((optString, optIdx) => {
                                const letter = optString.charAt(1);
                                const isSelected = userSelectedChoice === letter;
                                return (
                                  <button key={optIdx} type="button"
                                    onClick={() => setSession(prev => ({ ...prev, answers: { ...prev.answers, vocab: { ...prev.answers.vocab, [answerKey]: letter } } }))}
                                    className={`py-3 px-4 rounded-xl text-xs text-left font-semibold border transition ${isSelected ? "bg-teal-700 text-white border-teal-700" : "bg-white text-stone-700 border-stone-250 hover:bg-stone-50"}`}>
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

                {/* 2. CLOZE */}
                {currentSection === "cloze" && examSuite.clozeSuite && examSuite.clozeSuite.questions && (
                  <div className="space-y-6">
                    <div className="border-b border-stone-100 pb-3">
                      <h3 className="text-base font-bold text-stone-900">Part II: Cloze Test (綜合測驗 11–15)</h3>
                      <p className="text-xs text-stone-500 mt-0.5">閱讀文章後，為標號空格 11–15 選出最適合的答案。</p>
                    </div>
                    <div className="bg-stone-50 border border-stone-200 rounded-2xl p-5 text-base font-sans leading-loose text-stone-800 whitespace-pre-wrap">
                      {examSuite.clozeSuite.passage}
                    </div>
                    <div className="space-y-4 mt-4">
                      <span className="text-xs font-bold font-mono text-stone-400 uppercase tracking-widest block">Choose options for gaps 11–15:</span>
                      {examSuite.clozeSuite.questions.map((q, idx) => {
                        const gapNum = q.gapNumber ?? (11 + idx);
                        const userSel = session.answers.cloze[gapNum] || "";
                        const opts = normalizeOptions(q.options);
                        return (
                          <div key={idx} className="bg-white border border-stone-200 rounded-xl p-4 space-y-3">
                            <span className="text-xs font-bold font-mono text-amber-800">Gap ({gapNum})</span>
                            {opts.length === 0 ? (
                              <p className="text-xs text-rose-400 italic">⚠ Options missing for this gap — please regenerate.</p>
                            ) : (
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {opts.map((optString, optIdx) => {
                                  const letter = optString.charAt(1);
                                  const isSelected = userSel === letter;
                                  return (
                                    <button key={optIdx} type="button"
                                      onClick={() => setSession(prev => ({ ...prev, answers: { ...prev.answers, cloze: { ...prev.answers.cloze, [gapNum]: letter } } }))}
                                      className={`py-2 px-3 rounded-lg text-xs font-semibold text-center border transition ${isSelected ? "bg-teal-700 text-white border-teal-700" : "bg-white text-stone-700 border-stone-300 hover:bg-stone-50"}`}>
                                      {optString}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 3. BLANK MATCHING */}
                {currentSection === "matching" && examSuite.blankMatchingSuite && (
                  <div className="space-y-6">
                    <div className="border-b border-stone-100 pb-3">
                      <h3 className="text-base font-bold text-stone-900">Part III: Blank Matching (文意選填 16–25)</h3>
                      <p className="text-xs text-stone-500 mt-0.5">為空格 16–25 選出最適合的候選詞。每選項限用一次。</p>
                    </div>
                    <div className="bg-stone-100 border border-stone-200 rounded-xl p-4">
                      <span className="text-xs font-mono font-bold uppercase text-stone-500 block mb-3 text-center">Candidate Options (A)–(J)</span>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 font-mono text-xs font-semibold">
                        {normalizeOptions(examSuite.blankMatchingSuite.options).map((opt, idx) => {
                          const letter = opt.charAt(1);
                          const isUsed = Object.values(session.answers.blankMatching).includes(letter);
                          return (
                            <div key={idx} className={`py-2 px-3 rounded-lg border text-center transition ${isUsed ? "bg-stone-200/50 text-stone-400 line-through" : "bg-white text-stone-800 border-stone-300 shadow-xs"}`}>
                              {opt}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div className="bg-stone-50 border border-stone-200 rounded-2xl p-5 text-base font-sans leading-loose text-stone-800 whitespace-pre-wrap">
                      {examSuite.blankMatchingSuite.passage}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {Array.from({ length: 10 }).map((_, idx) => {
                        const gapNo = idx + 16;
                        const userSel = session.answers.blankMatching[idx] || "";
                        return (
                          <div key={idx} className="bg-white border border-stone-200 rounded-xl p-4 flex justify-between items-center gap-3">
                            <div>
                              <span className="text-xs font-bold text-stone-900">Blank __ {gapNo} __</span>
                              <p className="text-[10px] text-stone-400 mt-0.5">Choose for blank {gapNo}</p>
                            </div>
                            <select value={userSel}
                              onChange={(e) => setSession(prev => ({ ...prev, answers: { ...prev.answers, blankMatching: { ...prev.answers.blankMatching, [idx]: e.target.value } } }))}
                              className="bg-white border border-stone-300 rounded-lg py-1 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-teal-700">
                              <option value="">-- Choose --</option>
                              {["A","B","C","D","E","F","G","H","I","J"].map(letter => {
                                const fullOpt = normalizeOptions(examSuite.blankMatchingSuite!.options).find(o => o.startsWith(`(${letter})`)) || `(${letter})`;
                                return <option key={letter} value={letter}>{fullOpt}</option>;
                              })}
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 4. READING — uses pIdx_qIdx as key */}
                {currentSection === "reading" && examSuite.readingPassages && (
                  <div className="space-y-8">
                    <div className="border-b border-stone-100 pb-3">
                      <h3 className="text-base font-bold text-stone-900">Part IV: Reading Comprehension (閱讀測驗 26+)</h3>
                      <p className="text-xs text-stone-500 mt-0.5">仔細閱讀文章後作答。</p>
                    </div>
                    {examSuite.readingPassages.map((p, pIdx) => (
                      <div key={pIdx} className="space-y-6 border-b border-stone-200 pb-8 last:border-none">
                        <div className="flex items-center gap-2">
                          <span className="bg-amber-100 text-amber-900 font-mono text-[9px] px-2.5 py-0.5 rounded font-bold uppercase">Level: {p.level}</span>
                          <h4 className="text-md font-bold font-serif text-stone-950">{p.title}</h4>
                        </div>
                        <p className="bg-[#FAF9F5]/70 border border-stone-150 p-6 rounded-2xl text-stone-850 text-base leading-relaxed font-serif whitespace-pre-wrap">{p.passage}</p>
                        <div className="space-y-6 pt-4">
                          {p.questions.map((q, qIdx) => {
                            const userKey = `${pIdx}_${qIdx}`;
                            const userAns = session.answers.reading[userKey] || "";
                            const questionNumber = 26 + (pIdx * 4) + qIdx;
                            const opts = normalizeOptions(q.options);
                            return (
                              <div key={userKey} className="bg-stone-50/50 p-4 rounded-xl border border-stone-150/50 space-y-3">
                                <span className="font-mono text-[11px] font-bold text-stone-500 uppercase block">Question {questionNumber}</span>
                                <p className="font-semibold text-stone-900 text-sm leading-relaxed">{q.question}</p>
                                <div className="flex flex-col gap-2 mt-3 pl-1">
                                  {opts.map((optStr, optIdx) => {
                                    const letter = optStr.charAt(1);
                                    const isSelected = userAns === letter;
                                    return (
                                      <button key={optIdx} type="button"
                                        onClick={() => setSession(prev => ({ ...prev, answers: { ...prev.answers, reading: { ...prev.answers.reading, [userKey]: letter } } }))}
                                        className={`py-2 px-4 rounded-lg text-xs text-left font-semibold border transition ${isSelected ? "bg-teal-700 text-white border-teal-700" : "bg-white text-stone-700 border-stone-300 hover:bg-stone-50"}`}>
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
                  <span className="text-stone-400 italic">Have faith in your English intuition!</span>
                  {/* Next section button — navigate between sections without submitting */}
                  {currentSection === "vocab" && examSuite.clozeSuite ? (
                    <button onClick={() => setCurrentSection("cloze")} className="px-6 py-3 bg-stone-700 hover:bg-stone-800 text-white font-semibold rounded-2xl flex items-center gap-1.5 shadow-sm transition">
                      Next: Cloze →
                    </button>
                  ) : currentSection === "cloze" && examSuite.blankMatchingSuite ? (
                    <button onClick={() => setCurrentSection("matching")} className="px-6 py-3 bg-stone-700 hover:bg-stone-800 text-white font-semibold rounded-2xl flex items-center gap-1.5 shadow-sm transition">
                      Next: Blank Matching →
                    </button>
                  ) : currentSection === "matching" && examSuite.readingPassages?.length > 0 ? (
                    <button onClick={() => setCurrentSection("reading")} className="px-6 py-3 bg-stone-700 hover:bg-stone-800 text-white font-semibold rounded-2xl flex items-center gap-1.5 shadow-sm transition">
                      Next: Reading →
                    </button>
                  ) : (
                    <button onClick={handleInteractiveSubmitAnswers} className="px-6 py-3 bg-teal-800 hover:bg-teal-900 text-white font-semibold rounded-2xl flex items-center gap-1.5 shadow-sm transition">
                      <CheckCircle className="w-4 h-4" /> Submit Final Assessment
                    </button>
                  )}
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
            onGoToWorksheet={() => setActiveTab("worksheet")}
            onReviewExam={() => setActiveTab("player")}
          />
        )}

      </main>

      {/* Confirmation modal */}
      {showSubmitConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 md:p-8 max-w-md w-full shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-stone-900">確認交卷？</h3>
            <p className="text-sm text-stone-600">交卷後將無法修改答案。請確認你已完成所有想作答的題目。</p>
            <div className="bg-stone-50 rounded-xl p-4 text-xs text-stone-600 space-y-1">
              <p>✅ 字彙題：{Object.keys(session.answers.vocab).length} / {examSuite?.vocabQuestions?.length || 0} answered</p>
              <p>✅ 綜合測驗：{Object.keys(session.answers.cloze).length} / {examSuite?.clozeSuite?.questions?.length || 0} answered</p>
              <p>✅ 文意選填：{Object.keys(session.answers.blankMatching).length} / 10 answered (gaps 16–25)</p>
              <p>✅ 閱讀測驗：{Object.keys(session.answers.reading).length} / {(examSuite?.readingPassages?.reduce((a, p) => a + p.questions.length, 0)) || 0} answered</p>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowSubmitConfirm(false)}
                className="flex-1 py-2.5 border border-stone-300 rounded-xl text-sm font-semibold text-stone-700 hover:bg-stone-50 transition">
                繼續作答
              </button>
              <button onClick={handleConfirmedSubmit}
                className="flex-1 py-2.5 bg-teal-800 hover:bg-teal-900 text-white rounded-xl text-sm font-semibold transition">
                確認交卷
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="no-print bg-white border-t border-stone-200 mt-16 py-6 text-center text-[11px] text-stone-500">
        <p className="font-semibold text-stone-700">GSAT English Mock Paper Creator • 學測英文模考創建器</p>
        <p className="mt-1 text-[10px] text-amber-800">Designed by Tr. Shirley Du</p>
        <p className="mt-2 text-[9px] text-stone-400">© 2026. All rights reserved.</p>
      </footer>
    </div>
  );
}
