/* TASK-0048 — Stitch desktop design shell for the ISOLATED preview.
 * Presentation-only overlay in the same pattern as vibe-purple-gold.js:
 * reads the fictional sample store, renders a Stitch-layout dashboard,
 * top command bar and footer ribbon. It never writes to storage and
 * never touches app data contracts. All bet-derived strings are inserted
 * with textContent; the only innerHTML uses are two static/numeric sinks
 * (constant flask SVG, and the chart SVG built exclusively from computed
 * numbers) — see the TASK-0048 report for the full sink audit. */
(function () {
  "use strict";
  const STORAGE_KEY = "betlab_preview_sample_v1";
  const GREEN = "#39ff88", RED = "#ff3b5c";
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const $ = (id) => document.getElementById(id);
  let queued = false;

  /* ---------- data (same formulas as the app / vibe shell) ---------- */
  function readBets() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(data) ? data.filter((b) => b && typeof b === "object") : [];
    } catch { return []; }
  }
  function payoutFor(b) {
    const explicit = Number(b.payout);
    if (Number.isFinite(explicit) && explicit > 0) return explicit;
    const stake = Number(b.stake) || 0, odds = Number(b.odds) || 0;
    return odds === 0 ? 0 : stake + (odds > 0 ? stake * odds / 100 : stake * 100 / Math.abs(odds));
  }
  function pnl(b) {
    const stake = Number(b.stake) || 0;
    if (b.status === "Won") return payoutFor(b) - stake;
    if (b.status === "Lost") return -stake;
    return 0;
  }
  const isSettled = (b) => b.status === "Won" || b.status === "Lost" || b.status === "Push" || b.status === "Void";
  function stats(bets) {
    const won = bets.filter((b) => b.status === "Won");
    const lost = bets.filter((b) => b.status === "Lost");
    const push = bets.filter((b) => b.status === "Push" || b.status === "Void");
    const open = bets.filter((b) => b.status === "Open");
    const settled = bets.filter(isSettled);
    const net = settled.reduce((s, b) => s + pnl(b), 0);
    const settledStakes = settled.reduce((s, b) => s + (Number(b.stake) || 0), 0);
    const decided = won.length + lost.length;
    return {
      total: bets.length, won: won.length, lost: lost.length, push: push.length,
      pending: open.length, settledCount: settled.length,
      wagered: bets.reduce((s, b) => s + (Number(b.stake) || 0), 0),
      openPotential: open.reduce((s, b) => s + payoutFor(b), 0),
      net, settledStakes,
      winRate: decided ? won.length / decided * 100 : null,
      roi: settledStakes ? net / settledStakes * 100 : null,
      openLive: open.filter((b) => b.liveBet || b.betType === "live").length,
      openPregame: open.filter((b) => !(b.liveBet || b.betType === "live")).length,
      biggestOpen: open.reduce((m, b) => Math.max(m, Number(b.stake) || 0), 0)
    };
  }
  function marketType(b) {
    if (Array.isArray(b.legs) && b.legs.length > 1) return "Parlay";
    const s = String(b.selection || "");
    if (/touchdown/i.test(s)) return "Player Prop · TD";
    if (/yards/i.test(s)) return "Player Prop · Yards";
    if (/reception|catch/i.test(s)) return "Player Prop · Receptions";
    if (b.liveBet || b.betType === "live") return "Live Bet";
    return "Straight";
  }
  function fmtMoney(n) { return "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function fmtSigned(n) { return (n < 0 ? "-" : n > 0 ? "+" : "") + fmtMoney(n); }
  function fmtDate(iso) {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return "—";
    return MONTHS[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear();
  }
  function fmtTime(d) {
    let h = d.getHours(); const m = String(d.getMinutes()).padStart(2, "0");
    const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12;
    return MONTHS[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear() + " " + h + ":" + m + " " + ap;
  }
  function fmtOdds(b) {
    const odds = Number(b.odds) || 0;
    if (!odds) return "—";
    const dec = odds > 0 ? 1 + odds / 100 : 1 + 100 / Math.abs(odds);
    return (odds > 0 ? "+" + odds : "" + odds) + " (" + dec.toFixed(2) + ")";
  }
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  /* ---------- chrome: top bar + ambient + footer ---------- */
  const FLASK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2v7.31L4.17 18.23A2 2 0 0 0 5.86 21h12.28a2 2 0 0 0 1.69-2.77L14 9.31V2"></path><path d="M8.5 2h7"></path><path d="M14 9.3a6.5 6.5 0 1 1-4 0"></path><circle cx="12" cy="15" r="1" fill="currentColor"></circle></svg>';
  const NAV = ["Dashboard", "Bet Tracker", "Add Bet", "Analytics", "Sportsbooks", "Scout"];

  function buildChrome() {
    const ambient = el("div", "stx-ambient");
    ambient.setAttribute("aria-hidden", "true");
    for (let i = 0; i < 4; i++) ambient.appendChild(el("i"));
    document.body.prepend(ambient);

    const bar = el("header", "stx-topbar");
    const inner = el("div", "stx-topbar-in");
    const brand = el("div", "stx-brand");
    const flask = el("div", "stx-flask");
    flask.innerHTML = FLASK_SVG; // constant static SVG, no data
    const word = el("div", "stx-word");
    word.append(el("b", null, "BET LAB"), el("span", null, "COMMAND CENTER"));
    brand.append(flask, word);
    const pills = el("nav", "stx-pills");
    pills.setAttribute("aria-label", "Bet Lab sections");
    for (const name of NAV) {
      const b = el("button", "stx-pill" + (name === "Dashboard" ? " active" : ""), name.toUpperCase());
      b.type = "button";
      b.dataset.go = name; // the app's own router handles [data-go] clicks + active toggling
      pills.appendChild(b);
    }
    const right = el("div", "stx-top-right");
    right.appendChild(el("span", "stx-preview-badge", "ISOLATED PREVIEW · SAMPLE DATA"));
    inner.append(brand, pills, right);
    bar.appendChild(inner);
    const main = document.querySelector(".main") || document.body;
    main.prepend(bar);

    const foot = el("footer", "stx-footer");
    const fin = el("div", "stx-footer-in");
    const fbrand = el("div", "stx-f-brand");
    const fbText = el("div");
    fbText.append(el("div", null, "BET LAB"), el("small", null, "PREVIEW"));
    fbrand.append(fbText);
    const metrics = el("div", "stx-f-metrics");
    const mk = (label, id) => {
      const s = el("span", null, label);
      const b = el("b"); b.id = id; s.appendChild(b);
      metrics.appendChild(s);
      return b;
    };
    mk("TOTAL BETS", "stxFBets"); mk("WAGERED", "stxFWagered"); mk("NET PROFIT", "stxFNet");
    mk("RECORD", "stxFRecord"); mk("WIN RATE", "stxFRate"); mk("OPEN POTENTIAL", "stxFPotential");
    const fright = el("div", "stx-f-right");
    fright.append(el("span", "stx-online", "PREVIEW"), el("span", null, "|"));
    const upd = el("span"); upd.id = "stxFUpdated";
    fright.append(upd);
    fin.append(fbrand, metrics, fright);
    foot.appendChild(fin);
    document.body.appendChild(foot);
  }

  /* ---------- dashboard skeleton ---------- */
  const F = { status: "ALL", sport: "ALL", market: "ALL", tf: "ALL", search: "", sort: "date", chartTf: "90" };

  function kpiCard(border, ico, label, chipText, valId, subId) {
    const card = el("div", "stx-panel stx-kpi " + border);
    const top = el("div", "stx-kpi-top");
    const lab = el("span", "stx-kpi-label");
    lab.append(el("span", "stx-kpi-ico", ico), el("span", null, label));
    const chip = el("span", "stx-kpi-chip", chipText); chip.id = valId + "Chip";
    top.append(lab, chip);
    const val = el("div", "stx-kpi-val stx-neu"); val.id = valId;
    const sub = el("div", "stx-kpi-sub"); sub.id = subId;
    card.append(top, val, sub);
    return card;
  }
  function panelHead(ico, icoCls, title, subId, tagText) {
    const head = el("div", "stx-p-head");
    const t = el("div", "stx-p-title");
    t.append(el("span", "stx-p-ico " + (icoCls || ""), ico));
    const tt = el("div");
    tt.append(el("h3", null, title));
    const p = el("p"); if (subId) p.id = subId;
    tt.append(p);
    t.append(tt);
    head.append(t);
    if (tagText) head.append(el("span", "stx-tag", tagText));
    return head;
  }

  function buildDashboard(dashboard) {
    const root = el("section", "stx-dash");
    root.id = "stxDash";
    root.setAttribute("aria-label", "Bet Lab dashboard — Stitch preview skin");

    const strip = el("div", "stx-strip");
    const sh = el("h2"); sh.append(document.createTextNode("BET "), el("em", null, "LAB"), document.createTextNode(" — DASHBOARD"));
    const sp = el("p", null, "Isolated preview skin (TASK-0048) · every figure computed from the fictional sample store · live site untouched");
    strip.append(sh, sp);
    root.appendChild(strip);

    const kpis = el("div", "stx-kpis");
    kpis.append(
      kpiCard("stx-b-green", "$", "NET PROFIT", "—", "stxKpiNet", "stxKpiNetSub"),
      kpiCard("stx-b-purple", "✓", "WIN RATE", "SETTLED", "stxKpiRate", "stxKpiRateSub"),
      kpiCard("stx-b-orange", "▲", "ROI", "SETTLED", "stxKpiRoi", "stxKpiRoiSub"),
      kpiCard("stx-b-pink", "▥", "TOTAL WAGERED", "—", "stxKpiWagered", "stxKpiWageredSub")
    );
    root.appendChild(kpis);

    const split = el("div", "stx-split");
    const left = el("div", "stx-left");

    /* chart panel */
    const chartPanel = el("article", "stx-panel");
    chartPanel.style.padding = "20px";
    const chead = panelHead("▥", "", "Cumulative Net Profit Trajectory", "stxChartSub", null);
    const tfs = el("div", "stx-tfs"); tfs.id = "stxTfs";
    for (const [v, label] of [["7", "7D"], ["30", "30D"], ["90", "90D"], ["365", "1Y"], ["ALL", "ALL"]]) {
      const b = el("button", "stx-tf" + (v === F.chartTf ? " active" : ""), label);
      b.type = "button"; b.dataset.tf = v;
      b.setAttribute("aria-pressed", v === F.chartTf ? "true" : "false");
      b.addEventListener("click", () => {
        F.chartTf = v;
        tfs.querySelectorAll(".stx-tf").forEach((x) => {
          const on = x.dataset.tf === v;
          x.classList.toggle("active", on);
          x.setAttribute("aria-pressed", on ? "true" : "false");
        });
        update();
      });
      tfs.appendChild(b);
    }
    chead.appendChild(tfs);
    chartPanel.appendChild(chead);
    const chartBox = el("div", "stx-chart-box"); chartBox.id = "stxChartBox";
    chartPanel.appendChild(chartBox);
    const legend = el("div", "stx-legend");
    for (const [label, id] of [["SETTLED STAKES", "stxLegStakes"], ["SETTLED BETS", "stxLegSettled"], ["OPEN POTENTIAL", "stxLegPotential"], ["PENDING BETS", "stxLegPending"]]) {
      const d = el("div");
      d.append(el("small", null, label));
      const b = el("b"); b.id = id; d.append(b);
      legend.appendChild(d);
    }
    chartPanel.appendChild(legend);
    left.appendChild(chartPanel);

    /* ledger panel */
    const ledger = el("article", "stx-panel");
    ledger.style.padding = "20px";
    ledger.appendChild(panelHead("▤", "purple", "Recent Wager Ledger", "stxLedgerSub", "SETTLED · SAMPLE"));
    const tools = el("div", "stx-ledger-tools");
    const row1 = el("div", "stx-tools-row");
    const searchWrap = el("div", "stx-field");
    const search = el("input"); search.id = "stxSearch"; search.type = "text";
    search.placeholder = "Search team, player, matchup...";
    search.setAttribute("aria-label", "Search settled wagers");
    search.addEventListener("input", () => { F.search = search.value.trim(); renderLedger(readBets()); });
    searchWrap.appendChild(search);
    const sportSel = mkSelect("stxSportSel", [["ALL", "All Sports"]]);
    const marketSel = mkSelect("stxMarketSel", [["ALL", "All Markets"]]);
    const tfSel = mkSelect("stxTfSel", [["ALL", "All Time"], ["7", "Last 7 Days"], ["30", "Last 30 Days"], ["90", "Last 90 Days"]]);
    sportSel.querySelector("select").addEventListener("change", (e) => { F.sport = e.target.value; renderLedger(readBets()); });
    marketSel.querySelector("select").addEventListener("change", (e) => { F.market = e.target.value; renderLedger(readBets()); });
    tfSel.querySelector("select").addEventListener("change", (e) => { F.tf = e.target.value; renderLedger(readBets()); });
    row1.append(searchWrap, sportSel, marketSel, tfSel);
    tools.appendChild(row1);
    const row2 = el("div", "stx-tools-sub");
    const sGroup = el("div", "stx-status-group"); sGroup.id = "stxStatusGroup";
    for (const s of ["ALL", "WON", "LOST", "PUSH"]) {
      const b = el("button", "stx-status-btn" + (s === "ALL" ? " active" : ""), s);
      b.type = "button"; b.dataset.status = s;
      b.addEventListener("click", () => {
        F.status = s;
        sGroup.querySelectorAll(".stx-status-btn").forEach((x) => x.classList.toggle("active", x.dataset.status === s));
        renderLedger(readBets());
      });
      sGroup.appendChild(b);
    }
    const sortWrap = el("span");
    sortWrap.append(el("span", null, "SORT BY:  "));
    const sortGroup = el("span", "stx-sort-group"); sortGroup.id = "stxSortGroup";
    for (const [v, label] of [["date", "Date (Newest)"], ["profit", "Profit/Loss"], ["stake", "Stake Size"]]) {
      const b = el("button", "stx-sort-btn" + (v === "date" ? " active" : ""), label);
      b.type = "button"; b.dataset.sort = v;
      b.addEventListener("click", () => {
        F.sort = v;
        sortGroup.querySelectorAll(".stx-sort-btn").forEach((x) => x.classList.toggle("active", x.dataset.sort === v));
        renderLedger(readBets());
      });
      sortGroup.appendChild(b);
    }
    sortWrap.appendChild(sortGroup);
    const counter = el("span", "stx-counter"); counter.id = "stxCounter";
    row2.append(sGroup, sortWrap, counter);
    tools.appendChild(row2);
    const row3 = el("div", "stx-tools-sub");
    const chips = el("div", "stx-chips"); chips.id = "stxChips";
    const reset = el("button", "stx-reset", "✕ Reset Filters");
    reset.type = "button"; reset.id = "stxReset";
    reset.addEventListener("click", resetFilters);
    row3.append(chips, reset);
    tools.appendChild(row3);
    ledger.appendChild(tools);

    const twrap = el("div", "stx-table-wrap");
    const table = el("table", "stx-table"); table.id = "stxTable";
    const thead = el("thead");
    const htr = el("tr");
    for (const [label, cls] of [["SETTLED", ""], ["EVENT / MARKET", ""], ["BOOK", ""], ["MARKET TYPE", ""], ["ODDS (AMER / DEC)", ""], ["STAKE", "r"], ["RESULT", "c"], ["PROFIT / LOSS", "r"]]) {
      htr.appendChild(el("th", cls, label));
    }
    thead.appendChild(htr);
    const tbody = el("tbody"); tbody.id = "stxTbody";
    table.append(thead, tbody);
    twrap.appendChild(table);
    const empty = el("div", "stx-empty"); empty.id = "stxEmpty"; empty.hidden = true;
    empty.append(el("b", null, "No matching wagers found"));
    const ep = el("p", null, "Try adjusting your filters, searching for another team or player, or resetting criteria to view settled wagers.");
    const eb = el("button", "stx-reset", "Reset All Filters");
    eb.type = "button"; eb.addEventListener("click", resetFilters);
    empty.append(ep, eb);
    twrap.appendChild(empty);
    ledger.appendChild(twrap);
    left.appendChild(ledger);
    split.appendChild(left);

    /* right rail */
    const rail = el("div", "stx-rail");
    const watch = el("article", "stx-panel stx-rail-card stx-b-purple");
    watch.appendChild(panelHead("◎", "purple", "Scout Watchlist", "stxWatchSub", "SAMPLE DATA"));
    const watchList = el("div", "stx-watch"); watchList.id = "stxWatch";
    watch.appendChild(watchList);
    const scoutBtn = el("button", "stx-rail-btn", "Open Scout Tab ›");
    scoutBtn.type = "button"; scoutBtn.dataset.go = "Scout";
    watch.appendChild(scoutBtn);
    rail.appendChild(watch);
    const openCard = el("article", "stx-panel stx-rail-card stx-b-orange");
    openCard.appendChild(panelHead("▦", "", "Open Positions", null, "SAMPLE DATA"));
    const mini = el("div", "stx-mini-rows"); mini.id = "stxOpenRows";
    openCard.appendChild(mini);
    rail.appendChild(openCard);
    split.appendChild(rail);

    root.appendChild(split);
    dashboard.prepend(root);
  }
  function mkSelect(id, options) {
    const wrap = el("div", "stx-field");
    const sel = el("select"); sel.id = id;
    for (const [v, label] of options) {
      const o = el("option", null, label); o.value = v;
      sel.appendChild(o);
    }
    wrap.appendChild(sel);
    return wrap;
  }
  function resetFilters() {
    F.status = "ALL"; F.sport = "ALL"; F.market = "ALL"; F.tf = "ALL"; F.search = ""; F.sort = "date";
    const s = $("stxSearch"); if (s) s.value = "";
    const ss = $("stxSportSel"); if (ss) ss.value = "ALL";
    const ms = $("stxMarketSel"); if (ms) ms.value = "ALL";
    const ts = $("stxTfSel"); if (ts) ts.value = "ALL";
    document.querySelectorAll("#stxStatusGroup .stx-status-btn").forEach((x) => x.classList.toggle("active", x.dataset.status === "ALL"));
    document.querySelectorAll("#stxSortGroup .stx-sort-btn").forEach((x) => x.classList.toggle("active", x.dataset.sort === "date"));
    renderLedger(readBets());
  }

  /* ---------- renders ---------- */
  function semClass(n) { return n > 0 ? "stx-pos" : n < 0 ? "stx-neg" : "stx-neu"; }
  function setVal(id, text, cls) {
    const n = $(id); if (!n) return;
    n.textContent = text;
    if (cls) n.className = "stx-kpi-val " + cls;
  }
  function renderKPIs(s) {
    setVal("stxKpiNet", fmtSigned(s.net), semClass(s.net));
    const nc = $("stxKpiNetChip"); if (nc) nc.textContent = "RECORD " + s.won + " – " + s.lost;
    const nsub = $("stxKpiNetSub"); if (nsub) nsub.textContent = "Across " + s.settledCount + " settled sample bets";
    setVal("stxKpiRate", s.winRate === null ? "—" : s.winRate.toFixed(1) + "%", "stx-neu");
    const rsub = $("stxKpiRateSub"); if (rsub) rsub.textContent = s.won + " W / " + s.lost + " L" + (s.push ? " / " + s.push + " P" : "");
    setVal("stxKpiRoi", s.roi === null ? "—" : s.roi.toFixed(1) + "%", s.roi === null ? "stx-neu" : semClass(s.roi));
    const wc = $("stxKpiWageredChip"); if (wc) wc.textContent = s.total + " BETS";
    setVal("stxKpiWagered", fmtMoney(s.wagered), "stx-neu");
    const wsub = $("stxKpiWageredSub"); if (wsub) wsub.textContent = "Open potential " + fmtMoney(s.openPotential) + " · " + s.pending + " pending";
    const l1 = $("stxLegStakes"); if (l1) l1.textContent = fmtMoney(s.settledStakes);
    const l2 = $("stxLegSettled"); if (l2) l2.textContent = String(s.settledCount);
    const l3 = $("stxLegPotential"); if (l3) l3.textContent = fmtMoney(s.openPotential);
    const l4 = $("stxLegPending"); if (l4) l4.textContent = String(s.pending);
  }

  function renderChart(bets) {
    const box = $("stxChartBox"); if (!box) return;
    const settled = bets.filter(isSettled)
      .map((b) => ({ t: new Date(b.placedAt || b.createdAt || 0).getTime(), v: pnl(b) }))
      .filter((x) => Number.isFinite(x.t))
      .sort((a, b) => a.t - b.t);
    const sub = $("stxChartSub");
    if (!settled.length) {
      box.replaceChildren(el("div", "stx-chart-empty", "Settle a ticket to see your profit trajectory."));
      if (sub) sub.textContent = "Profit (USD) — no settled bets yet";
      return;
    }
    const end = settled[settled.length - 1].t;
    const days = F.chartTf === "ALL" ? Infinity : Number(F.chartTf);
    const start = days === Infinity ? settled[0].t - 86400000 : end - days * 86400000;
    const carry = settled.filter((x) => x.t < start).reduce((s, x) => s + x.v, 0);
    const inside = settled.filter((x) => x.t >= start && x.t <= end);
    const tfLabel = { "7": "Last 7 days", "30": "Last 30 days", "90": "Last 90 days", "365": "Last 1 year", "ALL": "All time" }[F.chartTf];
    if (sub) sub.textContent = "Profit (USD) · cumulative · " + tfLabel + " · " + inside.length + " settled bets" + (carry !== 0 ? " · starts at " + fmtSigned(carry) + " from earlier settlements" : "");
    if (!inside.length) {
      box.replaceChildren(el("div", "stx-chart-empty", "No settled bets inside this timeframe window."));
      return;
    }
    let cum = carry;
    const pts = [{ t: start, v: carry }];
    for (const x of inside) { cum += x.v; pts.push({ t: x.t, v: cum }); }
    if (pts.length === 1 || pts[pts.length - 1].t === start) pts.push({ t: end, v: cum });
    const finalV = cum;
    const W = 800, H = 240, PL = 46, PR = 14, PT = 16, PB = 24;
    const plotW = W - PL - PR, plotH = H - PT - PB;
    let lo = Math.min(0, ...pts.map((p) => p.v)), hi = Math.max(0, ...pts.map((p) => p.v));
    if (hi === lo) { hi += 1; lo -= 1; }
    const pad = (hi - lo) * 0.12; hi += pad; lo -= pad;
    /* 2% head-room past the last settlement so the final step isn't flush
       against the panel edge when bets cluster on one day. */
    const domEnd = end + Math.max(1, end - start) * 0.02;
    const X = (t) => PL + (t - start) / Math.max(1, domEnd - start) * plotW;
    const Y = (v) => PT + (hi - v) / (hi - lo) * plotH;
    const line = pts.map((p, i) => (i ? "L" : "M") + X(p.t).toFixed(1) + " " + Y(p.v).toFixed(1)).join(" ");
    const area = line + " L " + X(pts[pts.length - 1].t).toFixed(1) + " " + Y(lo).toFixed(1) + " L " + X(start).toFixed(1) + " " + Y(lo).toFixed(1) + " Z";
    const color = finalV >= 0 ? GREEN : RED;
    let grid = "", ylab = "";
    for (let i = 0; i <= 4; i++) {
      const v = lo + (hi - lo) * i / 4, y = Y(v);
      grid += '<line x1="' + PL + '" x2="' + (W - PR) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="#1f1833" stroke-dasharray="3 3" stroke-width="1"/>';
      ylab += '<text x="' + (PL - 6) + '" y="' + (y + 3).toFixed(1) + '" text-anchor="end" font-size="9.5" fill="#64748b">' + (v < 0 ? "-$" + Math.abs(Math.round(v)) : "$" + Math.round(v)) + "</text>";
    }
    let xlab = "";
    for (let i = 0; i <= 3; i++) {
      const t = start + (domEnd - start) * i / 3, d = new Date(t);
      xlab += '<text x="' + X(t).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="9.5" fill="#64748b">' + MONTHS[d.getMonth()] + " " + d.getDate() + "</text>";
    }
    /* a marker on every settlement point so same-day steps stay legible */
    const dots = pts.slice(1, -1).map((p) => '<circle cx="' + X(p.t).toFixed(1) + '" cy="' + Y(p.v).toFixed(1) + '" r="3.2" fill="' + color + '" stroke="#07050d" stroke-width="1.4"/>').join("");
    const zeroY = Y(0);
    const last = pts[pts.length - 1];
    const chipText = fmtSigned(finalV) + " NET";
    const chipW = chipText.length * 7.6 + 20;
    const chipX = Math.min(Math.max(X(last.t) - chipW / 2, PL), W - PR - chipW);
    const chipY = Math.max(2, Y(last.v) - 34);
    /* SVG built exclusively from computed numbers + the two color constants:
       no bet-derived text reaches this string. */
    box.innerHTML =
      '<svg class="stx-chart-breathe" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Cumulative net profit chart">' +
      "<defs>" +
      '<linearGradient id="stxArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="' + color + '" stop-opacity="0.34"/><stop offset="100%" stop-color="' + color + '" stop-opacity="0"/></linearGradient>' +
      '<filter id="stxGlow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
      "</defs>" + grid +
      '<line x1="' + PL + '" x2="' + (W - PR) + '" y1="' + zeroY.toFixed(1) + '" y2="' + zeroY.toFixed(1) + '" stroke="#a855f7" stroke-width="1.3" stroke-dasharray="7 6" opacity="0.6"/>' +
      '<path d="' + area + '" fill="url(#stxArea)"/>' +
      '<path d="' + line + '" fill="none" stroke="' + color + '" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" filter="url(#stxGlow)"/>' +
      dots +
      '<circle cx="' + X(last.t).toFixed(1) + '" cy="' + Y(last.v).toFixed(1) + '" r="5" fill="' + color + '" stroke="#07050d" stroke-width="2"/>' +
      '<g><rect x="' + chipX.toFixed(1) + '" y="' + chipY.toFixed(1) + '" width="' + chipW.toFixed(1) + '" height="24" rx="7" fill="rgba(9,3,18,.92)" stroke="#b026ff" stroke-width="1.1"/>' +
      '<text x="' + (chipX + chipW / 2).toFixed(1) + '" y="' + (chipY + 16).toFixed(1) + '" text-anchor="middle" font-size="12.5" font-weight="800" fill="' + color + '">' + chipText + "</text></g>" +
      ylab + xlab + "</svg>";
  }

  function renderLedger(bets) {
    const tbody = $("stxTbody"); if (!tbody) return;
    const settled = bets.filter(isSettled);
    /* keep filter option lists in sync with the data itself */
    syncOptions($("stxSportSel"), [...new Set(settled.map((b) => b.sport || "Other"))], F.sport, "All Sports");
    syncOptions($("stxMarketSel"), [...new Set(settled.map(marketType))], F.market, "All Markets");
    const maxT = settled.reduce((m, b) => Math.max(m, new Date(b.placedAt || 0).getTime() || 0), 0);
    const q = F.search.toLowerCase();
    let rows = settled.filter((b) => {
      if (F.status === "WON" && b.status !== "Won") return false;
      if (F.status === "LOST" && b.status !== "Lost") return false;
      if (F.status === "PUSH" && !(b.status === "Push" || b.status === "Void")) return false;
      if (F.sport !== "ALL" && (b.sport || "Other") !== F.sport) return false;
      if (F.market !== "ALL" && marketType(b) !== F.market) return false;
      if (F.tf !== "ALL" && maxT) {
        const age = (maxT - (new Date(b.placedAt || 0).getTime() || 0)) / 86400000;
        if (age > Number(F.tf)) return false;
      }
      if (q) {
        const corpus = ((b.game || "") + " " + (b.selection || "") + " " + (b.book || "") + " " + marketType(b)).toLowerCase();
        if (!corpus.includes(q)) return false;
      }
      return true;
    });
    rows.sort((a, b) => {
      if (F.sort === "profit") return pnl(b) - pnl(a);
      if (F.sort === "stake") return (Number(b.stake) || 0) - (Number(a.stake) || 0);
      return String(b.placedAt || "").localeCompare(String(a.placedAt || ""));
    });
    tbody.replaceChildren();
    for (const b of rows) {
      const tr = el("tr");
      tr.appendChild(el("td", null, fmtDate(b.placedAt)));
      const ev = el("td", "stx-ev");
      ev.append(document.createTextNode(b.game || b.selection || "Bet"));
      const small = el("small", null, b.selection || "");
      ev.appendChild(small);
      tr.appendChild(ev);
      tr.appendChild(el("td", null, b.book || "—"));
      tr.appendChild(el("td", null, marketType(b)));
      const od = el("td", "stx-odds", fmtOdds(b)); tr.appendChild(od);
      tr.appendChild(el("td", "r", fmtMoney(Number(b.stake) || 0)));
      const rc = el("td", "c");
      const pillCls = b.status === "Won" ? "stx-pill-won" : b.status === "Lost" ? "stx-pill-lost" : "stx-pill-push";
      rc.appendChild(el("span", pillCls, b.status.toUpperCase()));
      tr.appendChild(rc);
      const pl = pnl(b);
      const pc = el("td", "r", b.status === "Push" || b.status === "Void" ? "$0.00" : fmtSigned(pl));
      pc.style.color = pl > 0 ? GREEN : pl < 0 ? RED : "#cbd5e1";
      pc.style.fontWeight = "700";
      tr.appendChild(pc);
      tbody.appendChild(tr);
    }
    const counter = $("stxCounter");
    if (counter) {
      counter.replaceChildren(document.createTextNode("Showing "));
      const cb = el("b", null, rows.length + " of " + settled.length);
      counter.appendChild(cb);
    }
    const empty = $("stxEmpty"), table = $("stxTable");
    if (empty) empty.hidden = rows.length !== 0;
    if (table) table.style.display = rows.length === 0 ? "none" : "";
    const lsub = $("stxLedgerSub");
    if (lsub) lsub.textContent = "All settled sample wagers with result and profit attribution";
    renderChips();
  }
  function syncOptions(sel, values, current, allLabel) {
    if (!sel) return;
    const want = ["ALL", ...values];
    const have = [...sel.options].map((o) => o.value);
    if (JSON.stringify(want) === JSON.stringify(have)) return;
    sel.replaceChildren();
    const first = el("option", null, allLabel); first.value = "ALL";
    sel.appendChild(first);
    for (const v of values) {
      const o = el("option", null, v); o.value = v;
      sel.appendChild(o);
    }
    sel.value = want.includes(current) ? current : "ALL";
  }
  function renderChips() {
    const wrap = $("stxChips"); if (!wrap) return;
    wrap.replaceChildren();
    const defs = [];
    if (F.status !== "ALL") defs.push({ label: "Status: " + F.status, clear: () => { F.status = "ALL"; document.querySelectorAll("#stxStatusGroup .stx-status-btn").forEach((x) => x.classList.toggle("active", x.dataset.status === "ALL")); } });
    if (F.sport !== "ALL") defs.push({ label: "Sport: " + F.sport, clear: () => { F.sport = "ALL"; const s = $("stxSportSel"); if (s) s.value = "ALL"; } });
    if (F.market !== "ALL") defs.push({ label: "Market: " + F.market, clear: () => { F.market = "ALL"; const s = $("stxMarketSel"); if (s) s.value = "ALL"; } });
    if (F.tf !== "ALL") defs.push({ label: "Window: " + F.tf + "D", clear: () => { F.tf = "ALL"; const s = $("stxTfSel"); if (s) s.value = "ALL"; } });
    if (F.search) defs.push({ label: '"' + F.search + '"', clear: () => { F.search = ""; const s = $("stxSearch"); if (s) s.value = ""; } });
    for (const d of defs) {
      const chip = el("span", "stx-chip");
      /* label goes in via textContent ONLY — raw user search text can never
         become markup here (the Stitch original interpolated it into
         innerHTML; that sink is closed by construction). */
      chip.appendChild(document.createTextNode(d.label));
      const x = el("button", null, "×");
      x.type = "button";
      x.setAttribute("aria-label", "Remove filter " + d.label);
      x.addEventListener("click", () => { d.clear(); renderLedger(readBets()); });
      chip.appendChild(x);
      wrap.appendChild(chip);
    }
  }

  function renderRail(bets, s) {
    const list = $("stxWatch"); if (!list) return;
    const open = bets.filter((b) => b.status === "Open")
      .sort((a, b) => String(b.placedAt || "").localeCompare(String(a.placedAt || "")));
    list.replaceChildren();
    if (!open.length) list.appendChild(el("div", "stx-watch-item", "No open sample bets."));
    for (const b of open.slice(0, 5)) {
      const item = el("div", "stx-watch-item");
      const t1 = el("div", "t1");
      t1.append(el("span", null, (b.sport || "—") + " · " + (b.liveBet || b.betType === "live" ? "Live" : "Pregame")),
                el("span", null, b.book || ""));
      const t2 = el("div", "t2", b.selection || b.game || "Bet");
      const t3 = el("div", "t3", b.game || "");
      const t4 = el("div", "t4");
      t4.append(el("span", null, "Odds " + fmtOdds(b)),
                el("span", null, fmtMoney(Number(b.stake) || 0) + " → " + fmtMoney(payoutFor(b))));
      item.append(t1, t2, t3, t4);
      list.appendChild(item);
    }
    const wsub = $("stxWatchSub");
    if (wsub) wsub.textContent = "Open sample positions from the preview store — not live edges";
    const mini = $("stxOpenRows"); if (!mini) return;
    mini.replaceChildren();
    const rows = [
      ["Open bets", String(s.pending)],
      ["Live open", String(s.openLive)],
      ["Pregame open", String(s.openPregame)],
      ["Open potential", fmtMoney(s.openPotential)],
      ["Biggest open stake", fmtMoney(s.biggestOpen)]
    ];
    for (const [k, v] of rows) {
      const d = el("div");
      d.append(el("span", null, k), el("b", null, v));
      mini.appendChild(d);
    }
  }

  function renderFooter(s) {
    const set = (id, text, cls) => {
      const n = $(id); if (!n) return;
      n.textContent = text;
      n.className = cls || "";
    };
    set("stxFBets", String(s.total));
    set("stxFWagered", fmtMoney(s.wagered));
    set("stxFNet", fmtSigned(s.net), s.net > 0 ? "stx-pos" : s.net < 0 ? "stx-neg" : "");
    set("stxFRecord", s.won + " – " + s.lost);
    set("stxFRate", s.winRate === null ? "—" : s.winRate.toFixed(1) + "%");
    set("stxFPotential", fmtMoney(s.openPotential));
    set("stxFUpdated", "Last Updated: " + fmtTime(new Date()));
  }

  function update() {
    const bets = readBets();
    const s = stats(bets);
    renderKPIs(s);
    renderChart(bets);
    renderLedger(bets);
    renderRail(bets, s);
    renderFooter(s);
  }
  function scheduleUpdate() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; update(); });
  }

  function mount() {
    const dashboard = $("dashboard");
    if (!dashboard || document.body.classList.contains("stx-on")) return;
    try {
      buildChrome();
      buildDashboard(dashboard);
      document.body.classList.add("stx-on");
      document.body.dataset.stitchShell = "task-0048-preview";
      update();
      document.addEventListener("betlab-board-rendered", scheduleUpdate);
      window.addEventListener("storage", (e) => { if (e.key === STORAGE_KEY) scheduleUpdate(); });
      const observed = $("kpiProfit");
      if (observed) new MutationObserver(scheduleUpdate).observe(observed, { characterData: true, childList: true, subtree: true });
      window.setInterval(() => { if (!document.hidden) scheduleUpdate(); }, 4000);
    } catch (err) {
      console.error("Stitch preview shell could not initialize; app unchanged.", err);
      document.body.classList.remove("stx-on");
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
})();
