#!/usr/bin/env node
/**
 * scrape-chiikawa.mjs — 抓 ちいかわマーケット 全部商品，整返個 catalog.json
 *
 *   node scrape-chiikawa.mjs                     → catalog.json（預設）
 *   node scrape-chiikawa.mjs --out dex.json      → 自訂檔名
 *   node scrape-chiikawa.mjs --slow 800          → 每次請求隔 800ms（預設 400）
 *   node scrape-chiikawa.mjs --prev catalog.json → 沿用舊檔嘅「首次見到」日期，
 *                                                  新嘢先會打「新」標籤
 *   node scrape-chiikawa.mjs --imgw 320          → 存落本機嘅圖片闊度（預設 320px）
 *   node scrape-chiikawa.mjs --no-images         → 唔存圖，淨係記官網網址
 *
 * 需要 Node 18 以上（用內建 fetch），唔使裝任何 package。
 * 抓完之後去 app 嘅「資料」分頁 →「匯入 catalog.json」。
 *
 * 做緊咩：
 *  1. /collections/all/products.json 分頁抓晒全部商品（名、價、發售日、相、連結）
 *  2. 逐個官方 collection 再抓一次，用嚟砌角色／系列／類別標籤
 *  3. 併埋一齊輸出
 *
 * 圖片：官網 CDN 支援 ?width= 縮圖，所以直接攞細版落 img/ 資料夾，
 * 一齊 commit 上 repo。官網將來落架咗、換咗相都照樣睇到。
 * 已經有嘅唔會再下載，所以第一次行之後每次只加新嘢。
 *
 * 抓唔到嘅：ちいかわくじ（online-kuji.chiikawamarket.jp）係 JavaScript 渲染，
 * 冇公開 JSON。一番賞／くじ 嘅賞品要喺 app 入面手動加。
 */

const BASE = 'https://chiikawamarket.jp';
const args = process.argv.slice(2);
const argv = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const OUT = argv('out', 'catalog.json');
const PREV = argv('prev', null);
const DELAY = +argv('slow', 400);
const IMGW = +argv('imgw', 320);
const IMGDIR = argv('imgdir', 'img');
const NOIMG = args.includes('--no-images');
const TODAY = new Date().toISOString().slice(0, 10);

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ── 官方 collection handle → 我哋嘅標籤 ─────────────────── */
const CH = {
  chiikawa:'chiikawa', hachiware:'hachiware', usagi:'usagi', momonga:'momonga',
  kurimanju:'kurimanju', rakko:'rakko', shisa:'shisa', furuhonya:'furuhonya',
  anoko:'anoko', dekatsuyo:'dekatsuyo', ode:'ode', chimaera:'chimaera',
  yoroisan:'yoroisan', beetle:'beetle', goblin:'goblin', star:'star',
  muchauman:'muchauman',
};
const SE = {
  suppaiman:'suppaiman', chiikawamovie:'movie', chiikawapark:'park',
  tokyochiikawa:'standard', 'anime-chiikawa':'standard', goharajuku:'standard',
  'go-ikebukuro-goods':'standard', chiikawababy:'baby', tenshitoakuma:'tenshi',
  parallelworld:'parallel', chiikawabakery:'bakery', 'chiikawa-sushi':'sushi',
  shisamatsuri:'shisamatsuri', ramenbuta:'ramenbuta', magicalchiikawa:'magical',
  chiikawarestaurant:'restaurant', suizokukan:'aquarium', sanriocharacters:'sanrio',
  tokyomiyage:'tokyomiyage', wakuwakuyuenchi:'yuenchi', chiikawahanten:'hanten',
  chiikawaland:'land',
};
const CA = {
  nuigurumi:'plush', 'nuigurumi-mascot':'mascot', mascot:'mascot',
  goods:'other', interior:'interior', apparel:'apparel', stationery:'stationery',
  towel:'towel', kitchen:'kitchen', spgoods:'phone', amenity:'other',
  outdoor:'other', plaything:'toy', foods:'food',
};

