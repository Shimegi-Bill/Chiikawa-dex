# 吉伊卡哇 周邊圖鑑

一頁式收藏管理：官網全部周邊同一番賞嘅圖鑑、收藏狀態、打卡紀錄。
冇後端、冇 build step，靜態檔案 host 喺 GitHub Pages 就用得。

```
你個 repo/
├─ index.html              整個 app（single file）
├─ catalog.json            圖鑑資料（Action 自動更新，第一次要自己行一次）
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

之後 Action 每星期一香港時間 04:00 自己行一次，有新嘢先 commit。
想即刻行就去 repo 嘅 **Actions** 分頁 →「更新圖鑑」→ Run workflow。

Action 會用 `--prev` 接上舊檔，所以每件嘢都記住「幾時首次見到」。
兩星期內新見到嘅，喺圖鑑會有個綠色「新」字，狀態篩選揀「新登場」就淨係睇呢啲。

個網開嗰陣會自動 fetch `catalog.json`，有更新會自己換，唔使你手動匯入。
（想關就去「資料」分頁熄咗「每次開頁檢查」。）

**抓唔到嘅嘢**：ちいかわくじ 官網（online-kuji.chiikawamarket.jp）係 JavaScript
渲染，冇公開 JSON，爬唔到。一番賞賞品要喺圖鑑頁用「＋ 自訂加入」手動加，
揀類型「一番賞 / くじ」就會出賞別欄。

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
