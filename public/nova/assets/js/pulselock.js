/* ============================================================
   PulseLock — conviction terminal engine (Nova shell, no iframe)
   Contract: EventSource('/stream') → {demo,t,header,pools[50],alerts[8]}
   Formatting: exact spec from mockup/dashboard.html
   ============================================================ */

/* ---------- formatting (locked spec) ---------- */
const fmtUSD = n => n==null ? '--' : n>=1e9 ? '$'+(n/1e9).toFixed(1)+'B' : n>=1e6 ? '$'+(n/1e6).toFixed(1)+'M'
  : n>=1e3 ? '$'+(n/1e3).toFixed(1)+'K' : '$'+n.toFixed(2);
const fmtPct = n => (n==null?'--':(n*100).toFixed(0)+'%');
const fmtAge = s => s<60 ? s+'s' : Math.floor(s/60)+'m '+String(s%60).padStart(2,'0')+'s';
const fmtSlot = n => (n>0 ? n.toLocaleString('en-US') : '—');
const short = a => a ? a.slice(0,4)+'…'+a.slice(-4) : '—';
const scoreCls = n => n>=75 ? 'deep' : n>=55 ? 'watch' : 'idle';

const actLinks = mint => !mint ? [] : [
  ['Photon',     'https://photon-sol.tinyastro.io/en/token/'+mint],
  ['Axiom',      'https://axiom.trade/t/'+mint],
  ['Birdeye',    'https://birdeye.so/token/'+mint+'?chain=solana'],
  ['Dexscreener','https://dexscreener.com/solana/'+mint],
];
const brkHTML = p => (p && p.score ? p.score.parts : []).map(b =>
  `<div class="brk-row"><span class="nm">${esc(b.name)}</span><span class="pt">+${b.pts}</span>` +
  `<span class="tr"><i style="width:${b.max ? Math.min(100, Math.round(b.pts/b.max*100)) : 0}%"></i></span></div>`).join('');

/* ---------- session state ---------- */
let lastSnap = null;
let firstSnap = true;
let lastMsgAt = Date.now();
let selectedKey = null;
let prevState = new Map();     // key → state, for flash/toast on transition
const seenAlertIds = new Set();
let unreadAlerts = 0;
let staleToast = null;         // persistent toast element while stream is stale
let gaveUpToastShown = false;
let flashKeys = new Set();     // rows to flash this render (newly crossed DEEP)

let sortKey = 'score', sortDir = -1;   // score desc by default (server order)
let filterState = 'all';
let searchQ = '';

const $ = id => document.getElementById(id);

/* ================= views (sidebar nav) ================= */
function switchView(id){
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('hidden', v.id !== id));
  document.querySelectorAll('.nav-item[data-view]').forEach(i => i.classList.toggle('active', i.dataset.view === id));
  $('sidebar').classList.remove('mobile-open');
  $('sidebarBackdrop').classList.remove('show');
  document.querySelector('.frame-wrap').scrollTop = 0;
}

/* ================= sidebar / mobile / theme ================= */
function initShell(){
  const collapsed = localStorage.getItem('nova-sidebar-collapsed') === '1';
  $('sidebar').classList.toggle('collapsed', collapsed);
  $('collapseBtn').addEventListener('click', () => {
    const is = $('sidebar').classList.toggle('collapsed');
    localStorage.setItem('nova-sidebar-collapsed', is ? '1' : '0');
  });
  $('menuBtn').addEventListener('click', () => {
    $('sidebar').classList.add('mobile-open');
    $('sidebarBackdrop').classList.add('show');
  });
  $('sidebarBackdrop').addEventListener('click', () => {
    $('sidebar').classList.remove('mobile-open');
    $('sidebarBackdrop').classList.remove('show');
  });
  document.querySelectorAll('.nav-item[data-view]').forEach(i =>
    i.addEventListener('click', () => switchView(i.dataset.view)));

  $('themeToggleBtn').addEventListener('click', () => { NovaTheme.toggle(); updateThemeIcon(); });
  updateThemeIcon();
}
function updateThemeIcon(){
  const light = document.documentElement.classList.contains('light');
  $('themeIcon').innerHTML = light
    ? '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'
    : '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>';
}

