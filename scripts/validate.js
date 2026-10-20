import { readFileSync, existsSync } from "node:fs";
import { exampleIssues, formatWord, structureIssues, wordStage } from "../js/logic.js";

const root = new URL("../", import.meta.url);
const symbols = JSON.parse(readFileSync(new URL("data/symbols.json", root)));
const words = JSON.parse(readFileSync(new URL("data/words.json", root)));
const manifest = JSON.parse(readFileSync(new URL("data/audio-manifest.json", root)));
const symbolExamples = JSON.parse(readFileSync(new URL("data/symbol-examples.json", root)));
const errors = [];
const notes = [];

const ids = new Set();
for (const symbol of symbols) {
  if (ids.has(symbol.id)) errors.push(`注音 id 重複：${symbol.id}`);
  ids.add(symbol.id);
}
const groups = { sheng: 0, jie: 0, yun: 0 };
for (const symbol of symbols) groups[symbol.group] += 1;
if (symbols.length !== 37) errors.push(`注音應為 37 個，目前 ${symbols.length}`);
if (groups.sheng !== 21 || groups.jie !== 3 || groups.yun !== 13) {
  errors.push(`分類數量不對：${JSON.stringify(groups)}`);
}
for (const symbol of symbols) {
  const list = symbolExamples[symbol.id];
  if (!Array.isArray(list) || !list.length) {
    errors.push(`${symbol.id} 沒有例詞`);
    continue;
  }
  const seenWords = new Set();
  list.forEach((item) => {
    if (seenWords.has(item.word)) errors.push(`${symbol.id} 例詞重複：${item.word}`);
    seenWords.add(item.word);
    exampleIssues(symbol, item).forEach((issue) => errors.push(`${symbol.id} 的例詞「${item.word || "未命名"}」：${issue}`));
  });
}

const required = ["爸爸", "媽媽", "哥哥", "姐姐", "米飯", "麵包", "牛奶", "蛋糕", "蘋果", "香蕉", "西瓜", "小狗", "小貓", "兔子", "大象", "汽車", "火車", "公車", "衣服", "鞋子", "書包", "杯子"];
const fields = ["id", "word", "zhuyin", "syllables", "category", "image", "audio", "difficulty", "tags", "status"];
const wordIds = new Set();
const seen = new Set();
for (const word of words) {
  for (const field of fields) {
    if (word[field] === undefined || word[field] === "") errors.push(`${word.id || word.word} 缺少 ${field}`);
  }
  if (wordIds.has(word.id)) errors.push(`詞語 id 重複：${word.id}`);
  wordIds.add(word.id);
  const key = `${word.word}|${word.zhuyin}`;
  if (seen.has(key)) errors.push(`詞語重複：${key}`);
  seen.add(key);
  if (!["draft", "reviewed", "approved"].includes(word.status)) errors.push(`${word.id} 狀態無效`);
  if (!String(word.image).startsWith("emoji:") || word.image === "emoji:") errors.push(`${word.id} 圖片不是自製符號或 emoji 標記`);
  if (String(word.image).startsWith("http")) errors.push(`${word.id} 使用了外部圖片`);
  if (!String(word.audio).startsWith("audio/") || !word.audio.endsWith(".mp3")) errors.push(`${word.id} 音檔路徑不正確`);
  const formatted = formatWord(word);
  if (formatted !== word.zhuyin) errors.push(`${word.word} 注音應為 ${formatted}，資料寫 ${word.zhuyin}`);
  word.syllables.forEach((syllable, index) => {
    const issues = structureIssues(syllable);
    if (issues.length) errors.push(`${word.word} 第 ${index + 1} 音：${issues.join("、")}`);
  });
  if (word.difficulty !== wordStage(word)) notes.push(`${word.word} 難度欄是 ${word.difficulty}，結構判斷為 ${wordStage(word)}`);
}
for (const text of required) {
  if (!words.some((word) => word.word === text && word.status === "approved")) errors.push(`正式題庫缺少：${text}`);
}

const listed = new Set(manifest.items.map((item) => `${item.kind}:${item.id}`));
for (const symbol of symbols) {
  if (!listed.has(`symbol:${symbol.id}`)) errors.push(`音檔清單缺少符號 ${symbol.id}`);
}
for (const word of words) {
  if (!listed.has(`word:${word.id}`)) errors.push(`音檔清單缺少詞語 ${word.id}`);
}
for (const kind of ["good", "again", "look", "yes"]) {
  if (!listed.has(`feedback:${kind}`)) errors.push(`音檔清單缺少回饋 ${kind}`);
}
for (const kind of ["listen", "blend", "home"]) {
  if (!listed.has(`instruction:${kind}`)) errors.push(`音檔清單缺少說明 ${kind}`);
}
const readyMissing = [];
for (const item of manifest.items) {
  if (item.status === "ready" && !existsSync(new URL(`../${item.file}`, import.meta.url))) {
    errors.push(`清單寫著已完成，但檔案不存在：${item.file}`);
  }
  if (item.status !== "ready") readyMissing.push(item.file);
}

const stages = [1, 2, 3, 4, 5].map((stage) => words.filter((word) => word.status === "approved" && wordStage(word) === stage).length);
if (stages.some((count) => count < 3)) errors.push(`有關卡題目少於 3：${stages.join(",")}`);

const pendingReview = words.filter((word) => word.review !== "teacher").map((word) => word.word);
console.log(`待老師簽核 ${pendingReview.length} 個詞`);
if (notes.length) console.log(notes.join("\n"));
console.log(`待補音檔 ${readyMissing.length} 個`);
console.log(`各關題數 ${stages.join(" / ")}`);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`驗證通過：注音 ${symbols.length}、詞語 ${words.length}`);
