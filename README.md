# ㄅㄆㄇ注音樂園

給台灣幼兒認識 37 個注音、聽音找注音、拼讀生活詞語的靜態網頁。可以在電腦、平板和手機瀏覽器開啟。題庫、語音、計分和畫面是分開的檔案，不需要登入，也不會把學習紀錄上傳。

## 開啟

這個遊戲用模組和 JSON 題庫，不能靠直接點開 `index.html`。請在專案資料夾執行：

```bash
python -m http.server 8765
```

然後用瀏覽器打開 `http://localhost:8765/`。

已放上 GitHub Pages 時，網址是 `https://oreoyanz.github.io/leaning/`。目前線上版本要等這次修改被推上去才會更新。

## 測試

```bash
npm test
```

會檢查 37 個注音、詞語欄位、注音結構、音檔清單，以及答對、答錯和學習紀錄。

## 注音讀音

37 個注音使用教育部《國語注音符號手冊》開放部件裡的原始 WAV，沒有改名，也沒有轉檔。

- 來源頁：<https://language.moe.gov.tw/001/Upload/files/site_content/M0001/juyin/index.html>
- 獨立下載：<https://language.moe.gov.tw/001/Upload/files/site_content/M0001/juyin/bopomofo_materials_20170213.zip>
- 授權：創用 CC 姓名標示 4.0 國際版（CC BY 4.0）。手冊頁寫明，利用這些音檔視為符合政府資料開放授權條款。手冊正文本身是 CC BY-ND 3.0 臺灣，這次沒有收進專案。
- 標示：2017 © 教育部，國語注音符號手冊-開放部件。授權原文在 `audio/symbols/license.txt`。

壓縮檔的 `audio/` 只有 `F1.WAV` 到 `F37.WAV`。和手冊 HTML 的黃色朗讀格對起來，`F1` 是ㄅ、`F21` 是ㄙ、`F22` 是ㄚ、`F34` 是ㄦ、`F35` 到 `F37` 是ㄧㄨㄩ。音檔裡沒有寫出符號名稱，所以這個對應是照頁面上的播放標記，不是照聽感猜測。每個檔都還需要人耳試聽。

詞語、答題回饋和說明語音仍沒有音檔。沒有檔案時，遊戲改用瀏覽器裡的台灣華語語音。網址加上 `?dev=1` 可以看到還缺哪些。清單在 `data/audio-manifest.json`。
