# 吉伊卡哇 周邊圖鑑

一頁式收藏管理：官網全部周邊同一番賞嘅圖鑑、收藏狀態、打卡紀錄。
冇後端、冇 build step，靜態檔案 host 喺 GitHub Pages 就用得。

```
你個 repo/
├─ index.html              整個 app（single file）
├─ catalog.json            官網抓返嚟嘅（Action 自動更新，你唔使手改）
├─ manual.json             你自己維護嗰份，Action 永遠唔會掂
├─ img/                    官網圖片嘅本地備份（320px，Action 自動加新嘅）
├─ scrape-chiikawa.mjs     爬官網嘅 script
├─ Code.gs                 貼落 Google Apps Script（同步用）
└─ .github/workflows/
   └─ update-catalog.yml   每週自動更新 catalog.json
```

---

## 1　上架到 GitHub Pages

```bash
git init
git add .
git commit -m "init"
git remote add origin git@github.com:你個名/chiikawa-dex.git
git push -u origin main
```

Repo → **Settings → Pages → Source** 揀 `main` / `/ (root)`。
等一兩分鐘，個網就喺 `https://你個名.github.io/chiikawa-dex/`。

`.github/workflows/update-catalog.yml` 要放返喺嗰個路徑先行得到，記得開埋
**Settings → Actions → General → Workflow permissions → Read and write**，
唔係 Action commit 唔返上去。

---

## 2　第一次抓圖鑑資料

Action 要下星期先行，所以第一次自己行：

```bash
node scrape-chiikawa.mjs --out catalog.json
git add catalog.json && git commit -m "圖鑑初版" && git push
```

Node 18 以上，唔使裝 package。全站幾千件，行落去大概十幾二十分鐘
（每個請求之間有 400ms 間隔，唔好撳得官網太密）。

之後 Action **每兩日 香港時間 04:00** 自己行一次，有新嘢先 commit。
想即刻行就去 repo 嘅 **Actions** 分頁 →「更新圖鑑」→ Run workflow。

Action 會用 `--prev` 接上舊檔，所以每件嘢都記住「幾時首次見到」。
兩星期內新見到嘅，喺圖鑑會有個綠色「新」字，狀態篩選揀「新登場」就淨係睇呢啲。

個網開嗰陣會自動 fetch `catalog.json`，有更新會自己換，唔使你手動匯入。
（想關就去「資料」分頁熄咗「每次開頁檢查」。）

### 圖片會自己備份落 repo

官網 CDN 支援 `?width=`，所以爬蟲直接攞 320px 細版存落 `img/<編號>.jpg`，
一齊 commit 上去。官網將來落架、換相、甚至成個 CDN 路徑變咗，你都仲睇到。

個網載圖嘅次序係：`img/` 本地備份 → 官網原圖 → 角色色塊。三層都冇先會灰晒。

已經有嘅唔會再下載，所以第一次之後每次 Action 只加新嘢。
大約 3000 件，每張 15–25KB，頭一次差唔多 60MB。嫌大就用 `--imgw 200` 再行一次
（約 30MB），或者 `--no-images` 淨係記官網網址。

### 兩個來源

| 來源 | 內容 | 地區標籤 |
|---|---|---|
| `chiikawamarket.jp` | 官方網店全部周邊 | 日本 |
| `jp-api.com` NOD62 | ご当地ちいかわ（日本各地限定），**包括鐵牌**（プレートマグネット） | 日本地區限定 |

ご当地 嗰批冇價錢冇發售日，官網冇寫。地點由商品名前半截切出嚟
（「東京スカイツリー　プレートマグネット」→ 地點＝東京スカイツリー），
所以「按限定地點分段」睇鐵牌好好用。

⚠ **jp-api 個網寫明「無断転載・無断使用お断り」**，所以爬蟲預設唔會 mirror
佢啲相落你個公開 repo，淨係記低圖片網址。要 mirror 就自己加 `--gotochi-images`，
風險你自己衡量。（Chiikawa Market 嗰批一樣係有版權嘅商品相，
mirror 落公開 repo 同樣係灰色地帶 —— 想穩陣就 repo 設 private，
但咁樣 GitHub Pages 免費版就用唔到。）

### 爬唔到嘅兩類

1. **香港／台灣／大陸／韓國／澳門限定** —— 各地代理各自發行，冇任何統一目錄，
   冇一個網爬得晒。
2. **一番賞賞品** —— ちいかわくじ 官網係 JavaScript 渲染，冇公開 JSON。

呢兩類嘅做法：喺圖鑑頁「＋ 自訂加入」入（有發行地區同限定地點欄），
入完去「資料」分頁撳 **匯出自訂項目做 manual.json**，commit 上 repo。
app 開頁會自動 merge `catalog.json` ＋ `manual.json`，Action 唔會覆蓋 `manual.json`。

自訂加入嘅項目可以刪 —— 撳入去 →「編輯 / 刪除」。官網抓返嚟嗰啲刪唔到
（刪咗下次 Action 又會抓返）。

