/* Bet Lab PREVIEW enhancements (additive; loaded deferred after the app).
 * - Adds Sportsbooks + Scout pages and an Add Bet nav action.
 * - Animated rolling numbers on Win/Lose via a renderDashboard wrapper.
 * - Gentle chart re-animation while Analytics is open.
 * - Polymarket .com wallet import RETIRED (Polymarket shut down its public
 *   positions endpoint — it answers HTTP 410 Gone; the account connects via
 *   the Polymarket US API import in polymarket-us.js), Kalshi connector
 *   structure (key ships EMPTY, disabled), Novig labelled slip-upload only.
 * Nothing here changes the sync module, the storage key, or persist(). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var round2 = function (n) { return Math.round(Number(n) * 100) / 100; };
  var LS_PM = 'betlab_polymarket_wallet';
  var LS_KALSHI = 'betlab_kalshi_key_id';

  /* ---------------- pages ---------------- */
  function buildPages() {
    var main = document.querySelector('main.main') || document.body;
    var books = document.createElement('section');
    books.className = 'content-page'; books.id = 'sportsbooksPage'; books.hidden = true;
    books.innerHTML =
      '<h2 style="margin:6px 0">▣ Sportsbooks</h2>' +
      '<p class="notice">Jump straight into a book to place a bet, or link an account for automatic import. Bet Lab never places bets for you, and no book password is ever asked for here.</p>' +
      '<div class="bl-books-grid">' +
      [['DraftKings', 'https://sportsbook.draftkings.com/', 'Slip photos only — not a linked account (friend\'s tickets, upload-only)'],
       ['Novig', 'https://novig.com/', 'One of your books · slip-upload only (no public API)'],
       ['Polymarket', 'https://polymarket.us/', 'One of your books · auto-import below'],
       ['Kalshi', 'https://kalshi.com/', 'One of your books · API connect below']]
        .map(function (b) { return '<a class="bl-book-tile" href="' + b[1] + '" target="_blank" rel="noopener noreferrer">' + b[0] + '<small>' + b[2] + '</small><span class="bl-open">OPEN ▸</span></a>'; }).join('') +
      '</div>' +
      '<div class="panel bl-module" id="pmModule"><h3>◈ Polymarket (.com) — wallet import retired</h3>' +
      '<p class="bl-status">This panel used to pull .com positions by wallet address. Polymarket has shut that public positions endpoint down (it now answers HTTP 410 Gone), so wallet import is retired — an address entered here can no longer import anything, and it is never sent anywhere. Your Polymarket account is a US app account: it connects through the Polymarket US API import directly below.</p>' +
      '<div class="fields"><label>Polymarket wallet address (0x…)<input id="pmWallet" placeholder="Not set — add your wallet address" autocomplete="off" spellcheck="false"></label></div>' +
      '<p><button class="primary" type="button" id="pmSave">Save address</button> <button class="primary" type="button" id="pmImport">Import my positions (retired)</button></p>' +
      '<p class="bl-status" id="pmStatus">Wallet import retired — use the Polymarket US API import below.</p></div>' +
      '<div class="panel bl-module" id="pmusModule"><h3>◈ Polymarket US — API import</h3>' +
      '<p class="bl-status">Your Polymarket US app account connects through a read-only proxy: positions are pulled straight into the tracker using your API Key ID. The Key ID (from polymarket.us/developer) is a public identifier — it is NOT your secret key, and the secret key must never be pasted into any web page. The Key ID stays in this browser only.</p>' +
      '<div class="fields"><label>Polymarket US API Key ID<input id="pmusKeyId" placeholder="Not set — paste your Key ID" autocomplete="off" spellcheck="false"></label></div>' +
      '<p><button class="primary" type="button" id="pmusSave">Save Key ID</button> <button class="primary" type="button" id="pmusImport">Import positions</button></p>' +
      '<p class="bl-status" id="pmusStatus">No Key ID saved yet, so nothing has been imported.</p></div>' +
      '<div class="panel bl-module" id="kalshiModule"><h3>◈ Kalshi — API connection</h3>' +
      '<p class="bl-status">Kalshi API access needs an API Key ID plus RSA-signed requests. A private key must never be pasted into a web page, so the connector below is structured and ready, but stays <b>disabled</b> until a secure local signer exists. Storing a Key ID alone cannot move money or place bets.</p>' +
      '<div class="fields"><label>Kalshi API Key ID<input id="kalshiKey" placeholder="Not set" autocomplete="off" spellcheck="false"></label></div>' +
      '<p><button class="primary" type="button" id="kalshiSave">Save Key ID</button> <button class="primary" type="button" id="kalshiConnect" disabled title="Disabled by design — see note above">Connect (disabled)</button></p>' +
      '<p class="bl-status" id="kalshiStatus">Not connected.</p></div>' +
      '<div class="panel bl-module"><h3>◈ Novig — slip upload only</h3>' +
      '<p class="bl-status">Novig offers no public API for account bets, so there is nothing to link. Your Novig tickets come in by slip photo (the importer reads stake, payout, legs and ticket ID automatically) or by share link.</p>' +
      '<p><button class="primary" type="button" data-go="Slip Importer">Open Slip Importer</button></p></div>';
    var scout = document.createElement('section');
    scout.className = 'content-page'; scout.id = 'scoutPage'; scout.hidden = true;
    scout.innerHTML =
      '<h2 style="margin:6px 0">⌖ Scout — matchup notes</h2>' +
      '<p class="bl-disclaimer">Data notes computed from ESPN\'s public feed: team records, streaks, and the posted line when the feed carries one. Facts about matchups — <b>not picks, not predictions, not guarantees.</b></p>' +
      '<p><button class="primary" type="button" id="scoutRefresh">↻ Refresh notes</button> <span class="bl-status" id="scoutStatus">Not loaded yet.</span></p>' +
      '<div id="scoutNotes"></div>';
    var ws = $('workspace');
    if (ws && ws.parentNode) { ws.parentNode.insertBefore(books, ws.nextSibling); ws.parentNode.insertBefore(scout, books.nextSibling); }
    else { main.append(books, scout); }
  }

  /* ---------------- navigation ---------------- */
  function hideMine() { ['sportsbooksPage', 'scoutPage'].forEach(function (id) { var el = $(id); if (el) { el.hidden = true; el.classList.remove('active'); } }); }
  function showMine(id) { hideMine(); var el = $(id); if (el) { el.hidden = false; el.classList.add('active'); } }
  function wireNav() {
    if (typeof window.go !== 'function') return;
    var origGo = window.go;
    window.go = function (name) {
      if (name === 'Add Bet') {
        origGo('Bet Tracker');
        document.querySelectorAll('[data-go]').forEach(function (x) { x.classList.toggle('active', x.dataset.go === 'Add Bet'); });
        var t = $('pageTitle'); if (t) t.textContent = 'Add Bet';
        var form = $('betForm');
        if (form) { form.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' }); var g = $('game'); if (g) setTimeout(function () { g.focus({ preventScroll: true }); }, 400); }
        return;
      }
      if (name === 'Sportsbooks' || name === 'Scout') {
        origGo('Dashboard');
        var dash = $('dashboard'); if (dash) dash.classList.remove('active');
        document.querySelectorAll('[data-go]').forEach(function (x) { x.classList.toggle('active', x.dataset.go === name); });
        showMine(name === 'Sportsbooks' ? 'sportsbooksPage' : 'scoutPage');
        window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
        if (name === 'Scout') loadScout();
        return;
      }
      hideMine();
      origGo(name);
    };
  }

  /* Reduced motion: number tweens, chart pulse and smooth scrolling are
   * decorative. Under prefers-reduced-motion they resolve instantly (or are
   * skipped) so settled values are final in the same call stack. */
  function reducedMotion() {
    try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
    catch (e) { return false; }
  }

  /* ---------------- animated rolling numbers ---------------- */
  var NUMCONF = {
    kpiWinRate: 'pct1', kpiROI: 'pct1', kpiProfit: 'moneySign',
    statWagered: 'money', statPotential: 'money',
    statLive: 'int', statPending: 'int', statWon: 'int', statLost: 'int',
    donutValue: 'pct0', analyticsTrendHeadline: 'moneyLoose'
  };
  var lastVals = new Map(), rafIds = new Map();
  /* Sign-aware: the app formats negative money as "-$1.80" (sign separated
   * from the digits by "$") and moneyLoose uses U+2212, so a bare -?\d+
   * match drops the minus and the tween re-renders a negative profit as
   * positive. Look for a minus in the prefix before the digits instead. */
  function parseNum(txt) { if (txt == null) return null; var s = String(txt).replace(/,/g, ''); var m = s.match(/\d+(?:\.\d+)?/); if (!m) return null; var v = Number(m[0]); if (/[-−]/.test(s.slice(0, m.index))) v = -v; return v; }
  function moneyStr(v) { return '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function fmt(kind, v) {
    if (kind === 'money') return moneyStr(v);
    if (kind === 'moneySign') return (v < 0 ? '-' : v > 0 ? '+' : '') + moneyStr(v);
    if (kind === 'moneyLoose') return (v < 0 ? '−' : '') + '$' + Math.abs(v).toFixed(2);
    if (kind === 'pct1') return v.toFixed(1) + '%';
    if (kind === 'pct0') return Math.round(v) + '%';
    return String(Math.round(v));
  }
  function tween(el, kind, from, to) {
    if (reducedMotion()) { el.textContent = fmt(kind, to); return; }
    var id = el.id;
    if (rafIds.has(id)) cancelAnimationFrame(rafIds.get(id));
    var start = null, dur = 650;
    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min(1, (ts - start) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(kind, from + (to - from) * e);
      if (p < 1) rafIds.set(id, requestAnimationFrame(step)); else rafIds.delete(id);
    }
    rafIds.set(id, requestAnimationFrame(step));
  }
  function wrapRender(fnName, ids) {
    var orig = window[fnName];
    if (typeof orig !== 'function') return;
    window[fnName] = function () {
      var pre = {};
      ids.forEach(function (id) { var el = $(id); if (el) pre[id] = parseNum(el.textContent); });
      var out = orig.apply(this, arguments);
      ids.forEach(function (id) {
        var el = $(id); if (!el) return;
        var target = parseNum(el.textContent); if (target === null) return;
        var prev = lastVals.has(id) ? lastVals.get(id) : pre[id];
        lastVals.set(id, target);
        if (prev !== null && prev !== undefined && prev !== target) tween(el, NUMCONF[id], prev, target);
      });
      return out;
    };
  }

  /* ---------------- chart pulse ---------------- */
  function chartPulse() {
    setInterval(function () {
      if (reducedMotion()) return; // chart pulse is decorative re-animation
      var p = $('analyticsPage'); if (!p || p.hidden) return;
      document.querySelectorAll('#analyticsPage canvas').forEach(function (c) {
        if (c._chart) { try { c._chart.update(); } catch (e) { /* chart mid-draw */ } }
      });
    }, 5000);
  }

  /* ---------------- Polymarket .com wallet import — RETIRED ----------------
   * The legacy importer pulled .com positions from Polymarket's public
   * wallet positions endpoint. Polymarket has shut that endpoint down
   * (it answers HTTP 410 Gone), so the path is retired: this panel keeps
   * its browser-storage behaviour for any previously saved address, but
   * the Import action performs NO network call and imports nothing — it
   * explains the retirement and points at the live path, the Polymarket
   * US API import (polymarket-us.js), which is how the account connects. */
  function wirePolymarket() {
    var input = $('pmWallet'), status = $('pmStatus');
    if (!input || !status) return;
    var saved = '';
    try { saved = localStorage.getItem(LS_PM) || ''; } catch (e) { /* storage unavailable */ }
    input.value = saved;
    if (saved) status.textContent = 'Wallet address saved in this browser from before the retirement. It is never sent anywhere now — the Polymarket US API import below is the live path.';
    $('pmSave').addEventListener('click', function () {
      var v = input.value.trim();
      if (v && !/^0x[0-9a-fA-F]{40}$/.test(v)) { status.textContent = 'That does not look like a wallet address (expected 0x + 40 hex characters). Nothing saved.'; return; }
      try { if (v) localStorage.setItem(LS_PM, v); else localStorage.removeItem(LS_PM); } catch (e) { /* ignore */ }
      status.textContent = v ? 'Wallet address saved in this browser only.' : 'Wallet address cleared.';
    });
    $('pmImport').addEventListener('click', function () {
      var addr = input.value.trim();
      if (!addr) { status.textContent = 'Add your Polymarket wallet address first — this field ships empty on purpose. Your address is public on-chain info, not a password.'; return; }
      if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) { status.textContent = 'That does not look like a wallet address (expected 0x + 40 hex characters).'; return; }
      status.textContent = 'Polymarket retired the public wallet positions endpoint (it answers HTTP 410 Gone now), so .com wallet import is retired in Bet Lab. Your Polymarket account connects via the Polymarket US API import below — nothing was imported and no records were changed.';
    });
  }

  /* ---------------- Kalshi connector (structure; disabled) ---------------- */
  var KalshiClient = {
    baseUrl: 'https://api.elections.kalshi.com/trade-api/v2',
    keyId: '',
    get configured() { return Boolean(this.keyId); },
    // Signed requests need the account's RSA private key. That secret must
    // never live in a web page, so every call refuses until a secure local
    // signer exists. This is the client structure only — no fake data.
    request: async function () {
      throw new Error('Kalshi is not connected: signed requests require your RSA private key, which is never stored in this page by design.');
    },
    getPortfolio: function () { return this.request('/portfolio/positions'); },
    getOrders: function () { return this.request('/portfolio/orders'); },
    // Scaffold mapping ONLY (PREVIEW-06): converts a Kalshi position-shaped
    // fixture to a Bet Lab bet, or null when unmappable. The shape below
    // (ticker/title/side/avgPrice/count/cost) is a scaffold contract, NOT
    // validated against the live Kalshi API — requests are disabled until a
    // secure signer exists, so no live position has ever passed through it.
    // Security review: the Key ID is a public identifier, not a secret, and
    // is stored only in this browser's localStorage; the RSA private key is
    // never requested, pasted, stored, or bundled, and no Kalshi credential
    // is written to any database, log, or board. Enabling live calls needs
    // a morning decision: a secure local signer (server-side or device-side)
    // that holds the private key outside this page — see TASK-0033.
    toBet: function (pos) {
      if (!pos || !pos.ticker || !pos.title) return null;
      var count = Number(pos.count), cost = Number(pos.cost), avg = Number(pos.avgPrice);
      if (!(count > 0) || !(cost > 0) || !(avg > 0) || !(avg < 1)) return null;
      var side = String(pos.side || 'yes').toLowerCase();
      if (side !== 'yes' && side !== 'no') return null;
      var odds = avg >= 0.5 ? -Math.round(100 * avg / (1 - avg)) : Math.round(100 * (1 - avg) / avg);
      return {
        game: String(pos.title), selection: String(pos.title) + ' — ' + side.toUpperCase(),
        book: 'Kalshi', sport: 'Other', stake: round2(cost), payout: round2(count), odds: odds,
        status: 'Open', source: 'Kalshi API import (scaffold)',
        ticket: 'KAL-' + String(pos.ticker) + '-' + side,
        legs: [String(pos.title) + ' ' + side.toUpperCase()], importedAt: new Date().toISOString()
      };
    }
  };
  window.BetLabKalshi = KalshiClient;
  function wireKalshi() {
    var input = $('kalshiKey'), status = $('kalshiStatus');
    if (!input || !status) return;
    var saved = '';
    try { saved = localStorage.getItem(LS_KALSHI) || ''; } catch (e) { /* ignore */ }
    input.value = saved; KalshiClient.keyId = saved;
    if (saved) status.textContent = 'Key ID saved in this browser (…' + saved.slice(-4) + '). Requests stay disabled until a secure signer exists — by design.';
    $('kalshiSave').addEventListener('click', function () {
      var v = input.value.trim();
      try { if (v) localStorage.setItem(LS_KALSHI, v); else localStorage.removeItem(LS_KALSHI); } catch (e) { /* ignore */ }
      KalshiClient.keyId = v;
      status.textContent = v ? 'Key ID saved in this browser only. Requests stay disabled until a secure signer exists — by design.' : 'Key ID cleared. Not connected.';
    });
  }

  /* ---------------- Scout ---------------- */
  function scoutNotesFor(ev) {
    var comp = ev.competitions && ev.competitions[0]; if (!comp) return [];
    var teams = comp.competitors || [];
    var away = teams.find(function (t) { return t.homeAway === 'away'; });
    var home = teams.find(function (t) { return t.homeAway === 'home'; });
    if (!away || !home) return [];
    function nm(t) { return (t.team && (t.team.shortDisplayName || t.team.displayName || t.team.abbreviation)) || ''; }
    function rec(t, kind) { var r = (t.records || []).find(function (x) { return x.name === kind; }); return r ? r.summary : ''; }
    var out = [];
    var when = ev.status && ev.status.type && ev.status.type.shortDetail ? ev.status.type.shortDetail : 'Scheduled';
    out.push('<b>' + esc(nm(away)) + (rec(away, 'overall') ? ' (' + esc(rec(away, 'overall')) + ')' : '') + ' at ' + esc(nm(home)) + (rec(home, 'overall') ? ' (' + esc(rec(home, 'overall')) + ')' : '') + '</b> — ' + esc(when));
    if (rec(away, 'streak')) out.push(esc(nm(away)) + ' streak: <b>' + esc(rec(away, 'streak')) + '</b> per ESPN team record.');
    if (rec(home, 'streak')) out.push(esc(nm(home)) + ' streak: <b>' + esc(rec(home, 'streak')) + '</b> per ESPN team record.');
    var odds = comp.odds && comp.odds[0];
    if (odds && odds.details) out.push('Posted line in the feed' + (odds.provider && odds.provider.name ? ' (' + esc(odds.provider.name) + ')' : '') + ': <b>' + esc(odds.details) + '</b>' + (odds.overUnder ? ' · O/U ' + esc(String(odds.overUnder)) : ''));
    try {
      var mine = (typeof bets !== 'undefined' ? bets : []).filter(function (b) {
        return b.status === 'Open' && b.game && nm(away).length > 2 && nm(home).length > 2 && (b.game.indexOf(nm(away)) >= 0 || b.game.indexOf(nm(home)) >= 0);
      });
      if (mine.length) out.push('You have <b>' + mine.length + '</b> open ticket(s) tied to this matchup — see Bet Tracker.');
    } catch (e) { /* tracker cross-ref is best-effort */ }
    return out;
  }
  async function loadScout() {
    var status = $('scoutStatus'), box = $('scoutNotes');
    if (!status || !box) return;
    status.textContent = 'Loading ESPN scoreboard…';
    try {
      var r = await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard', { cache: 'no-store' });
      if (!r.ok) throw new Error('ESPN answered HTTP ' + r.status);
      var data = await r.json();
      var events = data.events || [];
      box.replaceChildren();
      if (!events.length) {
        box.innerHTML = '<p class="notice">No NFL games on the board right now. Scout notes appear here on game days — nothing is invented to fill the space.</p>';
        status.textContent = 'ESPN feed reached · 0 games listed.';
        return;
      }
      var count = 0;
      events.forEach(function (ev) {
        scoutNotesFor(ev).forEach(function (n) {
          var div = document.createElement('div'); div.className = 'bl-note-item'; div.innerHTML = n; box.append(div); count++;
        });
      });
      if (!count) box.innerHTML = '<p class="notice">Games are listed, but the feed carries no records or lines to note yet.</p>';
      status.textContent = 'ESPN feed · ' + events.length + ' game(s) · updated ' + new Date().toLocaleTimeString();
    } catch (e) {
      box.replaceChildren();
      status.textContent = 'Scout could not reach the ESPN feed (' + e.message + '). No notes shown rather than invented ones — tap Refresh to retry.';
    }
  }

  /* ---------------- init ---------------- */
  try { buildPages(); } catch (e) { console.warn('Bet Lab preview: page build skipped', e); }
  try { wireNav(); } catch (e) { console.warn('Bet Lab preview: nav wiring skipped', e); }
  try {
    wrapRender('renderDashboard', Object.keys(NUMCONF).filter(function (id) { return id !== 'analyticsTrendHeadline'; }));
    wrapRender('renderAnalyticsCharts', ['analyticsTrendHeadline']);
  } catch (e) { console.warn('Bet Lab preview: number animation skipped', e); }
  try { chartPulse(); } catch (e) { /* non-fatal */ }
  try { wirePolymarket(); } catch (e) { console.warn('Bet Lab preview: Polymarket module skipped', e); }
  try { wireKalshi(); } catch (e) { console.warn('Bet Lab preview: Kalshi module skipped', e); }
  var sr = $('scoutRefresh');
  if (sr) sr.addEventListener('click', function () { loadScout(); });
})();