/* ================= notifications (real alerts) ================= */
function renderNotifs(alerts){
  const list = $('notifList');
  if (!alerts.length){
    list.innerHTML = '<div class="dropdown-item"><div><div class="t" style="color:var(--text-faint)">No alerts yet — threshold 75</div></div></div>';
  } else {
    list.innerHTML = alerts.slice(0,6).map(a => {
      const id = a.key+'@'+a.at;
      const cls = seenAlertIds.has(id) ? 'read' : 'unread';
      const ago = Math.max(0, Math.round((Date.now()-a.at)/1000));
      return `<div class="dropdown-item ${cls}" data-alert-key="${esc(a.key)}">
        <span class="dot" style="background:var(--mint)"></span>
        <div><div class="t">▲ $${esc(a.label)} — conviction ${a.score}</div>
        <div class="time">fired ${a.latencyMs}ms after event · ${fmtAge(ago)} ago</div></div></div>`;
    }).join('');
  }
  const badge = $('notifBadge');
  badge.textContent = unreadAlerts;
  badge.classList.toggle('hidden', unreadAlerts === 0);
  const nb = $('navAlertBadge');
  nb.textContent = unreadAlerts;
  nb.style.display = unreadAlerts ? '' : 'none';
}
function initNotifications(){
  $('notifBtn').addEventListener('click', e => { e.stopPropagation(); $('notifPanel').classList.toggle('open'); });
  document.addEventListener('click', () => $('notifPanel').classList.remove('open'));
  $('notifPanel').addEventListener('click', e => e.stopPropagation());
  $('markAllRead').addEventListener('click', e => {
    e.stopPropagation();
    if (lastSnap) lastSnap.alerts.forEach(a => seenAlertIds.add(a.key+'@'+a.at));
    unreadAlerts = 0;
    renderNotifs(lastSnap ? lastSnap.alerts : []);
  });
  $('notifList').addEventListener('click', e => {
    const item = e.target.closest('[data-alert-key]');
    if (!item) return;
    selectedKey = item.dataset.alertKey;
    $('notifPanel').classList.remove('open');
    switchView('viewTerminal');
    if (lastSnap) render(lastSnap);
  });
}
function trackAlerts(alerts, isBaseline){
  alerts.forEach(a => {
    const id = a.key+'@'+a.at;
    if (seenAlertIds.has(id)) return;
    seenAlertIds.add(id);
    if (!isBaseline) unreadAlerts++;
  });
}

