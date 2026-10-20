import { readFileSync } from "node:fs";
import {
  containsSymbol,
  emptyPick,
  exampleIssues,
  formatSyllable,
  formatWord,
  gradeBuild,
  gradeRocket,
  COIN_SHORT,
  GACHA_COST,
  gachaPull,
  gradeWord,
  hanMarkup,
  hanPlan,
  LEARNING_LOOPS,
  learnQuestion,
  listenChoiceCount,
  partChoices,
  recallQuestion,
  rocketBank,
  rocketSlots,
  structureIssues,
  syllableStage,
  takeOptions,
  teachingSpot,
  toRocketWord,
  wordStage,
  wrongKeepsGoing
} from "../js/logic.js";
import { createProgress } from "../js/progress.js";

const words = JSON.parse(readFileSync(new URL("../data/words.json", import.meta.url)));
let failed = 0;

function check(name, ok) {
  if (!ok) {
    failed += 1;
    console.error(`失敗 ${name}`);
  }
}

const dad = words.find((word) => word.word === "爸爸");
check("爸爸注音", formatWord(dad) === "ㄅㄚˋ ˙ㄅㄚ");
check("輕聲點在前面", formatSyllable(dad.syllables[1]) === "˙ㄅㄚ");
check("子是空韻", structureIssues(words.find((word) => word.word === "杯子").syllables[1]).length === 0);
check("衣可以沒有聲母", structureIssues({ initial: "", medial: "", final: "ㄧ", tone: 1 }).length === 0);
check("ㄢ可以獨立", structureIssues({ initial: "", medial: "", final: "ㄢ", tone: 1 }).length === 0 && syllableStage({ initial: "", medial: "", final: "ㄢ", tone: 1 }) >= 3);
check("ㄐ不能直接拼ㄚ", structureIssues({ initial: "ㄐ", medial: "", final: "ㄚ", tone: 1 }).length > 0);
check("家的結構可通過", structureIssues({ initial: "ㄐ", medial: "ㄧ", final: "ㄚ", tone: 1 }).length === 0);

const ba = words.find((word) => word.word === "八");
check("八在第一關", wordStage(ba) === 1);
check("八答對", gradeBuild(ba.syllables[0], { initial: "ㄅ", medial: "", final: "ㄚ", tone: 1 }, 1).ok);
check("八韻母錯", !gradeBuild(ba.syllables[0], { initial: "ㄅ", medial: "", final: "ㄛ", tone: 1 }, 1).ok);
check("還沒選輕聲不算對", !gradeBuild({ initial: "ㄗ", medial: "", final: "", tone: 0 }, { initial: "ㄗ", medial: "", final: "", tone: null }, 5).ok);
check("空白選擇不算答對", !gradeBuild(ba.syllables[0], emptyPick(), 1).ok);

const picks = dad.syllables.map((syllable) => ({ ...syllable }));
check("爸爸整詞答對", gradeWord(dad, picks, 5).ok);
check("爸爸聲母錯", !gradeWord(dad, [{ ...picks[0], initial: "ㄆ" }, picks[1]], 5).ok);

for (const word of words.filter((item) => item.status === "approved")) {
  const stage = wordStage(word);
  const own = word.syllables.map((syllable) => ({ ...syllable }));
  if (stage < 5) {
    check(`${word.word} 自測`, gradeWord(word, [own[0]], stage).ok);
    check(`${word.word} 錯答案`, !gradeWord(word, [{ ...own[0], final: own[0].final === "ㄚ" ? "ㄛ" : "ㄚ" }], stage).ok);
  } else {
    check(`${word.word} 自測`, gradeWord(word, own, 5).ok);
  }
}

const options = takeOptions(["ㄅ", "ㄆ", "ㄇ", "ㄈ"], "ㄅ", 2, () => 0.5);
check("選項含答案", options.includes("ㄅ") && options.length === 2);
check("第一關四個選項", partChoices("initial", "ㄅ", 1, () => 0.2).length === 4);
check("空韻可以選沒有韻母", partChoices("final", "", 5).includes(""));
check("熟悉前兩個選項", listenChoiceCount({ listenAsked: 1, listenRecent: [] }) === 2);
check("連續答對變四個", listenChoiceCount({ listenAsked: 8, listenRecent: [true, true, true, true, true, true] }) === 4);

