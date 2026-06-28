import { GoogleGenAI, Type } from "@google/genai";

console.log("ESM GoogleGenAI:", typeof GoogleGenAI);
console.log("ESM Type:", typeof Type, Type);

// Test CJS require
import { createRequire } from "module";
const require = createRequire(import.meta.url);
try {
  const ggenai = require("@google/genai");
  console.log("CJS ggenai keys:", Object.keys(ggenai));
  console.log("CJS GoogleGenAI:", typeof ggenai.GoogleGenAI);
  console.log("CJS default.GoogleGenAI:", ggenai.default ? typeof ggenai.default.GoogleGenAI : "no default");
} catch (e: any) {
  console.error("CJS require failed:", e.message);
}
