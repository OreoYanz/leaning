import { createAudio } from "./audio.js?v=31";
import {
  emptyPick,
  gradeBuild,
  gradeRocket,
  listenChoiceCount,
  partChoices,
  partLabel,
  rocketBank,
  rocketCharComplete,
  rocketSlots,
  shuffle,
  symbolWeight,
  takeOptions,
  toRocketWord,
  visibleParts,
  weightedPick,
  wordStage,
  COIN_SHORT,
  GACHA_COST,
  gachaPull,
  hanMarkup,
  learnQuestion,
  recallQuestion
} from "./logic.js?v=31";
import { createProgress } from "./progress.js?v=31";

const PAIRS = [["ㄅ", "ㄆ"], ["ㄉ", "ㄊ"], ["ㄍ", "ㄎ"], ["ㄓ", "ㄗ"], ["ㄢ", "ㄤ"], ["ㄋ", "ㄌ"], ["ㄣ", "ㄥ"], ["ㄚ", "ㄛ"]];
const GROUPS = [["sheng", "聲母"], ["jie", "介音"], ["yun", "韻母"], ["all", "全部"]];
const STAGES = [[1, "ㄅㄚ"], [2, "ㄠㄢ"], [3, "ㄧㄚ"], [4, "聲調"], [5, "詞語"]];
const BOSS_PER_STAGE = 2;
const ROCKET_COUNT = 5;
const ROUND_SIZE = STAGES.length * BOSS_PER_STAGE;
const TONES = [[1, "一聲", "—"], [2, "二聲", "ˊ"], [3, "三聲", "ˇ"], [4, "四聲", "ˋ"], [0, "輕聲", "˙"]];
const MODE_NAME = { learn: "注音認識", listen: "聽音找注音", boss: "拼音大魔王", rocket: "拼音火箭" };
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
let rocketTimer = 0;
let rocketDrag = null;
let gachaTimer = 0;
let paradeTimer = 0;
let paradeIndex = 0;
let particles = [];