/* ================= command palette ================= */
let cmdkItems = [], cmdkSel = 0;
function buildCmdkItems(){
  const sel = () => (lastSnap ? lastSnap.pools.find(p => p.key === selectedKey) : null) || (lastSnap ? lastSnap.pools[0] : null);
  const items = [
    {label:'Go to Terminal',   icon:'<rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/>', run:()=>switchView('viewTerminal')},
    {label:'Go to Alerts',     icon:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>', run:()=>switchView('viewAlerts')},
    {label:'Go to Score signals', icon:'<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-4 4"/>', run:()=>switchView('viewSignals')},
    {label:'Open landing page', icon:'<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>', run:()=>{ location.href='/'; }},
    {label:'Toggle light / dark theme', icon:'<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>', run:()=>{ NovaTheme.toggle(); updateThemeIcon(); }},
    {label:'Copy selected mint', icon:'<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>', run:()=>{ const p=sel(); if(p&&p.mint) copyToClipboard(p.mint,'Mint copied'); else showToast('No pool selected','error'); }},
  ];
  const p = sel();
  if (p && p.mint){
    const [ph, phUrl] = actLinks(p.mint)[0];
    items.push({label:`Act on $${p.label} — open ${ph}`, icon:'<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>', run:()=>window.open(phUrl,'_blank','noopener')});
  }
  return items;
}
function renderCmdk(filter=''){
  const q = filter.toLowerCase();
  cmdkItems = buildCmdkItems().filter(i => i.label.toLowerCase().includes(q));
  const list = $('cmdkList');
  if (!cmdkItems.length){ list.innerHTML = '<div class="cmdk-empty">No results found</div>'; return; }
  list.innerHTML = cmdkItems.map((it,i) =>
    `<div class="cmdk-item ${i===cmdkSel?'selected':''}" data-idx="${i}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${it.icon}</svg>${esc(it.label)}</div>`).join('');
  list.querySelectorAll('.cmdk-item').forEach(el =>
    el.addEventListener('click', () => { closeCmdk(); cmdkItems[+el.dataset.idx].run(); }));
}
function openCmdk(){ cmdkSel=0; $('cmdkBackdrop').classList.add('open'); $('cmdkInput').value=''; $('cmdkInput').focus(); renderCmdk(''); }
function closeCmdk(){ $('cmdkBackdrop').classList.remove('open'); }
function initCmdk(){
  $('searchBox').addEventListener('click', openCmdk);
  $('searchBox').addEventListener('keydown', e => { if(e.key==='Enter'||e.key===' '){ e.preventDefault(); openCmdk(); }});
  $('cmdkBackdrop').addEventListener('click', e => { if(e.target.id==='cmdkBackdrop') closeCmdk(); });
  $('cmdkInput').addEventListener('input', e => { cmdkSel=0; renderCmdk(e.target.value); });
  document.addEventListener('keydown', e => {
    if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='k'){ e.preventDefault(); openCmdk(); }
    if(e.key === 'Escape') closeCmdk();
    if(!$('cmdkBackdrop').classList.contains('open')) return;
    const items = document.querySelectorAll('.cmdk-item');
    if(e.key==='ArrowDown'){ e.preventDefault(); cmdkSel=Math.min(cmdkSel+1, items.length-1); renderCmdk($('cmdkInput').value); }
    if(e.key==='ArrowUp'){ e.preventDefault(); cmdkSel=Math.max(cmdkSel-1, 0); renderCmdk($('cmdkInput').value); }
    if(e.key==='Enter'){ const it=cmdkItems[cmdkSel]; if(it){ closeCmdk(); it.run(); } }
  });
}

/* ================= table: sort / filter / search ================= */
function initTableControls(){
  document.querySelectorAll('#poolsTable th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const k = th.dataset.sort;
      if (sortKey === k) sortDir *= -1; else { sortKey = k; sortDir = -1; }
      document.querySelectorAll('#poolsTable th').forEach(x => x.classList.remove('sort-asc','sort-desc'));
      th.classList.add(sortDir === 1 ? 'sort-asc' : 'sort-desc');
      th.querySelector('.sort-arrow').textContent = sortDir === 1 ? '▲' : '▼';
      if (lastSnap) renderTable(lastSnap.pools);
    });
  });
  document.querySelectorAll('[data-chipgroup="state"] .chip').forEach(c =>
    c.addEventListener('click', () => { filterState = c.dataset.filter; if (lastSnap) renderTable(lastSnap.pools); }));
  $('tableSearch').addEventListener('input', e => { searchQ = e.target.value.toLowerCase().trim(); if (lastSnap) renderTable(lastSnap.pools); });
}

function visiblePools(pools){
  let rows = pools.slice();
  if (filterState !== 'all') rows = rows.filter(r => r.state === filterState);
  if (searchQ) rows = rows.filter(r =>
    (r.label+' '+r.dex+' '+r.mint).toLowerCase().includes(searchQ));
  const get = r => sortKey === 'score' ? r.score.total : r[sortKey];
  rows.sort((a,b) => {
    const av = get(a), bv = get(b);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return (av > bv ? 1 : av < bv ? -1 : 0) * sortDir;
  });
  return rows;
}