const memory = {
  value: "",
  getItem() { return this.value; },
  setItem(key, value) { this.value = value; },
  removeItem() { this.value = ""; }
};
const progress = createProgress(memory);
progress.markSymbol("ㄅ", false);
progress.markListen(true);
progress.visit("boss");
const again = createProgress(memory);
check("進度可恢復", again.symbol("ㄅ").wrong === 1 && again.get().listenAsked === 1 && again.get().lastMode === "boss");
again.reset();
check("進度可清除", again.get().listenAsked === 0 && memory.value === "");
again.note("ㄆ", false, false);
again.note("ㄇ", true, true);
const saved = createProgress(memory);
check("答錯會再複習", saved.get().review[0] === "ㄇ" || saved.get().review.includes("ㄆ"));
check("慢答也會再出現", saved.symbol("ㄇ").slow === 1);
const bank = createProgress({ value: "", getItem() { return this.value; }, setItem(key, value) { this.value = value; }, removeItem() { this.value = ""; } });
check("一開始有 0 個金幣", bank.get().coins === 0);
const giftBox = { value: JSON.stringify({ avatar: "shiro", coins: 100, unlocked: ["shiro"] }), getItem() { return this.value; }, setItem(key, value) { this.value = value; } };
check("測試用的 100 個金幣改回 0", createProgress(giftBox).get().coins === 0);
const kept = { value: JSON.stringify({ avatar: "mimi", coins: 3, unlocked: ["shiro", "mimi"] }), getItem() { return this.value; }, setItem(key, value) { this.value = value; } };
check("已經花過的金幣保持原數", createProgress(kept).get().coins === 3);
bank.setPref("coins", 0);
check("做完一輪得到一個金幣", bank.addCoin() === 1 && bank.get().coins === 1);
check("十個金幣才能解鎖", bank.grantUnlock("mimi", GACHA_COST) === false && bank.get().unlocked.includes("shiro"));
for (let i = 0; i < 9; i += 1) bank.addCoin();
check("扭蛋會解鎖頭像", bank.grantUnlock("mimi", GACHA_COST) && bank.get().coins === 0 && bank.get().avatar === "mimi" && bank.get().unlocked.includes("mimi"));
check("扭蛋不會重複扣金幣", bank.grantUnlock("mimi", GACHA_COST) === false);
const ids = ["shiro", "mimi", "tiao"];
const shortMarkup = hanMarkup(COIN_SHORT);
check("金幣不足注音", formatWord(COIN_SHORT) === "ㄐㄧㄣ ㄅㄧˋ ㄅㄨˋ ㄗㄨˊ" && shortMarkup.includes(">ㄐ<") && shortMarkup.includes(">ㄣ<") && shortMarkup.includes("ˊ"));
check("扭蛋只抽還沒有的", gachaPull(["shiro"], ids, () => 0) === "mimi");
check("夥伴到齊就不再扭", gachaPull(ids, ids, () => 0) === "");

const cup = words.find((word) => word.word === "杯子");
const turtle = { word: "烏龜", zhuyin: "ㄨ ㄍㄨㄟ", emoji: "🐢", syllables: [{ initial: "", medial: "", final: "ㄨ", tone: 1 }, { initial: "ㄍ", medial: "ㄨ", final: "ㄟ", tone: 1 }] };
const bread = words.find((word) => word.word === "麵包");
check("杯子含有ㄗ但不是開頭", containsSymbol(cup, "ㄗ") && teachingSpot("sheng", "ㄗ", cup) === null);
check("爸爸是ㄅ的開頭", teachingSpot("sheng", "ㄅ", dad)?.part === "initial");
check("麵包的ㄅ不在第一個音", teachingSpot("sheng", "ㄅ", bread) === null);
check("兔子不是ㄨ的直接示範", teachingSpot("jie", "ㄨ", words.find((word) => word.word === "兔子")) === null);
check("烏龜直接示範ㄨ", teachingSpot("jie", "ㄨ", turtle)?.part === "final");
check("葉子在第一音示範ㄝ", teachingSpot("yun", "ㄝ", words.find((word) => word.word === "葉子"))?.part === "final");
check("未核對不能標成已確認", exampleIssues({ id: "ㄅ", group: "sheng" }, { ...dad, target: "ㄅ", spot: { index: 0, part: "initial" }, checked: true, review: "developer" }).some((issue) => issue.includes("尚未核對")));

const apple = words.find((word) => word.word === "蘋果");
const banana = words.find((word) => word.word === "香蕉");
const dadPlan = hanPlan(dad);
const applePlan = hanPlan(apple);
check("爸爸逐字對應", dadPlan.ok && dadPlan.cells.length === 2 && dadPlan.cells[0].char === "爸" && dadPlan.cells[1].char === "爸");
check("四聲有聲調符號", dadPlan.cells[0].toneMark === "ˋ" && dadPlan.cells[0].light === false && dadPlan.cells[0].symbols.at(-1) === "ㄚ");
check("輕聲點在音節上方", dadPlan.cells[1].light === true && dadPlan.cells[1].toneMark === "");
check("二聲位置", applePlan.cells[0].toneMark === "ˊ" && applePlan.cells[0].symbols.join("") === "ㄆㄧㄥ");
check("三聲位置", hanPlan(words.find((word) => word.word === "狗")).cells[0].toneMark === "ˇ");
check("香蕉沒有一聲符號", hanPlan(banana).cells.every((cell) => cell.toneMark === "" && cell.light === false) && hanPlan(banana).cells.length === 2);
const mismatch = hanPlan({ word: "爸爸", zhuyin: "ㄅㄚˋ", syllables: [dad.syllables[0]] });
check("字數不一致不會排版", mismatch.ok === false && !hanMarkup({ word: "爸爸", zhuyin: "ㄅㄚˋ", syllables: [dad.syllables[0]] }).includes("ㄅ"));
check("缺少注音會被標出", hanMarkup({ word: "爸爸", syllables: [] }).includes('data-han="missing"'));
const dadHtml = hanMarkup(dad);
check("四聲標在注音中間偏右", dadHtml.includes("<span class=\"han-stack\">") && dadHtml.includes("</span><i class=\"tone-mark\">ˋ</i></span>"));
check("輕聲標在直排上方", dadHtml.includes("<span class=\"tone-light\">˙</span><span class=\"han-zy-body\">"));

