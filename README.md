# 吉伊卡哇 周邊圖鑑

一頁式收藏管理：官網全部周邊、地區限定鐵牌、一番賞嘅圖鑑，加收藏狀態同打卡紀錄。
冇後端、冇 build step，靜態檔案 host 喺 GitHub Pages 就用得。

```
你個 repo/
├─ index.html              整個 app（single file）
├─ catalog.json            官網抓返嚟嘅（Action 自動更新，你唔使手改）
├─ manual.json             你自己維護嗰份，Action 永遠唔會掂
├─ translations.json       日文→繁中對照表，同主程式完全分開
├─ missing-translations.json  未譯嘅日文（爬蟲每次自動寫）
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
| `name_official` | 官網有冇譯呢件。true＝個名原封不動用；false＝由字典譯 |
| `character` | **逗號分隔字串**，例 `"吉伊卡哇, 小八"` |
| `theme` | 系列 |
| `main_category` / `sub_category` | 大類 / 細類 |
| `region` / `place` | 發行地區 / 限定地點 |
| `release_date` `price` `type` | 發售日、定價、`goods` 或 `kuji` |
| `image` / `image_remote` | 本機備份路徑 / 官網原圖 |
| `first_seen` | 首次抓到嘅日期，用嚟標「新」 |

**角色、系列、分類嘅清單由官網導覽即場讀返嚟，唔寫死。** 官網出新角色新系列，
下次 Action 跑完就自動有，篩選下拉會自己多一項。

不過官網**得商品名有繁中翻譯**，collection 標題（角色名、系列名、分類名）
一律係日文。所以爬蟲原封不動出日文，tag 嘅翻譯喺網頁層做 —— 見第 3 節。

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

### 由上一版升級：點清走舊 catalog.json

舊檔啲價錢係美金、角色 tag 又冇，用 `--prev` 接住佢反而衰，要推倒重嚟。

```bash
# 1. 本機刪走
rm -f catalog.json missing-translations.json

# 2. repo 度都要刪，唔係 Pages 仲會 serve 住舊嗰份
git rm --cached catalog.json
git commit -m "清走舊圖鑑，準備重抓"
git push

# 3. 重抓（唔好加 --prev）
node scrape-chiikawa.mjs --out catalog.json --country HK