/* 由商品名／product_type 猜類別，做 collection 對唔到時嘅後備 */
function guessCat(t, type) {
  const s = (t + ' ' + (type || ''));
  const m = [
    [/ぬいぐるみ|Plush/i, 'plush'], [/マスコット|Mascot/i, 'mascot'],
    [/キーリング|キーホルダー|Keyring|Keychain/i, 'keyring'],
    [/アクリルスタンド|アクリル|Acrylic/i, 'acrylic'],
    [/バッジ|缶バッジ|ピンズ|Badge/i, 'badge'],
    [/フィギュア|Figure/i, 'figure'], [/タオル|Towel/i, 'towel'],
    [/帽子|キャップ|ハット|Cap|Hat/i, 'hat'], [/バッグ|ポーチ|Bag|Pouch/i, 'bag'],
    [/Tシャツ|パーカー|ウェア|Shirt|Hoodie/i, 'apparel'],
    [/ノート|ペン|クリアファイル|付箋|レター|Stationery/i, 'stationery'],
    [/マグ|茶碗|箸|皿|グラス|Mug|Glass|Plate/i, 'kitchen'],
    [/スマホ|ケース|Phone/i, 'phone'],
    [/クッション|ブランケット|寝具|Cushion|Blanket/i, 'interior'],
    [/福袋|Happy Bag/i, 'luckybag'],
    [/パズル|おもちゃ|Puzzle|Toy/i, 'toy'],
    [/ラムネ|お菓子|Candy|Food|飴/i, 'food'],
  ];
  for (const [re, v] of m) if (re.test(s)) return v;
  return 'other';
}

/* 由商品名猜角色，做後備 */
function guessChars(t) {
  const map = [
    [/ちいかわ(?!マーケット|ランド|らんど)|Chiikawa/i, 'chiikawa'],
    [/ハチワレ|Hachiware/i, 'hachiware'], [/うさぎ|Usagi/i, 'usagi'],
    [/モモンガ|Momonga/i, 'momonga'], [/くりまんじゅう|Kurimanju/i, 'kurimanju'],
    [/ラッコ|Rakko/i, 'rakko'], [/シーサー|Shisa/i, 'shisa'],
    [/古本屋|Furuhonya/i, 'furuhonya'], [/あのこ|Anoko/i, 'anoko'],
    [/でかつよ|Dekatsuyo/i, 'dekatsuyo'], [/オデ|Ode/i, 'ode'],
    [/鎧さん|Yoroi/i, 'yoroisan'], [/カブトムシ|Beetle/i, 'beetle'],
    [/ゴブリン|Goblin/i, 'goblin'], [/キメラ|Chimaera/i, 'chimaera'],
    [/むちゃうマン|Muchauman/i, 'muchauman'],
  ];
  const out = map.filter(([re]) => re.test(t)).map(([, v]) => v);
  return out.length ? out : ['mixed'];
}

const extOf = u => (u.match(/\.(jpe?g|png|webp|gif)(?:\?|$)/i)?.[1] || 'jpg').toLowerCase();

async function saveImage(src, id, fs) {
  if (!src) return '';
  const ext = extOf(src);
  const rel = `${IMGDIR}/${id}.${ext}`;
  try { await fs.access(rel); return rel; } catch {}          // 已經有就唔使再落
  const url = src.split('?')[0] + `?width=${IMGW}`;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'chiikawa-dex/1.0' } });
    if (!r.ok) return '';
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 500) return '';                          // 空檔／錯誤頁
    await fs.writeFile(rel, buf);
    return rel;
  } catch { return ''; }
}

async function getJSON(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'chiikawa-dex/1.0' } });
      if (r.status === 429) { await sleep(3000 * (i + 1)); continue; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) {
      if (i === tries - 1) { console.warn('  ✗', url, e.message); return null; }
      await sleep(1200 * (i + 1));
    }
  }
}

async function collection(handle, label) {
  const ids = new Set();
  for (let page = 1; page <= 60; page++) {
    const j = await getJSON(`${BASE}/collections/${handle}/products.json?limit=250&page=${page}`);
    if (!j?.products?.length) break;
    for (const p of j.products) ids.add(String(p.id));
    process.stdout.write(`\r  ${label} … ${ids.size}   `);
    if (j.products.length < 250) break;
    await sleep(DELAY);
  }
  console.log(`\r  ${label} … ${ids.size} 件      `);
  return ids;
}