const bExamples = [
  { word: "爸爸", emoji: "👨", syllables: dad.syllables },
  { word: "杯子", emoji: "🥤", syllables: cup.syllables }
];
const otherExamples = [apple, banana, words.find((word) => word.word === "魚")];
const learn = learnQuestion({ id: "ㄅ", group: "sheng" }, bExamples, otherExamples, () => 0.2);
check("認識題要自己選", learn.options.some((item) => item.word === learn.answer) && learn.options.length >= 2);
check("干擾項不是同一個開頭", learn.options.filter((item) => item.word !== learn.answer).every((item) => !teachingSpot("sheng", "ㄅ", item)));
const firstRecall = recallQuestion({ id: "ㄅ", group: "sheng" }, bExamples, otherExamples, [], () => 0.2);
const secondRecall = recallQuestion({ id: "ㄅ", group: "sheng" }, bExamples, otherExamples, [firstRecall.answer], () => 0.2);
check("複習會換例詞", firstRecall.answer !== secondRecall.answer);
check("答錯後仍可繼續", wrongKeepsGoing(1).blocked === false && wrongKeepsGoing(1).hint && wrongKeepsGoing(2).reveal);
check("四種玩法都有回想", ["learn", "listen", "boss", "rocket"].every((name) => LEARNING_LOOPS[name]));

const appleRocket = toRocketWord(words.find((word) => word.word === "蘋果"));
check("蘋果火箭字數", appleRocket?.characters.length === 2);
check("蘋果火箭注音段", appleRocket.characters[0].letters.join("") === "ㄆㄧㄥ" && appleRocket.characters[1].letters.join("") === "ㄍㄨㄛ");
check("蘋果火箭聲調翼", appleRocket.characters[0].tone === "ˊ" && appleRocket.characters[1].tone === "ˇ");
const appleSlots = rocketSlots(appleRocket);
check("蘋果火箭零件數", appleSlots.filter((item) => item.kind === "letter").length === 6 && appleSlots.filter((item) => item.kind === "tone").length === 2);
const appleFills = Object.fromEntries(appleSlots.map((slot) => [slot.key, slot.answer]));
check("蘋果火箭可發射", gradeRocket(appleRocket, appleFills).ok);
check("蘋果火箭缺件不可發射", !gradeRocket(appleRocket, {}).ok);
const badFills = { ...appleFills, "T0": "ˇ" };
check("蘋果火箭錯聲調會標出", gradeRocket(appleRocket, badFills).keys.includes("T0") && !gradeRocket(appleRocket, badFills).ok);
const appleBank = rocketBank(appleRocket, () => 0.2);
check("蘋果火箭零件庫有正確注音", ["ㄆ", "ㄧ", "ㄥ", "ㄍ", "ㄨ", "ㄛ"].every((mark) => appleBank.letters.includes(mark)));
check("蘋果火箭聲調庫有二三聲", appleBank.tones.includes("ˊ") && appleBank.tones.includes("ˇ"));
const bananaRocket = toRocketWord(words.find((word) => word.word === "香蕉"));
check("一聲火箭翼是空的", bananaRocket.characters.every((item) => item.tone === ""));
const lightRocket = toRocketWord(words.find((word) => word.word === "杯子"));
check("輕聲火箭翼在點", lightRocket.characters[1].tone === "˙");

const uiSource = `${readFileSync(new URL("../js/main.js", import.meta.url), "utf8")}\n${readFileSync(new URL("../js/logic.js", import.meta.url), "utf8")}`;
const actions = [...uiSource.matchAll(/data-act="([a-z-]+)"/g)].map((match) => match[1]);
const missingActions = [...new Set(actions)].filter((act) => uiSource.split(`"${act}"`).length < 3);
check("每個按鈕都有作用", missingActions.length === 0);

if (failed) {
  console.error(`共 ${failed} 項失敗`);
  process.exit(1);
}
console.log("邏輯測試通過");
