export const COMPOUND_FINALS = ["ㄞ", "ㄟ", "ㄠ", "ㄡ", "ㄢ", "ㄣ", "ㄤ", "ㄥ"];
export const MEDIALS = ["ㄧ", "ㄨ", "ㄩ"];
export const SIMPLE_FINALS = ["ㄚ", "ㄛ", "ㄜ", "ㄝ", "ㄦ"];
export const SHENG = ["ㄅ", "ㄆ", "ㄇ", "ㄈ", "ㄉ", "ㄊ", "ㄋ", "ㄌ", "ㄍ", "ㄎ", "ㄏ", "ㄐ", "ㄑ", "ㄒ", "ㄓ", "ㄔ", "ㄕ", "ㄖ", "ㄗ", "ㄘ", "ㄙ"];
export const JQX = ["ㄐ", "ㄑ", "ㄒ"];
export const ZH_GROUP = ["ㄓ", "ㄔ", "ㄕ", "ㄖ", "ㄗ", "ㄘ", "ㄙ"];

export function formatSyllable(syllable) {
  const body = `${syllable.initial || ""}${syllable.medial || ""}${syllable.final || ""}`;
  const tone = Number(syllable.tone);
  if (tone === 2) return `${body}ˊ`;
  if (tone === 3) return `${body}ˇ`;
  if (tone === 4) return `${body}ˋ`;
  if (tone === 0) return `˙${body}`;
  return body;
}

export function formatWord(word) {
  return word.syllables.map(formatSyllable).join(" ");
}

export function syllableStage(syllable) {
  let stage = 1;
  if (syllable.medial) stage = Math.max(stage, 3);
  if (COMPOUND_FINALS.includes(syllable.final)) stage = Math.max(stage, 2);
  if (MEDIALS.includes(syllable.final)) stage = Math.max(stage, 3);
  if (!syllable.initial) stage = Math.max(stage, 3);
  if (Number(syllable.tone) !== 1) stage = Math.max(stage, 4);
  return stage;
}

export function wordStage(word) {
  const stage = Math.max(...word.syllables.map(syllableStage));
  return word.syllables.length > 1 ? Math.max(stage, 5) : stage;
}

export function gradeBuild(target, pick, stage) {
  const checkMedial = stage >= 3 || Boolean(target.medial);
  const checkTone = stage >= 4;
  const parts = ["initial"];
  if (checkMedial) parts.push("medial");
  parts.push("final");
  if (checkTone) parts.push("tone");
  for (const part of parts) {
    if (part === "tone") {
      if (pick?.tone === null || pick?.tone === undefined || pick?.tone === "") {
        return { ok: false, part, index: 0 };
      }
      if (Number(pick.tone) !== Number(target.tone)) return { ok: false, part, index: 0 };
    } else if (pick?.[part] === null || pick?.[part] === undefined || (pick?.[part] || "") !== (target[part] || "")) {
      return { ok: false, part, index: 0 };
    }
  }
  return { ok: true, part: "", index: 0 };
}

export function gradeWord(word, picks, stage) {
  if (stage < 5) {
    const index = word.targetIndex || 0;
    return gradeBuild(word.syllables[index], picks[0] || {}, stage);
  }
  for (let index = 0; index < word.syllables.length; index += 1) {
    const result = gradeBuild(word.syllables[index], picks[index] || {}, 5);
    if (!result.ok) return { ...result, index };
  }
  return { ok: true, part: "", index: 0 };
}

export function structureIssues(syllable) {
  const issues = [];
  const initial = syllable.initial || "";
  const medial = syllable.medial || "";
  const final = syllable.final || "";
  const tone = Number(syllable.tone);
  if (!final && !ZH_GROUP.includes(initial)) issues.push("缺少韻母");
  if (!final && medial) issues.push("空韻不能再加介音");
  if (![0, 1, 2, 3, 4].includes(tone)) issues.push("聲調無效");
  if (JQX.includes(initial) && !["ㄧ", "ㄩ"].includes(medial || final)) issues.push("ㄐㄑㄒ要搭配ㄧ或ㄩ");
  if (ZH_GROUP.includes(initial) && (medial === "ㄧ" || medial === "ㄩ" || final === "ㄧ" || final === "ㄩ")) {
    issues.push("捲舌或舌尖音不搭配ㄧ或ㄩ");
  }
  if (["ㄅ", "ㄆ", "ㄇ", "ㄈ"].includes(initial) && (medial === "ㄩ" || final === "ㄩ")) issues.push("ㄅㄆㄇㄈ不搭配ㄩ");
  if (medial && final === medial) issues.push("介音與韻母重複");
  if (formatSyllable(syllable).length < 1) issues.push("音節是空的");
  return issues;
}

