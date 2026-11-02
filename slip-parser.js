/* Bet Lab slip parser — turns raw OCR text from a bet-slip screenshot into
 * structured ticket objects. One screenshot can contain several tickets
 * (Novig portfolio screens), and the same ticket can appear in several
 * screenshots, so callers should dedupe on (book, ticketId) / signature().
 *
 * Design rules (learned from real fixtures, see betiq-pro/test-slips):
 * - Never invent a field. Novig portfolio cards print legs as "Player NN+ Yes"
 *   with NO market named — those legs keep market: null.
 * - Novig portfolio header totals are account values, never stakes/payouts.
 * - When a book prints no odds but stake + payout are known, American odds are
 *   DERIVED from them and flagged oddsSource: 'implied' (never presented as read).
 * - Works in the browser (window.BetLabSlipParser) and in Node (module.exports).
 */
(function (global) {
  'use strict';

  var MARKET_PHRASES = [
    'Anytime TD Scorer', 'Anytime Touchdown Scorer', 'Anytime Touchdown',
    'Longest Reception', 'Longest Rush', 'Rushing Yards', 'Receiving Yards',
    'Passing Yards', 'Receptions', 'Reception', 'Touchdowns', 'Touchdown',
    'Assists', 'Points', 'Yards', 'TD'
  ];
  var MARKET_SQUASH = {
    longestrush: 'Longest Rush', longestreception: 'Longest Reception',
    rushingyards: 'Rushing Yards', receivingyards: 'Receiving Yards',
    passingyards: 'Passing Yards', receptions: 'Receptions',
    anytimetd: 'Anytime TD Scorer', anytimetdscorer: 'Anytime TD Scorer',
    anytimetouchdown: 'Anytime Touchdown', touchdowns: 'Touchdowns'
  };
  var MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

  function cleanPlayerName(name) {
    return String(name || '')
      .replace(/\s+/g, ' ')
      // OCR reads the roman numeral "III" as "Ill" (a surname ending in III).
      .replace(/\bIll\b/g, 'III')
      .replace(/\bIl\b(?=\s*$)/, 'II')
      .trim();
  }

  function detectBook(raw) {
    // Novig portfolio screenshots often never print the word "Novig" — the
    // card fingerprint is "Amount To Pay" + TRADE CREDIT / Parlay Points.
    if (/novig/i.test(raw) || (/amount to pay/i.test(raw) && /(trade credit|parlay points)/i.test(raw))) return 'Novig';
    if (/draftkings|draft kings|\bDK\d{10,}\b/i.test(raw)) return 'DraftKings';
    if (/fanduel/i.test(raw)) return 'FanDuel';
    if (/kalshi/i.test(raw)) return 'Kalshi';
    if (/polymarket/i.test(raw)) return 'Polymarket';
    return 'Other';
  }

  function impliedAmerican(stake, payout) {
    if (!(stake > 0) || !(payout > stake)) return null;
    var ratio = payout / stake - 1;
    return ratio >= 1 ? Math.round(ratio * 100) : -Math.round(100 / ratio);
  }

  function splitNameMarket(text) {
    var t = String(text || '').replace(/\s+/g, ' ').trim();
    for (var i = 0; i < MARKET_PHRASES.length; i++) {
      var m = MARKET_PHRASES[i];
      if (t.toLowerCase().endsWith(m.toLowerCase()) && t.length > m.length) {
        return { player: cleanPlayerName(t.slice(0, t.length - m.length)), market: m };
      }
    }
    return { player: cleanPlayerName(t), market: null };
  }

  /* ---------------- DraftKings receipts: one ticket per screenshot -------- */
  function parseDraftKings(raw, lines) {
    var flat = raw.replace(/\s+/g, ' ');
    var ticketId = (flat.match(/\b(DK\d{10,})\b/) || [])[1] || null;
    var game = null;
    for (var i = 0; i < lines.length; i++) {
      var gm = lines[i].match(/^(.{3,60}?\S)\s+@\s+(.{2,40}\S)/);
      if (gm && !/wager|payout|odds/i.test(lines[i])) {
        game = (gm[1] + ' @ ' + gm[2]).replace(/\s*\+\s*Today.*$/i, '').replace(/\s+Today.*$/i, '').trim();
        break;
      }
    }
    var headerIdx = lines.findIndex(function (l) { return /\d+\s*(?:Pick|Leg)\s+Parlay/i.test(l); });
    var printedOdds = null;
    var headLine = headerIdx >= 0 ? lines[headerIdx] : '';
    var ho = headLine.match(/([+-]\d{2,4})\b/);
    if (ho) printedOdds = Number(ho[1]);
    var legs = [];
    var start = Math.max(0, headerIdx + 1);
    for (var j = start; j < lines.length; j++) {
      var line = lines[j];
      if (/wager amount|total payout|bet placed|receipt/i.test(line)) break;
      var thr = line.match(/^(\d+(?:\.\d+)?)\+$/);
      if (thr && j + 1 < lines.length) {
        var nm = splitNameMarket(lines[j + 1]);
        if (nm.market) { legs.push({ player: nm.player, line: thr[1] + '+', market: nm.market, raw: lines[j + 1] + ' ' + thr[1] + '+' }); j++; continue; }
      }
      // "<threshold>+" glued to the front: "10+ Sample Catcher Receiving Yards"
      var glued = line.match(/^(\d+(?:\.\d+)?)\+\s+(.+)$/);
      if (glued) {
        var nm2 = splitNameMarket(glued[2]);
        if (nm2.market) { legs.push({ player: nm2.player, line: glued[1] + '+', market: nm2.market, raw: line }); continue; }
      }
      // Player name on its own line, market phrase on the next line.
      var isNameOnly = /^[A-Z][A-Za-z.'-]+(?:\s+(?:[A-Z][A-Za-z.'-]+|III|II|Jr\.?|Sr\.?)){0,3}$/.test(line) && !/parlay|cash|receipt|wager|payout/i.test(line);
      if (isNameOnly && j + 1 < lines.length) {
        var nxt = lines[j + 1].trim();
        var isMarket = MARKET_PHRASES.some(function (m) { return nxt.toLowerCase() === m.toLowerCase(); });
        if (isMarket) { legs.push({ player: cleanPlayerName(line), line: null, market: nxt, raw: line + ' — ' + nxt }); j++; continue; }
      }
      // Combined line: "Sam Runner Rushing Yards 18+" (threshold at end)
      var comb = line.match(/^(.+?)\s+(\d+(?:\.\d+)?)\+$/);
      if (comb) {
        var nm3 = splitNameMarket(comb[1]);
        if (nm3.market) { legs.push({ player: nm3.player, line: comb[2] + '+', market: nm3.market, raw: line }); continue; }
      }
    }
    var stakeM = flat.match(/Wager Amount:?\s*\$([\d,]+(?:\.\d{1,2})?)/i);
    var payoutM = flat.match(/Total Payout:?\s*\$([\d,]+(?:\.\d{1,2})?)/i);
    var stake = stakeM ? Number(stakeM[1].replace(/,/g, '')) : 0;
    var payout = payoutM ? Number(payoutM[1].replace(/,/g, '')) : 0;
    var placedAt = null;
    var dm = flat.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),\s+(\d{4}),?\s+(\d{1,2}):(\d{2}):(\d{2})/i);
    if (dm) {
      var mo = MONTHS[dm[1].slice(0, 3).toLowerCase()];
      var d = new Date(Number(dm[3]), mo, Number(dm[2]), Number(dm[4]), Number(dm[5]), Number(dm[6]));
      var p2 = function (n) { return String(n).padStart(2, '0'); };
      placedAt = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + 'T' + p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds());
    }
    var odds = printedOdds, oddsSource = printedOdds !== null ? 'printed' : null;
    if (odds === null) { var imp = impliedAmerican(stake, payout); if (imp !== null) { odds = imp; oddsSource = 'implied'; } }
    return finalize({
      book: 'DraftKings', ticketId: ticketId,
      ticketType: legs.length > 1 ? 'parlay' : 'straight',
      parlayKind: legs.length > 1 && game ? 'SGP' : null,
      legs: legs, stake: stake, payout: payout,
      oddsAmerican: odds, oddsSource: oddsSource,
      stakeType: 'cash', placedAt: placedAt, game: game
    }, raw);
  }

  /* ------------- Novig portfolio screens: several tickets per image ------- */
  function novigLegs(segmentFlat) {
    var legs = [], seen = {};
    var re = /([A-Z][A-Za-z'’.-]+(?:\s+(?:[A-Z][A-Za-z'’.-]+|Ill|III|II|Jr\.?|Sr\.?)){0,3}?)\s+(\d+(?:\.\d+)?)\+\s*Yes/g;
    var m;
    while ((m = re.exec(segmentFlat)) !== null) {
      var player = cleanPlayerName(m[1].replace(/^(?:MATCHED|Pending)\s+/i, ''));
      if (/^(Leg|Parlay|Amount|Buy|Share|Home|Points|Portfolio|Social|Search)$/i.test(player)) continue;
      var key = player.toLowerCase() + '|' + m[2];
      if (seen[key]) continue;
      seen[key] = 1;
      legs.push({ player: player, line: m[2] + '+', market: null, raw: player + ' ' + m[2] + '+ Yes' });
    }
    return legs;
  }

  function parseNovig(raw) {
    var anchors = [], am;
    var anchorRe = /Amount To Pay[^$]{0,30}?\$([\d,]+(?:\.\d{2})?)\s*\$([\d,]+(?:\.\d{2})?)/g;
    while ((am = anchorRe.exec(raw)) !== null) anchors.push({ index: am.index, end: anchorRe.lastIndex, stake: Number(am[1].replace(/,/g, '')), payout: Number(am[2].replace(/,/g, '')) });
    var headers = [], hm;
    var headRe = /(\d+)\s*Leg Parlay\s*[·*•\-]?\s*([\d.]+)x/gi;
    while ((hm = headRe.exec(raw)) !== null) headers.push({ index: hm.index, count: Number(hm[1]), mult: Number(hm[2]) });
    var tickets = [], prevEnd = 0;
    anchors.forEach(function (a, i) {
      // Tail after the money pair may carry TRADE CREDIT and the ID line.
      var nextHead = headers.find(function (h) { return h.index > a.index; });
      var tailLimit = nextHead ? nextHead.index : Math.min(raw.length, a.end + 420);
      var tail = raw.slice(a.end, tailLimit);
      var idM = tail.match(/ID:\s*([0-9a-f]{8,})\s*Placed:\s*(\d{1,2}:\d{2}\s*[AP]M)/i);
      var segEnd = idM ? a.end + idM.index + idM[0].length : a.end;
      var segment = raw.slice(prevEnd, a.index);
      var header = null;
      headers.forEach(function (h) { if (h.index >= prevEnd && h.index < a.index) header = h; });
      var segFlat = segment.replace(/\s+/g, ' ');
      var legs = novigLegs(segFlat);
      var mult = header ? header.mult : null;
      var stakeType = /TRADE CREDIT/i.test(segment + tail) ? 'trade_credit' : 'cash';
      var winPct = null, game = null, market = null;
      if (!header && legs.length === 1) {
        var pm = segFlat.match(/(\d+(?:\.\d+)?)%/);
        if (pm) winPct = Number(pm[1]);
        segment.split(/\n/).forEach(function (ln) {
          var sq = ln.replace(/[^a-z]/gi, '').toLowerCase();
          if (MARKET_SQUASH[sq] && !market) market = MARKET_SQUASH[sq];
        });
        if (market) legs[0].market = market;
        var g = (segment + tail).match(/\b([A-Z]{2,4})\s+([A-Z]{2,4})\s*(?:-|Today\b)/);
        if (g) game = g[1] + ' @ ' + g[2];
      }
      tickets.push(finalize({
        book: 'Novig', ticketId: idM ? idM[1].toLowerCase() : null,
        ticketType: legs.length > 1 ? 'parlay' : 'straight',
        parlayKind: null, legs: legs, stake: a.stake, payout: a.payout,
        oddsAmerican: null, multiplier: mult, stakeType: stakeType,
        placedTimeText: idM ? idM[2].replace(/\s+/g, '') : null,
        winProbability: winPct, game: game
      }, raw));
      prevEnd = segEnd;
      void i;
    });
    return tickets;
  }

  /* ------------------------- generic fallback ----------------------------- */
  function parseGeneric(raw, lines, book) {
    var flat = raw.replace(/\s+/g, ' ');
    var grab = function (re) { var m = flat.match(re); return m ? Number(m[1].replace(/,/g, '')) : 0; };
    var stake = grab(/(?:wager amount|total wager|total stake|amount|cost|risk|bet amount)\s*:?\s*\$([\d,]+(?:\.\d{1,2})?)/i);
    var payout = grab(/(?:total payout|potential payout|max payout|to pay|to win|payout)\s*:?\s*(?:\$[\d,.]+\s+)?\$([\d,]+(?:\.\d{1,2})?)/i);
    var oddsM = flat.match(/(?:total odds|odds)\s*:?\s*([+-]\d{2,5})/i);
    var tidM = flat.match(/(?:bet id|ticket id|receipt id|wager id|reference)\s*[:#]?\s*([A-Za-z0-9-]{6,})/i);
    var legs = [];
    lines.forEach(function (line) {
      if (/(?:over|under|anytime|touchdown|receptions?|receiving|rushing|yards?|points?|\d+\+)/i.test(line) &&
          !/(?:potential payout|total wager|cash out|parlay points|trade credit|portfolio|to pay|total payout|stake|cost|matched)/i.test(line)) {
        legs.push({ player: null, line: null, market: null, raw: line });
      }
    });
    return [finalize({
      book: book, ticketId: tidM ? tidM[1] : null,
      ticketType: legs.length > 1 ? 'parlay' : 'straight',
      legs: legs, stake: stake, payout: payout,
      oddsAmerican: oddsM ? Number(oddsM[1]) : null,
      stakeType: /trade credit/i.test(raw) ? 'trade_credit' : 'cash'
    }, raw)];
  }

  function finalize(t, raw) {
    t.raw = raw;
    t.selections = t.legs.map(function (l) { return l.raw; });
    t.ticket = t.ticketId || '';
    t.odds = t.oddsAmerican || 0;
    return t;
  }

  function parseTickets(raw, filename) {
    var text = String(raw || '');
    var book = detectBook(text);
    var lines = text.split(/\n/).map(function (x) { return x.trim(); }).filter(Boolean);
    var tickets;
    if (book === 'Novig' && /Amount To Pay/i.test(text)) tickets = parseNovig(text);
    else if (book === 'DraftKings') tickets = [parseDraftKings(text, lines)];
    else tickets = parseGeneric(text, lines, book);
    tickets.forEach(function (t) { t.filename = filename || ''; });
    return tickets;
  }

  function signature(t) {
    // Content-based identity. Deliberately NOT id-based: the same real ticket
    // can be extracted with its ID from one screenshot and without it from
    // another (Novig 10-leg: ID visible in one portfolio shot, cut off in the
    // other), and dedupe must still recognise it as the same ticket. Callers
    // should ALSO check ticketId equality when both sides carry one.
    return [String(t.book || '').toLowerCase(),
      t.legs.map(function (l) { return ((l.player || '') + '|' + (l.line || '') + '|' + (l.raw || '')).toLowerCase(); }).join(';'),
      Number(t.stake) || 0, Number(t.payout) || 0].join('|');
  }

  var api = { parseTickets: parseTickets, detectBook: detectBook, impliedAmerican: impliedAmerican, signature: signature, cleanPlayerName: cleanPlayerName };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.BetLabSlipParser = api;
})(typeof window !== 'undefined' ? window : globalThis);