# 4. 推返上去
git add catalog.json missing-translations.json img
git commit -m "重抓圖鑑（港幣・角色 tag 修正）"
git push
```

`img/` 唔使刪 —— 啲相本身冇問題，留住慳返成 60MB 下載。
想連相都重嚟就 `rm -rf img && git rm -r --cached img`。

瀏覽器嗰邊仲 cache 住舊資料：開個網 → **資料** 分頁 → **還原內建圖鑑**，
或者 hard refresh（Ctrl/Cmd + Shift + R）。

冇 `--prev` 就當第一次行，「首次見到」會用官網發售日填返，
唔會成 9000 件都標住「新」。

### Action push 唔到點算

抓成個官網要廿幾分鐘。期間你如果 push 咗嘢上 main，runner 手上嗰份就落後咗，
`git push` 會俾 remote 彈返（`! [rejected] main -> main (fetch first)`）。
Workflow 已經加咗 `git pull --rebase --autostash`，最多試三次。
呢個 job 只掂 `catalog.json` / `missing-translations.json` / `img`，
同你手改嗰啲檔唔會撞。

### 爬蟲做咗咩

- **名同 tag 全部攞官方繁中**（`/zh-hant/` locale），商品名、角色名、系列名、
  分類名都唔使自己譯。同時抓一次日文版留返原名。
- **隔走唔係角色嘅 collection**。導覽入面「新商品／再入荷」嗰組排喺角色前面，
  唔擋住就會跌晒落角色度（之前角色清單出現過「8月28日預訂商品」
  「9月3日重新上貨商品」）。而家按 handle 同 label 兩邊夾攻擋住。
- **角色 tag 唔會再亂打**。商品名個頭嗰個「ちいかわ／吉伊卡哇」係品牌前綴唔係角色，
  會先剝走。官網將某件嘢同時放入「吉伊卡哇」同其他角色、但個名剝走前綴後完全冇提
  吉伊卡哇，就當佢係品牌分類剔走。（你圖中嗰件 ID 套就係中咗呢個坑。）
- **隔走預購同重複**。標題有 予約／受注／預購／Pre-order 嘅唔會入；
  同名重複（補貨版、預購版同正式版）只留一件。想保留預購就加 `--keep-preorder`。
- **大細類**。官網自己嗰堆分類做細類，大類喺 `scrape-chiikawa.mjs` 頂部
  `MAIN_OF` / `MAIN_BY_NAME` 度歸。官網加新分類落唔到呢兩張表，
  會歸做「其他」，行完 log 會列出嚟叫你補。
- **官網冇歸類嘅由商品名估**。有啲商品官網根本冇擺入任何分類 collection
  （上次有 345 件），淨靠 collection 歸屬會變晒「其他」。而家由商品名反推 ——
  對照表係 `GUESS_SUB`，中日文都試。次序好緊要：「毛絨公仔掛件」同時有
  「掛件」同「公仔」，所以掛件要行喺公仔前面。行完 log 會報估咗幾多件。
- **價錢出港幣**。Shopify 按請求嘅 IP 自動轉幣 —— GitHub runner 喺美國，
  唔釘就攞到美金。所以每個請求都帶 `country=HK`，攞官網香港市場嘅定價。
  幣值唔係估嘅：爬蟲讀官網頁入面嘅 `Shopify.currency.active` 攞返個 ISO code，
  記落每件嘢度，app 照住個 code 出符號（HKD→HK$、JPY→¥…）。
  讀唔到先退而求其次睇價錢有冇仙位（日圓冇仙位），仲係唔肯定就標「?」，
  唔會扮係港幣。想要日圓就 `--country JP`，唔要價錢就 `--no-price`。

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

## 3　日文翻譯系統

### 商品名 vs tag，兩套做法

**商品名一律用官網嘅官方繁中，一個字都唔改。** 官方譯法係人手譯嘅，
比逐詞替換準得多，冇理由攞字典去覆蓋佢。

爬蟲抓兩次（zh-hant 同日文），兩個名唔同 → 官網有譯 → `name_official: true`，
網頁原封不動照出。兩個名一模一樣 → 官網根本冇譯呢件 → `false`，
呢啲先至攞字典嚟譯。ご当地 嗰批同你自訂加入嘅一律當 `false`。

漏譯記錄亦都跟呢條線：官方有譯嘅商品名唔會掃 —— 「パスタライ助」呢類
商品食字名你唔會入字典，掃咗淨係整到成份清單都係噪音。
行完 log 會另外報「官網未有繁中名：N / 總數」。

**角色名、系列名、分類名**官網係有繁中嘅，但係台灣叫法 ——
小八貓、小桃鼠、海獺、盔甲、超好超人、獅薩、古本屋、那孩子、大強、偶、妖精。
呢批靠字典嘅「整句」區換成香港叫法。間中有啲官網未譯，照出日文，一樣由字典處理。

> 商品名因為用官方譯本，所以會留住「小八貓」「烏薩奇」，
> 而旁邊嘅角色 tag 會顯示「小八」「兔兔」。想商品名都跟埋香港叫法就話我知。

### 字典

對照表喺 `translations.json`，**同主程式完全分開**。加詞改詞唔使掂
`index.html`，改完 refresh 個網就生效，亦唔使重新爬官網。

分兩區，**結構都係 繁中詞 : [原文寫法…]**，即係多個原文對一個繁中（多對一）。

```json
{
  "整句": {
    "歐帝": ["偶", "オデ"],
    "師父": ["海獺", "ラッコ"]
  },
  "詞彙": {
    "掛飾公仔": ["マスコット", "マスコットぬいぐるみ"],
    "公仔":     ["ぬいぐるみ", "ぬいぐるみ・マスコット"]
  }
}
```

| 區 | 幾時用 | 點比對 |
|---|---|---|
| `整句` | 角色名、系列名、分類名 —— 成個欄位就係嗰個詞 | 完全相同先換 |
| `詞彙` | 商品名入面嘅詞 | 詞中間都會換，由長到短 |

**「整句」呢區係必要嘅**，唔係「偶」(オデ) 做子字串替換會將「玩**偶**」
變成「玩歐帝」。角色名放呢度就安全。

### 替換次序

1. `整句` 完全相同 → 換晒成個欄位
2. `詞彙` 完全相同 → 換
3. `詞彙` 砌成一個 regex，**由長到短**逐個換

第三步要小心：**短詞會咬爛長詞**。已經中過三次：

| 原文 | 出事 | 因為 | 解法 |
|---|---|---|---|
| ステンド**グラス** | ステンド杯 | グラス→杯 | 加 `"彩繪玻璃": ["ステンドグラス"]` |
| パン**ダ** | 麵包ダ | パン→麵包 | 加 `"熊貓": ["パンダ"]` |
| さくら**んぼ** | 櫻花んぼ | さくら→櫻花 | 加 `"車厘子": ["さくらんぼ"]` |

規律一致：加返完整嘅長詞就得，因為替換係由長到短。
好在漏譯記錄自己會揭發呢件事 —— 你會喺清單見到「ダ」「んぼ」「ステンド」
呢啲莫名其妙嘅碎片，見到碎片就知係邊個短詞咬爛咗邊隻長詞。

### 未譯詞攔截

翻譯嘅時候，會喺**原文**度將字典識得嘅詞遮走，剩低仲有假名嘅就係未譯。
喺原文度抽而唔係譯完先抽 —— 否則「おばけうさぎ」會記成「おばけ兔兔」，
半中半日，加返落字典都對唔上。

只計含**假名**嘅詞。漢字同中文分唔開，「限定」「東京」本身中文睇得明，
冇必要當佢哋係漏譯。

兩處睇得到：

- **網頁** —— 「資料」分頁列出呢次見到嘅未譯詞同次數，撳掣匯出
  `missing-translations.json`
- **爬蟲** —— 每次行完自動喺 repo 寫一份，連埋出現次數、一個例子，
  同埋有幾多件官網未有繁中名。Action 會 commit 埋，
  commit message 有未譯詞數

譯好就加返落 `translations.json` 個 `詞彙` 度，refresh 就生效。

---

## 4　版面同操作

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

### 配色

`index.html` 頂部得兩張表：`PALETTE`（角色冇相時嘅底色，認唔得嘅新角色會按
個名 hash 出一隻柔和色）同 `MAIN_ORDER`（大類排位）。
所有日文譯名喺 `translations.json`，唔喺主程式。

---

## 5　電腦 ⇄ 手機同步

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

## 6　瀏覽器儲存

成份圖鑑（近 9000 件、幾 MB）**放記憶體，唔存 localStorage**。
localStorage 得 5MB，塞唔落會掟 `QuotaExceededError`，
一唔小心就會出現「話載入咗 8978 件但畫面空白」嘅情況。
反正每次開頁都會由 `catalog.json` fetch 返，冇必要長存。

localStorage 只擺細嘢：

| Key | 內容 |
|---|---|
| `ck.collection` | 收藏狀態、數量、打卡紀錄、打卡相 |
| `ck.custom` | 你自訂加入同改過 tag 嘅項目 |
| `ck.ui` / `ck.sync` / `ck.theme` / `ck.zoom` | 介面同同步設定 |
| `ck.catalog` | 圖鑑嘅離線後備 —— 塞得落就塞，塞唔落照行 |

塞唔落嘅話，「資料」分頁會寫住「太大存唔入瀏覽器，每次開頁重新載入」。
唯一影響係離線開唔到圖鑑；收藏紀錄照樣存得住。

---

## 7　備份

同步唔等於備份 —— 合併出錯或者撳錯，兩邊會一齊錯。
「資料」分頁定期撳 **匯出收藏 JSON**，嗰個檔連打卡相都有齊。