export function shuffle(list, random = Math.random) {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

export function takeOptions(pool, answer, count, random = Math.random) {
  const others = shuffle(pool.filter((item) => item !== answer), random);
  return shuffle([answer, ...others.slice(0, Math.max(0, count - 1))], random);
}

export function symbolWeight(stats) {
  const correct = stats?.correct || 0;
  const wrong = stats?.wrong || 0;
  const slow = stats?.slow || 0;
  return Math.max(0.35, 1 + wrong * 1.8 + slow * 0.5 - Math.min(correct, 4) * 0.25);
}

export function weightedPick(items, weightOf, random = Math.random) {
  const weights = items.map((item) => Math.max(0.05, weightOf(item)));
  const total = weights.reduce((sum, value) => sum + value, 0);
  let mark = random() * total;
  for (let i = 0; i < items.length; i += 1) {
    mark -= weights[i];
    if (mark <= 0) return items[i];
  }
  return items[items.length - 1];
}

export function listenChoiceCount(progress) {
  const recent = progress?.listenRecent || [];
  const asked = progress?.listenAsked || 0;
  if (asked < 4) return 2;
  const last = recent.slice(-6);
  const correct = last.filter(Boolean).length;
  if (last.length >= 6 && correct >= 5) return 4;
  if (last.length >= 4 && correct >= 3) return 3;
  return 2;
}

export function emptyPick() {
  return { initial: null, medial: null, final: null, tone: null };
}

export function visibleParts(stage, syllable) {
  const parts = ["initial"];
  if (stage >= 3 || syllable?.medial) parts.push("medial");
  parts.push("final");
  if (stage >= 4) parts.push("tone");
  return parts;
}

export function partChoices(part, answer, stage, random = Math.random) {
  let pool = [];
  if (part === "initial") pool = SHENG.slice();
  if (part === "medial") pool = MEDIALS.slice();
  if (part === "final") {
    if (stage <= 1) pool = SIMPLE_FINALS.slice();
    else if (stage === 2) pool = COMPOUND_FINALS.slice();
    else pool = [...SIMPLE_FINALS, ...COMPOUND_FINALS, ...MEDIALS];
  }
  if (answer && !pool.includes(answer)) pool.push(answer);
  if (!answer && (part === "initial" || part === "medial" || part === "final")) pool = ["", ...pool];
  return takeOptions(pool, answer || "", 4, random);
}

export function partLabel(part) {
  if (part === "initial") return "聲母";
  if (part === "medial") return "介音";
  if (part === "final") return "韻母";
  if (part === "tone") return "聲調";
  return "這裡";
}

export const LEARNING_LOOPS = {
  learn: "picture-quiz",
  listen: "recall-word",
  boss: "build-word",
  rocket: "rocket-build"
};

const STANDALONE_YUN = new Set(["ㄚ", "ㄛ", "ㄜ", "ㄞ", "ㄟ", "ㄠ", "ㄡ", "ㄢ", "ㄣ", "ㄤ", "ㄦ"]);

export function hanChars(text) {
  return [...String(text || "")].filter((char) => /\p{Script=Han}/u.test(char));
}

export function containsSymbol(entry, id) {
  return (entry?.syllables || []).some((syllable) => syllable.initial === id || syllable.medial === id || syllable.final === id);
}

export function teachingSpot(group, id, entry) {
  const syllable = entry?.syllables?.[0];
  if (!syllable || !id) return null;
  if (group === "sheng") return syllable.initial === id ? { index: 0, part: "initial" } : null;
  if (group === "jie") {
    if (syllable.initial) return null;
    if (syllable.medial === id) return { index: 0, part: "medial" };
    if (syllable.final === id) return { index: 0, part: "final" };
    return null;
  }
  if (group === "yun") return syllable.final === id ? { index: 0, part: "final" } : null;
  return null;
}

export function exampleIssues(symbol, item) {
  const issues = [];
  if (!item?.word || !item.zhuyin || !item.emoji) issues.push("缺少欄位");
  if (!Array.isArray(item?.syllables) || !item.syllables.length) {
    issues.push("缺少音節");
    return issues;
  }
  if (formatWord(item) !== item.zhuyin) issues.push("注音和音節不一致");
  const chars = hanChars(item.word);
  if (chars.length !== [...String(item.word)].length) issues.push("含有無法對應的字元");
  if (chars.length !== item.syllables.length) issues.push("字數和音節數不同");
  item.syllables.forEach((syllable, index) => {
    const problems = structureIssues(syllable);
    if (problems.length) issues.push(`第 ${index + 1} 音${problems.join("、")}`);
  });
  const spot = teachingSpot(symbol.group, symbol.id, item);
  if (!spot) {
    issues.push(containsSymbol(item, symbol.id) ? "只出現在其他位置，不是教學位置" : "沒有這個符號");
  } else if (!item.spot || item.spot.index !== spot.index || item.spot.part !== spot.part) {
    issues.push("目標位置標記不正確");
  } else if (symbol.group === "yun" && !STANDALONE_YUN.has(symbol.id) && item.spot.part !== "final") {
    issues.push("韻母位置沒有標在韻母");
  }
  if (item.target && item.target !== symbol.id) issues.push("目標符號不一致");
  if (item.checked === true && item.review !== "teacher") issues.push("尚未核對卻標成已確認");
  return issues;
}

export function toneMark(tone) {
  const value = Number(tone);
  if (value === 2) return "ˊ";
  if (value === 3) return "ˇ";
  if (value === 4) return "ˋ";
  return "";
}

export function rocketTone(tone) {
  const value = Number(tone);
  if (value === 0) return "˙";
  if (value === 2) return "ˊ";
  if (value === 3) return "ˇ";
  if (value === 4) return "ˋ";
  return "";
}

export function toRocketWord(word) {
  const text = String(word?.word || "");
  const syllables = word?.syllables || [];
  const chars = hanChars(text);
  if (!chars.length || chars.length !== syllables.length) return null;
  if (word.zhuyin && formatWord(word) !== word.zhuyin) return null;
  return {
    id: word.id,
    word: text,
    image: word.image || "",
    audio: word.audio || "",
    characters: chars.map((char, index) => {
      const syllable = syllables[index];
      return {
        char,
        letters: [syllable.initial, syllable.medial, syllable.final].filter(Boolean),
        tone: rocketTone(syllable.tone)
      };
    })
  };
}

export function rocketSlots(rocket) {
  const slots = [];
  (rocket?.characters || []).forEach((item, charIndex) => {
    item.letters.forEach((letter, letterIndex) => {
      slots.push({
        key: `L${charIndex}-${letterIndex}`,
        kind: "letter",
        charIndex,
        letterIndex,
        answer: letter
      });
    });
    slots.push({
      key: `T${charIndex}`,
      kind: "tone",
      charIndex,
      answer: item.tone
    });
  });
  return slots;
}

export function gradeRocket(rocket, fills) {
  const keys = [];
  for (const slot of rocketSlots(rocket)) {
    const got = fills?.[slot.key];
    if (got === null || got === undefined || String(got) !== String(slot.answer)) keys.push(slot.key);
  }
  return { ok: keys.length === 0, key: keys[0] || "", keys };
}

export function rocketBank(rocket, random = Math.random) {
  const needLetters = (rocket?.characters || []).flatMap((item) => item.letters);
  const letterPool = [...new Set([...SHENG, ...MEDIALS, ...SIMPLE_FINALS, ...COMPOUND_FINALS])];
  const extras = shuffle(letterPool.filter((item) => !needLetters.includes(item)), random).slice(0, 4);
  return {
    letters: shuffle([...needLetters, ...extras], random),
    tones: ["", "ˊ", "ˇ", "ˋ", "˙"]
  };
}

export function rocketCharComplete(rocket, fills, charIndex) {
  return rocketSlots(rocket)
    .filter((slot) => slot.charIndex === charIndex)
    .every((slot) => fills?.[slot.key] !== null && fills?.[slot.key] !== undefined);
}

export function hanPlan(word) {
  const text = String(word?.word || "");
  const syllables = word?.syllables || [];
  const chars = hanChars(text);
  if (!syllables.length) return { ok: false, reason: "缺少注音", cells: [] };
  if (chars.length !== [...text].length) return { ok: false, reason: "含有無法對應的字元", cells: [] };
  if (chars.length !== syllables.length) return { ok: false, reason: "字數和音節數不同", cells: [] };
  if (word.zhuyin && formatWord(word) !== word.zhuyin) return { ok: false, reason: "注音和音節不一致", cells: [] };
  return {
    ok: true,
    reason: "",
    cells: chars.map((char, index) => {
      const syllable = syllables[index];
      const tone = Number(syllable.tone);
      return {
        char,
        symbols: [syllable.initial, syllable.medial, syllable.final].filter(Boolean),
        light: tone === 0,
        toneMark: tone === 0 ? "" : toneMark(tone),
        tone
      };
    })
  };
}

function escHan(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]));
}

