import { createAudio } from "./audio.js";
import {
  emptyPick,
  gradeBuild,
  listenChoiceCount,
  partChoices,
  partLabel,
  shuffle,
  symbolWeight,
  takeOptions,
  visibleParts,
  weightedPick,
  wordStage,
  COIN_SHORT,
  GACHA_COST,
  gachaPull,
  hanMarkup,
  learnQuestion,
  recallQuestion
} from "./logic.js";
import { createProgress } from "./progress.js?v=0";

const PAIRS = [["ㄅ", "ㄆ"], ["ㄉ", "ㄊ"], ["ㄍ", "ㄎ"], ["ㄓ", "ㄗ"], ["ㄢ", "ㄤ"], ["ㄋ", "ㄌ"], ["ㄣ", "ㄥ"], ["ㄚ", "ㄛ"]];
const GROUPS = [["sheng", "聲母"], ["jie", "介音"], ["yun", "韻母"], ["all", "全部"]];
const CATEGORIES = [["all", "全部", "🌈"], ["family", "家庭", "🏠"], ["food", "食物", "🍚"], ["fruit", "水果", "🍎"], ["animal", "動物", "🐶"], ["transport", "交通工具", "🚌"], ["daily", "日常生活", "👕"], ["toy", "玩具", "🧸"], ["nature", "自然", "🌳"]];
const STAGES = [[1, "ㄅㄚ"], [2, "ㄠㄢ"], [3, "ㄧㄚ"], [4, "聲調"], [5, "詞語"]];
const ROUND_SIZE = 10;
const TONES = [[1, "一聲", "—"], [2, "二聲", "ˊ"], [3, "三聲", "ˇ"], [4, "四聲", "ˋ"], [0, "輕聲", "˙"]];
const MODE_NAME = { learn: "注音認識", listen: "聽音找注音", boss: "拼音大魔王", free: "自由練習" };
const AVATARS = [
  { id: "shiro", name: "小白" },
  { id: "mimi", name: "咪咪", face: "🐱" },
  { id: "tiao", name: "跳跳", face: "🐸" },
  { id: "qiu", name: "球球", face: "🐧" },
  { id: "dou", name: "豆豆", face: "🐹" },
  { id: "hua", name: "花花", face: "🦊" },
  { id: "xiong", name: "熊熊", face: "🐻" },
  { id: "yuan", name: "圓圓", face: "🐼" },
  { id: "jiu", name: "啾啾", face: "🐤" },
  { id: "lele", name: "樂樂", face: "🦁" }
];

const screen = document.querySelector("#screen");
const live = document.querySelector("#live");
const dev = new URLSearchParams(location.search).has("dev");
const progress = createProgress();
let audio;
let symbols = [];
let words = [];
let symbolMap = new Map();
let exampleMap = new Map();
let lastView = "";
let suppressClick = false;
let drag = null;
let swipe = null;
let listenTimer = 0;
let bossTimer = 0;
let gachaTimer = 0;
let paradeTimer = 0;
let paradeIndex = 0;
let particles = [];

const state = {
  view: "home",
  learn: { group: "all", index: 0, exampleIndex: 0, mode: "hear", quiz: null },
  listen: freshListen(),
  boss: freshBoss(),
  free: { category: "all", view: "picture", heard: {}, flipped: {}, ask: "", highlight: null },
  gacha: null
};

function freshListen() {
  return { phase: "ready", total: ROUND_SIZE, index: 0, correct: 0, stars: 0, q: null, lock: false, message: "", missed: [], wrongs: 0, practice: false, usedWords: [], last: "" };
}

function freshBoss() {
  return {
    phase: "ready", stage: 1, total: ROUND_SIZE, index: 0, questions: [], step: 0, picks: [],
    choices: {}, hint: 0, message: "", solved: false, clean: true, starred: false, kind: "build", stars: 0, lock: false, miss: "", missed: [], right: 0, wrongs: 0, practice: false, practiceWord: null
  };
}

function unlockedIds() {
  const saved = progress.get().unlocked;
  const ids = Array.isArray(saved) ? saved : ["shiro"];
  return ids.includes("shiro") ? ids : ["shiro", ...ids];
}

function avatarUnlocked(id) {
  return unlockedIds().includes(id);
}

function currentAvatar() {
  const id = progress.get().avatar;
  return AVATARS.find((item) => item.id === id && avatarUnlocked(item.id)) || AVATARS[0];
}

function rewardRound(round) {
  if (round.rewarded) return;
  round.rewarded = true;
  round.coins = progress.addCoin();
}

function dogFace(extra = "") {
  const kind = extra ? ` ${extra}` : "";
  return `<span class="shiro${kind}"><span class="ear left"></span><span class="ear right"></span><span class="head"><span class="eye left"></span><span class="eye right"></span><span class="nose"></span></span></span>`;
}

function mascot(extra = "") {
  const avatar = currentAvatar();
  const kind = extra ? ` ${extra}` : "";
  if (!avatar.face) return `<span class="buddy${kind}" role="img" aria-label="${esc(avatar.name)}">${dogFace()}</span>`;
  return `<span class="buddy pal${kind}" role="img" aria-label="${esc(avatar.name)}">${avatar.face}</span>`;
}

function coinTag(extra = "") {
  const kind = extra ? ` ${extra}` : "";
  return `<span class="coin${kind}" aria-hidden="true"></span>`;
}

function avatarMark(avatar) {
  if (!avatar.face) return dogFace("mark");
  return `<span class="mark pal">${avatar.face}</span>`;
}

function paintMascot() {
  const slot = document.querySelector("#mascot");
  if (slot) slot.innerHTML = mascot();
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]));
}

function emojiOf(image) {
  return String(image || "").replace(/^emoji:/, "");
}

function say(text) {
  live.textContent = "";
  window.setTimeout(() => { live.textContent = text || ""; }, 30);
}

function approvedWords() {
  return words.filter((word) => word.status === "approved");
}

function wordByText(text) {
  return approvedWords().find((word) => word.word === text);
}

function learnItems() {
  return symbols.filter((symbol) => state.learn.group === "all" || symbol.group === state.learn.group);
}

function currentSymbol() {
  const list = learnItems();
  return list[state.learn.index % list.length];
}

function symbolExamples(symbol) {
  const list = exampleMap.get(symbol.id);
  return list?.length ? list : [symbol.example];
}

function currentExample() {
  const list = symbolExamples(currentSymbol());
  const total = list.length;
  const index = ((state.learn.exampleIndex % total) + total) % total;
  return { item: list[index], index, total };
}

function currentWord() {
  return state.boss.practiceWord || state.boss.questions[state.boss.index];
}

function currentSyllable() {
  const word = currentWord();
  const index = state.boss.stage < 5 ? 0 : state.boss.step;
  return word.syllables[index];
}

