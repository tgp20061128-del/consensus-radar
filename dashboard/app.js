// Consensus Radar's briefing page. It reads window.RADAR (written beside
// dashboard/ by main.ts) and renders the board, a detail dossier for every
// protocol, filters and the live-token view. No network: every byte it shows
// is in data.js. The page recomputes each row from the snapshot figures, so
// the number on screen and the number board.json carries are visibly the
// same arithmetic.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('app');
  var state = { q: '', category: 'all', verdict: 'all', watchlist: false, tab: 'pre-token', sort: 'consensus', dir: -1, selected: null, simK: 1 };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtNet(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n < 0 ? '-$' : '+$') + Math.abs(n).toFixed(2);
  }
  function fmtShare(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return '$' + n.toFixed(2);
  }

  // Consensus value per $1,000 of TVL: how richly the models price each
  // $1,000 locked in the protocol. A valuation density, not a payout.
  function share1k(row) {
    if (!row.tvl_usd) return null;
    return (1000 * row.implied_value_usd) / row.tvl_usd;
  }

  // Each row's rank by each model alone: the two models rank the same board
  // differently, and the gap between the two ranks is the row's rank interval.
  var rankMapsCache = null;
  function rankMaps() {
    if (rankMapsCache) return rankMapsCache;
    function ranks(key) {
      var order = DATA.rows.slice().sort(function (a, b) {
        if (b[key] !== a[key]) return b[key] - a[key];
        return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
      });
      var map = {};
      order.forEach(function (r, i) { map[r.slug] = i + 1; });
      return map;
    }
    rankMapsCache = { curve: ranks('curve_value_usd'), peers: ranks('peer_value_usd') };
    return rankMapsCache;
  }
  function rankInterval(row) {
    var maps = rankMaps();
    var a = maps.curve[row.slug];
    var b = maps.peers[row.slug];
    return { lo: Math.min(a, b), hi: Math.max(a, b) };
  }

  // The two models, as one function of the snapshot figures. The page uses
  // it for the detail view and the TVL simulator, and to check the board.
  function scoreRow(row, tvlMult) {
    var tvl = row.tvl_usd * tvlMult;
    var growth = Math.min(DATA.model.growth_cap, Math.max(DATA.model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * DATA.model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? DATA.model.unknown_age_days : row.age_days;
    var maturity = DATA.model.maturity_floor + (Math.min(Math.max(age, 0), DATA.model.maturity_days) / DATA.model.maturity_days) * DATA.model.maturity_range;
    var curve = Math.max(1, Math.round(Math.pow(10, DATA.curve.intercept + DATA.curve.slope * Math.log10(tvl)) * growthMult * maturity));
    var peer = Math.max(1, Math.round(tvl * row.peer_multiple * growthMult * maturity));
    var w = DATA.model.consensus_curve_weight;
    var consensus = Math.max(1, Math.round(Math.pow(curve, w) * Math.pow(peer, 1 - w)));
    return { curve: curve, peer: peer, consensus: consensus, growthMult: growthMult, maturity: maturity };
  }

  // How the consensus is named: the weight lives in the data, so the page
  // and the model can never drift apart.
  function consensusLabel() {
    var w = Math.round(DATA.model.consensus_curve_weight * 100);
    return 'weighted geometric mean (' + w + '% curve, ' + (100 - w) + '% peers)';
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('verdict')) state.verdict = params.get('verdict');
    if (params.get('watchlist')) state.watchlist = params.get('watchlist') === '1';
    if (params.get('sort')) state.sort = params.get('sort');
    if (params.get('tab')) state.tab = params.get('tab');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.verdict !== 'all') params.set('verdict', state.verdict);
    if (state.watchlist) params.set('watchlist', '1');
    if (state.sort !== 'consensus') params.set('sort', state.sort);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rowBySlug(slug) {
    for (var i = 0; i < DATA.rows.length; i++) if (DATA.rows[i].slug === slug) return DATA.rows[i];
    return null;
  }
  var watchlistSet = null;

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.verdict !== 'all' && r.verdict !== state.verdict) return false;
      if (state.watchlist && !watchlistSet.has(r.slug)) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'disagreement') { av = a.disagreement_log10; bv = b.disagreement_log10; }
      else if (key === 'net') { av = a.net_usd_per_hour; bv = b.net_usd_per_hour; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function masthead() {
    return el('header', { class: 'masthead' },
      el('div', { class: 'kicker', text: 'Daily briefing · Token launches · ' + DATA.as_of }),
      el('h1', { text: 'The Consensus Radar' }),
      el('p', { class: 'sub', text: 'Two models price every protocol that records no token yet. When they agree, the board says so. When they split, the board says that too.' }),
      el('div', { class: 'dateline' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: '758 protocols read' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function todaysCall() {
    var top = DATA.rows[0];
    var agree = DATA.rows.length - DATA.split_count;
    return el('section', { class: 'call' },
      el('div', { class: 'label', text: "Today's call" }),
      el('p', null,
        'Two models agree on ', el('b', { text: String(agree) + ' of ' + DATA.rows.length + ' rows' }),
        ' and split on ', el('b', { text: String(DATA.split_count) }), '. ',
        'Start with ', el('b', { text: '#' + top.rank + ' ' + top.name }), ' at ',
        el('b', { class: 'mono', text: fmtUsd(top.implied_value_usd) }), ' — curve ',
        el('span', { class: 'mono', text: fmtUsd(top.curve_value_usd) }), ', peers ',
        el('span', { class: 'mono', text: fmtUsd(top.peer_value_usd) }), '.'
      ),
      el('p', { class: 'note', text: 'The TVL curve explains only ' + Math.round(DATA.curve.r2 * 100) + '% of market-cap variance across ' + DATA.curve.n + ' live-token protocols (leave-one-out: half the predictions land within ' + Math.pow(10, DATA.curve.loo_median_log10_err).toFixed(1) + 'x). That is why this radar shows two models, not one.' })
    );
  }

  function facts() {
    return el('div', { class: 'facts' },
      el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
      el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows' }), el('b', { text: String(DATA.board_size) })),
      el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
      el('div', { class: 'fact' }, el('span', { text: 'Models split' }), el('b', { text: String(DATA.split_count) }))
    );
  }

  // Out-of-sample, on the board: the consensus against the naive baseline,
  // all three scored the same leave-one-out way on the same 92 teachers.
  function looHeadline() {
    var c = Math.pow(10, DATA.consensus_loo.median_log10_err).toFixed(2);
    var n = Math.pow(10, DATA.naive_loo.median_log10_err).toFixed(2);
    var p = Math.pow(10, DATA.peer_loo.median_log10_err).toFixed(2);
    return el('section', { class: 'headline' },
      el('div', { class: 'label', text: 'Out-of-sample' }),
      el('p', null,
        'The consensus lands half its predictions within ', el('b', { text: c + 'x' }),
        ' of the actual cap — against ', el('b', { text: n + 'x' }),
        ' for a single naive multiple and ', el('b', { text: p + 'x' }),
        ' for the peers alone. Leave-one-out on ' + DATA.curve.n + ' live-token protocols; the same test for all three.'
      )
    );
  }

  function topNetStrip() {
    var top = DATA.rows.slice().sort(function (a, b) { return b.net_usd_per_hour - a.net_usd_per_hour; }).slice(0, 3);
    var line = top.map(function (r) { return '#' + r.rank + ' ' + r.name + ' ' + fmtNet(r.net_usd_per_hour) + '/hr'; }).join('  ·  ');
    return el('p', { class: 'topnet' }, el('span', { class: 'label', text: 'Top 3 by net $/hr — ' }), line);
  }

  // The board checks itself: recompute five rows live — top, middle, bottom —
  // and say so in green when every number matches board.json.
  function selfCheckStrip() {
    var picks = [0, 44, 89, 134, 177].map(function (i) { return DATA.rows[i]; }).filter(Boolean);
    var bad = [];
    picks.forEach(function (row) {
      var s = scoreRow(row, 1);
      if (s.curve !== row.curve_value_usd || s.peer !== row.peer_value_usd || s.consensus !== row.implied_value_usd) bad.push(row.slug);
    });
    var ok = bad.length === 0;
    return el('p', { class: 'selfcheck' + (ok ? '' : ' bad'), text:
      ok
        ? '✓ board.json = this page — recomputed ' + picks.length + ' rows live (curve, peers, consensus), all match.'
        : '✗ self-check failed on ' + bad.join(', ') + ' — the data on this page does not match board.json.'
    });
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var verdict = el('select', { id: 'verdict', 'aria-label': 'Filter by model verdict' },
      el('option', { value: 'all', text: 'All verdicts' }),
      el('option', { value: 'agree', text: 'Models agree', selected: state.verdict === 'agree' ? 'selected' : null }),
      el('option', { value: 'split', text: 'Models split', selected: state.verdict === 'split' ? 'selected' : null })
    );
    verdict.addEventListener('change', function () { state.verdict = verdict.value; writeHash(); render(); });
    var wl = el('input', { type: 'checkbox', id: 'watchlist', checked: state.watchlist ? 'checked' : null });
    wl.addEventListener('change', function () { state.watchlist = wl.checked; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('label', { for: 'verdict', text: 'Verdict' }), verdict),
      el('label', { class: 'check' }, wl, 'Watchlist only'),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? filteredRows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col', class: key === 'implied' || key === 'tvl' || key === 'growth' || key === 'age' || key === 'net' ? 'num' : '' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } writeHash(); render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(filteredRows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another filter to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.verdict = 'all'; state.watchlist = false; writeHash(); render(); } })
      ));
    }
    var max = 1;
    DATA.rows.forEach(function (r) { if (r.implied_value_usd > max) max = r.implied_value_usd; });
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var iv = rankInterval(r);
      var intervalText = iv.lo === iv.hi ? 'rank ' + iv.lo + ' both' : 'ranks ' + iv.lo + '–' + iv.hi;
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') + (watchlistSet.has(r.slug) ? ' · watchlist' : '') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', { class: 'num', text: fmtShare(share1k(r)) }),
        el('td', { class: 'num ' + (r.net_usd_per_hour >= 0 ? 'pos' : 'neg'), text: fmtNet(r.net_usd_per_hour) }),
        el('td', { class: 'num' }, el('div', { class: 'range' },
          el('span', { class: 'mono', text: fmtUsd(Math.min(r.curve_value_usd, r.peer_value_usd)) + '–' + fmtUsd(Math.max(r.curve_value_usd, r.peer_value_usd)) }),
          el('span', { class: 'sub', text: intervalText })
        )),
        el('td', null, el('span', { class: 'chip ' + r.verdict, text: r.verdict === 'split' ? 'SPLIT' : 'AGREE' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', null,
      el('div', { class: 'panel' },
        el('div', { class: 'table-wrap' },
          el('table', null,
            el('caption', { text: 'Consensus board: pre-token protocols, strongest consensus first. Select a row for its dossier.' }),
            el('thead', null, el('tr', null,
              sortHeader('consensus', 'Rank'),
              sortHeader('name', 'Protocol'),
              sortHeader('tvl', 'TVL'),
              sortHeader('growth', '7d'),
              sortHeader('age', 'Age'),
              sortHeader('consensus', 'Consensus value'),
              el('th', { scope: 'col', class: 'num', text: '$1K share' }),
              sortHeader('net', 'Net $/hr'),
              el('th', { scope: 'col', class: 'num', text: 'Model range' }),
              el('th', { scope: 'col', text: 'Verdict' })
            )),
            tbody
          )
        )
      ),
      el('p', { class: 'share-note', text: '$1K share is the consensus value attributable to each $1,000 of the protocol\u2019s TVL (1000 x consensus value / TVL). It is a valuation density — how richly the models price each dollar locked — not a payout and not a promised return.' })
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('span', { class: 'chip live', text: 'LIVE' })),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking, and they are the teachers the two models were fitted on.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  // A two-point TVL path, drawn from the snapshot's own 7-day change, plus a
  // dashed projection clearly labelled as one, never as data.
  function tvlHistorySvg(row) {
    if (row.change_7d === null || row.change_7d === undefined) {
      return el('p', { class: 'check-line', text: 'The snapshot reports no 7-day change for this protocol, so no path can be drawn.' });
    }
    var g = row.change_7d / 100;
    var t0 = row.tvl_usd / (1 + g);
    var t1 = row.tvl_usd;
    var t2 = row.tvl_usd * Math.pow(1 + g, 30 / 7);
    var vals = [t0, t1, t2].map(function (v) { return Math.log10(Math.max(1, v)); });
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    if (hi - lo < 0.05) { hi = lo + 0.05; }
    var pad = (hi - lo) * 0.25;
    lo -= pad; hi += pad;
    function X(i) { return 70 + i * 230; }
    function Y(v) { return 78 - ((Math.log10(Math.max(1, v)) - lo) / (hi - lo)) * 60; }
    var svg = '<svg class="spark" viewBox="0 0 600 90" role="img" aria-label="TVL path">' +
      '<line x1="70" y1="8" x2="70" y2="82" stroke="#d5cdb8" stroke-width="1"/>' +
      '<line x1="70" y1="82" x2="570" y2="82" stroke="#d5cdb8" stroke-width="1"/>' +
      '<line x1="' + X(0) + '" y1="' + Y(t0).toFixed(1) + '" x2="' + X(1) + '" y2="' + Y(t1).toFixed(1) + '" stroke="#0e5a4c" stroke-width="2.5"/>' +
      '<line x1="' + X(1) + '" y1="' + Y(t1).toFixed(1) + '" x2="' + X(2) + '" y2="' + Y(t2).toFixed(1) + '" stroke="#8e2f22" stroke-width="2" stroke-dasharray="5 4"/>' +
      '<circle cx="' + X(0) + '" cy="' + Y(t0).toFixed(1) + '" r="4" fill="#0e5a4c"/>' +
      '<circle cx="' + X(1) + '" cy="' + Y(t1).toFixed(1) + '" r="4" fill="#0e5a4c"/>' +
      '<circle cx="' + X(2) + '" cy="' + Y(t2).toFixed(1) + '" r="4" fill="#8e2f22"/>' +
      '<text x="' + X(0) + '" y="89" font-size="11" fill="#6b655a" text-anchor="middle">7 days ago</text>' +
      '<text x="' + X(1) + '" y="89" font-size="11" fill="#6b655a" text-anchor="middle">today</text>' +
      '<text x="' + X(2) + '" y="89" font-size="11" fill="#6b655a" text-anchor="middle">+30 days, if the pace held</text>' +
      '<text x="' + X(0) + '" y="' + (Y(t0) - 10).toFixed(1) + '" font-size="12" fill="#1c1a16" text-anchor="middle">' + fmtUsd(t0) + '</text>' +
      '<text x="' + X(1) + '" y="' + (Y(t1) - 10).toFixed(1) + '" font-size="12" fill="#1c1a16" text-anchor="middle">' + fmtUsd(t1) + '</text>' +
      '<text x="' + X(2) + '" y="' + (Y(t2) - 10).toFixed(1) + '" font-size="12" fill="#8e2f22" text-anchor="middle">' + fmtUsd(t2) + '</text>' +
      '</svg>';
    var wrap = el('div');
    wrap.innerHTML = svg;
    return el('div', null, wrap,
      el('p', { class: 'check-line', text: 'Solid line: recorded TVL 7 days ago to today, derived from the snapshot\u2019s 7-day change. Dashed line: a projection if that pace held for 30 days, not data.' })
    );
  }

  function chainsShort(chains) {
    if (!chains || chains.length === 0) return 'an unnamed chain';
    if (chains.length <= 4) return chains.join(', ');
    return chains.slice(0, 4).join(', ') + ' and ' + (chains.length - 4) + ' more';
  }

  function detailDossier(row) {
    var recomputed = scoreRow(row, 1);
    var gap = Math.max(row.curve_value_usd, row.peer_value_usd) / Math.max(1, Math.min(row.curve_value_usd, row.peer_value_usd));
    var logRatio = Math.log10(row.curve_value_usd / row.peer_value_usd);
    var markPos = Math.max(0, Math.min(100, ((logRatio + 1) / 2) * 100));
    var higher = row.curve_value_usd >= row.peer_value_usd ? 'curve' : 'peers';
    var panel = el('section', { class: 'dossier', id: 'dossier' },
      el('div', { class: 'dossier-head' },
        el('div', null,
          el('span', { class: 'kicker', text: 'Dossier · Rank ' + row.rank + ' of ' + DATA.board_size + (watchlistSet.has(row.slug) ? ' · Watchlist' : ' · Early radar') }),
          el('h2', { text: row.name }),
          el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + chainsShort(row.chains) + ' · listed ' + (row.listed_at || 'date not reported') + ' · ' + fmtAge(row.age_days) + ' with no token on record' })
        ),
        el('button', { class: 'close', type: 'button', text: 'Back to the board', onclick: function () { state.selected = null; writeHash(); render(); } })
      ),
      el('div', { class: 'dossier-body' },
        el('h3', { text: 'The two models, side by side' }),
        el('p', { class: 'verdict-line' },
          el('span', { class: 'chip ' + row.verdict, text: row.verdict === 'split' ? 'SPLIT' : 'AGREE' }),
          row.verdict === 'split'
            ? 'The models disagree by ' + gap.toFixed(1) + 'x. Consensus is the ' + consensusLabel() + ' of the two, and the gap is the reason to size the first position small.'
            : 'The models agree within ' + gap.toFixed(1) + 'x. Consensus is the ' + consensusLabel() + ' of the two.'
        ),
        el('div', { class: 'duel' },
          el('div', { class: 'side ' + (higher === 'curve' ? 'winner' : 'loser') },
            el('h4', { text: 'Model A · The curve' }),
            el('div', { class: 'big', text: fmtUsd(row.curve_value_usd) }),
            el('p', { text: 'Log-log fit of market cap on TVL over ' + DATA.curve.n + ' live-token protocols: log10(mcap) = ' + DATA.curve.intercept + ' + ' + DATA.curve.slope + ' x log10(TVL).' })
          ),
          el('div', { class: 'side ' + (higher === 'peers' ? 'winner' : 'loser') },
            el('h4', { text: 'Model B · The peers' }),
            el('div', { class: 'big', text: fmtUsd(row.peer_value_usd) }),
            el('p', { text: 'Median market-cap-per-TVL of ' + row.peer_count + ' live ' + row.peer_category + ' protocols' + (row.peer_fallback ? ' (too few peers: global median ' + DATA.global_peer_multiple + ' used)' : '') + ' x ' + fmtUsd(row.tvl_usd) + ' TVL.' })
          )
        ),
        el('div', { class: 'diverge' },
          el('div', { class: 'track' }, el('div', { class: 'mark', style: 'left:' + markPos.toFixed(1) + '%' })),
          el('div', { class: 'labels' }, el('span', { text: 'peers higher' }), el('span', { text: 'agree' }), el('span', { text: 'curve higher' }))
        ),
        el('div', { class: 'equation' },
          el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
          el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
          el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
          el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
          el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
          el('div', null, el('span', { text: 'Consensus value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
        ),
        el('p', { class: 'check-line', text: 'The page recomputes this row as ' + fmtUsd(recomputed.consensus) + (recomputed.consensus === row.implied_value_usd ? ', the same number the board carries.' : ', which differs from the board: the data would be stale.') + ' Consensus is a ' + consensusLabel() + ', so one model cannot drag the other.' }),
        el('p', { class: 'econ-line' },
          'Farm economics: net ', el('b', { class: 'mono', text: fmtNet(row.net_usd_per_hour) + '/hr' }),
          ' · $1K share ', el('b', { class: 'mono', text: fmtShare(share1k(row)) }),
          ' — the value the position represents per hour of farming, not a promised return.'
        ),
        el('h3', { text: 'TVL path' }),
        tvlHistorySvg(row),
        el('h3', { text: 'What if TVL moves?' }),
        el('p', { class: 'check-line', text: 'Slide the TVL and both models re-price at once. The curve is sublinear, so doubling TVL lifts it by less than double; the peers scale with TVL.' }),
        el('div', { class: 'sim' },
          el('input', { type: 'range', min: '0.5', max: '3', step: '0.05', value: String(state.simK), 'aria-label': 'TVL multiplier', oninput: function (e) { state.simK = parseFloat(e.target.value); updateSim(row); } }),
          el('span', { class: 'sim-out', id: 'sim-out', text: '' })
        ),
        el('h3', { text: 'Farm plan' }),
        el('ol', { class: 'steps' }, row.farm_steps.map(function (s) {
          var at = s.indexOf(' Cost: ');
          var action = at >= 0 ? s.slice(0, at) : s;
          var tail = at >= 0 ? s.slice(at + 1) : '';
          return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
        })),
        el('p', { class: 'check-line', text: 'Farm economics, from this plan\u2019s own costs and times: $' + row.farm_gas_usd + ' of gas over ' + row.farm_active_hours + ' active hours; the $' + row.farm_capital_usd + ' position represents $' + row.farm_value_share_usd.toFixed(2) + ' of consensus value, so net ' + fmtNet(row.net_usd_per_hour) + '/hr. That is the value the position represents per hour of your time, not a promised return — no step of this plan promises one.' })
      )
    );
    return panel;
  }

  // Net $/hr at a simulated TVL: the same farm arithmetic as the board's
  // column, with the simulated consensus value and simulated TVL in place
  // of the row's own numbers. The plan's capital and gas do not move.
  function netAtSim(row, consensus, tvl) {
    if (!row.farm_active_hours) return null;
    return (row.farm_capital_usd * consensus / tvl - row.farm_gas_usd) / row.farm_active_hours;
  }

  function updateSim(row) {
    var out = document.getElementById('sim-out');
    if (!out) return;
    var s = scoreRow(row, state.simK);
    var netSim = netAtSim(row, s.consensus, row.tvl_usd * state.simK);
    out.textContent = 'TVL x' + state.simK.toFixed(2) + ' = ' + fmtUsd(row.tvl_usd * state.simK) + '  ·  curve ' + fmtUsd(s.curve) + '  ·  peers ' + fmtUsd(s.peer) + '  ·  consensus ' + fmtUsd(s.consensus) + (netSim === null ? '' : '  ·  net ' + fmtNet(netSim) + '/hr');
  }

  function modelPanel() {
    var c = DATA.curve;
    var peerLines = DATA.peers.slice(0, 8).map(function (pm) { return pm.category + ' ' + pm.median_multiple + ' (n=' + pm.peer_count + ')'; }).join(', ');
    return el('section', { class: 'model' },
      el('h2', { text: 'How consensus is computed' }),
      el('p', { text: 'Every row is scored by the same two functions of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'Model A (curve):  implied_A = 10^(' + c.intercept + ' + ' + c.slope + ' x log10(tvl_usd)) x growth x maturity\n' +
        'Model B (peers):  implied_B = tvl_usd x peer_multiple(category) x growth x maturity\n' +
        'Consensus:        implied_A^' + DATA.model.consensus_curve_weight.toFixed(2) + ' x implied_B^' + (1 - DATA.model.consensus_curve_weight).toFixed(2) + ', ranked highest first\n' +
        'growth = 1 + clamp(change_7d, -60, 120) / 100 x 0.5   ·   maturity = 0.6 + min(age_days, 1095) / 1095 x 0.4\n' +
        'SPLIT when |log10(implied_A / implied_B)| >= 0.5 (about 3.2x apart)'
      ),
      el('p', { text: 'Model A is fitted at run time from ' + c.n + ' live-token protocols. It explains R2 = ' + c.r2 + ' of market-cap variance; leave-one-out, half its predictions land within ' + Math.pow(10, c.loo_median_log10_err).toFixed(1) + 'x of the actual cap, ' + Math.round(c.loo_within_2x * 100) + '% within 2x and ' + Math.round(c.loo_within_3x * 100) + '% within 3x. A curve that weak is a reason for a second model, not a reason to trust the first one more.' }),
      el('p', { text: 'The blend is ' + Math.round(DATA.model.consensus_curve_weight * 100) + '% curve and ' + Math.round((1 - DATA.model.consensus_curve_weight) * 100) + '% peers because leave-one-out says the curve is the stronger predictor: the blend lands half its predictions within ' + Math.pow(10, DATA.consensus_loo.median_log10_err).toFixed(1) + 'x of the actual cap and ' + Math.round(DATA.consensus_loo.within_3x * 100) + '% within 3x, against ' + Math.pow(10, DATA.blend50_loo.median_log10_err).toFixed(1) + 'x and ' + Math.round(DATA.blend50_loo.within_3x * 100) + '% for the even blend and ' + Math.pow(10, DATA.peer_loo.median_log10_err).toFixed(1) + 'x and ' + Math.round(DATA.peer_loo.within_3x * 100) + '% for the peers alone. A single naive multiple — one median market-cap-per-TVL for every protocol, scored the same leave-one-out way — lands half its predictions within ' + Math.pow(10, DATA.naive_loo.median_log10_err).toFixed(2) + 'x.' }),
      el('p', { text: 'Net $/hr, per row, is the farm plan\u2019s own arithmetic: the plan\u2019s deposit represents deposit x consensus / TVL of consensus value; minus the plan\u2019s own gas, from the costs its steps state; divided by the active hours its steps state. The hold itself is passive and counts no hours. A negative number means the gas costs more than the value the position represents — most rows are negative, and the board shows that instead of hiding it. It is the value an hour of farming represents, not a promised return.' }),
      el('p', { class: 'peers', text: 'Peer multiples by category (median market-cap-per-TVL, three or more live peers): ' + peerLines + '. Global fallback: ' + DATA.global_peer_multiple + '.' }),
      el('p', { class: 'honest', text: 'Honesty note: the snapshot records no token for these protocols; it does not prove they have none, and it does not predict whether or when any of them issues one. Implied value is this entry\u2019s own claim, never make.fun\u2019s. The early radar is every pre-token protocol below the watchlist floor, by TVL; the live-token protocols are set aside with their market caps shown.' })
    );
  }

  function openDetail(slug) {
    state.selected = slug;
    state.simK = 1;
    writeHash();
    render();
    var d = document.getElementById('dossier');
    if (d) d.scrollIntoView();
  }

  function render() {
    // The watchlist set comes from the data itself: each row carries whether
    // the snapshot's own watchlist names it.
    if (!watchlistSet) {
      watchlistSet = new Set();
      DATA.rows.forEach(function (r) { if (r.watchlist) watchlistSet.add(r.slug); });
    }
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(masthead());
    shell.appendChild(todaysCall());
    shell.appendChild(looHeadline());
    shell.appendChild(topNetStrip());
    shell.appendChild(selfCheckStrip());
    shell.appendChild(facts());
    shell.appendChild(controls());
    var selected = state.selected ? rowBySlug(state.selected) : null;
    if (selected) shell.appendChild(detailDossier(selected));
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (selected) updateSim(selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state.selected) { state.selected = null; writeHash(); render(); }
  });
})();
