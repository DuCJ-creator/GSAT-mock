/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from "react";
import { Award, BookOpen, Clock, AlertTriangle, CheckCircle, RefreshCw, Printer, FileText, Sparkles, Smile, Star, ChevronDown, ChevronUp } from "lucide-react";
import { ProgressReport, GeneratedExamSuite } from "../types";
import { normalizeOptions } from "../utils/helpers";

interface ProgressReportProps {
  report: ProgressReport;
  suite: GeneratedExamSuite;
  onRestart: () => void;
  onGoToWorksheet: () => void;
  onReviewExam: () => void;
}

interface TeacherFeedback {
  greeting: string;
  analysis: string;
  tips: string[];
  encouragement: string;
}

export default function ProgressReportView({ report, suite, onRestart, onGoToWorksheet, onReviewExam }: ProgressReportProps) {
  const [feedback, setFeedback] = useState<TeacherFeedback | null>(null);
  const [loadingFeedback, setLoadingFeedback] = useState(true);
  const [errorFeedback, setErrorFeedback] = useState<string | null>(null);
  const [showClozePassage, setShowClozePassage] = useState(false);
  const [expandedReadingIdx, setExpandedReadingIdx] = useState<number | null>(null);
  const [showMatchingPassage, setShowMatchingPassage] = useState(false);

  useEffect(() => {
    async function fetchTeacherDiagnostics() {
      try {
        setLoadingFeedback(true);
        const response = await fetch("/api/evaluate-report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scoreSummary: report.scoreSummary,
            details: report.details,
            selectedLevel: suite.metadata.selectedLevel,
          }),
        });
        if (!response.ok) throw new Error("Failed to generate diagnostics.");
        const resData = await response.json();
        if (resData.success) setFeedback(resData.data);
        else throw new Error(resData.error || "Failed feedback fetch");
      } catch (err: any) {
        console.error("Feedback error:", err);
        setErrorFeedback("無法載入專屬講評。你依然可以閱讀底下的每題詳解與檢討。加油！");
      } finally {
        setLoadingFeedback(false);
      }
    }
    fetchTeacherDiagnostics();
  }, [report, suite]);

  const formatDuration = (ms: number) => {
    const totalSecs = Math.floor(ms / 1000);
    return `${Math.floor(totalSecs / 60)}m ${totalSecs % 60}s`;
  };

  const getScoreMessage = (score: number) => {
    if (score >= 90) return "學霸降臨！無懈可擊！";
    if (score >= 80) return "頂標實力！再接再厲！";
    if (score >= 60) return "均標通過！掌握魔鬼細節！";
    return "尚有努力空間！多複習必考搭配詞。";
  };

  // Get explanation for a report detail item
  const getExplanation = (item: any): string => {
    if (item.section === "vocab" && suite.vocabQuestions) {
      const idx = parseInt(item.questionNumberOrName.replace("vocab_", ""));
      return suite.vocabQuestions[idx]?.explanation || "無獨立解析";
    }
    if (item.section === "cloze" && suite.clozeSuite) {
      return suite.clozeSuite.questions.find(q => String(q.gapNumber) === item.questionNumberOrName)?.explanation || "無獨立解析";
    }
    if (item.section === "blankMatching" && suite.blankMatchingSuite) {
      const idx = parseInt(item.questionNumberOrName) - 21;
      return suite.blankMatchingSuite.explanations[idx] || "無獨立解析";
    }
    if (item.section === "reading" && suite.readingPassages) {
      const [pIdx, qIdx] = item.questionNumberOrName.split("_").map(Number);
      return suite.readingPassages[pIdx]?.questions[qIdx]?.explanation || "無獨立解析";
    }
    return "載入解析失敗";
  };

  // Get the option text from options array for a given letter
  const getOptionText = (options: any[], letter: string): string => {
    return normalizeOptions(options).find(o => o.startsWith(`(${letter})`)) || `(${letter})`;
  };

  return (
    <div className="space-y-8" id="progress-report-view">

      {/* Top Banner */}
      <div className="bg-gradient-to-r from-teal-900 to-amber-950 text-white rounded-3xl p-6 md:p-8 shadow-md flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="space-y-2">
          <span className="bg-white/15 px-3 py-1 rounded-full text-xs font-mono font-bold uppercase tracking-wider text-amber-200">
            Exam Completed (備考任務完成)
          </span>
          <h1 className="text-2xl md:text-3xl font-bold leading-tight">學測英語備考：成果診斷報告書</h1>
          <p className="text-stone-300 text-sm">系統即時答題診斷</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={onReviewExam}
            className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition">
            <BookOpen className="w-4 h-4" /> Review Exam
          </button>
          <button onClick={onGoToWorksheet}
            className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition">
            <Printer className="w-4 h-4" /> Print / PDF
          </button>
          <button onClick={onRestart}
            className="px-4 py-2.5 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition">
            <RefreshCw className="w-4 h-4" /> New Test
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-stone-200 p-6 rounded-2xl flex flex-col items-center justify-center text-center shadow-xs">
          <span className="text-xs font-bold font-mono uppercase text-stone-500 mb-3">Overall Accuracy</span>
          <div className="relative w-28 h-28 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90">
              <circle cx="56" cy="56" r="44" stroke="#E7E5E4" strokeWidth="8" fill="transparent" />
              <circle cx="56" cy="56" r="44"
                stroke={report.scoreSummary.comprehensive.score >= 60 ? "#0f766e" : "#b91c1c"}
                strokeWidth="8" fill="transparent"
                strokeDasharray={276}
                strokeDashoffset={276 - (276 * report.scoreSummary.comprehensive.score) / 100}
                strokeLinecap="round" className="transition-all duration-1000" />
            </svg>
            <div className="absolute flex flex-col items-center">
              <span className="text-2xl font-extrabold font-mono text-stone-900">{report.scoreSummary.comprehensive.score}%</span>
              <span className="text-[10px] text-stone-500">{report.scoreSummary.comprehensive.correct}/{report.scoreSummary.comprehensive.total}</span>
            </div>
          </div>
          <span className="mt-4 text-xs font-bold text-teal-800">{getScoreMessage(report.scoreSummary.comprehensive.score)}</span>
        </div>

        <div className="bg-white border border-stone-200 p-5 rounded-2xl flex flex-col justify-between shadow-xs">
          <div className="flex items-start justify-between">
            <span className="text-xs font-bold font-mono uppercase text-stone-500">Duration</span>
            <span className="p-1.5 bg-amber-50 rounded-lg text-amber-800"><Clock className="w-4 h-4" /></span>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-extrabold font-mono text-stone-900">{formatDuration(report.durationMs)}</h3>
            <p className="text-xs text-stone-500 mt-1">Total session time</p>
          </div>
        </div>

        <div className="bg-white border border-stone-200 p-5 rounded-2xl flex flex-col justify-between shadow-xs">
          <div className="flex items-start justify-between">
            <span className="text-xs font-bold font-mono uppercase text-stone-500">Level</span>
            <span className="p-1.5 bg-teal-50 rounded-lg text-teal-800"><BookOpen className="w-4 h-4" /></span>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-extrabold font-mono text-stone-900">Level {suite.metadata.selectedLevel}</h3>
            <p className="text-xs text-stone-500 mt-1">{suite.metadata.vocabCount} reference words</p>
          </div>
        </div>

        <div className="bg-white border border-stone-200 p-5 rounded-2xl flex flex-col justify-between shadow-xs">
          <div className="flex items-start justify-between">
            <span className="text-xs font-bold font-mono uppercase text-stone-500">Status</span>
            <span className="p-1.5 bg-stone-50 rounded-lg text-stone-600"><Award className="w-4 h-4" /></span>
          </div>
          <div className="mt-4">
            <h3 className="text-xl font-extrabold text-stone-900">Submitted ✓</h3>
            <p className="text-xs text-stone-500 mt-1">Click "Review Exam" to revisit</p>
          </div>
        </div>
      </div>

      {/* Section Scores */}
      <div className="bg-white border border-stone-200 p-6 md:p-8 rounded-2xl shadow-xs space-y-5">
        <h2 className="text-md font-bold text-stone-900 flex items-center gap-2">
          <Award className="w-5 h-5 text-amber-800" /> Section Score Breakdown (各題型答對率)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[
            { label: "Part I: Vocabulary MCQ (字彙題)", ...report.scoreSummary.vocab },
            { label: "Part II: Cloze (綜合測驗)", ...report.scoreSummary.cloze },
            { label: "Part III: Blank Matching (文意選填)", ...report.scoreSummary.blankMatching },
            { label: "Part IV: Reading (閱讀測驗)", ...report.scoreSummary.reading },
          ].map((sec, idx) => {
            if (sec.total === 0) return null;
            return (
              <div key={idx} className="space-y-1.5 p-3 rounded-xl hover:bg-stone-50/50 transition">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-stone-800">{sec.label}</span>
                  <span className="font-mono font-bold text-stone-900">{sec.correct}/{sec.total} ({sec.score}%)</span>
                </div>
                <div className="h-2.5 bg-stone-200 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-1000 ${sec.score >= 80 ? "bg-teal-700" : sec.score >= 60 ? "bg-amber-700" : "bg-rose-700"}`}
                    style={{ width: `${sec.score}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Teacher Feedback */}
      <div className="bg-amber-50/50 border border-amber-900/10 rounded-3xl p-6 md:p-8 shadow-xs relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-amber-900/5 rounded-full blur-2xl -mr-10 -mt-10"></div>
        <div className="relative space-y-4">
          <div className="flex items-center gap-2 text-amber-800">
            <Sparkles className="w-5 h-5" />
            <h2 className="font-bold text-lg uppercase tracking-wide">考生專屬備考叮嚀</h2>
          </div>
          {loadingFeedback ? (
            <div className="py-8 flex flex-col items-center justify-center text-center space-y-2">
              <RefreshCw className="w-6 h-6 text-amber-800 animate-spin" />
              <p className="text-xs text-stone-500">正在批閱答題成果，撰寫診斷建議中，請稍候...</p>
            </div>
          ) : errorFeedback ? (
            <div className="bg-white/80 p-4 rounded-xl border border-amber-900/10 text-stone-600 text-xs text-center">{errorFeedback}</div>
          ) : feedback ? (
            <div className="space-y-6">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-amber-800 rounded-full flex items-center justify-center text-white shrink-0 font-bold shadow-sm">Tr</div>
                <div className="space-y-1.5">
                  <h4 className="text-sm font-bold text-amber-950 flex items-center gap-1.5">
                    {feedback.greeting} <Smile className="w-4 h-4 text-amber-700" />
                  </h4>
                  <p className="text-stone-750 text-xs leading-relaxed whitespace-pre-wrap">{feedback.analysis}</p>
                </div>
              </div>
              <div className="border-t border-amber-900/5 pt-4">
                <h5 className="text-xs font-bold text-stone-800 mb-3 uppercase tracking-wider flex items-center gap-1.5">
                  <Star className="w-4 h-4 text-amber-700" /> 學測大補丸 & 備考建議
                </h5>
                <ul className="space-y-3 pl-1">
                  {feedback.tips.map((tip, idx) => (
                    <li key={idx} className="flex items-start gap-2.5 text-xs">
                      <span className="w-5 h-5 bg-teal-800 text-white rounded-full flex items-center justify-center font-mono font-bold text-[10px] shrink-0 mt-0.5">{idx + 1}</span>
                      <p className="text-stone-700 leading-normal">{tip}</p>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-white border border-amber-900/10 p-4 rounded-xl text-center italic text-amber-950 text-sm">
                "{feedback.encouragement}"
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* ── PASSAGE REVIEW SECTION ── */}
      {/* Cloze Passage */}
      {suite.clozeSuite && (
        <div className="bg-white border border-stone-200 rounded-2xl shadow-xs overflow-hidden">
          <button
            onClick={() => setShowClozePassage(!showClozePassage)}
            className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-stone-50 transition"
          >
            <div className="flex items-center gap-2">
              <span className="bg-teal-100 text-teal-800 font-mono text-[10px] px-2 py-0.5 rounded font-bold uppercase">Part II</span>
              <span className="text-sm font-bold text-stone-900">Cloze Passage (綜合測驗全文)</span>
            </div>
            {showClozePassage ? <ChevronUp className="w-4 h-4 text-stone-400" /> : <ChevronDown className="w-4 h-4 text-stone-400" />}
          </button>
          {showClozePassage && (
            <div className="px-6 pb-6 space-y-4">
              <div className="bg-stone-50 border border-stone-200 rounded-xl p-5 text-sm font-sans leading-loose text-stone-800 whitespace-pre-wrap">
                {suite.clozeSuite.passage}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {suite.clozeSuite.questions?.map((q, idx) => {
                  const detail = report.details.find(d => d.section === "cloze" && d.questionNumberOrName === String(q.gapNumber));
                  const isCorrect = detail?.isCorrect;
                  return (
                    <div key={idx} className={`p-3 rounded-xl border text-xs ${isCorrect ? "border-teal-200 bg-teal-50/30" : "border-rose-200 bg-rose-50/30"}`}>
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-bold text-stone-800">Gap ({q.gapNumber})</span>
                        <span className={`font-mono font-bold ${isCorrect ? "text-teal-700" : "text-rose-700"}`}>
                          Answer: ({q.correctAnswer}) {isCorrect ? "✓" : `✗ You: (${detail?.userAnswer || "—"})`}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2 my-1">
                        {normalizeOptions(q.options).map((opt, oi) => (
                          <span key={oi} className={`px-2 py-0.5 rounded font-mono ${opt.startsWith(`(${q.correctAnswer})`) ? "bg-teal-100 text-teal-800 font-bold" : "bg-stone-100 text-stone-600"}`}>{opt}</span>
                        ))}
                      </div>
                      <p className="text-stone-600 mt-1 leading-normal">{q.explanation}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Blank Matching Passage */}
      {suite.blankMatchingSuite && (
        <div className="bg-white border border-stone-200 rounded-2xl shadow-xs overflow-hidden">
          <button
            onClick={() => setShowMatchingPassage(!showMatchingPassage)}
            className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-stone-50 transition"
          >
            <div className="flex items-center gap-2">
              <span className="bg-amber-100 text-amber-800 font-mono text-[10px] px-2 py-0.5 rounded font-bold uppercase">Part III</span>
              <span className="text-sm font-bold text-stone-900">Blank Matching Passage (文意選填全文)</span>
            </div>
            {showMatchingPassage ? <ChevronUp className="w-4 h-4 text-stone-400" /> : <ChevronDown className="w-4 h-4 text-stone-400" />}
          </button>
          {showMatchingPassage && (
            <div className="px-6 pb-6 space-y-4">
              <div className="bg-stone-100 border border-stone-200 rounded-xl p-4">
                <span className="text-xs font-mono font-bold uppercase text-stone-500 block mb-2">Candidate Options</span>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs font-mono">
                  {normalizeOptions(suite.blankMatchingSuite.options).map((opt, idx) => (
                    <div key={idx} className="bg-white border border-stone-200 py-1.5 px-2 rounded-md text-center">{opt}</div>
                  ))}
                </div>
              </div>
              <div className="bg-stone-50 border border-stone-200 rounded-xl p-5 text-sm font-sans leading-loose text-stone-800 whitespace-pre-wrap">
                {suite.blankMatchingSuite.passage}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {suite.blankMatchingSuite.answers.map((ans, idx) => {
                  const detail = report.details.find(d => d.section === "blankMatching" && d.questionNumberOrName === String(idx + 21));
                  const isCorrect = detail?.isCorrect;
                  const optText = normalizeOptions(suite.blankMatchingSuite!.options).find(o => o.startsWith(`(${ans})`)) || `(${ans})`;
                  return (
                    <div key={idx} className={`p-3 rounded-xl border text-xs ${isCorrect ? "border-teal-200 bg-teal-50/30" : "border-rose-200 bg-rose-50/30"}`}>
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-bold text-stone-800">Blank __ {idx + 21} __</span>
                        <span className={`font-mono font-bold ${isCorrect ? "text-teal-700" : "text-rose-700"}`}>
                          ({ans}) {optText} {isCorrect ? "✓" : `✗ You: (${detail?.userAnswer || "—"})`}
                        </span>
                      </div>
                      <p className="text-stone-600 leading-normal">{suite.blankMatchingSuite!.explanations[idx]}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Reading Passages */}
      {suite.readingPassages && suite.readingPassages.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
            <span className="bg-stone-100 text-stone-700 font-mono text-[10px] px-2 py-0.5 rounded font-bold uppercase">Part IV</span>
            Reading Passages (閱讀測驗全文)
          </h3>
          {suite.readingPassages.map((p, pIdx) => (
            <div key={pIdx} className="bg-white border border-stone-200 rounded-2xl shadow-xs overflow-hidden">
              <button
                onClick={() => setExpandedReadingIdx(expandedReadingIdx === pIdx ? null : pIdx)}
                className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-stone-50 transition"
              >
                <div className="flex items-center gap-2">
                  <span className="bg-stone-100 text-stone-700 font-mono text-[10px] px-2 py-0.5 rounded font-bold uppercase">Level: {p.level}</span>
                  <span className="text-sm font-bold text-stone-900">{p.title}</span>
                </div>
                {expandedReadingIdx === pIdx ? <ChevronUp className="w-4 h-4 text-stone-400" /> : <ChevronDown className="w-4 h-4 text-stone-400" />}
              </button>
              {expandedReadingIdx === pIdx && (
                <div className="px-6 pb-6 space-y-4">
                  <div className="bg-[#FAF9F5] border border-stone-150 rounded-xl p-5 text-sm font-serif leading-relaxed text-stone-800 whitespace-pre-wrap">
                    {p.passage}
                  </div>
                  <div className="space-y-3">
                    {p.questions.map((q, qIdx) => {
                      const userKey = `${pIdx}_${qIdx}`;
                      const detail = report.details.find(d => d.section === "reading" && d.questionNumberOrName === userKey);
                      const isCorrect = detail?.isCorrect;
                      return (
                        <div key={qIdx} className={`p-4 rounded-xl border text-xs ${isCorrect ? "border-teal-200 bg-teal-50/30" : "border-rose-200 bg-rose-50/30"}`}>
                          <div className="flex justify-between items-start mb-2">
                            <p className="font-semibold text-stone-900 text-sm flex-1 pr-4">{qIdx + 1}. {q.question}</p>
                            <span className={`font-mono font-bold shrink-0 ${isCorrect ? "text-teal-700" : "text-rose-700"}`}>
                              ({q.correctAnswer}) {isCorrect ? "✓" : `✗ You: (${detail?.userAnswer || "—"})`}
                            </span>
                          </div>
                          <div className="flex flex-col gap-1 pl-2 mb-2">
                            {normalizeOptions(q.options).map((opt, oi) => (
                              <span key={oi} className={`text-xs px-2 py-0.5 rounded ${opt.startsWith(`(${q.correctAnswer})`) ? "bg-teal-100 text-teal-800 font-bold" : "text-stone-600"}`}>{opt}</span>
                            ))}
                          </div>
                          <p className="text-stone-600 leading-normal border-t border-stone-100 pt-2">{q.explanation}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Detailed Q&A Review */}
      <div className="space-y-4">
        <div className="border-l-4 border-stone-800 pl-3">
          <h2 className="text-md font-bold text-stone-900 uppercase">Full Answer Review (全卷逐題對照)</h2>
          <p className="text-xs text-stone-500">每題你的作答、正確答案與老師解析。</p>
        </div>
        <div className="space-y-3">
          {report.details.map((item, idx) => (
            <div key={idx}
              className={`bg-white border rounded-xl p-5 shadow-xs flex flex-col md:flex-row gap-4 justify-between items-start ${item.isCorrect ? "border-stone-200 hover:border-teal-200" : "border-rose-150 hover:border-rose-200"} transition`}>
              <div className="space-y-2 max-w-2xl flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="bg-stone-100 text-stone-600 px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold">
                    {item.section === "vocab" ? "Vocab" : item.section === "cloze" ? "Cloze" : item.section === "blankMatching" ? "Matching" : "Reading"}
                  </span>
                  {item.isCorrect ? (
                    <span className="text-teal-700 bg-teal-50 border border-teal-100 flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold">
                      <CheckCircle className="w-3 h-3" /> 正確
                    </span>
                  ) : (
                    <span className="text-rose-700 bg-rose-50 border border-rose-100 flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold">
                      <AlertTriangle className="w-3 h-3" /> 錯誤
                    </span>
                  )}
                  {/* Word meta tag for vocab questions */}
                  {item.section === "vocab" && item.wordMeta && (
                    <span className="bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded text-[10px] font-mono font-bold">
                      L{item.wordMeta.level}-U{item.wordMeta.unit}
                    </span>
                  )}
                </div>
                <p className="text-xs font-semibold text-stone-900 leading-relaxed">{item.questionText}</p>
                <div className="flex flex-wrap gap-3 text-xs mt-1">
                  <p className="text-stone-500">Your answer: <strong className={item.isCorrect ? "text-teal-700" : "text-rose-700 font-mono"}>({item.userAnswer || "—"})</strong></p>
                  <p className="text-stone-500">Correct: <strong className="text-teal-700 font-mono">({item.correctAnswer})</strong></p>
                </div>
              </div>
              <div className="w-full md:w-80 border-t md:border-t-0 md:border-l border-stone-100 pt-3 md:pt-0 md:pl-4 shrink-0">
                <span className="text-[10px] uppercase font-mono tracking-wider text-stone-400 block font-bold mb-1">【詳解】</span>
                <p className="text-stone-700 text-xs leading-normal">{getExplanation(item)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Actions */}
      <div className="flex justify-center items-center gap-4 py-6 border-t border-stone-200">
        <button onClick={onReviewExam}
          className="px-6 py-3 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl text-sm font-semibold flex items-center gap-2 transition border border-stone-200">
          <BookOpen className="w-4 h-4" /> Review Exam
        </button>
        <button onClick={onRestart}
          className="px-6 py-3 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-sm font-semibold flex items-center gap-2 transition">
          <RefreshCw className="w-4 h-4" /> New Test
        </button>
        <button onClick={onGoToWorksheet}
          className="px-6 py-3 bg-teal-800 hover:bg-teal-900 text-white rounded-xl text-sm font-semibold flex items-center gap-2 shadow-sm transition">
          <FileText className="w-4 h-4" /> Print Paper
        </button>
      </div>
    </div>
  );
}