export function hanMarkup(word, options = {}) {
  const plan = hanPlan(word);
  const text = escHan(word?.word || "");
  if (!plan.ok) return `<span class="han-word" data-han="missing">${text}</span>`;
  const cells = plan.cells.map((cell, index) => {
    const stack = cell.symbols.map((symbol) => `<span>${escHan(symbol)}</span>`).join("");
    const light = cell.light ? `<span class="tone-light">˙</span>` : "";
    const mark = cell.toneMark ? `<i class="tone-mark">${escHan(cell.toneMark)}</i>` : "";
    const on = options.highlight === index ? " on" : "";
    return `<span class="han${on}"><span class="han-char">${escHan(cell.char)}</span><span class="han-zy">${light}<span class="han-zy-body"><span class="han-stack">${stack}</span>${mark}</span></span></span>`;
  }).join("");
  return `<span class="han-word">${cells}</span>`;
}

export function learnPrompt(symbol) {
  if (symbol.group === "sheng") return `哪個詞語是${symbol.id}開頭的？`;
  if (symbol.group === "jie") return `你找到${symbol.id}了嗎？`;
  return `哪個詞語裡有${symbol.id}？`;
}

function usableDistractors(symbol, answerWord, pool, random) {
  const distractors = [];
  for (const item of shuffle(pool, random)) {
    if (!item?.word || item.word === answerWord) continue;
    if (teachingSpot(symbol.group, symbol.id, item)) continue;
    if (distractors.some((other) => other.word === item.word)) continue;
    distractors.push(item);
    if (distractors.length === 2) break;
  }
  return distractors;
}

