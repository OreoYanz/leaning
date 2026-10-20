const KEY = "zhuyin-school-progress-v1";

function empty() {
  return {
    symbols: {},
    review: [],
    listenRecent: [],
    listenAsked: 0,
    listenCorrect: 0,
    bossClears: 0,
    lastMode: "",
    lastStage: 1,
    muted: false,
    calm: false,
    avatar: "shiro",
    coins: 0,
    unlocked: ["shiro"],
    updatedAt: 0
  };
}

export function createProgress(storage) {
  const memory = { value: "" };
  const box = storage || (typeof localStorage === "undefined" ? null : localStorage);
  const readRaw = () => {
    try {
      if (!box) return memory.value;
      return box.getItem(KEY) || "";
    } catch (error) {
      return memory.value;
    }
  };
  const writeRaw = (value) => {
    memory.value = value;
    try {
      if (box) box.setItem(KEY, value);
    } catch (error) {
      console.warn("學習紀錄無法寫入這個瀏覽器", error);
    }
  };

  function load() {
    try {
      const parsed = JSON.parse(readRaw() || "null");
      if (!parsed || typeof parsed !== "object") return empty();
      const data = { ...empty(), ...parsed, symbols: parsed.symbols || {}, review: Array.isArray(parsed.review) ? parsed.review : [] };
      const unlocked = Array.isArray(parsed.unlocked)
        ? parsed.unlocked.filter((id) => typeof id === "string")
        : ["shiro", ...(parsed.avatar && parsed.avatar !== "shiro" ? [parsed.avatar] : [])];
      if (!unlocked.includes("shiro")) unlocked.unshift("shiro");
      data.unlocked = [...new Set(unlocked)];
      const coins = Number(parsed.coins);
      const savedCoins = Number.isFinite(coins) && coins > 0 ? Math.floor(coins) : 0;
      const onlyStarter = data.unlocked.length === 1 && data.unlocked[0] === "shiro";
      data.coins = onlyStarter && savedCoins === 100 ? 0 : savedCoins;
      if (!data.unlocked.includes(data.avatar)) data.avatar = "shiro";
      delete data.stickers;
      return data;
    } catch (error) {
      console.warn("學習紀錄讀取失敗，改以這次遊玩為準", error);
      return empty();
    }
  }

  let data = load();

  function save() {
    data.updatedAt = Date.now();
    writeRaw(JSON.stringify(data));
  }

  return {
    get: () => data,
    symbol(id) {
      return data.symbols[id] || { seen: 0, correct: 0, wrong: 0, lastAt: 0 };
    },
    see(id) {
      const item = this.symbol(id);
      item.seen += 1;
      item.lastAt = Date.now();
      data.symbols[id] = item;
      save();
    },
    markSymbol(id, ok) {
      const item = this.symbol(id);
      item[ok ? "correct" : "wrong"] += 1;
      item.lastAt = Date.now();
      data.symbols[id] = item;
      save();
    },
    note(id, ok, slow = false) {
      const item = this.symbol(id);
      item[ok ? "correct" : "wrong"] += 1;
      if (slow && ok) item.slow = (item.slow || 0) + 1;
      item.lastAt = Date.now();
      data.symbols[id] = item;
      const review = (Array.isArray(data.review) ? data.review : []).filter((value) => value !== id);
      if (!ok || (slow && item.correct < 3)) review.unshift(id);
      data.review = review.slice(0, 12);
      save();
    },
    markListen(ok) {
      data.listenAsked += 1;
      if (ok) data.listenCorrect += 1;
      data.listenRecent = [...data.listenRecent, Boolean(ok)].slice(-24);
      data.lastMode = "listen";
      save();
    },
    markBoss(stage) {
      data.bossClears += 1;
      data.lastMode = "boss";
      data.lastStage = stage;
      save();
    },
    visit(mode) {
      data.lastMode = mode;
      save();
    },
    setPref(key, value) {
      data[key] = value;
      save();
    },
    addCoin() {
      data.coins = (Number(data.coins) || 0) + 1;
      save();
      return data.coins;
    },
    grantUnlock(id, cost) {
      const price = Number(cost) || 0;
      if (!id || data.unlocked.includes(id)) return false;
      if ((Number(data.coins) || 0) < price) return false;
      data.coins -= price;
      data.unlocked = [...data.unlocked, id];
      data.avatar = id;
      save();
      return true;
    },
    reset() {
      data = empty();
      try {
        if (box) box.removeItem(KEY);
      } catch (error) {
        console.warn("學習紀錄無法清除", error);
      }
      memory.value = "";
    }
  };
}
