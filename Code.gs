/**
 * Code.gs — 吉伊卡哇圖鑑 同步後端
 *
 * 安裝（一次過，五分鐘）：
 *  1. 去 sheets.new 開一個新 Google Sheet，改個名做「Chiikawa 收藏」
 *  2. 上面 Menu → 擴充功能 → Apps Script
 *  3. 刪走原本嗰啲 code，成個檔貼落去
 *  4. 改下面 KEY，改成你自己嘅通行碼（唔好用預設嗰個）
 *  5. 右上角「部署」→「新增部署作業」→ 類型揀「網頁應用程式」
 *       執行身分：我
 *       誰可以存取：任何人          ← 一定要揀呢個，唔係個網連唔到
 *  6. 撳部署，授權（會彈「未驗證」警告，撳「進階」→「前往…（不安全）」，
 *     因為呢個 script 係你自己寫嘅，未經 Google 審核，正常）
 *  7. 抄低嗰條 /exec 結尾嘅網址，連同通行碼填入 app 嘅「資料」分頁
 *
 * 改完 code 記得重新部署（部署 → 管理部署作業 → 鉛筆 → 版本揀「新版本」），
 * 唔係會繼續行舊版。
 */

const KEY = 'chiikawa-改我';      // ← 改成你自己嘅通行碼
const DATA_SHEET = 'data';        // 機器讀嘅
const VIEW_SHEET = '收藏一覽';     // 你睇嘅

const HEAD = ['id', 'status', 'qty', 'updated', 'logs', 'photo'];

function doGet() {
  return out({ ok: true, msg: 'chiikawa sync 運作緊。個 app 係用 POST 嘅。' });
}

function doPost(e) {
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (req.key !== KEY) return out({ ok: false, error: '通行碼唔啱' });

    switch (req.action) {
      case 'ping': return out({ ok: true, rows: Math.max(0, sh(DATA_SHEET).getLastRow() - 1) });
      case 'pull': return out({ ok: true, data: pull() });
      case 'push':
        push(req.data || {});
        if (req.names) buildView(req.data || {}, req.names);
        return out({ ok: true, rows: Object.keys(req.data || {}).length });
      default: return out({ ok: false, error: '唔識呢個 action：' + req.action });
    }
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}

/* ── 讀 ───────────────────────────────────────────────── */
function pull() {
  const s = sh(DATA_SHEET);
  const last = s.getLastRow();
  if (last < 2) return {};
  const rows = s.getRange(2, 1, last - 1, HEAD.length).getValues();
  const out = {};
  rows.forEach(function (r) {
    const id = String(r[0] || '').trim();
    if (!id) return;
    const rec = { u: Number(r[3]) || 0 };
    if (r[1] !== '' && r[1] !== null) rec.s = Number(r[1]) || 0;
    if (r[2]) rec.q = Number(r[2]) || 1;
    if (r[4]) { try { rec.logs = JSON.parse(r[4]); } catch (x) {} }
    if (r[5]) rec.ph = String(r[5]);
    out[id] = rec;
  });
  return out;
}

/* ── 寫（整張表換晒，簡單過逐行對數）───────────────────── */
function push(data) {
  const s = sh(DATA_SHEET);
  s.clearContents();
  s.getRange(1, 1, 1, HEAD.length).setValues([HEAD]);
  const ids = Object.keys(data);
  if (!ids.length) return;
  const rows = ids.map(function (id) {
    const c = data[id] || {};
    return [
      id,
      c.s === undefined ? '' : c.s,
      c.q || '',
      c.u || 0,
      c.logs && c.logs.length ? JSON.stringify(c.logs) : '',
      c.ph || '',
    ];
  });
  s.getRange(2, 1, rows.length, HEAD.length).setValues(rows);
  s.getRange(1, 1, 1, HEAD.length).setFontWeight('bold');
}

/* ── 人睇嗰張 ─────────────────────────────────────────── */
function buildView(data, names) {
  const s = sh(VIEW_SHEET);
  s.clear();
  const head = ['名稱', '狀態', '數量', '打卡次數', '最近入手', '地點', '實付(¥)', '備註'];
  const label = { 0: '未入手', 1: '已入手', 2: '想要' };

  const rows = Object.keys(data)
    .filter(function (id) { const c = data[id]; return c && (c.s || (c.logs || []).length); })
    .map(function (id) {
      const c = data[id], logs = c.logs || [], l = logs[0] || {};
      return [
        names[id] || id,
        label[c.s || 0] || '未入手',
        c.q || '',
        logs.length || '',
        l.d || '',
        l.pl || '',
        l.pr || '',
        l.no || '',
      ];
    })
    .sort(function (a, b) { return String(b[4]).localeCompare(String(a[4])); });

  s.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
  if (rows.length) s.getRange(2, 1, rows.length, head.length).setValues(rows);
  s.setFrozenRows(1);
  s.autoResizeColumn(1);
}

/* ── 雜項 ─────────────────────────────────────────────── */
function sh(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}
function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}