function applyPrefs() {
  const data = progress.get();
  document.documentElement.classList.toggle("calm", Boolean(data.calm) || window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const mute = document.querySelector("#mute");
  mute.setAttribute("aria-pressed", String(Boolean(data.muted)));
  mute.setAttribute("aria-label", data.muted ? "打開聲音" : "關閉聲音");
  mute.textContent = data.muted ? "🔇" : "🔊";
  audio?.setMuted(Boolean(data.muted));
}

function stars(count) {
  return "★".repeat(count) || "☆";
}

function ownedAvatars() {
  return AVATARS.filter((avatar) => avatarUnlocked(avatar.id));
}

function paradeHtml(names) {
  if (!names.length) return "";
  return `<span class="parade" role="img" aria-label="夥伴 ${esc(names.join("、"))} 在跑"></span>`;
}

function paintParade() {
  window.clearTimeout(paradeTimer);
  const lane = document.querySelector(".parade");
  if (!lane || state.view !== "home") return;
  const owned = ownedAvatars();
  if (!owned.length) return;
  const send = () => {
    if (document.querySelector(".parade") !== lane || state.view !== "home") return;
    if (lane.childElementCount > 6) lane.firstElementChild.remove();
    const avatar = owned[paradeIndex % owned.length];
    paradeIndex += 1;
    const runner = document.createElement("span");
    runner.className = "runner";
    runner.innerHTML = `<span class="trot">${avatarMark(avatar)}</span>`;
    runner.addEventListener("animationend", (event) => {
      if (event.target !== runner || event.animationName !== "dash") return;
      runner.remove();
    });
    lane.appendChild(runner);
    paradeTimer = window.setTimeout(send, 1400);
  };
  send();
}

function render() {
  window.clearTimeout(paradeTimer);
  const view = state.view;
  paintMascot();
  document.body.dataset.scene = view;
  if (view === "home") screen.innerHTML = homeHtml();
  if (view === "learn") screen.innerHTML = learnHtml();
  if (view === "listen") screen.innerHTML = listenHtml();
  if (view === "boss") screen.innerHTML = bossHtml();
  if (view === "free") screen.innerHTML = freeHtml();
  if (state.gacha?.short) screen.insertAdjacentHTML("beforeend", shortCoinsHtml());
  if (view !== lastView) {
    lastView = view;
    screen.focus();
  }
  if (state.gacha?.short) document.querySelector(".mask")?.focus();
  if (view === "home") paintParade();
}

function shortCoinsHtml() {
  return `
    <div class="mask" data-act="close-short" role="dialog" aria-modal="true" aria-label="金幣不足" tabindex="-1">
      <div class="mask-card">${hanMarkup(COIN_SHORT)}</div>
    </div>
  `;
}

function homeHtml() {
  const stickers = progress.get().stickers || 0;
  const coins = progress.get().coins || 0;
  const names = ownedAvatars().map((avatar) => avatar.name);
  return `
    <section class="hello">
      ${mascot("hello-face")}
      <div>
        <h2>哈囉！今天想玩什麼？</h2>
        <p class="whisper coin-line" aria-label="金幣 ${coins} 個${names.length ? `，夥伴 ${esc(names.join("、"))} 在跑` : ""}">${coinTag()} <span class="coin-count">${coins}</span>${paradeHtml(names)}${stickers ? `<span class="sticker-note">貼紙 ${stickers} 張</span>` : ""}</p>
      </div>
    </section>
    <div class="gates">
      <button type="button" class="gate pink" data-act="go" data-view="learn" aria-label="注音認識，看看注音"><span aria-hidden="true">📒</span><strong>注音認識</strong><small>看看注音</small></button>
      <button type="button" class="gate yellow" data-act="go" data-view="listen" aria-label="聽音找注音，聽一聽再點"><span aria-hidden="true">👂</span><strong>聽音找注音</strong><small>聽一聽再點</small></button>
      <button type="button" class="gate blue" data-act="go" data-view="boss" aria-label="拼音大魔王，把字拼起來"><span aria-hidden="true">🐲</span><strong>拼音大魔王</strong><small>把字拼起來</small></button>
      <button type="button" class="gate green" data-act="go" data-view="free" aria-label="自由練習，想聽就點"><span aria-hidden="true">🎈</span><strong>自由練習</strong><small>想聽就點</small></button>
    </div>
    ${machineHtml()}
    <section class="roster" aria-label="選擇夥伴">
      <h2>選一個夥伴</h2>
      <div class="avatars">
        ${AVATARS.map((avatar) => {
          if (!avatarUnlocked(avatar.id)) {
            return `<button type="button" class="avatar locked" data-act="locked-avatar" aria-label="還沒解鎖"><span class="mark secret" aria-hidden="true">?</span></button>`;
          }
          const on = avatar.id === currentAvatar().id;
          return `<button type="button" class="avatar${on ? " on" : ""}" data-act="avatar" data-id="${esc(avatar.id)}" aria-pressed="${on}" aria-label="${on ? "已選擇" : "選擇"} ${esc(avatar.name)}">${avatarMark(avatar)}<span class="avatar-name">${esc(avatar.name)}</span></button>`;
        }).join("")}
      </div>
    </section>
  `;
}

function machineHtml() {
  const coins = progress.get().coins || 0;
  const locked = AVATARS.some((avatar) => !avatarUnlocked(avatar.id));
  const gacha = state.gacha;
  const prize = gacha?.id ? AVATARS.find((avatar) => avatar.id === gacha.id) : null;
  let note = locked ? `再收集 ${Math.max(0, GACHA_COST - coins)} 個就能扭` : "夥伴都到齊了";
  let noteCoin = locked && coins < GACHA_COST;
  if (locked && coins >= GACHA_COST) note = "可以扭蛋了";
  if (gacha?.message) {
    note = gacha.message;
    noteCoin = false;
  }
  return `
    <section class="machine" aria-label="扭蛋">
      <p class="whisper coin-line" aria-label="10 個金幣扭一次">${coinTag()} 10 扭一次</p>
      <button type="button" class="gacha-btn${gacha?.spin ? " spin" : ""}" data-act="gacha" aria-label="扭蛋，需要 10 個金幣">🥚</button>
      <p class="whisper coin-line" aria-label="${esc(noteCoin ? `金幣${note}` : note)}">${noteCoin ? coinTag() : ""} ${esc(note)}</p>
      ${prize ? `<p class="prize">${avatarMark(prize)}<span>解鎖了 ${esc(prize.name)}</span></p>` : ""}
    </section>
  `;
}

function learnHtml() {
  const list = learnItems();
  const symbol = currentSymbol();
  const example = currentExample();
  ensureLearnQuiz();
  const quiz = state.learn.quiz;
  const hint = quiz?.tried && !quiz.solved ? " hint-pop" : "";
  return `
    <div class="pills">
      ${GROUPS.map(([id, label]) => `<button type="button" class="chip ${state.learn.group === id ? "on" : ""}" data-act="learn-group" data-group="${id}" aria-pressed="${state.learn.group === id}">${label}</button>`).join("")}
    </div>
    <p class="whisper">第 ${state.learn.index + 1} 個，共 ${list.length} 個</p>
    <section class="stage learn-stage">
      ${mascot("sidekick")}
      <button type="button" class="symbol${hint}" data-act="play-symbol" data-id="${esc(symbol.id)}" aria-label="聽 ${esc(symbol.id)} 的單音">${esc(symbol.id)}</button>
      <button type="button" class="example" data-act="play-example" data-id="${esc(symbol.id)}" aria-label="聽詞語 ${esc(example.item.word)}">
        <span class="picture" aria-hidden="true">${esc(example.item.emoji)}</span>
        ${hanMarkup(example.item)}
      </button>
      ${exampleNav()}
      ${quiz ? learnQuizHtml(quiz) : ""}
    </section>
  `;
}

function learnQuizHtml(quiz) {
  return `
    <p class="say-hi">${mascot()} ${esc(quiz.message || quiz.prompt)}</p>
    <div class="choices">
      ${quiz.options.map((item) => {
        const right = quiz.solved && item.word === quiz.answer;
        const dim = quiz.solved && item.word !== quiz.answer;
        return `<button type="button" class="choice${right ? " show-right" : ""}${dim ? " dim" : ""}" data-act="learn-word" data-word="${esc(item.word)}" aria-label="詞語 ${esc(item.word)}"><span aria-hidden="true">${esc(item.emoji || "")}</span>${hanMarkup(item)}</button>`;
      }).join("")}
    </div>
  `;
}

function ensureLearnQuiz() {
  const symbol = currentSymbol();
  const shown = currentExample().item.word;
  const quiz = state.learn.quiz;
  if (quiz?.symbol === symbol.id && (quiz.solved || quiz.shown === shown)) return;
  const list = symbolExamples(symbol);
  const rest = shuffle(list.filter((item) => item.word !== shown));
  const others = [];
  for (const [id, items] of exampleMap) {
    if (id === symbol.id) continue;
    others.push(...items.slice(0, 3));
  }
  const question = learnQuestion(symbol, rest.length ? rest : list, others);
  const confirm = (rest.length ? rest : list).find((item) => item.word !== question.answer);
  state.learn.quiz = {
    symbol: symbol.id,
    shown,
    ...question,
    confirm: confirm?.word || "",
    tried: 0,
    solved: false,
    message: ""
  };
}

function resultList(items, act) {
  if (!items.length) return `<p class="say-hi">全都對了</p>`;
  return `
    <p class="whisper">再練這些</p>
    <div class="choices review">
      ${items.map((item) => `<button type="button" class="choice" data-act="${act}" data-id="${esc(item.id)}" aria-label="再練 ${esc(item.label)}">${item.html || `${item.face || ""}${esc(item.label)}`}</button>`).join("")}
    </div>
  `;
}

function listenHtml() {
  const round = state.listen;
  if (round.phase === "done") {
    const wrong = round.wrongs;
    const right = round.total - wrong;
    const items = round.missed.map((id) => ({ id, label: id }));
    return `<section class="stage yay">${mascot("hello-face")}<h2>聽完了</h2><p class="score">答對 ${right} 題</p><p class="score">答錯 ${wrong} 題</p>${round.rewarded ? `<p class="score coin-line" aria-label="得到 1 個金幣">${coinTag("big")}</p><p class="whisper coin-line" aria-label="現在有 ${round.coins} 個金幣">${coinTag()} ${round.coins}</p>` : ""}${resultList(items, "listen-practice")}<button type="button" class="go-btn" data-act="listen-start">再玩一次</button><button type="button" class="quiet" data-act="home">回首頁</button></section>`;
  }
  const q = round.q;
  if (!q) return `<section class="stage"><button type="button" class="go-btn" data-act="listen-start">開始聽</button></section>`;
  if (q.step === "recall" && q.recall) return recallHtml(round, q);
  return `
    <p class="whisper">第 ${round.index + 1} 題　${stars(round.stars)}</p>
    <section class="stage">
      <button type="button" class="play-orb" data-act="listen-replay" aria-label="再聽題目">${mascot()}▶</button>
      <p class="say-hi">${esc(round.message || "聽聽看，是哪一個？")}</p>
      <div class="choices">
        ${q.options.map((id) => {
          const shown = q.revealed && id === q.answer;
          const dim = q.revealed && id !== q.answer;
          return `<button type="button" class="choice${shown ? " show-right" : ""}${dim ? " dim" : ""}" data-act="listen-pick" data-id="${esc(id)}" aria-label="${shown ? "正確的注音" : "注音"} ${esc(id)}">${shown ? "★ " : ""}${esc(id)}</button>`;
        }).join("")}
      </div>
    </section>
  `;
}

function recallHtml(round, q) {
  const recall = q.recall;
  const look = recall.look;
  return `
    <p class="whisper">第 ${round.index + 1} 題　${stars(round.stars)}</p>
    <section class="stage">
      <p class="symbol show-answer">${esc(q.answer)}</p>
      ${look ? `<div class="example">${esc(look.emoji || "")}${hanMarkup(look)}</div>` : ""}
      <p class="say-hi">${mascot()} ${esc(round.message || recall.prompt)}</p>
      <div class="choices">
        ${recall.options.map((item) => {
          const shown = recall.wrong >= 1 && item.word === recall.answer;
          return `<button type="button" class="choice${shown ? " show-right" : ""}" data-act="listen-recall" data-word="${esc(item.word)}" aria-label="詞語 ${esc(item.word)}"><span aria-hidden="true">${esc(item.emoji || "")}</span>${hanMarkup(item)}</button>`;
        }).join("")}
      </div>
    </section>
  `;
}

function bossHtml() {
  const round = state.boss;
  if (round.phase === "ready") {
    return `
      <section class="stage">
        ${mascot("hello-face")}
        <h2>拼一拼</h2>
        <button type="button" class="go-btn" data-act="boss-start">開始拼</button>
      </section>
    `;
  }
  if (round.phase === "done") {
    const wrong = round.wrongs;
    const right = round.total - wrong;
    const items = round.missed.map((item) => {
      const word = words.find((entry) => entry.id === item.id);
      return { id: item.id, label: item.word, html: word ? `${esc(item.emoji)} ${hanMarkup(word)}` : `${esc(item.emoji)} ${esc(item.word)}` };
    });
    return `<section class="stage yay">${mascot("hello-face")}<h2>拼完了</h2><p class="score">答對 ${right} 題</p><p class="score">答錯 ${wrong} 題</p>${round.rewarded ? `<p class="score coin-line" aria-label="得到 1 個金幣">${coinTag("big")}</p><p class="whisper coin-line" aria-label="現在有 ${round.coins} 個金幣">${coinTag()} ${round.coins}</p>` : ""}${resultList(items, "boss-practice")}<button type="button" class="go-btn" data-act="boss-start">再玩一次</button><button type="button" class="quiet" data-act="home">回首頁</button></section>`;
  }
  const word = currentWord();
  const syllable = currentSyllable();
  const pick = round.picks[round.step] || emptyPick();
  const parts = visibleParts(round.stage, syllable);
  const stepCount = round.stage < 5 ? 1 : word.syllables.length;
  return `
    <p class="whisper">第 ${round.index + 1} 題${stepCount > 1 ? `　第 ${round.step + 1} 個音` : ""}　${stars(round.stars)}</p>
    <section class="stage ${round.solved ? "yay" : ""}">
      <div class="boss-hero">
        <div class="picture" aria-hidden="true">${esc(emojiOf(word.image))}</div>
        <div class="tray" aria-label="拼音區">
          ${parts.map((part) => slotHtml(part, pick, round.kind === "tone" && part !== "tone")).join("")}
        </div>
      </div>
      <div class="word-line">
        ${hanMarkup(word)}
        <button type="button" class="bubble" data-act="boss-replay" aria-label="重聽題目">▶</button>
      </div>
      ${round.kind === "build" ? parts.filter((part) => part !== "tone").map((part) => choiceHtml(part)).join("") : ""}
      ${parts.includes("tone") ? `<div class="zone zone-tone${round.miss === "tone" ? " miss" : ""}"><div class="tones">${TONES.map(([tone, name, mark]) => {
        const on = pick.tone !== null && pick.tone !== undefined && Number(pick.tone) === tone;
        return `<button type="button" class="tone ${on ? "on" : ""}" data-act="tone" data-tone="${tone}" aria-pressed="${on}" aria-label="${name}">${mark}</button>`;
      }).join("")}</div></div>` : ""}
      <p class="say-hi">${round.solved ? `<span aria-hidden="true">😄</span>` : mascot()} ${esc(round.message || "點一點，拼在這裡")}</p>
    </section>
  `;
}

function slotHtml(part, pick, locked) {
  const raw = part === "tone" ? pick.tone : pick[part];
  const unset = raw === null || raw === undefined;
  const value = part === "tone"
    ? (unset ? "" : TONES.find((item) => item[0] === Number(raw))?.[2] || "")
    : (raw || "");
  const shown = unset ? "·" : (value || "無");
  const label = `${partLabel(part)} ${unset ? "還沒選" : (value || "沒有")}`;
  const mark = state.boss.miss === part ? " miss" : "";
  if (locked) return `<div class="slot slot-${part}${mark}" data-slot data-part="${part}"><strong>${esc(shown)}</strong></div>`;
  return `<button type="button" class="slot slot-${part}${mark}" data-slot data-part="${part}" data-act="clear-part" aria-label="${esc(label)}"><strong>${esc(shown)}</strong></button>`;
}

function choiceHtml(part) {
  const pick = state.boss.picks[state.boss.step] || emptyPick();
  const options = state.boss.choices[part] || [];
  return `
    <div class="zone zone-${part}${state.boss.miss === part ? " miss" : ""}">
    <div class="choices">
      ${options.map((value) => {
        const on = pick[part] === value;
        const text = value || (part === "final" ? "沒有" : "無");
        return `<button type="button" class="choice ${on ? "on" : ""}" data-card data-act="pick" data-part="${part}" data-value="${esc(value)}" aria-pressed="${on}" aria-label="${partLabel(part)} ${text}">${esc(text)}</button>`;
      }).join("")}
    </div>
    </div>
  `;
}

function freeHtml() {
  if (!state.free.ask && symbols.length) nextFreeAsk();
  const list = approvedWords().filter((word) => state.free.category === "all" || word.category === state.free.category);
  return `
    <div class="pills">
      ${CATEGORIES.map(([id, label, icon]) => `<button type="button" class="chip ${state.free.category === id ? "on" : ""}" data-act="free-cat" data-cat="${id}" aria-pressed="${state.free.category === id}" aria-label="${label}">${icon} ${label}</button>`).join("")}
    </div>
    <div class="pills quiet-row">
      <button type="button" class="chip ${state.free.view === "guess" ? "on" : ""}" data-act="free-view" data-view="${state.free.view === "guess" ? "picture" : "guess"}" aria-pressed="${state.free.view === "guess"}">猜猜看</button>
    </div>
    <p class="say-hi">${mascot()} 幫${esc(currentAvatar().name)}找出 ${esc(state.free.ask || "")}</p>
    <div class="free-grid">
      ${list.map((word) => freeCard(word)).join("")}
    </div>
  `;
}

function freeCard(word) {
  const picture = `<span class="big" aria-hidden="true">${esc(emojiOf(word.image))}</span>`;
  const highlight = state.free.highlight?.id === word.id ? state.free.highlight.index : -1;
  const face = `${picture}${hanMarkup(word, { spots: true, id: word.id, highlight })}`;
  if (state.free.view !== "guess") {
    return `<button type="button" class="free-card" data-act="free-play" data-id="${esc(word.id)}" aria-label="播放 ${esc(word.word)}">${face}</button>`;
  }
  const shown = state.free.flipped[word.id] ? " show" : "";
  return `<button type="button" class="free-card guess${shown}" data-act="free-play" data-id="${esc(word.id)}" aria-label="${shown ? `播放 ${esc(word.word)}` : "猜猜看"}"><span class="flip"><span class="face front"><span class="big" aria-hidden="true">❓</span></span><span class="face back">${face}</span></span></button>`;
}

function go(view) {
  window.clearTimeout(listenTimer);
  window.clearTimeout(bossTimer);
  audio.stop();
  if (view === "learn") {
    state.learn.group = "all";
    state.learn.index = 0;
    state.learn.exampleIndex = 0;
    state.learn.quiz = null;
  }
  if (view === "boss" && state.boss.phase === "done") state.boss = { ...freshBoss(), stage: 1, total: ROUND_SIZE };
  if (view === "listen" && state.listen.phase === "done") state.listen = freshListen();
  state.view = view;
  if (view !== "home") progress.visit(view);
  if (view === "listen" && state.listen.phase === "ready") {
    startListen();
    return;
  }
  if (view === "boss" && state.boss.phase === "ready") {
    state.boss.stage = 1;
    state.boss.total = ROUND_SIZE;
    startBoss();
    return;
  }
  render();
}

function playSymbol(id) {
  const symbol = symbolMap.get(id);
  if (!symbol) return;
  progress.see(id);
  audio.play("symbol", id, symbol.call);
}

function exampleNav() {
  return `
    <div class="example-nav">
      <button type="button" data-act="example-prev" aria-label="上一個例詞">上一個詞</button>
      <button type="button" data-act="example-next" aria-label="下一個例詞">下一個詞</button>
      <button type="button" class="bubble" data-act="learn-random" aria-label="隨機換一個注音">🎲</button>
    </div>
  `;
}

function playExample(id) {
  const symbol = symbolMap.get(id);
  const example = symbol.id === currentSymbol().id ? currentExample().item : symbolExamples(symbol)[0];
  const word = wordByText(example.word);
  audio.play("word", word ? word.id : `example-${symbol.fileKey}`, example.word);
}

function shiftExample(delta) {
  const total = symbolExamples(currentSymbol()).length;
  state.learn.exampleIndex = (state.learn.exampleIndex + delta + total) % total;
  state.learn.quiz = null;
  if (state.learn.mode === "picture") makeQuiz();
  render();
  playExample(currentSymbol().id);
}

function makeQuiz() {
  const symbol = currentSymbol();
  const pool = symbols.filter((item) => item.group === symbol.group).map((item) => item.id);
  state.learn.quiz = { id: symbol.id, options: takeOptions(pool, symbol.id, Math.min(3, pool.length)), picked: "", show: false, message: "" };
}

function showLearn(delta) {
  const list = learnItems();
  state.learn.index = (state.learn.index + delta + list.length) % list.length;
  state.learn.exampleIndex = 0;
  state.learn.quiz = null;
  progress.see(currentSymbol().id);
  if (state.learn.mode === "picture") makeQuiz();
  render();
}

function makeListenQuestion() {
  const data = progress.get();
  const count = listenChoiceCount(data);
  const due = (data.review || []).filter((id) => symbolMap.has(id));
  const source = due.length && Math.random() < 0.7 ? symbols.filter((symbol) => due.includes(symbol.id)) : symbols;
  let answer = weightedPick(source.length ? source : symbols, (symbol) => symbolWeight(progress.symbol(symbol.id))).id;
  if (answer === state.listen.last && symbols.length > 1) {
    const again = symbols.filter((symbol) => symbol.id !== state.listen.last);
    answer = weightedPick(again, (symbol) => symbolWeight(progress.symbol(symbol.id))).id;
  }
  state.listen.last = answer;
  const group = symbolMap.get(answer).group;
  const pair = PAIRS.find((item) => item.includes(answer));
  const preferred = pair ? pair.filter((id) => id !== answer) : [];
  const same = symbols.filter((symbol) => symbol.group === group && symbol.id !== answer).map((symbol) => symbol.id);
  const pool = [...new Set([...preferred, ...shuffle(same)])];
  return { answer, options: takeOptions(pool, answer, count), wrong: 0, revealed: false, started: Date.now(), step: "hear" };
}

function buildRecall(id) {
  const symbol = symbolMap.get(id);
  const examples = symbolExamples(symbol).filter((item) => item.syllables?.length);
  if (!examples.length) return null;
  const used = state.listen.usedWords;
  const look = examples.find((item) => !used.includes(item.word)) || examples[0];
  if (look && !used.includes(look.word)) used.push(look.word);
  const others = [];
  for (const [key, items] of exampleMap) {
    if (key === id) continue;
    others.push(...items.slice(0, 2));
  }
  const question = recallQuestion(symbol, examples.filter((item) => item.word !== look?.word), others, used);
  if (question.answer && !used.includes(question.answer)) used.push(question.answer);
  return { ...question, look, wrong: 0 };
}

function startListen() {
  state.listen = freshListen();
  state.listen.phase = "play";
  askListen();
}

function askListen() {
  window.clearTimeout(listenTimer);
  if (state.listen.index >= state.listen.total) {
    state.listen.phase = "done";
    rewardRound(state.listen);
    say("聽完了");
    burst();
    render();
    return;
  }
  state.listen.q = makeListenQuestion();
  state.listen.lock = false;
  state.listen.message = "聽聽看，是哪一個？";
  render();
  playSymbol(state.listen.q.answer);
}

function pickListen(id) {
  const round = state.listen;
  const q = round.q;
  if (!q || round.lock) return;
  if (id !== q.answer) {
    q.wrong += 1;
    progress.note(q.answer, false);
    if (q.wrong >= 2) {
      q.revealed = true;
      round.message = "";
      playSymbol(q.answer);
    } else {
      audio.play("symbol", q.answer, symbolMap.get(q.answer).call);
    }
    render();
    return;
  }
  q.done = true;
  round.lock = true;
  const chosen = document.querySelector(`#screen [data-act="listen-pick"][data-id="${CSS.escape(id)}"]`);
  if (chosen) chosen.classList.add("show-right");
  burst(true);
  audio.cheer();
  if (round.practice) {
    listenTimer = window.setTimeout(() => {
      round.phase = "done";
      round.practice = false;
      round.lock = false;
      round.q = null;
      if (state.view === "listen") render();
    }, 1100);
    return;
  }
  const firstTry = q.wrong === 0;
  progress.note(q.answer, true, Date.now() - (q.started || Date.now()) > 6000);
  progress.markListen(firstTry);
  if (firstTry) round.stars += 1;
  else {
    round.wrongs += 1;
    if (!round.missed.includes(q.answer)) round.missed.push(q.answer);
  }
  round.correct += 1;
  const recall = buildRecall(q.answer);
  if (!recall?.options || recall.options.length < 2) {
    listenTimer = window.setTimeout(advanceListen, 1100);
    return;
  }
  q.step = "recall";
  q.recall = recall;
  round.lock = false;
  round.message = recall.prompt;
  render();
}

function pickRecall(word) {
  const round = state.listen;
  const q = round.q;
  if (!q?.recall || round.lock || q.step !== "recall") return;
  if (word !== q.recall.answer) {
    q.recall.wrong += 1;
    progress.note(q.answer, false);
    playSymbol(q.answer);
    round.message = "再聽一次";
    if (q.recall.wrong >= 2) {
      round.lock = true;
      render();
      listenTimer = window.setTimeout(advanceListen, 1200);
      return;
    }
    render();
    return;
  }
  round.lock = true;
  progress.note(q.answer, true);
  burst(true);
  audio.cheer();
  listenTimer = window.setTimeout(advanceListen, 800);
}

function practiceListen(id) {
  const symbol = symbolMap.get(id);
  if (!symbol) return;
  const same = symbols.filter((item) => item.group === symbol.group && item.id !== id).map((item) => item.id);
  const round = state.listen;
  round.practice = true;
  round.phase = "play";
  round.q = { answer: id, options: takeOptions(same, id, 2), wrong: 0, revealed: false };
  round.lock = false;
  round.message = "聽聽看，是哪一個？";
  render();
  playSymbol(id);
}

function practiceBoss(id) {
  const word = words.find((item) => item.id === id);
  if (!word) return;
  const round = state.boss;
  round.practice = true;
  round.practiceWord = word;
  round.phase = "play";
  round.step = 0;
  round.picks = [];
  round.clean = true;
  round.solved = false;
  round.counted = true;
  round.starred = true;
  round.hint = 0;
  round.lock = false;
  round.kind = round.stage === 4 ? "tone" : "build";
  prepareStep(true);
  render();
}

function advanceListen() {
  window.clearTimeout(listenTimer);
  if (state.view !== "listen" || !state.listen.q?.done) return;
  state.listen.index += 1;
  askListen();
}

function bossPool(stage) {
  return approvedWords().filter((word) => wordStage(word) === stage);
}

function takeBossWords(pool, questions, used) {
  while (questions.length < state.boss.total && used.size < pool.length) {
    const word = weightedPick(pool.filter((item) => !used.has(item.id)), (item) => {
      const ids = item.syllables.flatMap((syllable) => [syllable.initial, syllable.medial, syllable.final].filter(Boolean));
      return Math.max(...ids.map((id) => symbolWeight(progress.symbol(id))));
    });
    if (!word) break;
    used.add(word.id);
    questions.push(word);
  }
}

function startBoss() {
  const stageWords = bossPool(state.boss.stage);
  const extra = approvedWords().filter((word) => word.syllables?.length && !stageWords.some((item) => item.id === word.id));
  const pool = [...stageWords, ...extra];
  if (!pool.length) {
    state.boss.message = "這一關還沒有題目";
    render();
    return;
  }
  const questions = [];
  const used = new Set();
  takeBossWords(stageWords, questions, used);
  takeBossWords(pool, questions, used);
  while (questions.length < state.boss.total) questions.push(pool[questions.length % pool.length]);
  const stage = state.boss.stage;
  const total = state.boss.total;
  state.boss = { ...freshBoss(), phase: "play", stage, total, questions, stars: 0, kind: stage === 4 ? "tone" : "build" };
  prepareStep(true);
  render();
}

function prepareStep(speakWord) {
  const round = state.boss;
  const word = currentWord();
  const syllable = currentSyllable();
  round.hint = 0;
  round.solved = false;
  round.lock = false;
  round.message = "";
  round.miss = "";
  if (!round.picks.length) round.picks = word.syllables.map(() => emptyPick());
  if (round.kind === "tone") {
    round.picks[0] = { initial: syllable.initial, medial: syllable.medial, final: syllable.final, tone: null };
  }
  round.choices = {};
  if (round.kind === "build") {
    for (const part of visibleParts(round.stage, syllable)) {
      if (part === "tone") continue;
      round.choices[part] = partChoices(part, syllable[part] || "", round.stage);
    }
  }
  if (speakWord) audio.play("word", word.id, word.word);
}

function pickReady() {
  const round = state.boss;
  const pick = round.picks[round.step];
  if (!pick) return false;
  return visibleParts(round.stage, currentSyllable()).every((part) => {
    if (part === "tone") return pick.tone !== null && pick.tone !== undefined && pick.tone !== "";
    return pick[part] !== null && pick[part] !== undefined;
  });
}

function setPick(part, value) {
  const round = state.boss;
  if (round.lock || round.solved || round.phase !== "play") return;
  if (round.kind === "tone" && part !== "tone") return;
  const pick = round.picks[round.step];
  const next = part === "tone" ? Number(value) : value;
  const prev = part === "tone" ? (pick.tone === null || pick.tone === undefined ? null : Number(pick.tone)) : pick[part];
  if (prev === next) return;
  if (part === "tone") pick.tone = next;
  else pick[part] = value;
  round.solved = false;
  round.message = "";
  round.miss = "";
  if (pickReady()) confirmBoss();
  else render();
}

function confirmBoss() {
  const round = state.boss;
  if (round.lock || round.phase !== "play") return;
  if (round.solved) {
    audio.play("word", currentWord().id, currentWord().word);
    return;
  }
  const now = Date.now();
  if (now - (round.lastConfirm || 0) < 350) return;
  round.lastConfirm = now;
  const syllable = currentSyllable();
  const result = gradeBuild(syllable, round.picks[round.step], round.stage);
  if (!result.ok) {
    round.message = "再看看";
    round.miss = result.part;
    round.hint = Math.max(round.hint, 1);
    round.clean = false;
    const symbolId = result.part === "tone" ? "" : (syllable[result.part] || "");
    if (symbolId && round.lastMark !== `${round.step}:${result.part}`) {
      progress.markSymbol(symbolId, false);
      round.lastMark = `${round.step}:${result.part}`;
    }
    audio.play("feedback", "look", "再看看");
    say(round.message);
    render();
    return;
  }
  round.solved = true;
  round.lock = true;
  round.miss = "";
  if (round.hint === 0) {
    ["initial", "medial", "final"].forEach((part) => {
      if (syllable[part]) progress.markSymbol(syllable[part], true);
    });
  }
  const word = currentWord();
  const last = round.stage < 5 || round.step >= word.syllables.length - 1;
  if (last && !round.practice && !round.counted) {
    round.counted = true;
    if (round.clean) {
      round.right += 1;
      if (!round.starred) {
        round.stars += 1;
        round.starred = true;
      }
    } else {
      round.wrongs += 1;
      if (!round.missed.some((item) => item.id === word.id)) {
        round.missed.push({ id: word.id, word: word.word, emoji: emojiOf(word.image) });
      }
    }
  }
  burst();
  render();
  window.clearTimeout(bossTimer);
  bossTimer = window.setTimeout(async () => {
    if (state.view !== "boss" || !state.boss.solved) return;
    try {
      await audio.play("word", word.id, word.word);
    } catch (error) {
      console.warn("複誦失敗", error);
    }
    if (state.view !== "boss" || !state.boss.solved) return;
    state.boss.lock = false;
    nextBoss();
  }, 1000);
}

function nextFreeAsk() {
  const pool = symbols.filter((symbol) => symbol.id !== state.free.ask);
  const list = pool.length ? pool : symbols;
  state.free.ask = list[Math.floor(Math.random() * list.length)]?.id || "";
}

function pickLearnWord(word) {
  const quiz = state.learn.quiz;
  const symbol = currentSymbol();
  if (!quiz || quiz.solved || quiz.symbol !== symbol.id) return;
  if (word !== quiz.answer) {
    quiz.tried += 1;
    quiz.message = "再聽一次";
    progress.note(symbol.id, false);
    playSymbol(symbol.id);
    render();
    return;
  }
  quiz.solved = true;
  quiz.message = "對，再看一個";
  progress.note(symbol.id, true);
  const list = symbolExamples(symbol);
  const confirm = list.find((item) => item.word === quiz.confirm);
  if (confirm) state.learn.exampleIndex = Math.max(0, list.indexOf(confirm));
  burst(true);
  audio.cheer();
  render();
  playExample(symbol.id);
}

function hintBoss() {
  const round = state.boss;
  const syllable = currentSyllable();
  const pick = round.picks[round.step];
  const parts = visibleParts(round.stage, syllable);
  const wrong = parts.find((part) => {
    if (part === "tone") return pick.tone === null || pick.tone === undefined || Number(pick.tone) !== Number(syllable.tone);
    if (pick[part] === null || pick[part] === undefined) return true;
    return (pick[part] || "") !== (syllable[part] || "");
  });
  round.hint += 1;
  round.clean = false;
  if (!wrong) {
    confirmBoss();
    return;
  }
  if (round.hint >= 2) {
    if (wrong === "tone") pick.tone = Number(syllable.tone);
    else pick[wrong] = syllable[wrong] || "";
    if (pickReady()) {
      confirmBoss();
      return;
    }
  }
  round.miss = wrong;
  round.message = round.hint >= 2 ? "看看這裡" : "再聽聽看";
  if (round.hint < 2) audio.play("feedback", "again", "再聽一次");
  say(round.message);
  render();
}

function armLock() {
  state.boss.lock = true;
  window.setTimeout(() => {
    if (state.boss.phase === "play") state.boss.lock = false;
  }, 400);
}

function nextBoss() {
  const round = state.boss;
  if (!round.solved || round.lock) return;
  round.lock = true;
  const word = currentWord();
  const more = round.stage >= 5 && round.step < word.syllables.length - 1;
  if (more) {
    round.step += 1;
    round.kind = "build";
    prepareStep(false);
    armLock();
    render();
    return;
  }
  if (round.practice) {
    round.practice = false;
    round.practiceWord = null;
    round.phase = "done";
    round.lock = false;
    round.solved = false;
    render();
    return;
  }
  round.index += 1;
  if (round.index >= round.questions.length) {
    round.phase = "done";
    round.lock = false;
    round.solved = false;
    rewardRound(round);
    progress.markBoss(round.stage);
    say("拼完了");
    render();
    return;
  }
  round.step = 0;
  round.clean = true;
  round.starred = false;
  round.counted = false;
  round.lastMark = "";
  round.kind = round.stage === 4 && round.index % 2 === 0 ? "tone" : "build";
  round.picks = currentWord().syllables.map(() => emptyPick());
  prepareStep(true);
  armLock();
  render();
}

function burst(force) {
  if (!force && document.documentElement.classList.contains("calm")) return;
  const canvas = document.querySelector("#confetti");
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(rect.width, window.innerWidth);
  canvas.height = Math.max(rect.height, window.innerHeight);
  const colors = ["#ff8fab", "#ffd166", "#7bdff2", "#8ce99a", "#c4b5fd"];
  particles = Array.from({ length: 64 }, () => ({
    x: canvas.width * (0.2 + Math.random() * 0.6),
    y: canvas.height * (0.25 + Math.random() * 0.2),
    vx: (Math.random() - 0.5) * 14,
    vy: Math.random() * -12 - 4,
    g: 0.22,
    life: 78,
    color: colors[Math.floor(Math.random() * colors.length)]
  }));
  tick();
}

function tick() {
  const canvas = document.querySelector("#confetti");
  const pen = canvas.getContext("2d");
  pen.clearRect(0, 0, canvas.width, canvas.height);
  particles = particles.filter((item) => item.life > 0);
  for (const item of particles) {
    item.x += item.vx;
    item.y += item.vy;
    item.vy += item.g;
    item.life -= 1;
    pen.fillStyle = item.color;
    pen.beginPath();
    pen.arc(item.x, item.y, 11, 0, Math.PI * 2);
    pen.fill();
  }
  if (particles.length) requestAnimationFrame(tick);
}

function showShortCoins() {
  state.gacha = { short: true };
  render();
  say("金幣不足");
  audio.play("feedback", "short-coins", "金幣不足");
}

function pullGacha() {
  if (state.gacha?.spin) return;
  const unlocked = unlockedIds();
  const prizeId = gachaPull(unlocked, AVATARS.map((avatar) => avatar.id));
  if (!prizeId) {
    state.gacha = { message: "夥伴都到齊了" };
    render();
    return;
  }
  if ((progress.get().coins || 0) < GACHA_COST) {
    showShortCoins();
    return;
  }
  const finish = () => {
    const prize = AVATARS.find((avatar) => avatar.id === prizeId);
    const ok = progress.grantUnlock(prizeId, GACHA_COST);
    if (!ok) {
      showShortCoins();
      return;
    }
    state.gacha = { id: prizeId, message: `解鎖了 ${prize?.name || ""}` };
    if (ok) {
      burst(true);
      audio.cheer();
    }
    render();
  };
  state.gacha = { spin: true, message: "扭一扭" };
  render();
  window.clearTimeout(gachaTimer);
  gachaTimer = window.setTimeout(finish, 700);
}

function onClick(event) {
  const button = event.target.closest("[data-act]");
  if (!button) return;
  if (suppressClick) {
    suppressClick = false;
    return;
  }
  audio.unlock();
  audio.click();
  const act = button.dataset.act;
  if (act === "home") go("home");
  if (act === "mute") {
    progress.setPref("muted", !progress.get().muted);
    applyPrefs();
  }
  if (act === "avatar" && AVATARS.some((item) => item.id === button.dataset.id) && avatarUnlocked(button.dataset.id)) {
    progress.setPref("avatar", button.dataset.id);
    render();
  }
  if (act === "locked-avatar") {
    state.gacha = { message: "扭蛋才能帶走這個夥伴" };
    render();
  }
  if (act === "close-short") {
    state.gacha = null;
    render();
    return;
  }
  if (act === "gacha") pullGacha();
  if (act === "go") go(button.dataset.view);
  if (act === "learn-group") {
    state.learn.group = button.dataset.group;
    state.learn.index = 0;
    state.learn.exampleIndex = 0;
    state.learn.quiz = null;
    if (state.learn.mode === "picture") makeQuiz();
    progress.see(currentSymbol().id);
    render();
  }
  if (act === "learn-mode") {
    state.learn.mode = button.dataset.mode;
    if (state.learn.mode === "picture") makeQuiz();
    render();
    if (state.learn.mode === "picture") playExample(currentSymbol().id);
  }
  if (act === "example-prev") shiftExample(-1);
  if (act === "example-next") shiftExample(1);
  if (act === "learn-random") {
    const list = learnItems();
    state.learn.exampleIndex = 0;
    state.learn.quiz = null;
    let next = state.learn.index;
    if (list.length > 1) {
      while (next === state.learn.index) next = Math.floor(Math.random() * list.length);
    }
    state.learn.index = next;
    if (state.learn.mode === "picture") makeQuiz();
    progress.see(currentSymbol().id);
    render();
  }
  if (act === "play-symbol") playSymbol(button.dataset.id || currentSymbol().id);
  if (act === "play-example") playExample(button.dataset.id);
  if (act === "learn-word") pickLearnWord(button.dataset.word);
  if (act === "learn-pick") {
    const quiz = state.learn.quiz;
    quiz.picked = button.dataset.id;
    if (quiz.picked === quiz.id) {
      quiz.show = true;
      quiz.message = "找到了";
      progress.markSymbol(quiz.id, true);
      playExample(quiz.id);
      say("找到了");
    } else {
      quiz.message = "再看一次";
      progress.markSymbol(quiz.id, false);
      playSymbol(quiz.id);
      say("再看一次");
    }
    render();
  }
  if (act === "listen-start") startListen();
  if (act === "listen-replay" && state.listen.q) playSymbol(state.listen.q.answer);
  if (act === "listen-pick") pickListen(button.dataset.id);
  if (act === "listen-recall") pickRecall(button.dataset.word);
  if (act === "free-spot") {
    const symbol = button.dataset.symbol;
    state.free.highlight = { id: button.dataset.id, index: Number(button.dataset.index) };
    if (symbol && symbol === state.free.ask) {
      progress.note(symbol, true);
      burst(true);
      audio.cheer();
      nextFreeAsk();
    } else if (symbol) playSymbol(symbol);
    render();
    return;
  }
  if (act === "listen-practice") practiceListen(button.dataset.id);
  if (act === "boss-practice") practiceBoss(button.dataset.id);
  if (act === "listen-next") advanceListen();
  if (act === "boss-count") {
    state.boss.total = Number(button.dataset.count);
    if (state.boss.phase === "play") startBoss();
    else render();
  }
  if (act === "boss-stage") {
    state.boss.stage = Number(button.dataset.stage);
    progress.setPref("lastStage", state.boss.stage);
    if (state.boss.phase === "play") startBoss();
    else render();
  }
  if (act === "boss-start") startBoss();
  if (["pick", "tone", "clear-part", "boss-clear", "boss-hint", "boss-confirm", "boss-next"].includes(act) && state.boss.lock) return;
  if (act === "boss-replay") audio.play("word", currentWord().id, currentWord().word);
  if (act === "pick") setPick(button.dataset.part, button.dataset.value);
  if (act === "tone") setPick("tone", button.dataset.tone);
  if (act === "clear-part") {
    const part = button.dataset.part;
    const pick = state.boss.picks[state.boss.step];
    if (part === "tone") pick.tone = null;
    else pick[part] = null;
    state.boss.solved = false;
    state.boss.miss = "";
    state.boss.message = "";
    render();
  }
  if (act === "boss-clear") {
    const pick = state.boss.picks[state.boss.step];
    if (state.boss.kind === "tone") pick.tone = null;
    else state.boss.picks[state.boss.step] = emptyPick();
    state.boss.solved = false;
    state.boss.message = "再選一次";
    render();
  }
  if (act === "boss-hint") hintBoss();
  if (act === "boss-confirm") confirmBoss();
  if (act === "boss-next") nextBoss();
  if (act === "boss-restart") {
    const stage = state.boss.stage;
    const total = state.boss.total;
    state.boss = { ...freshBoss(), stage, total };
    render();
  }
  if (act === "free-cat") {
    state.free.category = button.dataset.cat;
    render();
  }
  if (act === "free-view") {
    state.free.view = button.dataset.view;
    state.free.flipped = {};
    render();
  }
  if (act === "free-play") {
    const word = words.find((item) => item.id === button.dataset.id);
    if (!word) return;
    if (state.free.view === "guess" && !state.free.flipped[word.id]) {
      state.free.flipped[word.id] = true;
      button.classList.add("show");
      const wait = document.documentElement.classList.contains("calm") || window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 480;
      window.setTimeout(() => {
        if (state.view === "free" && state.free.view === "guess") audio.play("word", word.id, word.word);
      }, wait);
      return;
    }
    state.free.heard[word.id] = true;
    audio.play("word", word.id, word.word);
  }
}

document.addEventListener("click", onClick);
document.addEventListener("pointerdown", (event) => {
  audio?.unlock();
  if (state.view === "learn" && event.isPrimary !== false) {
    swipe = { x: event.clientX, y: event.clientY, pointer: event.pointerId };
  }
  const card = event.target.closest("[data-card]");
  if (!card || state.view !== "boss" || state.boss.kind !== "build") return;
  drag = { part: card.dataset.part, value: card.dataset.value, x: event.clientX, y: event.clientY, moved: false, pointer: event.pointerId, text: card.textContent.trim() };
  try { card.setPointerCapture(event.pointerId); } catch (error) { /* 未信任的事件不抓指標 */ }
}, { passive: true });

document.addEventListener("pointermove", (event) => {
  if (!drag || event.pointerId !== drag.pointer) return;
  if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 12) {
    drag.moved = true;
    const ghost = document.querySelector("#ghost");
    ghost.hidden = false;
    ghost.textContent = drag.text.replace("★", "").trim();
    ghost.style.left = `${event.clientX}px`;
    ghost.style.top = `${event.clientY}px`;
    event.preventDefault();
  }
}, { passive: false });

