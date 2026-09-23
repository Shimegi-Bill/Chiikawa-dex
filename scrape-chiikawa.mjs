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
 *
 * 需要 Node 18 以上，唔使裝 package。
 *
 * ── 名同 tag 都攞官方繁中 ────────────────────────────────
 * 官網有 zh-hant locale，products.json 一樣食呢個前綴，所以商品名、
 * 角色名、系列名、分類名全部用官方翻譯，唔使我自己譯。
 * 角色／系列清單係由官網 collections 頁面即場讀返嚟 —— 官網加新角色
 * 新系列，下次 Action 就自動有，唔使改 code。
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
const TODAY = new Date().toISOString().slice(0, 10);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const UA = { 'User-Agent': 'chiikawa-dex/2.0' };

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

async function getText(url, enc = 'utf-8') {
  try {
    const r = await fetch(url, { headers: UA });
    if (!r.ok) return '';
    return new TextDecoder(enc).decode(await r.arrayBuffer());
  } catch (e) { console.warn('  ✗', url, e.message); return ''; }
}

/* ══ ① 由官網讀返角色／系列／分類清單（唔寫死）═══════════════
   /zh-hant/collections 個頁有三段，各自有 #character / #series /
   #category 錨點。讀唔到就退而求其次用導覽選單嘅標題切段。 */
const KNOWN = {
  character: ['chiikawa','hachiware','usagi','momonga','kurimanju','rakko','shisa',
    'furuhonya','anoko','dekatsuyo','ode','chimaera','yoroisan','beetle','goblin','star','muchauman'],
  category: Object.keys(MAIN_OF),
};

function linksIn(html) {
  return [...html.matchAll(
    /<a[^>]+href="(?:\/zh-hant)?\/collections\/([a-z0-9][a-z0-9-]*)"[^>]*>([\s\S]{0,120}?)<\/a>/gi
  )].map(([, handle, inner]) => ({
    handle,
    label: inner.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim(),
  })).filter(x => x.label && x.label.length < 60);
}

async function discover() {
  const html = await getText(`${BASE}${LOC}/collections`);
  const groups = { character: new Map(), series: new Map(), category: new Map() };

  if (html) {
    // 用錨點切三段
    const marks = ['character', 'series', 'category']
      .map(k => ({ k, i: html.search(new RegExp(`id=["']${k}["']`, 'i')) }))
      .filter(x => x.i >= 0).sort((a, b) => a.i - b.i);
    if (marks.length === 3) {
      for (let n = 0; n < marks.length; n++) {
        const chunk = html.slice(marks[n].i, marks[n + 1]?.i ?? html.length);
        for (const { handle, label } of linksIn(chunk)) groups[marks[n].k].set(handle, label);
      }
    }
  }

  const total = Object.values(groups).reduce((s, m) => s + m.size, 0);
  if (total < 10) {
    // 錨點讀唔到 → 用全頁連結 + 已知 handle 歸類，新嘅一律當系列
    console.log('  （錨點讀唔到，改用已知清單歸類）');
    for (const { handle, label } of linksIn(html || '')) {
      if (KNOWN.character.includes(handle)) groups.character.set(handle, label);
      else if (KNOWN.category.includes(handle)) groups.category.set(handle, label);
      else groups.series.set(handle, label);
    }
  }
  for (const k of Object.keys(groups))
    console.log(`  ${k}：${groups[k].size} 個 —— ${[...groups[k].values()].slice(0, 6).join('、')}…`);
  return groups;
}

