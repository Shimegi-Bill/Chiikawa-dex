#!/usr/bin/env node
/**
 * scrape-chiikawa.mjs — 抓 ちいかわマーケット + ご当地，出 catalog.json
 *
 *   node scrape-chiikawa.mjs
 *   node scrape-chiikawa.mjs --prev catalog.json    沿用「首次見到」日期
 *   node scrape-chiikawa.mjs --imgw 320             本機備份圖片闊度
 *   node scrape-chiikawa.mjs --no-images            唔存圖
 *   node scrape-chiikawa.mjs --no-gotochi           唔抓 ご当地
 *   node scrape-chiikawa.mjs --gotochi-images       連 ご当地 啲相都 mirror（見下面注意）
 *   node scrape-chiikawa.mjs --keep-preorder        唔隔走預購商品
 *   node scrape-chiikawa.mjs --country HK           釘住市場（預設 HK，出港幣）
 *   node scrape-chiikawa.mjs --no-price             唔要價錢（轉幣搞唔掂就用呢個）
 *
 * 需要 Node 18 以上，唔使裝 package。
 *
 * ── 商品名用官方繁中，tag 用字典 ──────────────────────────
 * 官網有 zh-hant locale，products.json 一樣食呢個前綴，所以商品名
 * 直接攞官方翻譯，一個字都唔改。
 * collection 標題（角色名、系列名、分類名）官網有繁中，但係台灣叫法
 * （小八貓、小桃鼠、海獺、盔甲、獅薩…），所以原封不動輸出，
 * 由網頁層照 translations.json 換成香港叫法。冇繁中嘅就照出日文，
 * 一樣由字典處理。
 *
 * 每件嘢有個 name_official：官方繁中名同日文名唔同 → true（有翻譯），
 * 一模一樣 → false（官網根本冇譯呢件）。ご当地 嗰批一律 false。
 * 網頁見到 false 先會攞字典嚟譯個名。
 *
 * 角色／系列清單由官網導覽即場讀返嚟 —— 官網加新角色新系列，
 * 下次 Action 就自動有，唔使改 code。
 *
 * ── 角色 tag 唔會再亂打 ──────────────────────────────────
 * 商品名個頭嗰個「ちいかわ／吉伊卡哇」係品牌前綴唔係角色，所以會先
 * 剝走。角色主要靠官網 collection 歸屬；如果官網將某件嘢同時放入
 * 「吉伊卡哇」同其他角色，但個名（剝走前綴後）完全冇提吉伊卡哇，
 * 就當佢係品牌分類，剔走。
 *
 * ── 隔走 ─────────────────────────────────────────────────
 * 預購／受注商品、同名重複項（補貨、預購版同正式版）都唔會入圖鑑。
 *
 * ── 兩個來源 ─────────────────────────────────────────────
 *  ① chiikawamarket.jp  官方網店全部周邊（地區＝日本）
 *  ② jp-api.com NOD62   ご当地ちいかわ，日本各地限定，包括鐵牌
 *     ⚠ 佢個網寫明「無断転載お断り」，所以預設唔 mirror 佢啲相。
 *
 * ── 爬唔到 ───────────────────────────────────────────────
 * 一番賞（ちいかわくじ 係 SPA）同港／台／陸／韓／澳限定（各地代理各自
 * 發行，冇統一目錄）。呢兩類放 manual.json，呢支 script 唔會掂。
 */

const BASE = 'https://chiikawamarket.jp';
const LOC = '/zh-hant';                     // 官方繁中 locale
const args = process.argv.slice(2);
const argv = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const OUT = argv('out', 'catalog.json');
const PREV = argv('prev', null);
const DELAY = +argv('slow', 400);
const IMGW = +argv('imgw', 320);
const IMGDIR = argv('imgdir', 'img');
const NOIMG = args.includes('--no-images');
const NO_GOTOCHI = args.includes('--no-gotochi');
const GOTOCHI_IMG = args.includes('--gotochi-images');
const KEEP_PREORDER = args.includes('--keep-preorder');
const COUNTRY = argv('country', 'HK');   // 釘住市場 —— 唔釘會按 runner 個 IP 轉幣
const MISSING_OUT = argv('missing', 'missing-translations.json');
const TODAY = new Date().toISOString().slice(0, 10);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const UA = { 'User-Agent': 'chiikawa-dex/2.0' };