async function main() {
  console.log('抓全部商品…');
  const products = [];
  for (let page = 1; page <= 200; page++) {
    const j = await getJSON(`${BASE}/collections/all/products.json?limit=250&page=${page}`);
    if (!j?.products?.length) break;
    products.push(...j.products);
    process.stdout.write(`\r  第 ${page} 頁 · 累計 ${products.length} 件   `);
    if (j.products.length < 250) break;
    await sleep(DELAY);
  }
  console.log(`\r  合共 ${products.length} 件商品          `);

  console.log('\n抓角色分類…');
  const charOf = new Map();
  for (const [h, tag] of Object.entries(CH)) {
    for (const id of await collection(h, tag)) {
      if (!charOf.has(id)) charOf.set(id, []);
      charOf.get(id).push(tag);
    }
    await sleep(DELAY);
  }

  console.log('\n抓系列分類…');
  const seOf = new Map();
  for (const [h, tag] of Object.entries(SE)) {
    for (const id of await collection(h, tag)) if (!seOf.has(id)) seOf.set(id, tag);
    await sleep(DELAY);
  }

  console.log('\n抓類別分類…');
  const caOf = new Map();
  for (const [h, tag] of Object.entries(CA)) {
    for (const id of await collection(h, tag)) if (!caOf.has(id)) caOf.set(id, tag);
    await sleep(DELAY);
  }

  console.log('\n整理同下載圖片…');

  // 沿用上次見到嘅日期，新嘢先當「新登場」
  let firstSeen = {};
  if (PREV) {
    try {
      const { readFile } = await import('node:fs/promises');
      for (const x of JSON.parse(await readFile(PREV, 'utf8'))) if (x.fs) firstSeen[x.id] = x.fs;
      console.log(`  接上舊檔 ${Object.keys(firstSeen).length} 件嘅首見日期`);
    } catch { console.log('  搵唔到舊檔，全部當今次先見到'); }
  }

  const out = products.map(p => {
    const id = String(p.id);
    const title = (p.title || '').replace(/\s+/g, ' ').trim();
    const v = p.variants?.[0];
    return {
      id: v?.barcode || v?.sku || id,        // 有 JAN 用 JAN，方便同手動記錄對得返
      shopifyId: id,
      n: title,
      ja: title,
      ch: charOf.get(id) || guessChars(title),
      se: seOf.get(id) || 'standard',
      ca: caOf.get(id) || guessCat(title, p.product_type),
      t: 'g',
      d: (p.published_at || '').slice(0, 10),   // 官網上架日
      p: Math.round(+(v?.price || 0)),
      img: '',                                       // 本機備份，下面補
      imgr: p.images?.[0]?.src ? p.images[0].src.split('?')[0] + '?width=480' : '',
      url: `${BASE}/products/${p.handle}`,
      fs: '',   // 首次見到嘅日期，下面補
    };
  });
  for (const x of out) x.fs = firstSeen[x.id] || TODAY;

  const fsp = await import('node:fs/promises');
  if (NOIMG) {
    console.log('  --no-images：唔存圖，淨係記官網網址');
    for (const x of out) x.img = x.imgr;
  } else {
    await fsp.mkdir(IMGDIR, { recursive: true });
    const prevImg = {};
    if (PREV) { try { for (const x of JSON.parse(await fsp.readFile(PREV, 'utf8'))) if (x.img) prevImg[x.id] = x.img; } catch {} }
    let got = 0, fresh = 0;
    for (let i = 0; i < out.length; i++) {
      const x = out[i];
      const had = prevImg[x.id];
      x.img = await saveImage(x.imgr, x.id, fsp) || had || '';
      if (x.img) got++;
      if (x.img && !had) { fresh++; await sleep(120); }        // 只有真係要落嗰啲先等
      if (i % 50 === 0) process.stdout.write(`\r  存圖 ${i}/${out.length} · 新下載 ${fresh}   `);
    }
    console.log(`\r  存圖好晒：${got}/${out.length} 有相，今次新下載 ${fresh} 張      `);
  }

  // 同名同價嘅重複項清走
  const seen = new Set();
  const dedup = out.filter(x => { if (seen.has(x.id)) return false; seen.add(x.id); return true; });

  const { writeFile } = await import('node:fs/promises');
  await writeFile(OUT, JSON.stringify(dedup, null, 1));
  const fresh = dedup.filter(x => x.fs === TODAY).length;
  console.log(`\n✓ 寫好 ${OUT} —— ${dedup.length} 件` +
    (PREV ? `，其中 ${fresh} 件係今次新見到` : ''));
  console.log('  去 app 嘅「資料」分頁 →「匯入 catalog.json」就得。');
}

main().catch(e => { console.error(e); process.exit(1); });