function renderTable(pools){
  const rows = visiblePools(pools).slice(0, 50);
  const tbody = $('poolRows');
  $('poolEmpty').style.display = rows.length ? 'none' : '';
  $('poolPill').textContent = pools.length + ' pools';
  $('poolInfo').textContent = rows.length
    ? `showing ${rows.length} of ${pools.length} tracked · sorted by ${sortKey === 'score' ? 'conviction' : sortKey} ${sortDir === -1 ? '↓' : '↑'}`
    : 'no pools match the current filter';

  tbody.innerHTML = rows.map(r => {
    const n = r.score.total, cls = scoreCls(n);
    return `<tr data-key="${esc(r.key)}" class="${selectedKey===r.key?'sel':''} ${flashKeys.has(r.key)?'flash':''}">
      <td class="num"><span class="score-cell"><span class="n sc-${cls}">${n}</span>
        <span class="bar"><i class="sc-${cls}" style="width:${n}%;background:currentColor"></i></span></span></td>
      <td><span class="tok">$${esc(r.label)}<small>${esc(r.dex)} · ${short(r.mint)}</small></span></td>
      <td class="num">${fmtAge(r.ageSec)}</td>
      <td class="num">${fmtUSD(r.liqUsd)}</td>
      <td class="num">${fmtUSD(r.vol60)}</td>
      <td class="num">${r.w10}</td>
      <td class="num"><span class="buybar"><i style="width:${Math.round((r.buyRatio||0)*100)}%"></i></span>${fmtPct(r.buyRatio)}</td>
      <td><span class="pill ${r.state==='deep'?'success':r.state==='watch'?'pending':'neutral'}">${r.state.toUpperCase()}</span></td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('tr').forEach(tr => tr.addEventListener('click', () => {
    selectedKey = tr.dataset.key;
    renderTable(lastSnap.pools);
    renderDetail(lastSnap.pools);
  }));
}

/* ================= detail pane ================= */
function renderDetail(pools){
  const p = pools.find(x => x.key === selectedKey) || pools[0];
  if (!p){
    ['dLabel','dDex','dMint','dScore','dLiq','dVol','dAge'].forEach(id => $(id).textContent = '—');
    $('dBrk').innerHTML = ''; $('dAct').innerHTML = ''; $('dFlow').innerHTML = '';
    return;
  }
  if (!selectedKey) selectedKey = p.key;
  const n = p.score.total;
  $('dSub').textContent = p.state.toUpperCase() + ' · alert threshold 75';
  $('dLabel').textContent = '$' + p.label;
  $('dDex').textContent = p.dex;
  $('dMint').textContent = short(p.mint);
  $('dMint').title = p.mint;
  $('dScore').textContent = n;
  $('dScore').className = 'n sc-' + scoreCls(n);
  $('dBrk').innerHTML = brkHTML(p);
  $('dLiq').textContent = fmtUSD(p.liqUsd);
  $('dVol').textContent = fmtUSD(p.vol60);
  $('dAge').textContent = fmtAge(p.ageSec);

  const links = actLinks(p.mint);
  $('dAct').innerHTML = links.length
    ? `<a class="btn btn-primary btn-sm" href="${links[0][1]}" target="_blank" rel="noopener noreferrer">⚡ Act on ${esc(links[0][0])} ↗</a>` +
      links.slice(1,3).map(([l,u]) => `<a class="btn btn-ghost btn-sm" href="${u}" target="_blank" rel="noopener noreferrer">${esc(l)} ↗</a>`).join('')
    : '';

  $('dFlow').innerHTML = (p.swaps||[]).slice(0,10).map(sw => {
    const ago = Math.max(0, Math.round((Date.now()-sw.t)/1000));
    return `<div class="f-row"><span class="s ${sw.side}">${sw.side.toUpperCase()} ${fmtUSD(sw.vol)}</span><span class="a">${fmtAge(ago)} ago</span></div>`;
  }).join('') || '<div class="f-row"><span class="a">no swaps in window</span></div>';
}

/* ================= alerts view ================= */
function renderAlerts(alerts){
  $('alertPill').textContent = alerts.length + ' fired';
  $('alertEmpty').style.display = alerts.length ? 'none' : '';
  const links0 = a => actLinks(a.mint);
  $('alertFeed').innerHTML = alerts.map(a => {
    const links = links0(a);
    const ago = Math.max(0, Math.round((Date.now()-a.at)/1000));
    return `<div class="alert-card">
      <div class="sc sc-${scoreCls(a.score)}">${a.score}</div>
      <div class="body">
        <div class="t1">$${esc(a.label)} <span style="color:var(--text-faint);font-weight:400">· ${esc(a.dex)}</span></div>
        <div class="t2">fired ${a.latencyMs}ms after event · ${fmtAge(ago)} ago · liq ${fmtUSD(a.liqUsd)} · vol ${fmtUSD(a.vol60)} · w/10s ${a.w10} · buy ${fmtPct(a.buyRatio)}</div>
      </div>
      <div class="acts">${links.length ? `<a class="btn btn-primary btn-sm" href="${links[0][1]}" target="_blank" rel="noopener noreferrer">⚡ ${esc(links[0][0])} ↗</a>` : ''}</div>
    </div>`;
  }).join('');
}

/* ================= header chips / stats / ticker ================= */
function renderHeader(s){
  const h = s.header;
  $('tSlot').textContent = fmtSlot(h.slot);

  const freshChip = $('tFreshChip');
  if (h.freshnessMs == null){ $('tFresh').textContent = '—'; freshChip.className = 'chip-stat'; }
  else {
    $('tFresh').textContent = (h.freshnessMs/1000).toFixed(2)+'s';
    freshChip.className = 'chip-stat ' + (h.freshnessMs < 2000 ? 'ok' : h.freshnessMs < 5000 ? 'warn' : 'bad');
  }
  $('tFire').textContent = 'firehose ' + (h.firehose ? 'ON' : 'OFF');
  $('tFireDot').className = 'livedot' + (h.firehose ? '' : ' off');
  $('tFireChip').className = 'chip-stat ' + (h.firehose ? 'ok' : 'bad');

  $('tDeep').textContent = 'deep ' + h.deepN;
  $('tDeepDot').className = 'livedot' + (h.gRPCGaveUp ? ' off' : h.deepN > 0 ? '' : ' amber');
  $('tDeepChip').className = 'chip-stat ' + (h.gRPCGaveUp ? 'bad' : '');

  let rc = `blur:${h.blurReconnects} grpc:${h.grpcReconnects}`;
  if (h.replayed > 0) rc += ` · +${h.replayed} replayed`;
  if (h.pongs > 0) rc += ` · ping ${h.pongs}`;
  $('tReconn').innerHTML = '<b>'+esc(rc)+'</b>';
  $('tReconn').className = 'chip-stat ' + (h.gRPCGaveUp ? 'bad' : '');

  $('tEvents').textContent = h.events.toLocaleString('en-US');

  $('stEvents').textContent = h.events.toLocaleString('en-US');
  $('stPools').textContent = h.pools.toLocaleString('en-US');
  $('stDeep').textContent = h.deepN;
  $('stLatency').textContent = s.alerts.length ? s.alerts[0].latencyMs + 'ms' : '—';

  // mode / demo
  const pill = $('modePill'), wm = $('wm');
  if (s.demo){ pill.textContent = 'DEMO'; pill.className = 'mode-pill demo'; wm.style.display = 'block'; }
  else { pill.textContent = 'LIVE'; pill.className = 'mode-pill'; wm.style.display = 'none'; }
  $('sfDot').className = 'livedot' + (h.firehose ? '' : ' off');
  $('sfMode').textContent = s.demo ? 'SYNTHETIC FEED' : (h.firehose ? 'MAINNET LIVE' : 'RECONNECTING…');
}

function renderTicker(pools){
  const top = pools.slice(0,10);
  if (!top.length) return;
  const item = p => `<div class="ticker-item">$${esc(p.label)} <b class="t-sc ${scoreCls(p.score.total)}">${p.score.total}</b>` +
    ` <span>liq ${fmtUSD(p.liqUsd)}</span> <span>vol ${fmtUSD(p.vol60)}</span> <span>w/10s ${p.w10}</span></div>`;
  $('tickerTrack').innerHTML = top.map(item).join('') + top.map(item).join('');
}

function renderSignalsExample(pools){
  const p = pools[0];
  if (!p) return;
  $('sigExLabel').textContent = '$' + p.label + ' = ' + p.score.total;
  $('sigExample').innerHTML = brkHTML(p) +
    `<div style="margin-top:10px;font-family:var(--font-mono);font-size:11.5px;color:var(--text-faint)">` +
    p.score.parts.map(b => `+${b.pts} ${b.name.toLowerCase()}`).join(' · ') +
    ` <b style="color:var(--text)">= ${p.score.total}</b></div>`;
}

/* ================= transitions (flash + toast) ================= */
function trackTransitions(pools){
  for (const p of pools){
    const prev = prevState.get(p.key);
    if (p.state === 'deep' && prev && prev !== 'deep' && !firstSnap){
      showToast(`▲ $${p.label} crossed DEEP — ${p.score.total}`, 'success', 6000);
      flashKeys.add(p.key);
    }
  }
  prevState = new Map(pools.map(p => [p.key, p.state]));
}

/* ================= stale detection ================= */
function initStaleWatch(){
  setInterval(() => {
    const stale = Date.now() - lastMsgAt > 4000;
    if (stale && !staleToast){
      staleToast = showPersistentToast('Stream stale — reconnecting…', 'error', 'staleToast');
    } else if (!stale && staleToast){
      const btn = staleToast.querySelector ? staleToast.querySelector('.toast-close') : null;
      if (btn) btn.click();
      staleToast = null;
    }
    if (stale){ $('sfMode').textContent = 'STALE — RECONNECTING'; $('sfDot').className = 'livedot off'; }
  }, 1000);
}

/* ================= render ================= */
function render(s){
  lastSnap = s;
  lastMsgAt = Date.now();

  trackAlerts(s.alerts, firstSnap);
  trackTransitions(s.pools);          // detect newly-deep → toast + flash keys
  renderHeader(s);
  renderTicker(s.pools);
  renderTable(s.pools);               // consumes flashKeys
  renderDetail(s.pools);
  renderAlerts(s.alerts);
  renderNotifs(s.alerts);
  renderSignalsExample(s.pools);
  flashKeys.clear();

  if (s.header.gRPCGaveUp && !gaveUpToastShown){
    gaveUpToastShown = true;
    showPersistentToast('gRPC unavailable — running Blur-only (check SOLAMI_GRPC_*)', 'info');
  }
  firstSnap = false;
}

/* ================= boot ================= */
function boot(){
  initShell();
  initNotifications();
  initCmdk();
  initTableControls();
  initStaleWatch();

  $('dCopyMint').addEventListener('click', () => {
    const p = lastSnap ? (lastSnap.pools.find(x => x.key === selectedKey) || lastSnap.pools[0]) : null;
    if (p && p.mint) copyToClipboard(p.mint, 'Mint copied');
    else showToast('No pool selected', 'error');
  });

  const es = new EventSource('/stream');
  es.onmessage = e => { try { render(JSON.parse(e.data)); } catch (err) { console.error('snapshot parse', err); } };
  // EventSource auto-reconnects; the stale watcher owns the reconnect UI
}
document.addEventListener('DOMContentLoaded', boot);