/* 角色名、系列名、分類名一律原樣輸出官網嗰個（多數係台灣繁中，
   間中係日文）—— 換成香港叫法喺網頁層做，對照表喺 translations.json。
   咁改譯名就唔使重新爬成個官網。 */

/* ══ 大類：官網自己嘅分類係細類，大類我哋自己歸 ═══════════════
   左邊係官網 collection handle，右邊係大類。
   官網將來加新分類，落唔到呢度就會歸做「其他」，喺 log 會提你。 */
const MAIN_OF = {
  nuigurumi: '公仔・吊飾', mascot: '公仔・吊飾', 'nuigurumi-mascot': '公仔・吊飾',
  apparel: '衫褲鞋襪', hat: '衫褲鞋襪', socks: '衫褲鞋襪',
  stationery: '文具・紙品',
  interior: '家居・生活', towel: '家居・生活', kitchen: '家居・生活', amenity: '家居・生活',
  spgoods: '電子・手機',
  plaything: '玩具・收藏', acrylic: '玩具・收藏', badge: '玩具・收藏', figure: '玩具・收藏',
  foods: '食品',
  outdoor: '戶外・旅行',
  goods: '雜貨小物', cataloggift: '雜貨小物',
  gotochi_plate: '地區限定・鐵牌',
};
const MAIN_FALLBACK = '其他';

/* 細類名（官網分類名）→ 大類，做第二重對照 */
const MAIN_BY_NAME = [
  [/玩偶|絨毛|布偶|公仔|吊飾|掛飾|吊鏈/, '公仔・吊飾'],
  [/T恤|上衣|服飾|衣|帽|襪|鞋/, '衫褲鞋襪'],
  [/文具|筆記|貼紙|資料夾|信紙/, '文具・紙品'],
  [/毛巾|寢具|抱枕|室內|廚房|餐具|杯/, '家居・生活'],
  [/手機|電腦|3C|充電/, '電子・手機'],
  [/壓克力|亞加力|徽章|襟章|模型|玩具|拼圖|砌圖|扭蛋/, '玩具・收藏'],
  [/食品|零食|糖|餅/, '食品'],
  [/戶外|旅行|行李/, '戶外・旅行'],
  [/鐵牌|磁石|磁鐵/, '地區限定・鐵牌'],
  [/鎖匙扣|鑰匙圈|袋|收納包|化妝袋|散紙包/, '雜貨小物'],
];
const mainOf = (handle, name) =>
  MAIN_OF[handle] || (MAIN_BY_NAME.find(([re]) => re.test(name || ''))?.[1]) || MAIN_FALLBACK;

/* 有啲商品官網根本冇擺入任何分類 collection（上次有 345 件），
   淨靠 collection 歸屬就會變晒「其他」。呢度由商品名反推細類同大類。
   中日文都擺埋 —— 官方繁中名同日文原名都試一次。
   次序好緊要：「毛絨公仔掛件」同時有「掛件」同「公仔」，
   掛件要行喺公仔前面先唔會歸錯。 */
