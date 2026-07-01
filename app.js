/* =========================================================
   My株ダッシュボード - 메인 로직
   데이터: Yahoo Finance 차트 API (무료·키 불필요)
   브라우저 CORS 우회를 위해 무료 프록시를 경유합니다.
   ========================================================= */

// ---------- 1. 기본 설정 ----------
const CONFIG = {
  // 시세를 우회 호출할 CORS 프록시 목록 (앞에서부터 시도, 실패 시 다음으로)
  proxies: [
    (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
    (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    (u) => `https://thingproxy.freeboard.io/fetch/${u}`,
  ],
  refreshMs: 90000, // 자동 새로고침 주기 (90초)
};

// 주요 지수 (^ = 지수 심볼)
const INDICES = ["^GSPC", "^N225", "^IXIC", "^DJI"];

// 관심종목 기본값 (미국 빅테크 + S&P500 ETF + 일본 대표주)
const DEFAULT_WATCH = [
  "AAPL", "TSLA", "NVDA", "MSFT", "GOOGL", // 미국 빅테크
  "2558.T",                                 // MAXIS 米国株式(S&P500) 도쿄상장 ETF
  "7203.T", "6758.T", "9984.T", "6861.T",   // 토요타, 소니, 소프트뱅크G, 키엔스
];

// TOP 상승/하락 계산용 유니버스 (인기 종목 모음)
const MOVERS_UNIVERSE = [
  "AAPL","TSLA","NVDA","MSFT","GOOGL","AMZN","META","AMD","NFLX",
  "7203.T","6758.T","9984.T","6861.T","8306.T","9432.T","6098.T","4063.T",
];

// S&P500 연동 ETF / 인기 ETF
const ETF_SP500 = ["VOO","SPY","2558.T","1655.T"];
const ETF_POPULAR = ["QQQ","VTI","1306.T","1321.T","GLD"];

// 심볼 → 표시 이름 (없으면 심볼 그대로 표시)
const NAMES = {
  "^GSPC":"S&P500","^N225":"日経225","^IXIC":"NASDAQ","^DJI":"ダウ",
  "AAPL":"Apple","TSLA":"Tesla","NVDA":"NVIDIA","MSFT":"Microsoft","GOOGL":"Alphabet",
  "AMZN":"Amazon","META":"Meta","AMD":"AMD","NFLX":"Netflix",
  "7203.T":"トヨタ自動車","6758.T":"ソニーG","9984.T":"ソフトバンクG","6861.T":"キーエンス",
  "8306.T":"三菱UFJ","9432.T":"NTT","6098.T":"リクルート","4063.T":"信越化学",
  "2558.T":"MAXIS米国株S&P500","1655.T":"iシェアーズS&P500","VOO":"Vanguard S&P500",
  "SPY":"SPDR S&P500","QQQ":"Invesco QQQ","VTI":"Vanguard 全米株",
  "1306.T":"TOPIX連動ETF","1321.T":"日経225連動ETF","GLD":"金 ETF",
};

// localStorage 저장 키
const LS = { watch: "kabu_watch", key: "kabu_apikey" };

// ---------- 2. 저장소 유틸 ----------
function getWatch() {
  const raw = localStorage.getItem(LS.watch);
  return raw ? JSON.parse(raw) : DEFAULT_WATCH.slice();
}
function setWatch(list) { localStorage.setItem(LS.watch, JSON.stringify(list)); }
function getApiKey() { return localStorage.getItem(LS.key) || ""; }

// 화면에 그린 시세를 담아두는 캐시 (심볼 → quote 객체)
const quoteCache = {};

// ---------- 3. 데이터 fetch ----------
// 프록시를 순서대로 시도하며 JSON을 가져온다
async function fetchViaProxy(targetUrl) {
  for (const makeUrl of CONFIG.proxies) {
    try {
      const res = await fetch(makeUrl(targetUrl), { cache: "no-store" });
      if (!res.ok) continue;
      const text = await res.text();
      return JSON.parse(text); // 프록시가 감싸지 않은 raw JSON 반환
    } catch (e) { /* 다음 프록시 시도 */ }
  }
  throw new Error("모든 프록시 실패");
}

// 단일 종목 시세 (현재가 + 등락률)
async function fetchQuote(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`;
  const data = await fetchViaProxy(url);
  const r = data?.chart?.result?.[0];
  if (!r) throw new Error("no data");
  const m = r.meta;
  const price = m.regularMarketPrice;
  const prev = m.chartPreviousClose ?? m.previousClose;
  const chg = price - prev;
  const chgPct = prev ? (chg / prev) * 100 : 0;
  const q = {
    symbol,
    name: NAMES[symbol] || m.shortName || symbol,
    price, prev, chg, chgPct,
    currency: m.currency || "",
    time: m.regularMarketTime,
  };
  quoteCache[symbol] = q;
  return q;
}

// 차트용 시계열 (상세 페이지)
async function fetchSeries(symbol, range, interval) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
  const data = await fetchViaProxy(url);
  const r = data?.chart?.result?.[0];
  if (!r) throw new Error("no data");
  const ts = r.timestamp || [];
  const closes = r.indicators?.quote?.[0]?.close || [];
  const points = [];
  for (let i = 0; i < ts.length; i++) {
    if (closes[i] == null) continue;
    points.push({ t: ts[i] * 1000, v: closes[i] });
  }
  return { meta: r.meta, points };
}

// 여러 종목을 동시성 제한하며 가져오기 (프록시 과부하 방지)
async function fetchMany(symbols, concurrency = 4) {
  const unique = [...new Set(symbols)];
  const results = {};
  let idx = 0;
  async function worker() {
    while (idx < unique.length) {
      const s = unique[idx++];
      try { results[s] = await fetchQuote(s); }
      catch (e) { results[s] = null; }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

// ---------- 4. 화면 그리기 유틸 ----------
function fmtNum(n, cur) {
  if (n == null || isNaN(n)) return "-";
  const digits = Math.abs(n) >= 1000 ? 0 : 2;
  const s = n.toLocaleString("ja-JP", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  if (cur === "JPY") return "¥" + s;
  if (cur === "USD") return "$" + s;
  return s;
}
function chgClass(v) { return v > 0 ? "up" : v < 0 ? "down" : "flat"; }
function chgText(chg, pct, cur) {
  const sign = chg > 0 ? "+" : "";
  return `${sign}${fmtNum(chg, cur)} (${sign}${pct.toFixed(2)}%)`;
}

// 지수 카드
function renderIndices(map) {
  const el = document.getElementById("indexGrid");
  el.innerHTML = INDICES.map((s) => {
    const q = map[s];
    if (!q) return `<div class="index-card"><div class="name">${NAMES[s]||s}</div><div class="price flat">-</div></div>`;
    return `<div class="index-card">
      <div class="name">${q.name}</div>
      <div class="price">${fmtNum(q.price)}</div>
      <div class="chg ${chgClass(q.chg)}">${chgText(q.chg, q.chgPct)}</div>
    </div>`;
  }).join("");
}

// 시세 행(row) 하나
function quoteRowHTML(q) {
  if (!q) return "";
  return `<div class="quote-row" data-sym="${q.symbol}">
    <div class="q-left">
      <div class="q-name">${q.name}</div>
      <div class="q-sym">${q.symbol}</div>
    </div>
    <div class="q-right">
      <div class="q-price">${fmtNum(q.price, q.currency)}</div>
      <div class="q-chg ${chgClass(q.chg)}">${chgText(q.chg, q.chgPct, q.currency)}</div>
    </div>
  </div>`;
}

function renderList(elId, symbols, map) {
  const el = document.getElementById(elId);
  el.innerHTML = symbols.map((s) => quoteRowHTML(map[s])).filter(Boolean).join("") || `<p class="hint">데이터 없음</p>`;
}

// 관심종목
function renderWatch(map) {
  const list = getWatch();
  document.getElementById("watchCount").textContent = `(${list.length})`;
  renderList("watchList", list, map);
}

// TOP 상승/하락
let moversDir = "up";
function renderMovers(map) {
  const rows = MOVERS_UNIVERSE.map((s) => map[s]).filter(Boolean);
  rows.sort((a, b) => moversDir === "up" ? b.chgPct - a.chgPct : a.chgPct - b.chgPct);
  const top = rows.slice(0, 7);
  document.getElementById("moversList").innerHTML = top.map(quoteRowHTML).join("") || `<p class="hint">데이터 없음</p>`;
}

// ETF 뷰
function renderEtf(map) {
  renderList("etfSp500", ETF_SP500, map);
  renderList("etfPopular", ETF_POPULAR, map);
}

// 설정: 관심종목 관리 목록
function renderManage() {
  const list = getWatch();
  document.getElementById("manageList").innerHTML = list.map((s) =>
    `<div class="manage-row"><span>${NAMES[s]||s} <span class="q-sym">${s}</span></span>
     <button class="del-btn" data-del="${s}">✕</button></div>`
  ).join("");
}

// ---------- 5. 전체 갱신 ----------
let refreshing = false;
async function refreshAll() {
  if (refreshing) return;
  refreshing = true;
  const status = document.getElementById("statusBar");
  status.classList.remove("err");
  status.textContent = "데이터 불러오는 중…";

  const all = [...INDICES, ...getWatch(), ...MOVERS_UNIVERSE, ...ETF_SP500, ...ETF_POPULAR];
  const map = await fetchMany(all);

  renderIndices(map);
  renderWatch(map);
  renderMovers(map);
  renderEtf(map);
  renderManage();

  const ok = Object.values(map).filter(Boolean).length;
  const total = new Set(all).size;
  if (ok === 0) {
    status.classList.add("err");
    status.textContent = "데이터를 불러오지 못했습니다. 잠시 후 새로고침(⟳) 해주세요.";
  } else {
    const now = new Date().toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    status.textContent = `업데이트 ${now} (JST) · ${ok}/${total}종목 · 15분 지연 시세`;
  }
  refreshing = false;
}

// ---------- 6. 종목 상세 ----------
let detailChart = null;
let currentDetailSym = null;
let currentRange = "1mo|1d";

async function openDetail(symbol) {
  currentDetailSym = symbol;
  const q = quoteCache[symbol];
  document.getElementById("detailName").textContent = (NAMES[symbol] || q?.name || symbol);
  document.getElementById("detailSym").textContent = symbol;
  if (q) {
    document.getElementById("detailPrice").textContent = fmtNum(q.price, q.currency);
    const chgEl = document.getElementById("detailChg");
    chgEl.textContent = chgText(q.chg, q.chgPct, q.currency);
    chgEl.className = "d-chg " + chgClass(q.chg);
  }
  document.getElementById("detail").classList.add("open");
  await loadDetailChart();
}

async function loadDetailChart() {
  const [range, interval] = currentRange.split("|");
  const wrap = document.getElementById("detailMeta");
  wrap.innerHTML = `<div class="meta-item"><div class="k">불러오는 중…</div></div>`;
  let series;
  try { series = await fetchSeries(currentDetailSym, range, interval); }
  catch (e) { wrap.innerHTML = `<div class="meta-item"><div class="k">차트 로드 실패</div></div>`; return; }

  const labels = series.points.map((p) => new Date(p.t));
  const values = series.points.map((p) => p.v);
  const rising = values.length > 1 && values[values.length - 1] >= values[0];
  const color = rising ? getVar("--up") : getVar("--down");

  if (detailChart) detailChart.destroy();
  const ctx = document.getElementById("detailChart").getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 0, 280);
  grad.addColorStop(0, color + "55");
  grad.addColorStop(1, color + "00");

  detailChart = new Chart(ctx, {
    type: "line",
    data: { labels, datasets: [{
      data: values, borderColor: color, backgroundColor: grad,
      fill: true, tension: 0.25, pointRadius: 0, borderWidth: 2,
    }]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { intersect: false, mode: "index" } },
      scales: {
        x: { type: "time", time: { unit: interval === "1d" ? "day" : interval === "1wk" ? "week" : "month" },
             grid: { color: getVar("--line") }, ticks: { color: getVar("--text-dim"), maxTicksLimit: 5 } },
        y: { grid: { color: getVar("--line") }, ticks: { color: getVar("--text-dim") } },
      },
    },
  });

  // 메타 정보 (기간 고가/저가)
  const hi = Math.max(...values), lo = Math.min(...values);
  const m = series.meta;
  wrap.innerHTML = `
    <div class="meta-item"><div class="k">기간 고가</div><div class="v">${fmtNum(hi, m.currency)}</div></div>
    <div class="meta-item"><div class="k">기간 저가</div><div class="v">${fmtNum(lo, m.currency)}</div></div>
    <div class="meta-item"><div class="k">통화</div><div class="v">${m.currency || "-"}</div></div>
    <div class="meta-item"><div class="k">거래소</div><div class="v">${m.exchangeName || m.fullExchangeName || "-"}</div></div>`;
}

// Chart.js에 time 스케일이 필요 → date adapter 로드 확인용 헬퍼
function getVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

// ---------- 7. 이벤트 연결 ----------
function switchView(name) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.getElementById("view-" + name).classList.add("active");
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === name));
  window.scrollTo(0, 0);
}

document.querySelectorAll(".tab").forEach((t) =>
  t.addEventListener("click", () => switchView(t.dataset.view)));

document.getElementById("refreshBtn").addEventListener("click", refreshAll);

// 상승/하락 세그먼트
document.querySelectorAll("[data-movers]").forEach((b) =>
  b.addEventListener("click", () => {
    moversDir = b.dataset.movers;
    document.querySelectorAll("[data-movers]").forEach((x) => x.classList.toggle("active", x === b));
    const map = quoteCache; renderMovers(map);
  }));

// 시세 행 클릭 → 상세 (이벤트 위임)
document.body.addEventListener("click", (e) => {
  const row = e.target.closest(".quote-row");
  if (row) openDetail(row.dataset.sym);
});

// 상세 닫기
document.getElementById("detailClose").addEventListener("click", () =>
  document.getElementById("detail").classList.remove("open"));

// 상세 기간 세그먼트
document.querySelectorAll("[data-range]").forEach((b) =>
  b.addEventListener("click", () => {
    currentRange = b.dataset.range;
    document.querySelectorAll("[data-range]").forEach((x) => x.classList.toggle("active", x === b));
    loadDetailChart();
  }));

// 관심종목 추가
document.getElementById("addBtn").addEventListener("click", async () => {
  const input = document.getElementById("tickerInput");
  const msg = document.getElementById("addMsg");
  let sym = input.value.trim().toUpperCase();
  if (!sym) return;
  const list = getWatch();
  if (list.includes(sym)) { msg.textContent = "이미 있는 종목입니다."; return; }
  msg.textContent = "확인 중…";
  try {
    await fetchQuote(sym);        // 실제로 시세가 나오는지 검증
    list.push(sym); setWatch(list);
    input.value = "";
    msg.textContent = `추가됨: ${NAMES[sym] || sym}`;
    renderManage();
    refreshAll();
  } catch (e) {
    msg.textContent = "시세를 찾을 수 없는 티커입니다. (일본주식은 .T 를 붙이세요)";
  }
});

// 관심종목 삭제 (이벤트 위임)
document.getElementById("manageList").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-del]");
  if (!btn) return;
  const sym = btn.dataset.del;
  setWatch(getWatch().filter((s) => s !== sym));
  renderManage(); renderWatch(quoteCache);
});

// API 키 저장
document.getElementById("saveKeyBtn").addEventListener("click", () => {
  localStorage.setItem(LS.key, document.getElementById("apiKeyInput").value.trim());
  document.getElementById("addMsg").textContent = "";
  alert("저장되었습니다.");
});
document.getElementById("apiKeyInput").value = getApiKey();

// ---------- 8. 시작 ----------
refreshAll();
setInterval(refreshAll, CONFIG.refreshMs); // 90초마다 자동 갱신

// 서비스워커 등록 (PWA 오프라인/홈화면)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