---

## 版面

圖鑑係**分段式**：唔係一大堆篩選掣加一版散貨，而係每一組一個標題，
標題右邊有進度條同「已入手／總數」，撳標題可以摺埋。

上面得三個控制項：

| 控制項 | 做咩 |
|---|---|
| 搵嘢 | 名、角色、系列、賞別都搵得到 |
| 分段方式 | 按系列 / 按角色 / 按類別 / **按發行地區** / **按限定地點** / 按發售月份 |
| 顯示 | 全部 / 淨係未入手 / 淨係已入手 / 想要 / 有重複 / 新登場 |
| 欄數 | 3 至 8 欄。7 欄以上會自動收起標籤，唔會迫爆 |

段與段之間按「最新一件嘅發售日」排，所以新嘢永遠喺最上。
段內都係新→舊。按角色分段嗰陣，一件有兩個角色嘅商品兩段都會出現。

每段先畫 60 件，捲到先至畫下一段，所以幾千件都唔會卡。

## 外觀

右上角三粒掣：`－` `＋` 係成個 app 放大縮細（0.8 至 1.5 倍，記住上次揀嘅），
第三粒係主題 —— 撳一下循環 白雪 ☀ → 黑夜 ☾ → 跟系統 ◐。預設白雪。
手指捏大縮細照樣用得。

角色、地區、系列、類別嘅中文名全部喺 `index.html` 最上面嗰四個字典度
（`CHARS` / `REGIONS` / `SERIES` / `CATS`）。覺得邊個譯名唔順口就直接改，
分段標題同標籤會跟住變。商品名本身係官網原文，冇譯。

`CHARS` 每個角色有個 `alt` 欄，入面擺其他叫法 —— 搵嘢嗰陣兩邊都搵得到。
即係打「海獺」都搵到師父、打「烏薩奇」都搵到兔兔。

---

## 3　電腦 ⇄ 手機同步

收藏紀錄本身存喺瀏覽器 localStorage，即係電腦同手機各自一份。
要同步就搭個 Google Sheet 做中轉。

### 設定（一次過）

1. 去 [sheets.new](https://sheets.new) 開個新 Sheet，改個名做「Chiikawa 收藏」
2. **擴充功能 → Apps Script**
3. 刪走原本嗰啲 code，將 `Code.gs` 成個檔貼落去
4. 改第 22 行嘅 `KEY`，改成你自己嘅通行碼
5. 右上角 **部署 → 新增部署作業 → 類型揀「網頁應用程式」**
   - 執行身分：**我**
   - 誰可以存取：**任何人**　← 一定要揀呢個，唔係個網連唔到
6. 撳部署。會彈「Google 未驗證這個應用程式」，撳 **進階 → 前往…（不安全）**。
   呢個 script 係你自己寫嘅、未經 Google 審核，正常嚟。
7. 抄低條 `/exec` 結尾嘅網址

然後喺兩部機分別開個網 → **資料** 分頁 → 填網址同通行碼 → **儲存設定**，
剔埋「開頁自動同步」。之後每次開個網就會自己同步。

### 點樣運作

個 Sheet 只係一個郵箱。每次同步：pull 落嚟 → 同本機合併 → push 返上去。
同一件兩邊都改過，以**時間戳較新**嗰次為準；輸咗嗰邊如果有打卡相而贏嗰邊冇，
張相照樣保留。

Sheet 會有兩張表：`data`（機器讀）同 `收藏一覽`（你睇嘅 —— 名稱、狀態、數量、
打卡次數、最近入手日期同地點）。

### 要知嘅限制

- **Google Sheet 一格上限 5 萬字元**。打卡相會自動縮到 640px JPEG，多數約 20–40KB，
  過到。太大嗰啲唔會經 Sheet 同步，「資料」分頁會話返你有幾多張，要過機就用匯出 JSON。
- 條 Apps Script 網址等於一條後門 —— 有網址加通行碼就讀寫到你個 Sheet。
  唔好放上公開 repo。（個 app 只係存喺你瀏覽器度，唔會入到 git。）
- 改完 `Code.gs` 要**重新部署**（部署 → 管理部署作業 → 鉛筆 → 版本揀「新版本」），
  唔係會繼續行舊版。

### 唔想用 Google？

- **GitHub Gist**：開個 private gist，整支只有 `gist` 權限嘅 fine-grained token，
  個 app 直接 PATCH 上去。好處係有 version history，壞處係 token 要放喺瀏覽器。
- **Supabase 免費版**：正式 database、有 row-level security，但要多開一個服務同管 key。
- **乜都唔用**：就繼續靠「匯出／匯入收藏 JSON」手動過機。零設定，夠用嘅話其實最穩陣。

---

## 4　備份

同步唔等於備份 —— 合併出錯或者手快撳錯，兩邊會一齊錯。
「資料」分頁定期撳一下 **匯出收藏 JSON**，嗰個檔連打卡相都有齊。