const GUESS_SUB = [
  [/磁鐵|磁石|マグネット|プレート/,            '鐵牌・磁石牌', '地區限定・鐵牌'],
  [/鑰匙圈|鎖匙扣|キーホルダー|キーリング/,      '鎖匙扣',      '雜貨小物'],
  [/掛件|吊飾|マスコット/,                    '掛飾公仔',    '公仔・吊飾'],
  [/玩偶|公仔|絨毛|ぬいぐるみ/,                '公仔',        '公仔・吊飾'],
  [/壓克力|亞加力|アクリル/,                   '亞加力企牌',  '玩具・收藏'],
  [/徽章|襟章|バッジ|ピンズ/,                  '襟章',        '玩具・收藏'],
  [/公仔模型|フィギュア/,                      '模型',        '玩具・收藏'],
  [/拼圖|砌圖|パズル|おもちゃ|玩具/,           '玩具・砌圖',  '玩具・收藏'],
  [/毛巾|タオル/,                             '毛巾',        '家居・生活'],
  [/抱枕|攬枕|毛毯|寢具|クッション|ブランケット/, '攬枕・床品',  '家居・生活'],
  [/馬克杯|玻璃杯|碗|碟|盤|筷|餐具|マグ|グラス|皿|箸|どんぶり/, '杯碟餐具', '家居・生活'],
  [/T恤|Tシャツ|上衣|衛衣|パーカー|スウェット/,  'T恤・衫褲',   '衫褲鞋襪'],
  [/襪|ソックス|靴下/,                        '襪',          '衫褲鞋襪'],
  [/帽|キャップ|ハット/,                      '帽',          '衫褲鞋襪'],
  [/手提袋|托特包|收納包|化妝包|散紙包|バッグ|ポーチ/, '袋・收納包', '雜貨小物'],
  [/錢包|銀包|財布|ウォレット/,                '銀包',        '雜貨小物'],
  [/資料夾|筆記本|便條|信紙|貼紙|文具|原子筆|ファイル|ノート|ステッカー|ペン/, '文具', '文具・紙品'],
  [/手機|스마|スマホ|ケーブル|充電/,           '手機周邊',    '電子・手機'],
  [/軟糖|餅乾|糖果|零食|お菓子|ラムネ|キャンディ/, '零食',      '食品'],
  [/福袋|ハッピーバッグ/,                      '福袋',        '雜貨小物'],
];
const guessSub = (...names) => {
  const s = names.filter(Boolean).join(' ');
  return GUESS_SUB.find(([re]) => re.test(s)) || null;
};

/* ══ 隔走預購／重複 ═══════════════════════════════════════ */
const PREORDER = /予約|受注|預購|預訂|豫約|Pre-?order|Pre-?Order/i;
// 剝走中括號內嘅落單須知同預購字樣，淨返商品本身個名，用嚟捉重複
const normName = s => s
  .replace(/[【\[（(][^】\])）]*(予約|受注|預購|預訂|Pre-?order|出荷|発送|配送|順次|campaign|キャンセル)[^】\])）]*[】\])）]/gi, '')
  .replace(/[【\[][^】\]]{0,40}[】\]]/g, '')
  .replace(/\s+/g, '')
  .trim()
  .toLowerCase();

async function getJSON(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: UA });
      if (r.status === 429) { await sleep(3000 * (i + 1)); continue; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) {
      if (i === tries - 1) { console.warn('  ✗', url, e.message); return null; }
      await sleep(1200 * (i + 1));
    }
  }
}

/* Shopify 每頁都有 Shopify.currency = {"active":"HKD","rate":"..."}，
   直接讀返個 code，好過靠價錢有冇仙位去估。 */
async function detectCurrency() {
  const html = await getText(`${BASE}${LOC}/collections/all?country=${COUNTRY}`);
  const m = html.match(/currency\s*[:=]\s*\{[^}]*?"active"\s*:\s*"([A-Z]{3})"/)
         || html.match(/"currencyCode"\s*:\s*"([A-Z]{3})"/);
  return m?.[1] || '';
}

async function getText(url, enc = 'utf-8') {
  try {
    const r = await fetch(url, { headers: UA });
    if (!r.ok) return '';
    return new TextDecoder(enc).decode(await r.arrayBuffer());
  } catch (e) { console.warn('  ✗', url, e.message); return ''; }
}

/* ══ ① 由官網讀返角色／系列／分類清單（唔寫死）═══════════════
   導覽選單三組嘅最後一條連結分別係 #character / #series / #category，
   呢三個 fragment 係固定嘅、同語言無關，所以用佢哋做分界最穩陣。
   （之前用 /collections 頁嘅錨點切段，結果切錯，角色同系列變晒空。） */
const SEED = {
  character: ['chiikawa','hachiware','usagi','momonga','kurimanju','rakko','shisa',
    'furuhonya','anoko','dekatsuyo','ode','chimaera','yoroisan','beetle','goblin',
    'star','muchauman'],
  category: ['nuigurumi','mascot','nuigurumi-mascot','goods','interior','apparel',
    'stationery','towel','kitchen','spgoods','amenity','outdoor','plaything','foods'],
  series: ['suppaiman','chiikawamovie','chiikawapark','go-ikebukuro-goods','tokyochiikawa',
    'anime-chiikawa','goharajuku','chiikawababy','tenshitoakuma','parallelworld',
    'chiikawabakery','chiikawa-sushi','shisamatsuri','ramenbuta','magicalchiikawa',
    'chiikawarestaurant','suizokukan','sanriocharacters','tokyomiyage','wakuwakuyuenchi',
    'chiikawahanten','chiikawaland'],
};
const SKIP = new Set(['all','newitems','restock','preorder','tshirt-sale','wishlist']);

