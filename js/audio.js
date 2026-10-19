const PREFERRED = ["zh-TW-HsiaoChenNeural", "zh-TW-HsiaoYuNeural", "zh-TW-YunJheNeural"];

function scoreVoice(voice) {
  const lang = (voice.lang || "").toLowerCase();
  const name = voice.name || "";
  if (lang === "zh-tw" || lang.startsWith("zh-tw")) return PREFERRED.some((item) => name.includes(item)) ? 0 : 1;
  if (lang.startsWith("zh")) return 5;
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

  function stop() {
    token += 1;
    if (current) {
      current.pause?.();
      current.src = "";
      current = null;
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }

  function blip(freqs, length, step = 0, volume = 0.08) {
    try {
      context = context || new AudioContext();
      context.resume?.();
      const now = context.currentTime;
      freqs.forEach((freq, index) => {
        const osc = context.createOscillator();
        const gain = context.createGain();
        const start = now + index * step;
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(volume, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
        osc.connect(gain).connect(context.destination);
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
      const voice = pickVoice();
      if (!voice) {
        console.warn("找不到 zh-TW 語音", text);
        resolve(false);
        return;
      }
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = "zh-TW";
      utter.voice = voice;
      utter.rate = rate;
      lastUtter = utter;
      utter.onend = () => resolve(myToken === token);
      utter.onerror = () => {
        console.warn("語音播放失敗", text);
        resolve(false);
      };
      synth.resume?.();
      synth.speak(utter);
    });
  }

  async function speak(text, myToken, { rate = 0.86, gap = 0 } = {}) {
    if (!text) return false;
    const parts = gap > 0 ? [...text].filter((ch) => ch.trim()) : [text];
    if (!parts.length) return false;
    if (!(await wait(60, myToken))) return false;
    for (let i = 0; i < parts.length; i += 1) {
      if (myToken !== token) return false;
      if (!(await speakOnce(parts[i], rate, myToken))) return false;
      if (gap > 0 && i < parts.length - 1 && !(await wait(gap, myToken))) return false;
    }
    return myToken === token;
  }

  async function playFile(file, myToken) {
    const audio = new Audio(file);
    current = audio;
    audio.volume = 1;
    try {
      await audio.play();
    } catch (error) {
      console.warn("音檔無法播放", file, error);
      return false;
    }
    return new Promise((resolve) => {
      audio.onended = () => resolve(myToken === token);
      audio.onerror = () => {
        console.warn("音檔讀取失敗", file);
        resolve(false);
      };
    });
  }

  return {
    preferredVoices: PREFERRED,
    missing,
    unlock() {
      unlocked = true;
    },
    setMuted(value) {
      muted = value;
      if (muted) stop();
    },
    get muted() {
      return muted;
    },
    stop,
    click() {
      if (muted || !unlocked) return;
      blip([620], 0.12);
    },
    cheer() {
      if (muted || !unlocked) return;
      blip([523, 659, 784], 0.22, 0.12, 0.2);
    },
    async play(kind, id, fallbackText) {
      const myToken = ++token;
      if (current) {
        current.pause?.();
        current = null;
      }
      if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
      if (muted) return false;
      const item = table.get(`${kind}:${id}`);
      if (item?.status === "ready" && item.file) {
        const ok = await playFile(item.file, myToken);
        if (ok || myToken !== token) return ok;
      } else if (dev && item) {
        console.info(`缺少音檔 ${item.file}，改用瀏覽器朗讀`);
      } else if (!item) {
        console.info(`沒有音檔清單項目 ${kind}:${id}`);
      }
      if (!unlocked) return false;
      const paced = kind === "word" || kind === "feedback";
      return speak(item?.speak || fallbackText || "", myToken, paced ? { rate: 0.7, gap: 0 } : {});
    }
  };
}