export function learnQuestion(symbol, examples, others, random = Math.random) {
  const answer = examples[0];
  const options = shuffle([answer, ...usableDistractors(symbol, answer?.word, others, random)].filter(Boolean), random);
  return { prompt: learnPrompt(symbol), answer: answer?.word || "", options };
}

export function recallQuestion(symbol, examples, others, used = [], random = Math.random) {
  const fresh = examples.filter((item) => !used.includes(item.word));
  const answer = fresh[0] || examples[0];
  const options = shuffle([answer, ...usableDistractors(symbol, answer?.word, others, random)].filter(Boolean), random);
  return { prompt: "剛才的聲音，在哪個詞語裡找得到？", answer: answer?.word || "", options };
}

export function wrongKeepsGoing(wrongCount) {
  return { hint: true, blocked: false, reveal: wrongCount >= 2 };
}

export const GACHA_COST = 10;

export const COIN_SHORT = {
  word: "金幣不足",
  syllables: [
    { initial: "ㄐ", medial: "ㄧ", final: "ㄣ", tone: 1 },
    { initial: "ㄅ", medial: "", final: "ㄧ", tone: 4 },
    { initial: "ㄅ", medial: "", final: "ㄨ", tone: 4 },
    { initial: "ㄗ", medial: "", final: "ㄨ", tone: 2 }
  ]
};

export function gachaPull(unlocked, ids, random = Math.random) {
  const owned = new Set(unlocked || []);
  const locked = (ids || []).filter((id) => id && !owned.has(id));
  if (!locked.length) return "";
  return locked[Math.floor(random() * locked.length)] || "";
}
