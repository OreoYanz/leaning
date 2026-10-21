const PREFERRED = ["zh-TW-HsiaoChenNeural", "zh-TW-HsiaoYuNeural", "zh-TW-YunJheNeural"];

/* 極短靜音，用來在 Safari 手勢內解鎖 HTMLAudio */
const SILENT_AUDIO =
  "data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAADhAC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAA4T5xeQCAAAAAAAAAAAAAAAAAAAA//sQZAAP8AAAaQAAAAAAAAAgAAAA0AAAAIAAAGkAAAAAAAAAIAAAA0TExMTcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxc=";

function scoreVoice(voice) {
  const lang = (voice.lang || "").toLowerCase().replace("_", "-");
  const name = voice.name || "";
  if (lang === "zh-tw" || lang.startsWith("zh-tw")) return PREFERRED.some((item) => name.includes(item)) ? 0 : 1;
  if (lang === "zh-hk" || lang.startsWith("zh-hk")) return 2;
  if (lang === "zh-cn" || lang.startsWith("zh-cn") || lang === "zh" || lang.startsWith("zh-")) return 5;
  return 9;
}

export function createAudio({ manifest, dev = false } = {}) {
  const table = new Map((manifest?.items || []).map((item) => [`${item.kind}:${item.id}`, item]));
  const missing = (manifest?.items || []).filter((item) => item.status !== "ready");
  let token = 0;
  let current = null;
  let muted = false;
  let unlocked = false;
  let voices = [];
  let lastUtter = null;
  let context = null;
  let unlockAudio = null;
  let safariKeepAlive = 0;

  function refreshVoices() {
    voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
  }

  if (typeof window !== "undefined" && window.speechSynthesis) {
    refreshVoices();
    window.speechSynthesis.addEventListener?.("voiceschanged", refreshVoices);
    window.speechSynthesis.onvoiceschanged = refreshVoices;
  }

  function pickVoice() {
    refreshVoices();
    return voices
      .filter((voice) => scoreVoice(voice) < 9)
      .sort((a, b) => scoreVoice(a) - scoreVoice(b) || a.lang.localeCompare(b.lang))[0] || null;
  }

  function stopMedia() {
    if (current) {
      try {
        current.pause();
        current.removeAttribute("src");
        current.load?.();
      } catch (error) {
        /* ignore */
      }
      current = null;
    }
  }

  function stopSpeech() {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch (error) {
        /* ignore */
      }
    }
  }

  function stop() {
    token += 1;
    stopMedia();
    stopSpeech();
  }

  function ensureContext() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      context = context || new Ctx();
      context.resume?.();
      return context;
    } catch (error) {
      return null;
    }
  }

  function unlockSpeech() {
    const synth = window.speechSynthesis;
    if (!synth || typeof SpeechSynthesisUtterance === "undefined") return;
    try {
      synth.cancel();
      const warm = new SpeechSynthesisUtterance(" ");
      warm.volume = 0;
      warm.rate = 2;
      warm.lang = "zh-TW";
      const voice = pickVoice();
      if (voice) warm.voice = voice;
      synth.speak(warm);
      synth.cancel();
    } catch (error) {
      /* ignore */
    }
  }

  function unlock() {
    unlocked = true;
    ensureContext();
    try {
      unlockAudio = unlockAudio || new Audio(SILENT_AUDIO);
      unlockAudio.playsInline = true;
      unlockAudio.muted = true;
      unlockAudio.play()?.catch?.(() => {});
    } catch (error) {
      /* ignore */
    }
    unlockSpeech();
    /* Safari 長句朗讀有時會卡住，週期 resume 維持 */
    if (!safariKeepAlive && typeof window !== "undefined" && window.speechSynthesis) {
      safariKeepAlive = window.setInterval(() => {
        const synth = window.speechSynthesis;
        if (!synth) return;
        if (synth.speaking && !synth.paused) {
          try {
            synth.pause();
            synth.resume();
          } catch (error) {
            /* ignore */
          }
        }
      }, 8000);
    }
  }

  function blip(freqs, length, step = 0, volume = 0.08) {
    try {
      const ctx = ensureContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      freqs.forEach((freq, index) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = now + index * step;
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(volume, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + length + 0.02);
      });
    } catch (error) {
      console.warn("音效無法播放", error);
    }
  }

  function wait(ms, myToken) {
    return new Promise((resolve) => {
      window.setTimeout(() => resolve(myToken === token), ms);
    });
  }

  function speakOnce(text, rate, myToken) {
    return new Promise((resolve) => {
      const synth = window.speechSynthesis;
      if (!synth || typeof SpeechSynthesisUtterance === "undefined") {
        console.warn("這個瀏覽器沒有語音朗讀", text);
        resolve(false);
        return;
      }
      refreshVoices();
      const voice = pickVoice();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = voice?.lang || "zh-TW";
      utter.rate = rate;
      /* Safari：沒找到中文語音也要講，交給系統預設 */
      if (voice) utter.voice = voice;
      lastUtter = utter;
      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        resolve(ok && myToken === token);
      };
      utter.onend = () => finish(true);
      utter.onerror = () => {
        console.warn("語音播放失敗", text);
        finish(false);
      };
      try {
        synth.resume?.();
        synth.speak(utter);
        /* 部分 Safari 不會觸發 onend，用超時保險 */
        const guess = Math.max(1200, String(text).length * 420);
        window.setTimeout(() => finish(true), guess);
      } catch (error) {
        console.warn("語音播放失敗", text, error);
        finish(false);
      }
    });
  }

  async function speak(text, myToken, { rate = 0.86, gap = 0 } = {}) {
    if (!text) return false;
    const parts = gap > 0 ? [...text].filter((ch) => ch.trim()) : [text];
    if (!parts.length) return false;
    /* 不在第一句前延遲，否則 Safari 會丟掉使用者手勢而靜音 */
    for (let i = 0; i < parts.length; i += 1) {
      if (myToken !== token) return false;
      if (!(await speakOnce(parts[i], rate, myToken))) return false;
      if (gap > 0 && i < parts.length - 1 && !(await wait(gap, myToken))) return false;
    }
    return myToken === token;
  }

  async function playFile(file, myToken) {
    stopMedia();
    const audio = new Audio();
    audio.playsInline = true;
    audio.preload = "auto";
    audio.src = file;
    current = audio;
    audio.volume = 1;
    try {
      await audio.play();
    } catch (error) {
      console.warn("音檔無法播放", file, error);
      return false;
    }
    return new Promise((resolve) => {
      let settled = false;
      const finish = (ok) => {
        if (settled) return;
        settled = true;
        resolve(ok && myToken === token);
      };
      audio.onended = () => finish(true);
      audio.onerror = () => {
        console.warn("音檔讀取失敗", file);
        finish(false);
      };
    });
  }

  return {
    preferredVoices: PREFERRED,
    missing,
    unlock,
    setMuted(value) {
      muted = value;
      if (muted) stop();
    },
    get muted() {
      return muted;
    },
    stop,
    click() {
      unlock();
      if (muted) return;
      blip([620], 0.12);
    },
    cheer() {
      unlock();
      if (muted) return;
      blip([523, 659, 784], 0.22, 0.12, 0.2);
    },
    async play(kind, id, fallbackText) {
      unlock();
      const myToken = ++token;
      stopMedia();
      stopSpeech();
      if (muted) return false;
      const item = table.get(`${kind}:${id}`);
      const text = item?.speak || fallbackText || "";
      if (item?.status === "ready" && item.file) {
        const ok = await playFile(item.file, myToken);
        if (ok || myToken !== token) return ok;
        /* 音檔失敗時立刻改朗讀，仍盡量在同一手勢鏈 */
      } else if (dev && item) {
        console.info(`缺少音檔 ${item.file}，改用瀏覽器朗讀`);
      } else if (!item && dev) {
        console.info(`沒有音檔清單項目 ${kind}:${id}`);
      }
      if (!text) return false;
      const paced = kind === "word" || kind === "feedback";
      return speak(text, myToken, paced ? { rate: 0.78, gap: 0 } : { rate: 0.9 });
    }
  };
}
