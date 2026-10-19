import { readFileSync, writeFileSync } from "node:fs";

const symbols = JSON.parse(readFileSync(new URL("../data/symbols.json", import.meta.url)));
const words = JSON.parse(readFileSync(new URL("../data/words.json", import.meta.url)));

// 檔名對應來自手冊 HTML：黃色格子 play('a1')…play('a37') 對到 audio/F1.WAV…F37.WAV。
const officialSymbolAudio = {
  "ㄅ": "F1.WAV", "ㄆ": "F2.WAV", "ㄇ": "F3.WAV", "ㄈ": "F4.WAV",
  "ㄉ": "F5.WAV", "ㄊ": "F6.WAV", "ㄋ": "F7.WAV", "ㄌ": "F8.WAV",
  "ㄍ": "F9.WAV", "ㄎ": "F10.WAV", "ㄏ": "F11.WAV", "ㄐ": "F12.WAV",
  "ㄑ": "F13.WAV", "ㄒ": "F14.WAV", "ㄓ": "F15.WAV", "ㄔ": "F16.WAV",
  "ㄕ": "F17.WAV", "ㄖ": "F18.WAV", "ㄗ": "F19.WAV", "ㄘ": "F20.WAV",
  "ㄙ": "F21.WAV", "ㄚ": "F22.WAV", "ㄛ": "F23.WAV", "ㄜ": "F24.WAV",
  "ㄝ": "F25.WAV", "ㄞ": "F26.WAV", "ㄟ": "F27.WAV", "ㄠ": "F28.WAV",
  "ㄡ": "F29.WAV", "ㄢ": "F30.WAV", "ㄣ": "F31.WAV", "ㄤ": "F32.WAV",
  "ㄥ": "F33.WAV", "ㄦ": "F34.WAV", "ㄧ": "F35.WAV", "ㄨ": "F36.WAV",
  "ㄩ": "F37.WAV"
};

const items = [
  ...symbols.map((symbol) => {
    const originalName = officialSymbolAudio[symbol.id];
    if (!originalName) throw new Error(`沒有官方音檔對應 ${symbol.id}`);
    return {
      kind: "symbol",
      id: symbol.id,
      file: `audio/symbols/${originalName}`,
      speak: symbol.call,
      status: "ready",
      source: "教育部《國語注音符號手冊》開放部件",
      license: "CC BY 4.0",
      originalName,
      note: "檔名與內容未改。對應依手冊 HTML 的播放標記。尚未人工試聽，不能把備援呼讀字當成已核對的讀音。"
    };
  }),
  ...words.map((word) => ({
    kind: "word",
    id: word.id,
    file: word.audio,
    speak: word.word,
    status: "missing"
  })),
  { kind: "feedback", id: "good", file: "audio/feedback/good.mp3", speak: "你好棒", status: "missing" },
  { kind: "feedback", id: "again", file: "audio/feedback/again.mp3", speak: "再聽一次", status: "missing" },
  { kind: "feedback", id: "look", file: "audio/feedback/look.mp3", speak: "再看看", status: "missing" },
  { kind: "feedback", id: "yes", file: "audio/feedback/yes.mp3", speak: "是這個", status: "missing" },
  { kind: "instruction", id: "listen", file: "audio/instruction/listen.mp3", speak: "聽一聽，點出一樣的", status: "missing" },
  { kind: "instruction", id: "blend", file: "audio/instruction/blend.mp3", speak: "拼一拼", status: "missing" },
  { kind: "instruction", id: "home", file: "audio/instruction/home.mp3", speak: "選一個遊戲", status: "missing" }
];

const manifest = {
  preferredVoices: ["zh-TW-HsiaoChenNeural", "zh-TW-HsiaoYuNeural", "zh-TW-YunJheNeural"],
  items
};

writeFileSync(new URL("../data/audio-manifest.json", import.meta.url), `${JSON.stringify(manifest, null, 2)}\n`);
const ready = items.filter((item) => item.status === "ready").length;
console.log(`音檔清單 ${items.length} 筆，已對上官方注音 ${ready} 筆`);
