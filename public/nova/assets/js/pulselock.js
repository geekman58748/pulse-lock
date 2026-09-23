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
const fmtPrice = n => {
  if (!n) return '--';
  if (n >= 1) return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 4 });
  let s = String(Number(n.toPrecision(4)));
  if (s.includes('e')) s = n.toFixed(11).replace(/0+$/, '').replace(/\.$/, '');
  return '$' + s;
};
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

/* ---------- sparkline (option B: price motion, zero deps) ---------- */
function sparkSVG(prices){
  if (!prices || prices.length < 3) return '';
  const w = 300, h = 48, ps = prices.map(x => x.p);
  const min = Math.min(...ps), max = Math.max(...ps), span = (max - min) || 1;
  const pts = ps.map((p, i) =>
    `${(i / (ps.length - 1) * w).toFixed(1)},${(h - 3 - ((p - min) / span) * (h - 6)).toFixed(1)}`).join(' ');
  const up = ps[ps.length - 1] >= ps[0];
  const color = up ? 'var(--mint)' : 'var(--red)';
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none" style="color:${color}">` +
    `<polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
}

/* ---------- PnL + shareable call card (canvas, zero deps) ---------- */
const fmtPnl = v => v==null ? '' : (v>=0?'+':'\u2212') + (Math.abs(v)>=100 ? Math.abs(v).toFixed(0) : Math.abs(v).toFixed(1)) + '%';
const pnlClass = v => v==null ? 'flat' : v >= 0 ? 'up' : 'down';

/* "According to Solami" — summary built from the fire-time metrics */
function buildInsight(a){
  const bits = [];
  bits.push(`${a.w10} unique wallet${a.w10===1?'':'s'} in the 10s before the call`);
  bits.push(`${fmtPct(a.buyRatio)} buy pressure across ${fmtUSD(a.vol60)} of 1m volume`);
  if (a.liqUsd) bits.push(`${fmtUSD(a.liqUsd)} liquidity at fire`);
  let s = 'According to Solami \u2014 ' + bits.join(', ') + '.';
  s += ` Caught ${a.latencyMs}ms after the triggering swap`;
  if (a.freshMs != null) s += ` with the stream ${((a.freshMs/1000)).toFixed(2)}s fresh`;
  s += '.';
  if (a.pnlPct != null) s += ` Since the call: ${fmtPnl(a.pnlPct)}.`;
  return s;
}

function seriesSince(a){
  const pools = lastSnap ? lastSnap.pools : [];
  const p = pools.find(x => x.key === a.key);
  // live pool series first; fall back to the alert's own persisted snapshot
  // so call cards still draw for old/evicted pools after a restart
  const raw = (p && p.prices && p.prices.length >= 3)
    ? p.prices
    : ((a.hist && a.hist.length >= 3) ? a.hist : []);
  if (!raw.length) return [];
  const since = raw.filter(pt => pt.t >= a.at - 2000);
  return since.length >= 3 ? since : raw.slice(-40);
}

async function shareCard(a){
  const W = 1080, H = 1080, PAD = 72;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  try { await document.fonts.ready; } catch(e){}
  const disp = s => { c.font = s.replace('FONT', "'Space Grotesk'"); };
  const mono = s => { c.font = s.replace('MONO', "'JetBrains Mono'"); };
  const C = { bg:'#0A0A0B', panel:'#141416', border:'rgba(255,255,255,0.09)', text:'#F7F5F4',
    mut:'#98928C', faint:'#5E5852', acc:'#FF640D', red:'#FB7185' };

  // background + bottom horizon glow (matches /app)
  c.fillStyle = C.bg; c.fillRect(0,0,W,H);
  const g = c.createLinearGradient(0,H,0,H*0.55);
  g.addColorStop(0,'rgba(255,100,13,0.22)'); g.addColorStop(1,'rgba(255,100,13,0)');
  c.fillStyle = g; c.fillRect(0,H*0.55,W,H*0.45);
  c.strokeStyle = C.border; c.lineWidth = 2; c.strokeRect(24,24,W-48,H-48);

  const rr = (x,y,w,h,r,fill,stroke) => { c.beginPath(); c.roundRect(x,y,w,h,r);
    if (fill){ c.fillStyle = fill; c.fill(); } if (stroke){ c.strokeStyle = stroke; c.stroke(); } };
  const left = (txt,x,y) => c.fillText(txt,x,y);
  const acc = txt => { c.fillStyle = C.acc; };
  const wrap = (text,x,y,maxW,lh) => { const words = text.split(' '); let line = '', yy = y;
    for (const w of words){ const t = line ? line+' '+w : w;
      if (c.measureText(t).width > maxW){ c.fillText(line,x,yy); line = w; yy += lh; } else line = t; }
    if (line) c.fillText(line,x,yy); return yy; };

  // header
  disp('700 34px FONT'); c.fillStyle = C.acc; left('⚡', PAD, 104);
  c.fillStyle = C.text; left('PULSELOCK', PAD+44, 104);
  disp('700 22px FONT'); const pillT = 'CALLED';
  const pw = c.measureText(pillT).width + 34;
  rr(W-PAD-pw, 76, pw, 40, 20, C.acc); c.fillStyle = C.bg; left(pillT, W-PAD-pw+17, 103);

  // token + score
  disp('700 66px FONT'); c.fillStyle = C.text; left('$'+a.label, PAD, 205);
  mono('24px MONO'); c.fillStyle = C.mut; left(`${a.dex} · fired ${a.latencyMs}ms after event`, PAD, 245);
  disp('700 72px FONT'); c.fillStyle = C.acc;
  c.textAlign = 'right'; left(String(a.score), W-PAD, 205);
  disp('600 18px FONT'); c.fillStyle = C.mut;
  left('CONVICTION', W-PAD, 238); c.textAlign = 'left';

  // PnL hero
  const up = (a.pnlPct ?? 0) >= 0;
  disp('700 128px FONT'); c.fillStyle = a.pnlPct==null ? C.mut : (up ? C.acc : C.red);
  const pnlTxt = a.pnlPct==null ? '—' : fmtPnl(a.pnlPct);
  left(pnlTxt, PAD, 385);
  disp('600 20px FONT'); c.fillStyle = C.mut; left('SINCE CALL', PAD+4, 425);
  mono('26px MONO'); c.fillStyle = C.text;
  const fmtP = v => v ? (v>=1 ? '$'+v.toFixed(4) : '$'+String(Number(v.toPrecision(4)))) : '—';
  left(`${fmtP(a.priceAt)}  →  ${fmtP(a.priceNow)}`, PAD, 475);

  // sparkline of prices since the call
  const pts = seriesSince(a); const sy = 515, sh = 200, sx = PAD, sw = W - PAD*2;
  rr(sx, sy, sw, sh, 14, 'rgba(255,255,255,0.03)', C.border);
  if (pts.length >= 3){
    const vals = pts.map(p => p.p); const mn = Math.min(...vals), mx = Math.max(...vals), sp = (mx-mn)||1;
    const X = i => sx + 14 + (i/(pts.length-1))*(sw-28);
    const Y = v => sy + sh - 18 - ((v-mn)/sp)*(sh-36);
    const line = new Path2D(); line.moveTo(X(0), Y(vals[0]));
    vals.forEach((v,i) => line.lineTo(X(i), Y(v)));
    const area = new Path2D(line); area.lineTo(X(vals.length-1), sy+sh-10); area.lineTo(X(0), sy+sh-10); area.closePath();
    const ag = c.createLinearGradient(0,sy,0,sy+sh); ag.addColorStop(0,'rgba(255,100,13,0.30)'); ag.addColorStop(1,'rgba(255,100,13,0)');
    c.fillStyle = ag; c.fill(area);
    c.strokeStyle = a.pnlPct!=null && a.pnlPct<0 ? C.red : C.acc; c.lineWidth = 3; c.stroke(line);
  } else {
    mono('22px MONO'); c.fillStyle = C.faint; c.textAlign='center';
    left('price series from Solami swaps', W/2, sy+sh/2+8); c.textAlign='left';
  }

  // metrics row
  const mets = [['LIQ', fmtUSD(a.liqUsd)], ['1M VOL', fmtUSD(a.vol60)], ['W/10S', String(a.w10)], ['BUY', fmtPct(a.buyRatio)]];
  const my = 782, cw = (W-PAD*2)/4;
  mets.forEach(([k,v],i) => {
    mono('700 32px MONO'); c.fillStyle = C.text; left(v, PAD+i*cw, my);
    disp('600 17px FONT'); c.fillStyle = C.faint; left(k, PAD+i*cw, my+30);
  });

  // Solami insight panel
  const iy = 842, ih = 158;
  rr(PAD, iy, W-PAD*2, ih, 16, C.panel, C.border);
  disp('700 19px FONT'); c.fillStyle = C.acc; left('◉ SOLAMI INSIGHT', PAD+24, iy+38);
  disp('400 23px FONT'); c.fillStyle = '#C9C4BE';
  wrap(buildInsight(a), PAD+24, iy+74, W-PAD*2-48, 32);

  // footer
  disp('500 19px FONT'); c.fillStyle = C.faint;
  left('powered by solami · blur firehose + yellowstone grpc', PAD, H-52);
  c.textAlign = 'right'; c.fillStyle = C.acc; disp('700 19px FONT');
  left('pulselock · mainnet live', W-PAD, H-52); c.textAlign = 'left';

  const done = msg => showToast(msg, 'success');
  const fname = `pulselock-${String(a.label).replace(/[^A-Za-z0-9]/g,'')}-${a.pnlPct!=null?fmtPnl(a.pnlPct).replace(/[^0-9A-Za-z+-]/g,''):'call'}.png`;
  cv.toBlob(async blob => {
    if (!blob) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      done('Call card copied — paste it anywhere');
    } catch (e) {
      const url = URL.createObjectURL(blob);
      const el = document.createElement('a'); el.href = url; el.download = fname;
      document.body.appendChild(el); el.click(); el.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      done('Call card saved');
    }
  }, 'image/png');
}

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
  $('dPrice').textContent = fmtPrice(p.price);
  $('dLiq').textContent = fmtUSD(p.liqUsd);
  $('dVol').textContent = fmtUSD(p.vol60);
  $('dAge').textContent = fmtAge(p.ageSec);
  const pts = (p.prices || []).length;
  $('dPriceLbl').textContent = pts > 1 ? pts + ' pts' : '';
  $('dSpark').innerHTML = sparkSVG(p.prices) || '<span class="none">no price data yet</span>';

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
        <div class="t1">$${esc(a.label)} <span style="color:var(--text-faint);font-weight:400">· ${esc(a.dex)}</span>${a.pnlPct != null ? `<span class="pnl-chip ${pnlClass(a.pnlPct)}">${fmtPnl(a.pnlPct)}</span>` : ''}</div>
        <div class="t2">fired ${a.latencyMs}ms after event · ${fmtAge(ago)} ago · liq ${fmtUSD(a.liqUsd)} · vol ${fmtUSD(a.vol60)} · w/10s ${a.w10} · buy ${fmtPct(a.buyRatio)}</div>
        <div class="insight"><b>◉ SOLAMI</b>${esc(buildInsight(a))}</div>
      </div>
      <div class="acts">${links.length ? `<a class="btn btn-primary btn-sm" href="${links[0][1]}" target="_blank" rel="noopener noreferrer">⚡ ${esc(links[0][0])} ↗</a>` : ''}<button class="btn btn-ghost btn-sm" data-share="${esc(a.key)}">⬇ Call card</button></div>
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

  // Telegram CTA — one click pushes the user to t.me/<bot> to add it
  if (s.telegramBot){
    const url = 'https://t.me/' + s.telegramBot;
    $('tgCta').style.display = '';
    $('tgCta').href = url;
    $('tgSideLink').style.display = '';
    $('tgSideLink').href = url;
  }
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

  $('alertFeed').addEventListener('click', e => {
    const b = e.target.closest('[data-share]');
    if (!b) return;
    const a = (lastSnap ? lastSnap.alerts : []).find(x => x.key === b.dataset.share);
    if (a) void shareCard(a);
  });

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