const state = {
  view: "home",
  learn: { group: "all", index: 0, exampleIndex: 0, mode: "hear", quiz: null },
  listen: freshListen(),
  boss: freshBoss(),
  rocket: freshRocket(),
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

const ROCKET_TONE_OPTIONS = [
  ["", "一聲", ""],
  ["ˊ", "二聲", "ˊ"],
  ["ˇ", "三聲", "ˇ"],
  ["ˋ", "四聲", "ˋ"],
  ["˙", "輕聲", "˙"]
];

function freshRocket() {
  return {
    phase: "ready",
    total: 0,
    index: 0,
    questions: [],
    usedIds: [],
    rocket: null,
    fills: {},
    bank: { letters: [], tones: ["", "ˊ", "ˇ", "ˋ", "˙"] },
    activeSlot: null,
    activePick: null,
    lock: false,
    anim: "idle",
    countdown: 0,
    token: 0,
    missKeys: [],
    message: "",
    missed: [],
    wrongs: 0,
    right: 0,
    stars: 0,
    rewarded: false,
    coins: 0,
    faulted: false,
    snapKey: ""
  };
}

function toneChip(value) {
  return value === "" ? "一" : value;
}

function toneValue(chip) {
  return chip === "一" || chip === "—" ? "" : chip;
}

function rocketPieceGhostText(piece) {
  if (piece?.dataset?.kind === "tone") {
    const mark = toneValue(piece.dataset.value);
    if (mark === "") return "";
    const face = piece.querySelector(".tone-face")?.textContent?.replace(/\u00a0/g, "").trim();
    return face || mark;
  }
  return (piece?.textContent || "").trim();
}

function clearRocketTimers() {
  window.clearTimeout(rocketTimer);
  rocketTimer = 0;
  document.body.classList.remove("rocket-launching", "rocket-liftoff", "rocket-quake");
}

function clearRocketDrag() {
  rocketDrag = null;
  document.body.classList.remove("rocket-dragging");
  const ghost = document.querySelector("#ghost");
  if (ghost) {
    ghost.hidden = true;
    ghost.textContent = "";
    ghost.style.left = "";
    ghost.style.top = "";
  }
  document.querySelectorAll(".craft-drop.hot").forEach((node) => node.classList.remove("hot"));
  document.querySelectorAll(".craft-drop.is-lifted").forEach((node) => node.classList.remove("is-lifted"));
}

/* 幽靈浮在手指上方，命中點跟著往上偏，才會對準亮起來的格子 */
const ROCKET_AIM_LIFT = 46;

function rocketAimPoint(clientX, clientY) {
  return { x: clientX, y: clientY - ROCKET_AIM_LIFT };
}

function rocketDropAt(x, y, kind, exceptKey = "") {
  const pads = kind
    ? document.querySelectorAll(`.craft-drop[data-kind="${kind}"]`)
    : document.querySelectorAll(".craft-drop");
  let best = null;
  let bestRank = Infinity;
  for (const drop of pads) {
    if (drop.disabled || drop.dataset.key === exceptKey) continue;
    const box = drop.getBoundingClientRect();
    const padX = 32;
    const padY = 28;
    const left = box.left - padX;
    const right = box.right + padX;
    const top = box.top - padY;
    const bottom = box.bottom + padY;
    const dx = x < left ? left - x : x > right ? x - right : 0;
    const dy = y < top ? top - y : y > bottom ? y - bottom : 0;
    const edgeDist = Math.hypot(dx, dy);
    if (edgeDist > 40) continue;
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    const centerDist = Math.hypot(x - cx, y - cy);
    const rank = edgeDist * 1000 + centerDist;
    if (rank < bestRank) {
      bestRank = rank;
      best = drop;
    }
  }
  return best;
}

function rocketDropFromDrag(info, clientX, clientY) {
  const aim = rocketAimPoint(clientX, clientY);
  if (info.hotKey) {
    const lit = document.querySelector(`.craft-drop[data-key="${info.hotKey}"]`);
    if (
      lit &&
      !lit.disabled &&
      (!info.kind || lit.dataset.kind === info.kind) &&
      lit.dataset.key !== (info.fromKey || "")
    ) {
      return lit;
    }
  }
  return rocketDropAt(aim.x, aim.y, info.kind, info.fromKey || "");
}

function clearRocketSlot(key) {
  const round = state.rocket;
  if (round.lock || round.anim !== "idle") return false;
  if (round.fills[key] === null || round.fills[key] === undefined) return false;
  delete round.fills[key];
  round.missKeys = round.missKeys.filter((item) => item !== key);
  round.activeSlot = null;
  round.activePick = null;
  round.snapKey = "";
  round.message = "已拿掉，再放一次";
  return true;
}

function rocketFillGhostText(kind, value) {
  if (kind === "tone") return value === "" ? "" : value;
  return value || "";
}

function moveRocketFill(fromKey, toKey) {
  const round = state.rocket;
  if (round.lock || !round.rocket || round.anim !== "idle") return false;
  if (!fromKey || !toKey || fromKey === toKey) return false;
  const slots = rocketSlots(round.rocket);
  const fromSlot = slots.find((item) => item.key === fromKey);
  const toSlot = slots.find((item) => item.key === toKey);
  if (!fromSlot || !toSlot || fromSlot.kind !== toSlot.kind) return false;
  const fromVal = round.fills[fromKey];
  if (fromVal === null || fromVal === undefined) return false;
  const toVal = round.fills[toKey];
  const targetEmpty = toVal === null || toVal === undefined;
  if (targetEmpty) {
    delete round.fills[fromKey];
    round.fills[toKey] = fromVal;
    round.message = "搬過去了";
  } else {
    round.fills[fromKey] = toVal;
    round.fills[toKey] = fromVal;
    round.message = "交換好了";
  }
  round.activeSlot = null;
  round.activePick = null;
  round.missKeys = round.missKeys.filter((item) => item !== fromKey && item !== toKey);
  round.snapKey = toKey;
  render();
  window.setTimeout(() => {
    if (state.rocket.snapKey === toKey) {
      state.rocket.snapKey = "";
      document.querySelector(`.craft-drop[data-key="${toKey}"]`)?.classList.remove("snap");
    }
  }, 220);
  if (rocketReady()) confirmRocket();
  return true;
}

function rocketAnimLive(token) {
  return state.view === "rocket" && state.rocket.token === token;
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
  return exampleMap.get(symbol.id) || [];
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

function syncBossQuestion() {
  const word = currentWord();
  const stage = Number(word?.bossStage) || wordStage(word) || 1;
  state.boss.stage = stage;
  state.boss.kind = stage === 4 ? "tone" : "build";
}

function currentSyllable() {
  const word = currentWord();
  const index = state.boss.stage < 5 ? 0 : state.boss.step;
  return word.syllables[index];
}

function stageTitle(stage) {
  return STAGES.find(([id]) => id === stage)?.[1] || "";
}

function trayParts(stage, syllable) {
  return visibleParts(stage, syllable).filter((part) => {
    if (part === "tone") return true;
    return Boolean(syllable?.[part]);
  });
}

function pickParts(stage, syllable) {
  return visibleParts(stage, syllable).filter((part) => {
    if (part === "tone") return false;
    return Boolean(syllable?.[part]);
  });
}

function fillEmptyParts(pick, syllable) {
  if (!syllable.initial) pick.initial = "";
  if (!syllable.medial) pick.medial = "";
  if (!syllable.final) pick.final = "";
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
  if (view === "rocket") screen.innerHTML = rocketHtml();
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
  const coins = progress.get().coins || 0;
  const names = ownedAvatars().map((avatar) => avatar.name);
  return `
    <div class="home-board">
      <section class="hello">
        ${mascot("hello-face")}
        <div>
          <h2>哈囉！今天想玩什麼？</h2>
          <p class="whisper coin-line" aria-label="金幣 ${coins} 個${names.length ? `，夥伴 ${esc(names.join("、"))} 在跑` : ""}">${coinTag()} <span class="coin-count">${coins}</span>${paradeHtml(names)}</p>
        </div>
      </section>
      <div class="home-main">
        <div class="gates">
          <button type="button" class="gate pink" data-act="go" data-view="learn" aria-label="注音認識，看看注音"><span aria-hidden="true">📒</span><strong>注音認識</strong><small>看看注音</small></button>
          <button type="button" class="gate yellow" data-act="go" data-view="listen" aria-label="聽音找注音，聽一聽再點"><span aria-hidden="true">👂</span><strong>聽音找注音</strong><small>聽一聽再點</small></button>
          <button type="button" class="gate blue" data-act="go" data-view="boss" aria-label="拼音大魔王，把字拼起來"><span aria-hidden="true">🐲</span><strong>拼音大魔王</strong><small>把字拼起來</small></button>
          <button type="button" class="gate green" data-act="go" data-view="rocket" aria-label="拼音火箭，直式拼注音"><span aria-hidden="true">🚀</span><strong>拼音火箭</strong><small>直式拼注音</small></button>
        </div>
        ${machineHtml()}
      </div>
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
    </div>
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
    <div class="choices learn-choices" aria-label="練習選項">
      ${quiz.options.slice(0, 3).map((item) => {
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
  if (quiz?.symbol === symbol.id && !quiz.solved) {
    quiz.shown = shown;
    return;
  }
  if (quiz?.symbol === symbol.id && quiz.solved && quiz.shown === shown) return;
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
  const slots = trayParts(round.stage, syllable);
  const picks = pickParts(round.stage, syllable);
  const stepCount = round.stage < 5 ? 1 : word.syllables.length;
  return `
    <p class="whisper">第 ${round.index + 1} 題　${esc(stageTitle(round.stage))}${stepCount > 1 ? `　第 ${round.step + 1} 個音` : ""}　${stars(round.stars)}</p>
    <section class="stage ${round.solved ? "yay" : ""}">
      <div class="boss-hero">
        <button type="button" class="boss-aside" data-act="boss-replay" aria-label="重聽 ${esc(word.word)}">
          <span class="picture" aria-hidden="true">${esc(emojiOf(word.image))}</span>
          <span class="word-line">${hanMarkup(word)}</span>
        </button>
        ${trayHtml(slots, pick, round.kind === "tone")}
      </div>
      ${round.kind === "build" ? picks.map((part) => choiceHtml(part)).join("") : ""}
      ${slots.includes("tone") ? `<div class="zone zone-tone${round.miss === "tone" ? " miss" : ""}"><div class="tones">${TONES.map(([tone, name, mark]) => {
        const on = pick.tone !== null && pick.tone !== undefined && Number(pick.tone) === tone;
        return `<button type="button" class="tone ${on ? "on" : ""}" data-act="tone" data-tone="${tone}" aria-pressed="${on}" aria-label="${name}">${mark}</button>`;
      }).join("")}</div></div>` : ""}
      <p class="say-hi">${round.solved ? `<span aria-hidden="true">😄</span>` : mascot()} ${esc(round.message || "點一點，拼在這裡")}</p>
    </section>
  `;
}

function trayHtml(slots, pick, toneMode) {
  const symbols = slots.filter((part) => part !== "tone");
  const hasTone = slots.includes("tone");
  const lockSymbols = toneMode;
  const stack = symbols.map((part) => slotHtml(part, pick, lockSymbols)).join("");
  if (!hasTone) {
    return `<div class="tray tray-zy" aria-label="拼音區"><div class="tray-body"><div class="tray-stack">${stack}</div></div></div>`;
  }
  const raw = pick.tone;
  const unset = raw === null || raw === undefined;
  const tone = unset ? null : Number(raw);
  const light = tone === 0;
  const sideMark = unset ? "·" : (tone === 1 || light ? "" : (TONES.find((item) => item[0] === tone)?.[2] || ""));
  const toneLabel = unset ? "聲調 還沒選" : `聲調 ${TONES.find((item) => item[0] === tone)?.[1] || ""}`;
  const miss = state.boss.miss === "tone" ? " miss" : "";
  const lightSlot = light
    ? `<button type="button" class="slot slot-tone tray-light${miss}" data-slot data-part="tone" data-act="clear-part" aria-label="${esc(toneLabel)}"><strong>˙</strong></button>`
    : "";
  const sideSlot = light
    ? ""
    : `<button type="button" class="slot slot-tone tray-tone${miss}${tone === 1 ? " is-first" : ""}" data-slot data-part="tone" data-act="clear-part" aria-label="${esc(toneLabel)}"><strong>${esc(sideMark)}</strong></button>`;
  return `
    <div class="tray tray-zy" aria-label="拼音區">
      ${lightSlot}
      <div class="tray-body">
        <div class="tray-stack">${stack}</div>
        ${sideSlot}
      </div>
    </div>
  `;
}

function slotHtml(part, pick, locked) {
  const raw = part === "tone" ? pick.tone : pick[part];
  const unset = raw === null || raw === undefined;
  const value = part === "tone"
    ? (unset ? "" : TONES.find((item) => item[0] === Number(raw))?.[2] || "")
    : (raw || "");
  const shown = unset ? "·" : value;
  const label = `${partLabel(part)} ${unset ? "還沒選" : value}`;
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
      ${options.filter((value) => value).map((value) => {
        const on = pick[part] === value;
        return `<button type="button" class="choice ${on ? "on" : ""}" data-card data-act="pick" data-part="${part}" data-value="${esc(value)}" aria-pressed="${on}" aria-label="${partLabel(part)} ${esc(value)}">${esc(value)}</button>`;
      }).join("")}
    </div>
    </div>
  `;
}

function rocketDropHtml(slot, label) {
  const round = state.rocket;
  const fill = round.fills[slot.key];
  const unset = fill === null || fill === undefined;
  const miss = round.missKeys.includes(slot.key);
  const active = round.activeSlot === slot.key;
  const success = ["success", "countdown", "ignite", "liftoff"].includes(round.anim);
  const ok = success && !miss && !unset;
  const shown = unset ? "" : (slot.kind === "tone" && fill === "" ? "" : fill);
  const first = slot.kind === "tone" && !unset && fill === "";
  const light = slot.kind === "tone" && (round.rocket.characters[slot.charIndex]?.tone === "˙" || fill === "˙");
  const snap = round.snapKey === slot.key;
  const cls = [
    "craft-drop",
    slot.kind === "tone" ? "craft-wing" : "craft-seg",
    light ? "light" : "",
    active ? "active" : "",
    miss ? "miss" : "",
    ok ? "ok" : "",
    unset ? "empty" : "filled",
    first ? "first" : "",
    snap ? "snap" : ""
  ].filter(Boolean).join(" ");
  const spoken = unset ? label : `${label} ${shown || "一聲"}`;
  return `<button type="button" class="${cls}" data-drop data-kind="${slot.kind}" data-key="${esc(slot.key)}" data-act="rocket-slot" aria-label="${esc(spoken)}" aria-pressed="${active}"><strong>${esc(shown)}</strong></button>`;
}

function rocketBayHtml(item, charIndex) {
  const round = state.rocket;
  const light = item.tone === "˙";
  const done = rocketCharComplete(round.rocket, round.fills, charIndex);
  const success = ["success", "countdown", "ignite", "liftoff"].includes(round.anim);
  const toneSlot = { key: `T${charIndex}`, kind: "tone", charIndex };
  const wing = rocketDropHtml(toneSlot, `${item.char} 的聲調翅膀`);
  const segs = item.letters.map((letter, letterIndex) => {
    const slot = { key: `L${charIndex}-${letterIndex}`, kind: "letter", charIndex, letterIndex };
    return rocketDropHtml(slot, `${item.char} 的注音 ${letterIndex + 1}`);
  }).join("");
  if (light) {
    return `
      <div class="craft-bay is-light${done || success ? " lit" : ""}" data-bay="${charIndex}">
        <span class="craft-tag">${esc(item.char)}</span>
        ${wing}
        <div class="craft-core">${segs}</div>
      </div>
    `;
  }
  return `
    <div class="craft-bay${done || success ? " lit" : ""}" data-bay="${charIndex}">
      <span class="craft-tag">${esc(item.char)}</span>
      <div class="craft-bay-row">
        <div class="craft-core">${segs}</div>
        ${wing}
      </div>
    </div>
  `;
}

function rocketCapsuleHtml() {
  return `<div class="craft-capsule" aria-hidden="true"><span class="craft-capsule-ring"></span></div>`;
}

function rocketBodyHtml(characters) {
  return characters.map((item, charIndex) => {
    const bay = rocketBayHtml(item, charIndex);
    if (charIndex < characters.length - 1) return `${bay}${rocketCapsuleHtml()}`;
    return bay;
  }).join("");
}

function rocketHtml() {
  const round = state.rocket;
  if (round.phase === "ready") {
    return `
      <section class="stage">
        ${mascot("hello-face")}
        <h2>拼音火箭</h2>
        <p class="say-hi">${mascot()} 把注音拖上火箭，發射！</p>
        <button type="button" class="go-btn" data-act="rocket-start">開始發射</button>
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
    return `<section class="stage yay">${mascot("hello-face")}<h2>發射完成</h2><p class="score">答對 ${right} 題</p><p class="score">答錯 ${wrong} 題</p>${round.rewarded ? `<p class="score coin-line" aria-label="得到 1 個金幣">${coinTag("big")}</p><p class="whisper coin-line" aria-label="現在有 ${round.coins} 個金幣">${coinTag()} ${round.coins}</p>` : ""}${resultList(items, "rocket-practice")}<button type="button" class="go-btn" data-act="rocket-start">再玩一次</button><button type="button" class="quiet" data-act="home">回首頁</button></section>`;
  }
  const rocket = round.rocket;
  if (!rocket) {
    return `<section class="stage"><button type="button" class="go-btn" data-act="rocket-start">開始發射</button></section>`;
  }
  const anim = round.anim || "idle";
  const pickKind = round.activePick?.kind || "";
  const slotKind = round.activeSlot ? rocketSlots(rocket).find((slot) => slot.key === round.activeSlot)?.kind : "";
  const filterKind = pickKind || slotKind;
  const placed = Object.entries(round.fills).filter(([key]) => key.startsWith("L")).map(([, value]) => value);
  const letterCount = rocket.characters.reduce((sum, item) => sum + item.letters.length, 0);
  return `
    <section class="stage rocket-stage anim-${esc(anim)}">
      <div class="rocket-hint">
        <button type="button" class="rocket-pic" data-act="rocket-replay" aria-label="重聽 ${esc(rocket.word)}">
          <span class="picture" aria-hidden="true">${esc(emojiOf(rocket.image))}</span>
        </button>
        <strong class="rocket-word">${esc(rocket.word)}</strong>
      </div>
      <div class="rocket-play">
        <div class="rocket-banks">
          <div class="zone zone-letter${filterKind === "tone" ? " dim-zone" : ""}">
            <div class="choices rocket-parts">
              ${round.bank.letters.map((value) => {
                const used = placed.includes(value);
                const on = round.activePick?.kind === "letter" && round.activePick.value === value ? " on" : "";
                const disabled = filterKind === "tone" || round.lock;
                return `<button type="button" class="choice${used ? " used" : ""}${on}" data-rocket-piece data-act="rocket-pick" data-kind="letter" data-value="${esc(value)}" ${disabled ? "disabled" : ""} aria-label="注音 ${esc(value)}" aria-pressed="${Boolean(on)}">${esc(value)}</button>`;
              }).join("")}
            </div>
          </div>
          <div class="zone zone-tone${filterKind === "letter" ? " dim-zone" : ""}">
            <div class="tones rocket-tones">
              ${ROCKET_TONE_OPTIONS.map(([value, name, mark]) => {
                const on = round.activePick?.kind === "tone" && round.activePick.value === value ? " on" : "";
                const disabled = filterKind === "letter" || round.lock;
                return `<button type="button" class="tone${on}${value === "" ? " is-first" : ""}" data-rocket-piece data-act="rocket-pick" data-kind="tone" data-value="${esc(toneChip(value))}" ${disabled ? "disabled" : ""} aria-label="${esc(name)}" aria-pressed="${Boolean(on)}"><span class="tone-face">${esc(mark)}</span><small>${esc(name)}</small></button>`;
              }).join("")}
            </div>
          </div>
        </div>
        <div class="craft-wrap" data-letters="${letterCount}">
          ${anim === "countdown" ? `<p class="rocket-count" aria-live="assertive">${round.countdown}</p>` : ""}
          ${anim === "success" ? `<p class="rocket-banner">組裝完成！</p>` : ""}
          <div class="craft-stack">
            <div class="craft craft-${esc(anim)}" data-letters="${letterCount}" aria-label="拼音火箭 ${esc(rocket.word)}">
              <div class="craft-nose" aria-hidden="true">
                <span class="craft-cone"></span>
                <span class="craft-window"></span>
              </div>
              <div class="craft-spine">
                ${rocketBodyHtml(rocket.characters)}
                <div class="craft-tail" aria-hidden="true">
                  <div class="craft-fins">
                    <span class="fin left"></span>
                    <span class="fin right"></span>
                  </div>
                  <div class="craft-thruster">
                    <span class="craft-thruster-band"></span>
                    <span class="craft-nozzle"></span>
                  </div>
                </div>
              </div>
              <div class="craft-exhaust" aria-hidden="true">
                <div class="craft-flame">
                  <span class="flame outer"></span>
                  <span class="flame inner"></span>
                </div>
                <div class="craft-smoke"><span></span><span></span><span></span><span></span><span></span></div>
              </div>
            </div>
            <div class="launch-pad" aria-hidden="true">
              <div class="pad-plumes"><span></span><span></span><span></span><span></span><span></span><span></span></div>
              <div class="pad-deck">
                <span class="pad-ring"></span>
                <span class="pad-grill"></span>
              </div>
              <div class="pad-legs">
                <span></span><span></span><span></span><span></span>
              </div>
              <div class="pad-floor"></div>
            </div>
          </div>
        </div>
      </div>
      <p class="say-hi">${anim === "liftoff" || anim === "ignite" ? "發射！" : anim === "countdown" ? "準備發射" : anim === "success" ? "組裝完成！" : `${mascot()} ${esc(round.message || "拖到空格，或先點零件再點空格；點錯的可拿掉")}`}</p>
    </section>
  `;
}

function go(view) {
  window.clearTimeout(listenTimer);
  window.clearTimeout(bossTimer);
  clearRocketTimers();
  clearRocketDrag();
  audio.stop();
  if (view === "learn") {
    state.learn.group = "all";
    state.learn.index = 0;
    rollExample(false);
    state.learn.quiz = null;
  }
  if (view === "boss" && state.boss.phase === "done") state.boss = { ...freshBoss(), stage: 1, total: ROUND_SIZE };
  if (view === "listen" && state.listen.phase === "done") state.listen = freshListen();
  if (view === "rocket" && state.rocket.phase === "done") state.rocket = freshRocket();
  if (view !== "rocket" && state.rocket.anim !== "idle") {
    state.rocket.anim = "idle";
    state.rocket.lock = false;
    state.rocket.countdown = 0;
  }
  state.view = view;
  if (view !== "home") progress.visit(view);
  if (view === "listen" && state.listen.phase === "ready") {
    startListen();
    return;
  }
  if (view === "boss" && state.boss.phase === "ready") {
    startBoss();
    return;
  }
  if (view === "rocket" && state.rocket.phase === "ready") {
    startRocket();
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
      <button type="button" data-act="example-next" aria-label="換一個例詞">換一個詞</button>
      <button type="button" class="bubble" data-act="learn-random" aria-label="隨機換一個注音">🎲</button>
    </div>
  `;
}

function playExample(id) {
  const symbol = symbolMap.get(id);
  const list = symbolExamples(symbol);
  const example = symbol.id === currentSymbol().id
    ? currentExample().item
    : list[Math.floor(Math.random() * list.length)];
  if (!example) return;
  const word = wordByText(example.word);
  audio.play("word", word ? word.id : `example-${symbol.fileKey}`, example.word);
}

function rollExample(different) {
  const list = symbolExamples(currentSymbol());
  if (list.length <= 1) {
    state.learn.exampleIndex = 0;
    return;
  }
  if (!different) {
    state.learn.exampleIndex = Math.floor(Math.random() * list.length);
    return;
  }
  const current = state.learn.exampleIndex;
  let next = current;
  while (next === current) next = Math.floor(Math.random() * list.length);
  state.learn.exampleIndex = next;
}

function makeQuiz() {
  const symbol = currentSymbol();
  const pool = symbols.filter((item) => item.group === symbol.group).map((item) => item.id);
  state.learn.quiz = { id: symbol.id, options: takeOptions(pool, symbol.id, Math.min(3, pool.length)), picked: "", show: false, message: "" };
}

function showLearn(delta) {
  const list = learnItems();
  state.learn.index = (state.learn.index + delta + list.length) % list.length;
  rollExample(false);
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
  const fresh = examples.filter((item) => !used.includes(item.word));
  const pool = fresh.length ? fresh : examples;
  const look = pool[Math.floor(Math.random() * pool.length)];
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
  const stage = wordStage(word);
  round.practice = true;
  round.practiceWord = { ...word, bossStage: stage };
  round.phase = "play";
  round.step = 0;
  round.picks = [];
  round.clean = true;
  round.solved = false;
  round.counted = true;
  round.starred = true;
  round.hint = 0;
  round.lock = false;
  round.stage = stage;
  round.kind = stage === 4 ? "tone" : "build";
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

function takeUniqueWords(pool, count, used) {
  const picked = [];
  for (const word of shuffle(pool)) {
    if (picked.length >= count) break;
    if (used.has(word.id)) continue;
    used.add(word.id);
    picked.push(word);
  }
  return picked;
}

function startBoss() {
  const used = new Set();
  let questions = [];
  for (const [stage] of STAGES) {
    let batch = takeUniqueWords(bossPool(stage), BOSS_PER_STAGE, used);
    if (batch.length < BOSS_PER_STAGE) {
      const extra = approvedWords().filter((word) => word.syllables?.length && !used.has(word.id));
      batch = batch.concat(takeUniqueWords(extra, BOSS_PER_STAGE - batch.length, used));
    }
    for (const word of batch) questions.push({ ...word, bossStage: stage });
  }
  questions = shuffle(questions);
  if (!questions.length) {
    state.boss.message = "這一關還沒有題目";
    render();
    return;
  }
  const first = questions[0];
  state.boss = {
    ...freshBoss(),
    phase: "play",
    stage: first.bossStage,
    total: questions.length,
    questions,
    stars: 0,
    kind: first.bossStage === 4 ? "tone" : "build"
  };
  prepareStep(true);
  render();
}

function rocketPool() {
  return approvedWords().map(toRocketWord).filter(Boolean);
}

function appendRocketQuestions(round, count = ROCKET_COUNT) {
  const pool = rocketPool();
  if (!pool.length) return 0;
  let used = new Set(round.usedIds || []);
  let batch = takeUniqueWords(pool, count, used);
  if (!batch.length) {
    used = new Set();
    batch = takeUniqueWords(pool, count, used);
  }
  if (!batch.length) {
    batch = shuffle(pool).slice(0, Math.min(count, pool.length));
    used = new Set(batch.map((item) => item.id));
  }
  round.questions.push(...batch);
  round.usedIds = [...used];
  round.total = round.questions.length;
  return batch.length;
}

function startRocket() {
  clearRocketTimers();
  const round = { ...freshRocket(), phase: "play" };
  if (!appendRocketQuestions(round, ROCKET_COUNT)) {
    state.rocket.message = "還沒有可以發射的詞";
    render();
    return;
  }
  state.rocket = round;
  prepareRocket(true);
  render();
}

function prepareRocket(speakWord) {
  clearRocketTimers();
  clearRocketDrag();
  const round = state.rocket;
  const item = round.questions[round.index];
  round.token = Date.now();
  round.rocket = item;
  round.fills = {};
  round.bank = rocketBank(item);
  round.activeSlot = null;
  round.activePick = null;
  round.lock = false;
  round.anim = "idle";
  round.countdown = 0;
  round.missKeys = [];
  round.faulted = false;
  round.message = "拖到格子；格子之間可互拖；點一下拿掉";
  if (speakWord && item) audio.play("word", item.id, item.word);
}

function setRocketFill(key, raw) {
  const round = state.rocket;
  if (round.lock || !round.rocket || round.anim !== "idle") return false;
  const slot = rocketSlots(round.rocket).find((item) => item.key === key);
  if (!slot) return false;
  if (slot.kind === "letter") {
    const value = toneValue(raw);
    if (!value || ["ˊ", "ˇ", "ˋ", "˙"].includes(value)) return false;
    round.fills[key] = value;
  } else {
    const mark = toneValue(raw);
    if (!["", "ˊ", "ˇ", "ˋ", "˙"].includes(mark)) return false;
    round.fills[key] = mark;
  }
  round.activeSlot = null;
  round.activePick = null;
  round.missKeys = round.missKeys.filter((item) => item !== key);
  round.message = "拖到格子；格子之間可互拖；點一下拿掉";
  round.snapKey = key;
  render();
  window.setTimeout(() => {
    if (state.rocket.snapKey === key) {
      state.rocket.snapKey = "";
      const node = document.querySelector(`.craft-drop[data-key="${key}"]`);
      node?.classList.remove("snap");
    }
  }, 220);
  if (rocketReady()) confirmRocket();
  return true;
}

function rocketReady() {
  const round = state.rocket;
  return rocketSlots(round.rocket).every((slot) => round.fills[slot.key] !== null && round.fills[slot.key] !== undefined);
}

function confirmRocket() {
  const round = state.rocket;
  if (round.lock || !round.rocket || round.anim !== "idle") return;
  const result = gradeRocket(round.rocket, round.fills);
  if (!result.ok) {
    round.missKeys = result.keys.slice();
    round.activeSlot = result.key || null;
    if (!round.faulted) {
      round.faulted = true;
      round.wrongs += 1;
      round.missed.push({ id: round.rocket.id, word: round.rocket.word, emoji: emojiOf(round.rocket.image) });
    }
    round.message = "再聽一次";
    audio.play("feedback", "again", "再聽一次");
    say(round.message);
    render();
    return;
  }
  round.lock = true;
  round.activeSlot = null;
  round.missKeys = [];
  round.right += 1;
  if (!round.faulted) round.stars += 1;
  round.anim = "success";
  round.message = "組裝完成！";
  burst(true);
  audio.cheer();
  say("組裝完成！");
  render();
  const token = round.token;
  rocketTimer = window.setTimeout(() => {
    if (!rocketAnimLive(token)) return;
    paintRocketAnim("countdown", 3);
    runRocketCountdown(token);
  }, 420);
}

function paintRocketAnim(anim, countdown) {
  const round = state.rocket;
  round.anim = anim;
  if (countdown !== undefined) round.countdown = countdown;
  const launching = ["countdown", "ignite", "liftoff"].includes(anim);
  document.body.classList.toggle("rocket-launching", launching);
  document.body.classList.toggle("rocket-liftoff", anim === "liftoff");
  document.body.classList.toggle("rocket-quake", anim === "countdown" || anim === "ignite");
  const stage = document.querySelector(".rocket-stage");
  const craft = document.querySelector(".craft");
  if (!stage || !craft || state.view !== "rocket") {
    render();
    return;
  }
  stage.className = `stage rocket-stage anim-${anim}`;
  const letters = craft.getAttribute("data-letters") || "";
  craft.className = `craft craft-${anim}`;
  if (letters) craft.setAttribute("data-letters", letters);
  if (anim === "liftoff") {
    void craft.offsetWidth;
  }
  const wrap = craft.closest(".craft-wrap");
  const stack = craft.closest(".craft-stack") || craft;
  let badge = wrap?.querySelector(".rocket-count, .rocket-banner");
  if (anim === "countdown") {
    if (!badge || !badge.classList.contains("rocket-count")) {
      if (badge) badge.remove();
      badge = document.createElement("p");
      badge.className = "rocket-count";
      badge.setAttribute("aria-live", "assertive");
      wrap?.insertBefore(badge, stack);
    }
    badge.textContent = String(round.countdown);
  } else if (anim === "success") {
    if (!badge || !badge.classList.contains("rocket-banner")) {
      if (badge) badge.remove();
      badge = document.createElement("p");
      badge.className = "rocket-banner";
      wrap?.insertBefore(badge, stack);
    }
    badge.textContent = "組裝完成！";
  } else if (badge) {
    badge.remove();
  }
  const hi = document.querySelector(".rocket-stage .say-hi");
  if (hi) {
    if (anim === "liftoff" || anim === "ignite") hi.textContent = "發射！";
    else if (anim === "countdown") hi.textContent = "準備發射";
    else if (anim === "success") hi.textContent = "組裝完成！";
  }
}

function runRocketCountdown(token) {
  rocketTimer = window.setTimeout(() => {
    if (!rocketAnimLive(token)) return;
    const round = state.rocket;
    if (round.countdown > 1) {
      paintRocketAnim("countdown", round.countdown - 1);
      runRocketCountdown(token);
      return;
    }
    paintRocketAnim("ignite", 0);
    rocketTimer = window.setTimeout(() => {
      if (!rocketAnimLive(token)) return;
      paintRocketAnim("liftoff", 0);
      rocketTimer = window.setTimeout(() => {
        if (!rocketAnimLive(token)) return;
        advanceRocket();
      }, 1100);
    }, 420);
  }, 320);
}

function advanceRocket() {
  clearRocketTimers();
  const round = state.rocket;
  round.anim = "idle";
  round.lock = false;
  round.countdown = 0;
  round.index += 1;
  if (round.index >= round.questions.length) {
    if (!appendRocketQuestions(round, ROCKET_COUNT)) {
      round.phase = "done";
      rewardRound(round);
      progress.visit("rocket");
      render();
      return;
    }
  }
  if (round.right > 0 && round.right % ROCKET_COUNT === 0) {
    round.rewarded = false;
    rewardRound(round);
    progress.visit("rocket");
  }
  prepareRocket(true);
  render();
}

function prepareStep(speakWord) {
  const round = state.boss;
  syncBossQuestion();
  const word = currentWord();
  const syllable = currentSyllable();
  round.hint = 0;
  round.solved = false;
  round.lock = false;
  round.message = "";
  round.miss = "";
  if (!round.picks.length) round.picks = word.syllables.map(() => emptyPick());
  if (round.kind === "tone") {
    round.picks[0] = {
      initial: syllable.initial || "",
      medial: syllable.medial || "",
      final: syllable.final || "",
      tone: null
    };
  }
  fillEmptyParts(round.picks[round.step] || round.picks[0], syllable);
  round.choices = {};
  if (round.kind === "build") {
    for (const part of pickParts(round.stage, syllable)) {
      round.choices[part] = partChoices(part, syllable[part] || "", round.stage).filter(Boolean);
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
    rollExample(false);
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
  if (act === "example-next") {
    rollExample(true);
    if (state.learn.quiz?.solved) state.learn.quiz = null;
    if (state.learn.mode === "picture") makeQuiz();
    render();
    playExample(currentSymbol().id);
  }
  if (act === "learn-random") {
    const list = learnItems();
    state.learn.quiz = null;
    let next = state.learn.index;
    if (list.length > 1) {
      while (next === state.learn.index) next = Math.floor(Math.random() * list.length);
    }
    state.learn.index = next;
    rollExample(false);
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
  if (act === "rocket-start") startRocket();
  if (act === "rocket-replay" && state.rocket.rocket) {
    audio.play("word", state.rocket.rocket.id, state.rocket.rocket.word);
  }
  if (act === "rocket-slot") {
    const round = state.rocket;
    if (round.lock || round.anim !== "idle") return;
    const key = button.dataset.key;
    const kind = button.dataset.kind;
    const filled = round.fills[key] !== null && round.fills[key] !== undefined;
    if (round.activePick && round.activePick.kind === kind) {
      setRocketFill(key, kind === "tone" ? toneChip(round.activePick.value) : round.activePick.value);
      return;
    }
    if (filled) {
      clearRocketSlot(key);
      say("已拿掉");
      render();
      return;
    }
    round.activeSlot = round.activeSlot === key ? null : key;
    round.activePick = null;
    round.message = round.activeSlot ? "再選左邊的零件" : "拖到格子；格子之間可互拖；點一下拿掉";
    render();
  }
  if (act === "rocket-pick") {
    const round = state.rocket;
    if (round.lock || round.anim !== "idle") return;
    const kind = button.dataset.kind;
    const value = toneValue(button.dataset.value);
    if (round.activeSlot) {
      const slot = rocketSlots(round.rocket).find((item) => item.key === round.activeSlot);
      if (slot && slot.kind === kind) {
        setRocketFill(round.activeSlot, button.dataset.value);
        return;
      }
      if (slot && slot.kind !== kind) {
        round.message = slot.kind === "tone" ? "這裡要放聲調翅膀" : "這裡要放注音節";
        say(round.message);
        render();
        return;
      }
    }
    if (round.activePick?.kind === kind && round.activePick.value === value) round.activePick = null;
    else round.activePick = { kind, value };
    round.message = round.activePick ? "再點火箭上的空格" : "拖到格子；格子之間可互拖；點一下拿掉";
    render();
  }
  if (act === "rocket-practice") {
    const word = words.find((item) => item.id === button.dataset.id);
    if (!word) return;
    const rocket = toRocketWord(word);
    if (!rocket) return;
    clearRocketTimers();
    state.rocket = {
      ...freshRocket(),
      phase: "play",
      total: 1,
      questions: [rocket]
    };
    prepareRocket(true);
    render();
  }
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
}

document.addEventListener("click", onClick);
document.addEventListener("pointerdown", (event) => {
  audio?.unlock();
  if (state.view === "learn" && event.isPrimary !== false) {
    swipe = { x: event.clientX, y: event.clientY, pointer: event.pointerId };
  }
  if (event.isPrimary === false) return;
  if (state.view === "rocket" && state.rocket.anim === "idle" && !state.rocket.lock) {
    const piece = event.target.closest("[data-rocket-piece]");
    if (piece && !piece.disabled) {
      rocketDrag = {
        kind: piece.dataset.kind,
        value: piece.dataset.value,
        fromKey: "",
        hotKey: "",
        x: event.clientX,
        y: event.clientY,
        moved: false,
        pointer: event.pointerId,
        text: rocketPieceGhostText(piece)
      };
      try { piece.setPointerCapture(event.pointerId); } catch (error) { /* ignore */ }
      return;
    }
    const filledDrop = event.target.closest(".craft-drop.filled");
    if (filledDrop && !filledDrop.disabled) {
      const key = filledDrop.dataset.key;
      const kind = filledDrop.dataset.kind;
      const raw = state.rocket.fills[key];
      if (raw !== null && raw !== undefined) {
        rocketDrag = {
          kind,
          value: kind === "tone" ? toneChip(raw) : raw,
          fromKey: key,
          hotKey: "",
          x: event.clientX,
          y: event.clientY,
          moved: false,
          pointer: event.pointerId,
          text: rocketFillGhostText(kind, raw)
        };
        try { filledDrop.setPointerCapture(event.pointerId); } catch (error) { /* ignore */ }
        return;
      }
    }
  }
  const card = event.target.closest("[data-card]");
  if (!card) return;
  if (state.view === "boss" && state.boss.kind === "build") {
    drag = { mode: "boss", part: card.dataset.part, value: card.dataset.value, x: event.clientX, y: event.clientY, moved: false, pointer: event.pointerId, text: card.textContent.trim() };
    try { card.setPointerCapture(event.pointerId); } catch (error) { /* 未信任的事件不抓指標 */ }
  }
}, { passive: true });

document.addEventListener("pointermove", (event) => {
  if (rocketDrag && event.pointerId === rocketDrag.pointer) {
    const dist = Math.hypot(event.clientX - rocketDrag.x, event.clientY - rocketDrag.y);
    if (dist > 6) {
      rocketDrag.moved = true;
      document.body.classList.add("rocket-dragging");
      if (rocketDrag.fromKey) {
        document.querySelector(`.craft-drop[data-key="${rocketDrag.fromKey}"]`)?.classList.add("is-lifted");
      }
      const ghost = document.querySelector("#ghost");
      ghost.hidden = false;
      ghost.textContent = rocketDrag.text;
      ghost.style.left = `${event.clientX}px`;
      ghost.style.top = `${event.clientY}px`;
      document.querySelectorAll(".craft-drop.hot").forEach((node) => node.classList.remove("hot"));
      const aim = rocketAimPoint(event.clientX, event.clientY);
      const drop = rocketDropAt(aim.x, aim.y, rocketDrag.kind, rocketDrag.fromKey || "");
      rocketDrag.hotKey = drop?.dataset.key || "";
      if (drop) drop.classList.add("hot");
      event.preventDefault();
    }
    return;
  }
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
  if (rocketDrag && event.pointerId === rocketDrag.pointer) {
    const info = rocketDrag;
    clearRocketDrag();
    if (!info.moved) return;
    suppressClick = true;
    window.setTimeout(() => { suppressClick = false; }, 0);
    if (state.view !== "rocket" || state.rocket.anim !== "idle" || state.rocket.lock) return;
    const drop = rocketDropFromDrag(info, event.clientX, event.clientY);
    if (info.fromKey) {
      if (drop) moveRocketFill(info.fromKey, drop.dataset.key);
      return;
    }
    if (drop) {
      setRocketFill(drop.dataset.key, info.value);
    } else {
      state.rocket.message = "靠近格子再放；格子可互拖，點一下拿掉";
      render();
    }
    return;
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
  if (slot && info.mode === "boss" && slot.dataset.part === info.part) setPick(info.part, info.value);
});

document.addEventListener("pointercancel", (event) => {
  if (swipe && event.pointerId === swipe.pointer) swipe = null;
  if (rocketDrag && event.pointerId === rocketDrag.pointer) clearRocketDrag();
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
      fetch("data/symbol-examples.json?v=2").then((response) => response.json())
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