document.addEventListener("pointerup", (event) => {
  if (swipe && event.pointerId === swipe.pointer) {
    const dx = event.clientX - swipe.x;
    const dy = event.clientY - swipe.y;
    swipe = null;
    if (state.view === "learn" && Math.abs(dx) >= 64 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      suppressClick = true;
      window.setTimeout(() => { suppressClick = false; }, 0);
      showLearn(dx < 0 ? 1 : -1);
      return;
    }
  }
  if (!drag || event.pointerId !== drag.pointer) return;
  const info = drag;
  drag = null;
  document.querySelector("#ghost").hidden = true;
  if (!info.moved) return;
  suppressClick = true;
  window.setTimeout(() => { suppressClick = false; }, 0);
  const under = document.elementFromPoint(event.clientX, event.clientY);
  const slot = under?.closest("[data-slot]");
  if (slot && slot.dataset.part === info.part) setPick(info.part, info.value);
});

document.addEventListener("pointercancel", (event) => {
  if (swipe && event.pointerId === swipe.pointer) swipe = null;
});

document.addEventListener("keydown", (event) => {
  if (state.gacha?.short && event.key === "Escape") {
    state.gacha = null;
    render();
    return;
  }
  if (state.view !== "learn" || state.learn.mode !== "hear") return;
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  if (!["BODY", "MAIN"].includes(event.target.tagName)) return;
  event.preventDefault();
  showLearn(event.key === "ArrowRight" ? 1 : -1);
});

window.addEventListener("error", (event) => {
  console.error(event.error || event.message);
  say("再回首頁試一次");
});

async function boot() {
  try {
    const [symbolData, wordData, manifest, exampleData] = await Promise.all([
      fetch("data/symbols.json").then((response) => response.json()),
      fetch("data/words.json").then((response) => response.json()),
      fetch("data/audio-manifest.json").then((response) => response.json()),
      fetch("data/symbol-examples.json").then((response) => response.json())
    ]);
    symbols = symbolData;
    words = wordData;
    symbolMap = new Map(symbols.map((symbol) => [symbol.id, symbol]));
    exampleMap = new Map(Object.entries(exampleData));
    audio = createAudio({ manifest, dev });
    applyPrefs();
    state.boss.stage = progress.get().lastStage || 1;
    if (dev) console.info("缺少音檔", audio.missing.map((item) => item.file));
    render();
  } catch (error) {
    console.error(error);
    screen.innerHTML = `<section class="card"><h2>題目還載入不起來</h2><p>請用網頁伺服器開啟這個資料夾。直接點開檔案時，瀏覽器讀不到題庫。</p></section>`;
  }
}

boot();