/* 導覽入面「新商品／再入荷」嗰組排喺角色前面，唔擋住就會跌晒落角色度 ——
   上一次就係咁搞到角色清單有「8月28日預訂商品」「9月3日重新上貨商品」。
   按 handle 同 label 兩邊夾攻。 */
const SKIP_HANDLE = /^(\d|restock|re-?nyuka|preorder|yoyaku|reserve|new-?item|newarrival|sale|outlet)/i;
const SKIP_LABEL = /(\d+\s*月\s*\d+\s*日|預訂|預購|預約|重新上貨|重新上架|再入荷|補貨|新商品|新品|新到貨|即將發售|發售預定|予約|入荷|再販)/;

function linksIn(html) {
  return [...html.matchAll(
    /<a[^>]+href="(?:https:\/\/chiikawamarket\.jp)?(?:\/[a-z-]+)?\/collections\/([a-z0-9][a-z0-9-]*)[\/"?#][^>]*>([\s\S]{0,120}?)<\/a>/gi
  )].map(m => ({
    handle: m[1],
    label: m[2].replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim(),
  })).filter(x => x.label.length < 60);
}

async function discover() {
  const groups = { character: new Map(), series: new Map(), category: new Map() };
  let skipped = 0;
  const add = (g, h, label) => {
    if (SKIP.has(h) || SKIP_HANDLE.test(h) || (label && SKIP_LABEL.test(label))) { skipped++; return; }
    if (!groups[g].has(h) || label) groups[g].set(h, label || groups[g].get(h) || h);
  };

  const html = await getText(`${BASE}${LOC}/collections/all`);
  let parsed = 0;
  if (html) {
    const marks = [['character','#character'], ['series','#series'], ['category','#category']]
      .map(([k, frag]) => ({ k, i: html.indexOf(frag) }))
      .filter(x => x.i >= 0)
      .sort((x, y) => x.i - y.i);
    let from = 0;
    for (const m of marks) {
      for (const { handle, label } of linksIn(html.slice(from, m.i))) { add(m.k, handle, label); parsed++; }
      from = m.i;
    }
  }
  if (!parsed) console.log('  （導覽讀唔到，淨係用內建清單）');

  // 內建清單做保底 —— 就算官網改版，起碼原本嗰批角色系列都齊
  for (const [k, list] of Object.entries(SEED)) for (const h of list) add(k, h);

  for (const k of Object.keys(groups))
    console.log(`  ${k}：${groups[k].size} 個 —— ${[...groups[k].values()].join('、')}`);
  if (skipped) console.log(`  （隔走 ${skipped} 個唔係角色／系列／分類嘅，例如「新商品」「X月X日重新上貨商品」）`);
  return groups;
}

/* ══ ② 全部商品，繁中 + 日文各抓一次 ══════════════════════ */
async function allProducts(locale) {
  const out = [];
  for (let page = 1; page <= 200; page++) {
    const j = await getJSON(`${BASE}${locale}/collections/all/products.json?limit=250&page=${page}&country=${COUNTRY}`);
    if (!j?.products?.length) break;
    out.push(...j.products);
    process.stdout.write(`\r  ${locale || '/ja'} 第 ${page} 頁 · 累計 ${out.length}   `);
    if (j.products.length < 250) break;
    await sleep(DELAY);
  }
  console.log(`\r  ${locale || '/ja'} 合共 ${out.length} 件          `);
  return out;
}

async function collectionIds(handle, label) {
  const ids = new Set();
  for (let page = 1; page <= 60; page++) {
    const j = await getJSON(`${BASE}/collections/${handle}/products.json?limit=250&page=${page}&country=${COUNTRY}`);
    if (!j?.products?.length) break;
    for (const p of j.products) ids.add(String(p.id));
    process.stdout.write(`\r  ${label} … ${ids.size}   `);
    if (j.products.length < 250) break;
    await sleep(DELAY);
  }
  console.log(`\r  ${label} … ${ids.size} 件        `);
  return ids;
}

