# 吉伊卡哇 周邊圖鑑

一頁式收藏管理：官網全部周邊、地區限定鐵牌、一番賞嘅圖鑑，加收藏狀態同打卡紀錄。
冇後端、冇 build step，靜態檔案 host 喺 GitHub Pages 就用得。

```
你個 repo/
├─ index.html              整個 app（single file）
├─ catalog.json            官網抓返嚟嘅（Action 自動更新，你唔使手改）
├─ manual.json             你自己維護嗰份，Action 永遠唔會掂
├─ img/                    官網圖片嘅本地備份（320px，Action 自動加新嘅）
├─ scrape-chiikawa.mjs     爬蟲
├─ Code.gs                 貼落 Google Apps Script（電腦⇄手機同步）
└─ .github/workflows/
   └─ update-catalog.yml   每兩日自動更新
```

---

## 資料格式

每一件嘢：

| 欄位 | 內容 |
|---|---|
| `id` | JAN 條碼，冇就用 Shopify id |
| `name` / `name_ja` | 官方繁中名 / 日文原名 |
| `character` | **逗號分隔字串**，例 `"吉伊卡哇, 小八"` |
| `theme` | 系列 |
| `main_category` / `sub_category` | 大類 / 細類 |
| `region` / `place` | 發行地區 / 限定地點 |
| `release_date` `price` `type` | 發售日、定價、`goods` 或 `kuji` |
| `image` / `image_remote` | 本機備份路徑 / 官網原圖 |
| `first_seen` | 首次抓到嘅日期，用嚟標「新」 |

**角色、系列、分類全部由官網 zh-hant 即場抓返嚟，唔寫死喺 code。**
官網出新角色新系列，下次 Action 跑完就自動有，篩選下拉都會自己多一項。

---

## 1　上架到 GitHub Pages

```bash
git init && git add . && git commit -m "init"
git remote add origin git@github.com:你個名/chiikawa-dex.git
git push -u origin main
```

Settings → Pages → Source 揀 `main` / root。
再開 Settings → Actions → General → Workflow permissions → **Read and write**，
唔係 Action push 唔返。

## 2　第一次抓資料

```bash
node scrape-chiikawa.mjs --out catalog.json
git add catalog.json img && git commit -m "圖鑑初版" && git push
```

Node 18 以上，唔使裝 package。全站幾千件，行落去十幾二十分鐘。
之後 Action **每兩日 香港時間 04:00** 自己行，有新嘢先 commit。
想即刻行就去 Actions 分頁 → 更新圖鑑 → Run workflow。

### 爬蟲做咗咩

- **名同 tag 全部攞官方繁中**（`/zh-hant/` locale），商品名、角色名、系列名、
  分類名都唔使自己譯。同時抓一次日文版留返原名。
- **角色 tag 唔會再亂打**。商品名個頭嗰個「ちいかわ／吉伊卡哇」係品牌前綴唔係角色，
  會先剝走。官網將某件嘢同時放入「吉伊卡哇」同其他角色、但個名剝走前綴後完全冇提
  吉伊卡哇，就當佢係品牌分類剔走。（你圖中嗰件 ID 套就係中咗呢個坑。）
- **隔走預購同重複**。標題有 予約／受注／預購／Pre-order 嘅唔會入；
  同名重複（補貨版、預購版同正式版）只留一件。想保留預購就加 `--keep-preorder`。
- **大細類**。官網自己嗰堆分類做細類，大類喺 `scrape-chiikawa.mjs` 頂部
  `MAIN_OF` / `MAIN_BY_NAME` 度歸。官網加新分類落唔到呢兩張表，
  會歸做「其他」，行完 log 會列出嚟叫你補。

### 兩個來源

| 來源 | 內容 | `region` |
|---|---|---|
| `chiikawamarket.jp/zh-hant` | 官方網店全部周邊 | 日本 |
| `jp-api.com` NOD62 | ご当地ちいかわ，**包括鐵牌**（プレートマグネット） | 日本地區限定 |

ご当地 嗰批冇價錢冇發售日（官網冇寫），地點由商品名前半截切出嚟，
所以「按限定地點分段」睇鐵牌好好用。

⚠ jp-api 個網寫明「無断転載お断り」，所以爬蟲**預設唔 mirror 佢啲相**，
淨係記低網址。要 mirror 就加 `--gotochi-images`，風險自己衡量。
（Chiikawa Market 嗰批一樣係有版權嘅商品相，擺落公開 repo 同樣係灰色地帶。）

