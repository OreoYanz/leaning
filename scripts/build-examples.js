import { readFileSync, writeFileSync } from "node:fs";
import { formatWord, structureIssues, teachingSpot } from "../js/logic.js";

const SHENG = new Set("ㄅㄆㄇㄈㄉㄊㄋㄌㄍㄎㄏㄐㄑㄒㄓㄔㄕㄖㄗㄘㄙ".split(""));
const MEDIALS = new Set(["ㄧ", "ㄨ", "ㄩ"]);
const PRIMARY = {
  "ㄅ": "爸爸",
  "ㄆ": "葡萄",
  "ㄇ": "媽媽",
  "ㄈ": "飛機",
  "ㄉ": "大象",
  "ㄊ": "兔子",
  "ㄋ": "牛奶",
  "ㄌ": "老虎",
  "ㄍ": "哥哥",
  "ㄎ": "卡車",
  "ㄏ": "花朵",
  "ㄐ": "雞",
  "ㄑ": "氣球",
  "ㄒ": "西瓜",
  "ㄓ": "豬",
  "ㄔ": "車",
  "ㄕ": "書",
  "ㄖ": "肉",
  "ㄗ": "早安",
  "ㄘ": "草莓",
  "ㄙ": "三",
  "ㄧ": "衣服",
  "ㄨ": "烏龜",
  "ㄩ": "魚",
  "ㄚ": "阿姨",
  "ㄛ": "波",
  "ㄜ": "鵝",
  "ㄝ": "葉子",
  "ㄞ": "愛心",
  "ㄟ": "杯子",
  "ㄠ": "貓",
  "ㄡ": "狗",
  "ㄢ": "安全",
  "ㄣ": "門",
  "ㄤ": "湯",
  "ㄥ": "風",
  "ㄦ": "耳朵"
};

function parseSyllable(token) {
  let tone = 1;
  let body = token;
  if (body.startsWith("˙")) {
    tone = 0;
    body = body.slice(1);
  } else if (/[0-4]$/.test(body)) {
    tone = Number(body.slice(-1));
    body = body.slice(0, -1);
  }
  const chars = [...body];
  let initial = "";
  let start = 0;
  if (SHENG.has(chars[0])) {
    initial = chars[0];
    start = 1;
  }
  const rest = chars.slice(start);
  let medial = "";
  let final = "";
  if (rest.length === 0) final = "";
  else if (rest.length === 1) final = rest[0];
  else if (rest.length === 2 && MEDIALS.has(rest[0])) {
    medial = rest[0];
    final = rest[1];
  } else {
    throw new Error(`音節無法拆開：${token}`);
  }
  return { initial, medial, final, tone };
}

function parseEntry(line, lineNo) {
  const parts = line.split("|");
  if (parts.length !== 4) throw new Error(`第 ${lineNo} 行欄位不是 4 個：${line}`);
  const [word, emoji, raw, category] = parts;
  if (!word || !emoji || !raw || !category) throw new Error(`第 ${lineNo} 行有空欄：${line}`);
  const syllables = raw.split(/\s+/).filter(Boolean).map(parseSyllable);
  const entry = { word, emoji, syllables, category };
  entry.zhuyin = formatWord(entry);
  syllables.forEach((syllable, index) => {
    const issues = structureIssues(syllable);
    if (issues.length) throw new Error(`${word} 第 ${index + 1} 音：${issues.join("、")}`);
  });
  if ([...word].length !== syllables.length) throw new Error(`${word} 的字數和音節數不同`);
  return entry;
}

function decorate(symbol, entry) {
  const spot = teachingSpot(symbol.group, symbol.id, entry);
  if (!spot) throw new Error(`${entry.word} 不能教 ${symbol.id}`);
  return {
    word: entry.word,
    zhuyin: entry.zhuyin,
    emoji: entry.emoji,
    syllables: entry.syllables,
    target: symbol.id,
    spot,
    checked: false,
    review: "developer",
    category: entry.category || "daily"
  };
}

const symbols = JSON.parse(readFileSync(new URL("../data/symbols.json", import.meta.url)));
const words = JSON.parse(readFileSync(new URL("../data/words.json", import.meta.url)));
const lexicon = readFileSync(new URL("../data/teach-lexicon.txt", import.meta.url), "utf8");
const byId = new Map(symbols.map((symbol) => [symbol.id, symbol]));
const buckets = new Map(symbols.map((symbol) => [symbol.id, []]));
const seen = new Map(symbols.map((symbol) => [symbol.id, new Set()]));

function add(symbol, entry) {
  const spot = teachingSpot(symbol.group, symbol.id, entry);
  if (!spot || seen.get(symbol.id).has(entry.word)) return false;
  seen.get(symbol.id).add(entry.word);
  buckets.get(symbol.id).push(entry);
  return true;
}

for (const word of words) {
  const entry = {
    word: word.word,
    emoji: String(word.image).replace(/^emoji:/, ""),
    syllables: word.syllables,
    zhuyin: word.zhuyin,
    category: word.category || "daily"
  };
  for (const symbol of symbols) add(symbol, entry);
}

let current = "";
const problems = [];
lexicon.split(/\r?\n/).forEach((line, index) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  if (trimmed.startsWith("#")) {
    current = trimmed.replace(/^#\s*/, "");
    if (!byId.has(current)) problems.push(`未知符號：${current}`);
    return;
  }
  if (!current) {
    problems.push(`第 ${index + 1} 行還沒有符號標題`);
    return;
  }
  let entry;
  try {
    entry = parseEntry(trimmed, index + 1);
  } catch (error) {
    problems.push(error.message);
    return;
  }
  const symbol = byId.get(current);
  if (!symbol) return;
  if (!teachingSpot(symbol.group, symbol.id, entry)) {
    problems.push(`${entry.word} 放在 ${current}，但第一個音節不是這個符號的教學位置`);
    return;
  }
  add(symbol, entry);
});
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}

const output = {};
const short = [];
for (const symbol of symbols) {
  const list = buckets.get(symbol.id);
  const primary = PRIMARY[symbol.id];
  list.sort((a, b) => Number(b.word === primary) - Number(a.word === primary));
  if (!list.some((item) => item.word === primary)) short.push(`${symbol.id} 缺少主要例詞 ${primary}`);
  const chosen = list.slice(0, 36).map((item) => decorate(symbol, item));
  output[symbol.id] = chosen;
  if (chosen.length < 30) short.push(`${symbol.id} ${chosen.length}`);
  const main = chosen[0];
  symbol.example = {
    word: main.word,
    zhuyin: main.zhuyin,
    emoji: main.emoji,
    syllables: main.syllables,
    target: symbol.id,
    spot: main.spot,
    checked: false,
    review: "developer",
    category: main.category
  };
}

if (short.length) {
  console.error(short.join("\n"));
  process.exit(1);
}

writeFileSync(new URL("../data/symbol-examples.json", import.meta.url), `${JSON.stringify(output, null, 2)}\n`);
writeFileSync(
  new URL("../data/symbols.json", import.meta.url),
  `[\n${symbols.map((symbol) => `  ${JSON.stringify(symbol)}`).join(",\n")}\n]\n`
);
const counts = symbols.map((symbol) => `${symbol.id}${output[symbol.id].length}`).join(" ");
console.log(counts);
console.log("例詞已依教學位置寫入");