/* ══ ② 全部商品，繁中 + 日文各抓一次 ══════════════════════ */
async function allProducts(locale) {
  const out = [];
  for (let page = 1; page <= 200; page++) {
    const j = await getJSON(`${BASE}${locale}/collections/all/products.json?limit=250&page=${page}`);
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
    const j = await getJSON(`${BASE}/collections/${handle}/products.json?limit=250&page=${page}`);
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
const GT_CAT = [
  [/プレートマグネット|メタルプレート|マグネット/, '鐵牌・磁石牌', '地區限定・鐵牌'],
  [/ぬいぐるみキーチェーン|マスコット/, '掛飾公仔', '公仔・吊飾'],
  [/ダイカットキーホルダー|キーホルダー|キーリング/, '鎖匙扣', '雜貨小物'],
  [/ソックス|靴下/, '襪', '衫褲鞋襪'], [/タオル/, '毛巾', '家居・生活'],
  [/ポーチ|バッグ/, '袋・收納包', '雜貨小物'],
  [/千社札|ステッカー|シール/, '貼紙', '文具・紙品'],
  [/メダル/, '紀念章', '玩具・收藏'],
  [/ぬいぐるみ/, '公仔', '公仔・吊飾'],
  [/缶バッジ|バッジ/, '襟章', '玩具・收藏'],
];
const GT_CHAR = [[/ちいかわ/, '吉伊卡哇'], [/ハチワレ/, '小八'], [/うさぎ/, '兔兔'],
  [/モモンガ/, '飛鼠'], [/くりまんじゅう/, '栗子饅頭'], [/ラッコ/, '師父'], [/シーサー/, '獅獅']];

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
      const chars = GT_CHAR.filter(([re]) => re.test(rest)).map(([, n]) => n);
      out.push({
        id: 'gt-' + pid,
        name: title.replace(/\s+/g, ' '), name_ja: title.replace(/\s+/g, ' '),
        character: chars.join(', '),
        theme: '地區限定（ご当地）',
        sub_category: hit?.[1] || '其他', main_category: hit?.[2] || MAIN_FALLBACK,
        region: OVERSEAS.find(([re]) => re.test(title))?.[1] || '日本地區限定',
        place,
        release_date: '', price: 0, type: 'goods',
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
  console.log('讀官網嘅角色／系列／分類清單…');
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
  let dropPre = 0, dropDup = 0, fixedChar = 0;
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
    const v = p.variants?.[0];
    items.push({
      id: v?.barcode || v?.sku || sid,
      shopify_id: sid,
      name: title,
      name_ja: jaName,
      character: chars.join(', '),
      theme: (themeOf.get(sid) || [])[0]?.label || '基本款',
      sub_category: cat?.label || '其他',
      main_category: mainOf(cat?.handle, cat?.label),
      region: '日本', place: '',
      release_date: (p.published_at || '').slice(0, 10),
      price: Math.round(+(v?.price || 0)),
      type: 'goods',
      image: '',
      image_remote: p.images?.[0]?.src ? p.images[0].src.split('?')[0] + '?width=480' : '',
      url: `${BASE}${LOC}/products/${p.handle}`,
      first_seen: '',
    });
  }
  console.log(`  隔走預購 ${dropPre} 件 · 重複 ${dropDup} 件 · 修正角色 tag ${fixedChar} 件`);

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
  for (const x of all) x.first_seen = firstSeen[x.id] || TODAY;

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

  const tally = (f) => { const m = {}; for (const x of all) m[x[f] || '（空）'] = (m[x[f]] || 0) + 1; return m; };
  const chars = new Set(all.flatMap(x => x.character.split(',').map(s => s.trim()).filter(Boolean)));
  console.log(`\n✓ 寫好 ${OUT} —— ${all.length} 件，其中 ${all.filter(x => x.first_seen === TODAY).length} 件今次新見到`);
  console.log('  角色：' + [...chars].join('、'));
  console.log('  大類：' + Object.entries(tally('main_category')).map(([k, v]) => `${k} ${v}`).join(' · '));
  console.log('  地區：' + Object.entries(tally('region')).map(([k, v]) => `${k} ${v}`).join(' · '));
  const other = all.filter(x => x.main_category === MAIN_FALLBACK);
  if (other.length) console.log(`  ⚠ 有 ${other.length} 件歸唔到大類，細類係：` +
    [...new Set(other.map(x => x.sub_category))].join('、') + '　←　加落 MAIN_OF / MAIN_BY_NAME 就得');
  console.log('  港／台／陸／韓／澳限定同一番賞放 manual.json，呢支 script 唔會掂。');
}

main().catch(e => { console.error(e); process.exit(1); });