### 爬唔到嘅兩類

1. **港／台／陸／韓／澳限定** —— 各地代理各自發行，冇統一目錄。
2. **一番賞賞品** —— ちいかわくじ 官網係 SPA，冇公開 JSON。

做法：圖鑑頁「＋ 自訂加入」入（有發行地區、限定地點、賞別欄），
入完去「資料」分頁撳 **匯出 manual.json**，commit 上 repo。
app 開頁會 merge `catalog.json` ＋ `manual.json`，Action 唔會覆蓋 `manual.json`。

### 官網落錯 tag 點算

撳入去件嘢 → **改 tag**，改完存低。你改過嘅版本會蓋過官網嗰份，
下次 Action 更新都唔會覆蓋返。想要返官網原本嘅就撳 **還原官網資料**。
改過嘅嘢同自訂加入嘅一齊出喺 `manual.json`。

---

## 3　版面同操作

圖鑑係分段式 —— 每組一個標題，右邊有進度條同「已入手／總數」，撳標題摺埋。

| 控制項 | 做咩 |
|---|---|
| 搵嘢 | 名、角色、系列、地點、賞別都搵到 |
| 角色 / 大類 / 細類 / 系列 / 地區 | 五個下拉，選項由資料本身即場抽出嚟（括號入面係件數） |
| 狀態 | 全部 / 未入手 / 已入手 / 想要 / 有重複 / 新登場 |
| 分段方式 | 系列 / 大類 / 細類 / 角色 / 地區 / 限定地點 / 發售月份 |
| 欄數 | 3 至 8 欄。7 欄以上自動收起標籤 |

**幾個下拉一齊揀就取交集**。角色用 `includes` 比對唔係 `===`，
所以一件標住 `"吉伊卡哇, 小八"` 嘅嘢，揀「小八」照樣搵得到，
按角色分段嗰陣兩段都會出現。

右上角 `－` `＋` 係成個 app 放大縮細（0.8–1.5 倍），第三粒轉主題：
白雪 ☀ → 黑夜 ☾ → 跟系統 ◐，預設白雪。手指捏大縮細照樣用得。

### 譯名

`index.html` 頂部有兩張表。`PALETTE` 係每個角色冇相時嘅底色 ——
認唔得嘅新角色會按個名 hash 出一隻柔和色，唔會變灰口灰面。
`RENAME` 係官方譯名換成你順口嗰個（烏薩奇→兔兔、小桃→飛鼠、海獺→師父、
古本屋→古本木、塞壬→賽蓮）。搵嘢兩邊都搵得到。

---

## 4　電腦 ⇄ 手機同步

收藏紀錄存喺瀏覽器 localStorage，兩部機各自一份。用 Google Sheet 做中轉。

1. [sheets.new](https://sheets.new) 開個新 Sheet
2. 擴充功能 → Apps Script，將 `Code.gs` 成個檔貼落去
3. 改 `KEY` 做你自己嘅通行碼
4. 部署 → 新增部署作業 → 網頁應用程式
   · 執行身分：**我**　· 誰可以存取：**任何人**（一定要，唔係連唔到）
5. 彈「未驗證」就撳 進階 → 前往（你自己寫嘅 script，正常）
6. 抄低 `/exec` 網址，喺兩部機嘅「資料」分頁填網址同通行碼，剔「開頁自動同步」

每次同步係 pull → 合併 → push。同一件兩邊都改過，以時間戳較新嗰次為準；
輸咗嗰邊有打卡相而贏嗰邊冇，張相會保留。

Sheet 有兩張表：`data`（機器讀）同 `收藏一覽`（你睇嘅）。

**限制**：Sheet 一格上限 5 萬字元。打卡相縮到 640px JPEG 多數 20–40KB 過到，
太大嗰啲唔會經 Sheet 走，「資料」分頁會話返你。改完 `Code.gs` 要重新部署
（管理部署作業 → 鉛筆 → 版本揀「新版本」）。條 Apps Script 網址等於一條後門，
唔好放上公開 repo。

**唔想用 Google**：GitHub private gist + 只有 gist 權限嘅 token（有 version history，
但 token 要放瀏覽器）；Supabase 免費版（正式 DB，但多一個服務要管）；
或者就繼續靠匯出／匯入 JSON 手動過機。

---

## 5　備份

同步唔等於備份 —— 合併出錯或者撳錯，兩邊會一齊錯。
「資料」分頁定期撳 **匯出收藏 JSON**，嗰個檔連打卡相都有齊。