/* ══ 圖片 ═════════════════════════════════════════════════ */
const extOf = u => (u.match(/\.(jpe?g|png|webp|gif)(?:\?|$)/i)?.[1] || 'jpg').toLowerCase();
async function saveImage(src, id, fs) {
  if (!src) return '';
  const rel = `${IMGDIR}/${id}.${extOf(src)}`;
  try { await fs.access(rel); return rel; } catch {}
  try {
    const r = await fetch(src.split('?')[0] + `?width=${IMGW}`, { headers: UA });
    if (!r.ok) return '';
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 500) return '';
    await fs.writeFile(rel, buf);
    return rel;
  } catch { return ''; }
}

/* ══ ③ ご当地ちいかわ（jp-api.com）════════════════════════ */
const GT_BASE = 'https://www.jp-api.com';
const OVERSEAS = [
  [/香港|ホンコン|Hong ?Kong/i, '香港'], [/台湾|台灣|台北|Taiwan|Taipei/i, '台灣'],
  [/韓国|ソウル|Korea|Seoul/i, '韓國'], [/マカオ|澳門|Macau/i, '澳門'],
  [/上海|北京|広州/i, '中國大陸'], [/シンガポール|バンコク|Singapore|Bangkok/i, '東南亞'],
];
/* 細類出返日文原名（網頁層會譯），大類係我哋自己歸嘅所以直接中文 */
const GT_CAT = [
  [/プレートマグネット|メタルプレート|マグネット/, 'プレートマグネット', '地區限定・鐵牌'],
  [/ぬいぐるみキーチェーン/, 'ぬいぐるみキーチェーン', '公仔・吊飾'],
  [/マスコット/, 'マスコット', '公仔・吊飾'],
  [/ダイカットキーホルダー|キーホルダー|キーリング/, 'キーホルダー', '雜貨小物'],
  [/ソックス|靴下/, 'ソックス', '衫褲鞋襪'],
  [/タオル/, 'タオル', '家居・生活'],
  [/ポーチ|バッグ/, 'ポーチ', '雜貨小物'],
  [/千社札|ステッカー|シール/, 'ステッカー', '文具・紙品'],
  [/メダル/, '記念メダル', '玩具・收藏'],
  [/ぬいぐるみ/, 'ぬいぐるみ', '公仔・吊飾'],
  [/缶バッジ|バッジ/, 'バッジ', '玩具・收藏'],
];
const GT_CHAR = ['ちいかわ', 'ハチワレ', 'うさぎ', 'モモンガ', 'くりまんじゅう', 'ラッコ', 'シーサー'];

async function gotochi() {
  const out = [], seen = new Set();
  for (let page = 1; page <= 12; page++) {
    const url = page === 1 ? `${GT_BASE}/contents/NOD62/` : `${GT_BASE}/contents/NOD62/PGE${page}/`;
    const html = await getText(url, 'shift_jis');
    if (!html) break;
    const rows = [...html.matchAll(/<img[^>]+src="(\/images\/tphoto_(\d+)_0_b\.(?:jpg|png))"[^>]*(?:alt|title)="([^"]*)"/gi)];
    if (!rows.length) break;
    let added = 0;
    for (const [, src, pid, raw] of rows) {
      if (seen.has(pid)) continue;
      seen.add(pid);
      const title = raw.replace(/&amp;/g, '&').trim();
      if (!title) continue;
      const place = title.split(/[\u3000\s]+/)[0].trim();   // 「地名　品名」
      const rest = title.slice(place.length).trim();
      const hit = GT_CAT.find(([re]) => re.test(title));
      const chars = GT_CHAR.filter(c => rest.includes(c));
      out.push({
        id: 'gt-' + pid,
        name: title.replace(/\s+/g, ' '), name_ja: title.replace(/\s+/g, ' '),
        name_official: false,           // ご当地 冇官方中文名，要靠字典
        character: chars.join(', '),
        theme: '地區限定（ご当地）',
        sub_category: hit?.[1] || '其他', main_category: hit?.[2] || MAIN_FALLBACK,
        region: OVERSEAS.find(([re]) => re.test(title))?.[1] || '日本地區限定',
        place,
        release_date: '', price: 0, price_raw: '', currency: '', type: 'goods',
        image: '', image_remote: GT_BASE + src, url, first_seen: '',
      });
      added++;
    }
    process.stdout.write(`\r  ご当地 第 ${page} 版 · 累計 ${out.length}   `);
    if (!added) break;
    await sleep(DELAY);
  }
  console.log(`\r  ご当地：${out.length} 件（鐵牌 ${out.filter(x => x.sub_category === '鐵牌・磁石牌').length} 件）      `);
  return out;
}

/* ══ 主流程 ═══════════════════════════════════════════════ */
async function main() {
  console.log(`釘住 ${COUNTRY} 市場，睇下攞到咩幣值…`);
  let CUR = await detectCurrency();
  const WANT = { HK: 'HKD', JP: 'JPY', TW: 'TWD', MO: 'MOP', KR: 'KRW', CN: 'CNY', US: 'USD' }[COUNTRY] || '';
  if (!CUR) console.log('  讀唔到幣值，稍後用價錢格式再估');
  else if (CUR === WANT) console.log(`  ✓ ${CUR}`);
  else console.log(`  ⚠ 攞到 ${CUR}，唔係預期嘅 ${WANT} —— 官網可能唔支援呢個市場`);

  console.log('\n讀官網嘅角色／系列／分類清單…');
  const groups = await discover();

  console.log('\n抓全部商品（繁中）…');
  const zh = await allProducts(LOC);
  console.log('抓全部商品（日文，留返原名）…');
  const ja = await allProducts('');
  const jaTitle = new Map(ja.map(p => [String(p.id), (p.title || '').replace(/\s+/g, ' ').trim()]));

  const memberOf = async (group) => {
    const map = new Map();
    for (const [handle, label] of groups[group]) {
      for (const id of await collectionIds(handle, label)) {
        if (!map.has(id)) map.set(id, []);
        map.get(id).push({ handle, label });
      }
      await sleep(DELAY);
    }
    return map;
  };
  console.log('\n抓角色歸屬…');   const charOf = await memberOf('character');
  console.log('\n抓系列歸屬…');   const themeOf = await memberOf('series');
  console.log('\n抓分類歸屬…');   const catOf = await memberOf('category');

  console.log('\n整理…');
  let dropPre = 0, dropDup = 0, fixedChar = 0, guessed = 0;
  const byName = new Map();
  const items = [];

  for (const p of zh) {
    const sid = String(p.id);
    const title = (p.title || '').replace(/\s+/g, ' ').trim();
    if (!title) continue;
    if (!KEEP_PREORDER && PREORDER.test(title)) { dropPre++; continue; }

    const key = normName(title);
    if (byName.has(key)) { dropDup++; continue; }
    byName.set(key, true);

    // ── 角色：官網歸屬為準，剔走純品牌嘅「吉伊卡哇」────────
    let chars = (charOf.get(sid) || []).map(x => x.label);
    const jaName = jaTitle.get(sid) || title;
    // 剝走個頭嘅品牌前綴
    const bodyJa = jaName.replace(/^ちいかわ[\s\u3000]*/, '');
    const bodyZh = title.replace(/^吉伊卡哇[\s\u3000]*/, '');
    if (chars.length > 1) {
      const brandOnly = !/ちいかわ/.test(bodyJa) && !/吉伊卡哇/.test(bodyZh);
      if (brandOnly) {
        const kept = chars.filter(c => !/^吉伊卡哇$|^ちいかわ$/.test(c));
        if (kept.length) { if (kept.length !== chars.length) fixedChar++; chars = kept; }
      }
    }

    const cat = (catOf.get(sid) || [])[0];
    const guess = cat ? null : guessSub(title, jaName);   // 官網冇歸類先估
    if (!cat && guess) guessed++;
    const v = p.variants?.[0];
    items.push({
      id: v?.barcode || v?.sku || sid,
      shopify_id: sid,
      name: title,                      // 官方繁中，原封不動
      name_ja: jaName,
      name_official: title !== jaName,  // 兩邊一樣＝官網冇譯呢件
      character: chars.join(', '),
      theme: (themeOf.get(sid) || [])[0]?.label || '基本款',
      sub_category: cat?.label || guess?.[1] || '其他',
      main_category: cat ? mainOf(cat.handle, cat.label) : (guess?.[2] || MAIN_FALLBACK),
      region: '日本', place: '',
      release_date: (p.published_at || '').slice(0, 10),
      price: Math.round((+(v?.price || 0)) * 100) / 100,
      price_raw: String(v?.price ?? ''),
      currency: CUR || '?',
      type: 'goods',
      image: '',
      image_remote: p.images?.[0]?.src ? p.images[0].src.split('?')[0] + '?width=480' : '',
      url: `${BASE}${LOC}/products/${p.handle}`,
      first_seen: '',
    });
  }
  console.log(`  隔走預購 ${dropPre} 件 · 重複 ${dropDup} 件 · 修正角色 tag ${fixedChar} 件`);
  console.log(`  官網冇歸類、由商品名估出分類：${guessed} 件`);

  /* ── 驗返幣值 ──────────────────────────────────────────
     日圓冇仙位，港幣有。所以只有喺讀唔到 currency code 嗰陣
     先用價錢格式去估，估唔到寧願標「?」都唔好扮係港幣。 */
  if (!CUR) {
    const withCents = items.filter(x => /\.\d*[1-9]/.test(x.price_raw)).length;
    CUR = withCents > items.length * 0.1 ? (WANT === 'JPY' ? '?' : WANT) : 'JPY';
    console.log(`  讀唔到 currency code，按價錢格式估係 ${CUR}（${withCents} 件有仙位）`);
    for (const x of items) x.currency = CUR;
  }
  if (CUR === '?' || (WANT && CUR !== WANT)) {
    console.log('\n  ⚠⚠ 幣值唔係預期嗰隻。Shopify 按請求嘅 IP 自動轉幣，');
    console.log('     --country 釘唔住就加 --no-price，價錢留空好過亂寫。');
    console.log('     樣本：' + items.slice(0, 5).map(x => x.price_raw).join(' / '));
  }
  if (args.includes('--no-price')) for (const x of items) { x.price = 0; x.currency = ''; }

  // ── ご当地 ────────────────────────────────────────────
  let gt = [];
  if (!NO_GOTOCHI) { console.log('\n抓 ご当地（鐵牌等）…'); gt = await gotochi(); }

  const all = [...items, ...gt];

  // ── 首次見到日期 ──────────────────────────────────────
  const fsp = await import('node:fs/promises');
  const firstSeen = {}, prevImg = {};
  if (PREV) {
    try {
      for (const x of JSON.parse(await fsp.readFile(PREV, 'utf8'))) {
        if (x.first_seen) firstSeen[x.id] = x.first_seen;
        if (x.image) prevImg[x.id] = x.image;
      }
      console.log(`\n接上舊檔 ${Object.keys(firstSeen).length} 件嘅首見日期`);
    } catch { console.log('\n搵唔到舊檔，全部當今次先見到'); }
  }
  // 第一次行（冇舊檔）就用發售日做「首次見到」，唔係成 9000 件都標「新」
  const first = !Object.keys(firstSeen).length;
  for (const x of all) x.first_seen = firstSeen[x.id] || (first ? (x.release_date || TODAY) : TODAY);

  // ── 圖片 ──────────────────────────────────────────────
  if (NOIMG) {
    for (const x of all) x.image = x.image_remote;
    console.log('--no-images：淨係記官網網址');
  } else {
    await fsp.mkdir(IMGDIR, { recursive: true });
    let got = 0, fresh = 0;
    for (let i = 0; i < all.length; i++) {
      const x = all[i];
      const isGt = x.id.startsWith('gt-');
      if (isGt && !GOTOCHI_IMG) { x.image = x.image_remote; continue; }
      const had = prevImg[x.id];
      x.image = await saveImage(x.image_remote, x.id, fsp) || had || '';
      if (x.image) got++;
      if (x.image && !had) { fresh++; await sleep(120); }
      if (i % 50 === 0) process.stdout.write(`\r  存圖 ${i}/${all.length} · 新下載 ${fresh}   `);
    }
    console.log(`\r  存圖好晒：${got} 有本機備份，今次新下載 ${fresh} 張        `);
  }

  await fsp.writeFile(OUT, JSON.stringify(all, null, 1));

  /* ── 漏譯偵測 ─────────────────────────────────────────
     讀 translations.json，將字典識得嘅詞喺原文度遮走，剩低仲有
     假名嘅就係未譯。只計含假名嘅 —— 漢字同中文分唔開，
     「限定」「東京」本身中文睇得明，冇必要當佢哋係漏譯。 */
  try {
    const dict = JSON.parse(await fsp.readFile('translations.json', 'utf8'));
    // 「整句」嗰批係成個欄位完全相同先算，所以淨係用嚟剔走，唔入替換 regex
    const whole = new Set(Object.values(dict.整句 || {}).flat().filter(Boolean));
    const terms = Object.values(dict.詞彙 || {}).flat().filter(Boolean)
      .sort((x, y) => y.length - x.length);
    const re = terms.length
      ? new RegExp(terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g')
      : null;
    const KANA = /[\u3040-\u309F\u30A0-\u30FF]/;
    const RUN = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]+/g;
    const miss = new Map(), sample = new Map();

    let noZh = 0;
    for (const x of all) {
      if (!x.name_official) noZh++;
      // 官方有繁中名嘅就唔掃個 name ——「パスタライ助」呢類商品食字名
      // 唔會入字典，掃咗淨係整到成份清單都係噪音。
      const fields = x.name_official
        ? ['character', 'theme', 'sub_category', 'place']
        : ['name', 'character', 'theme', 'sub_category', 'place'];
      for (const f of fields) {
        const v = x[f]; if (!v || !KANA.test(v) || whole.has(v.trim())) continue;
        for (const run of (re ? v.replace(re, '\u0000') : v).match(RUN) || []) {
          if (!KANA.test(run)) continue;
          miss.set(run, (miss.get(run) || 0) + 1);
          if (!sample.has(run)) sample.set(run, { 欄位: f, 例子: v });
        }
      }
    }
    const rows = [...miss.entries()].sort((p, q) => q[1] - p[1])
      .map(([詞, 次數]) => ({ 詞, 次數, ...sample.get(詞) }));
    await fsp.writeFile(MISSING_OUT, JSON.stringify({
      _說明: '字典 translations.json 未有嘅日文詞，按出現次數排。譯好就加返落 translations.json 個「詞彙」度。',
      _產生時間: new Date().toISOString(),
      _字典詞數: terms.length + whole.size,
      _未譯詞數: rows.length,
      _官網未有繁中名: noZh,
      詞彙: rows,
    }, null, 1));
    console.log(`\n  漏譯：${rows.length} 個詞未入字典 → ${MISSING_OUT}`);
    if (rows.length) console.log('  最常見：' + rows.slice(0, 12).map(r => `${r.詞}×${r.次數}`).join('  '));
    console.log(`  官網未有繁中名：${noZh} / ${all.length} 件（呢啲個名會由字典譯）`);
  } catch (e) {
    console.log(`\n  （搵唔到 translations.json，跳過漏譯偵測：${e.message}）`);
  }

  const tally = (f) => { const m = {}; for (const x of all) m[x[f] || '（空）'] = (m[x[f]] || 0) + 1; return m; };
  const chars = new Set(all.flatMap(x => x.character.split(',').map(s => s.trim()).filter(Boolean)));
  console.log(`\n✓ 寫好 ${OUT} —— ${all.length} 件，其中 ${all.filter(x => x.first_seen === TODAY).length} 件今次新見到`);
  console.log('  角色：' + [...chars].join('、'));
  console.log('  大類：' + Object.entries(tally('main_category')).map(([k, v]) => `${k} ${v}`).join(' · '));
  console.log('  地區：' + Object.entries(tally('region')).map(([k, v]) => `${k} ${v}`).join(' · '));
  console.log(`  幣值：${CUR}（角色名、系列名、細類名係日文原文，網頁會即時譯）`);
  const other = all.filter(x => x.main_category === MAIN_FALLBACK);
  if (other.length) console.log(`  ⚠ 有 ${other.length} 件歸唔到大類，細類係：` +
    [...new Set(other.map(x => x.sub_category))].join('、') + '　←　加落 MAIN_OF / MAIN_BY_NAME 就得');
  console.log('  港／台／陸／韓／澳限定同一番賞放 manual.json，呢支 script 唔會掂。');
}

main().catch(e => { console.error(e); process.exit(1); });
