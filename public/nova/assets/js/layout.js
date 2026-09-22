/* ============================================================
   NOVA — layout.js  (shell.html only)
   Iframe navigation, sidebar collapse, command palette, notifications, breadcrumbs.
   ============================================================ */

const PAGES = [
  {id:'dashboard',    label:'Dashboard',             group:'Overview',   icon:'<rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/>'},
  {id:'wallets',      label:'Wallets',               group:'Overview',   icon:'<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/>'},
  {id:'transactions', label:'Transactions',          group:'Overview',   icon:'<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="M16 21l4-4-4-4"/><path d="M20 17H4"/>', badge:'12'},
  {id:'market',       label:'Market',                group:'Overview',   icon:'<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-4 4"/>'},
  {id:'trading',      label:'Trading',               group:'Overview',   icon:'<path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>'},
  {id:'deposits',     label:'Deposits & Withdrawals', group:'Overview',  icon:'<path d="M12 5v14M5 12l7 7 7-7"/>'},
  {id:'kanban',       label:'Kanban Board',          group:'Tools',      icon:'<rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="10" rx="1"/>'},
  {id:'calendar',     label:'Calendar',              group:'Tools',      icon:'<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'},
  {id:'invoices',     label:'Invoices',              group:'Tools',      icon:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 15h6M9 11h6"/>'},
  {id:'team',         label:'Team',                  group:'Tools',      icon:'<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'},
  {id:'apikeys',      label:'API Keys',              group:'Tools',      icon:'<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"/>'},
  {id:'profile',      label:'Profile',               group:'Account',    icon:'<circle cx="12" cy="8" r="4"/><path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/>'},
  {id:'settings',     label:'Settings',              group:'Account',    icon:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'},
  {id:'support',      label:'Support',               group:'Account',    icon:'<path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>'},
  {id:'faq',          label:'Help & FAQ',            group:'Account',    icon:'<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>'},
];

/* Command palette actions (non-page actions) */
const ACTIONS = [
  {id:'action-new-tx',     label:'New transaction',     page:'transactions',  icon:'<path d="M12 5v14M5 12h14"/>'},
  {id:'action-export-tx',  label:'Export transactions', page:'transactions', icon:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>'},
  {id:'action-new-inv',    label:'Create invoice',       page:'invoices',   icon:'<path d="M12 5v14M5 12h14"/>'},
  {id:'action-new-key',    label:'Generate API key',     page:'apikeys',    icon:'<path d="M12 5v14M5 12h14"/>'},
  {id:'action-new-ticket', label:'Open support ticket',  page:'support',    icon:'<path d="M12 5v14M5 12h14"/>'},
  {id:'action-theme',      label:'Toggle light / dark mode', page:null,      icon:'<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>'},
];

/* Sidebar */
function buildSidebar(){
  const nav = document.getElementById('mainNav');
  const groups = {};
  PAGES.forEach(p=>{ (groups[p.group] = groups[p.group]||[]).push(p); });
  let html = '';
  Object.entries(groups).forEach(([g, items])=>{
    html += `<div class="nav-label">${g}</div>`;
    items.forEach(p=>{
      html += `<div class="nav-item" data-page="${p.id}" title="${p.label}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${p.icon}</svg>
        <span>${p.label}</span>
        ${p.badge?`<span class="nav-badge">${p.badge}</span>`:''}
      </div>`;
    });
  });
  nav.innerHTML = html;
  nav.querySelectorAll('.nav-item').forEach(item=>{
    item.addEventListener('click', ()=> navigate(item.dataset.page));
  });
}

/* Navigation + Breadcrumbs */
let currentPage = 'dashboard';
function navigate(pageId){
  if(!PAGES.find(p=>p.id===pageId)) pageId = 'dashboard';
  currentPage = pageId;
  const frame = document.getElementById('pageFrame');
  const loading = document.getElementById('frameLoading');
  loading.classList.remove('hide');
  frame.src = `pages/${pageId}.html`;
  frame.onload = ()=> loading.classList.add('hide');
  location.hash = pageId;
  document.querySelectorAll('.nav-item').forEach(i=> i.classList.toggle('active', i.dataset.page===pageId));
  document.getElementById('sidebar').classList.remove('mobile-open');
  document.getElementById('sidebarBackdrop').classList.remove('show');
  updateBreadcrumbs(pageId);
}
function updateBreadcrumbs(pageId){
  const page = PAGES.find(p=>p.id===pageId);
  if(!page) return;
  document.getElementById('breadcrumbs').innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
    <span>${page.group}</span>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
    <span>${page.label}</span>`;
}

/* Sidebar collapse */
function initSidebarCollapse(){
  const sidebar = document.getElementById('sidebar');
  const collapsed = localStorage.getItem('nova-sidebar-collapsed') === '1';
  sidebar.classList.toggle('collapsed', collapsed);
  document.getElementById('collapseBtn').addEventListener('click', ()=>{
    const isCollapsed = sidebar.classList.toggle('collapsed');
    localStorage.setItem('nova-sidebar-collapsed', isCollapsed ? '1' : '0');
  });
}

/* Mobile sidebar */
function initMobileSidebar(){
  document.getElementById('menuBtn').addEventListener('click', ()=>{
    document.getElementById('sidebar').classList.add('mobile-open');
    document.getElementById('sidebarBackdrop').classList.add('show');
  });
  document.getElementById('sidebarBackdrop').addEventListener('click', ()=>{
    document.getElementById('sidebar').classList.remove('mobile-open');
    document.getElementById('sidebarBackdrop').classList.remove('show');
  });
}

/* Notifications */
const notifications = [
  {id:1, text:'0.42 BTC withdrawal confirmed', time:'12 min ago', color:'var(--violet)', read:false},
  {id:2, text:'Staking reward credited', time:'2h ago', color:'var(--mint)', read:false},
  {id:3, text:'Invoice INV-2042 pending', time:'Yesterday', color:'var(--amber)', read:false},
];
function renderNotifications(){
  document.getElementById('notifList').innerHTML = notifications.map(n=>`
    <div class="dropdown-item ${n.read?'read':'unread'}" data-notif-id="${n.id}">
      <span class="dot" style="background:${n.color}"></span>
      <div><div class="t">${n.text}</div><div class="time">${n.time}</div></div>
    </div>`).join('');
  const unread = notifications.filter(n=>!n.read).length;
  const badge = document.getElementById('notifBadge');
  badge.textContent = unread;
  badge.classList.toggle('hidden', unread === 0);
  document.querySelectorAll('[data-notif-id]').forEach(el=>{
    el.addEventListener('click', ()=>{
      const n = notifications.find(x=>x.id===+el.dataset.notifId);
      if(n) n.read = true;
      renderNotifications();
    });
  });
}
function initNotifications(){
  renderNotifications();
  document.getElementById('markAllRead').addEventListener('click', ()=>{
    notifications.forEach(n=> n.read = true);
    renderNotifications();
  });
  const btn = document.getElementById('notifBtn');
  const panel = document.getElementById('notifPanel');
  btn.addEventListener('click', e=>{ e.stopPropagation(); panel.classList.toggle('open'); });
  document.addEventListener('click', ()=> panel.classList.remove('open'));
  panel.addEventListener('click', e=> e.stopPropagation());
}

/* Profile dropdown */
function initProfileDropdown(){
  const btn = document.getElementById('profileBtn');
  const panel = document.getElementById('profilePanel');
  btn.addEventListener('click', e=>{ e.stopPropagation(); panel.classList.toggle('open'); });
  document.addEventListener('click', ()=> panel.classList.remove('open'));
  panel.addEventListener('click', e=> e.stopPropagation());
  document.querySelectorAll('[data-profile-action]').forEach(el=>{
    el.addEventListener('click', ()=>{
      panel.classList.remove('open');
      if(el.dataset.profileAction === 'profile'){
        navigate('profile');
      } else if(el.dataset.profileAction === 'logout'){
        window.location.href = 'nova-auth.html';
      }
    });
  });
}

/* Command palette (Ctrl+K) */
let cmdkSelected = 0;
let cmdkItems = [];
function renderCmdk(filter=''){
  const list = document.getElementById('cmdkList');
  const q = filter.toLowerCase();
  const matchedPages = PAGES.filter(p=> p.label.toLowerCase().includes(q));
  const matchedActions = ACTIONS.filter(a=> a.label.toLowerCase().includes(q));
  cmdkItems = [...matchedPages.map(p=>({...p, type:'page'})), ...matchedActions.map(a=>({...a, type:'action'}))];
  if(!cmdkItems.length){ list.innerHTML = '<div class="cmdk-empty">No results found</div>'; return; }
  let html = '';
  if(matchedPages.length){
    html += `<div style="padding:6px 12px;font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--text-faint);font-weight:600;">Pages</div>`;
    matchedPages.forEach((p,i)=>{
      html += `<div class="cmdk-item ${i===cmdkSelected?'selected':''}" data-idx="${i}" data-type="page">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${p.icon}</svg>${p.label}</div>`;
    });
  }
  if(matchedActions.length){
    html += `<div style="padding:6px 12px;font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--text-faint);font-weight:600;margin-top:4px;">Actions</div>`;
    matchedActions.forEach((a,i)=>{
      const idx = matchedPages.length + i;
      html += `<div class="cmdk-item ${idx===cmdkSelected?'selected':''}" data-idx="${idx}" data-type="action">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${a.icon}</svg>${a.label}</div>`;
    });
  }
  list.innerHTML = html;
  list.querySelectorAll('.cmdk-item').forEach(el=>{
    el.addEventListener('click', ()=>{
      const item = cmdkItems[+el.dataset.idx];
      executeCmdkItem(item);
    });
  });
}
function executeCmdkItem(item){
  closeCmdk();
  if(item.type === 'action'){
    if(item.id === 'action-theme'){
      NovaTheme.toggle();
      updateThemeIcon();
    } else if(item.page){
      navigate(item.page);
      setTimeout(()=> triggerPageAction(item.id), 300);
    }
  } else {
    navigate(item.id);
  }
}
function triggerPageAction(actionId){
  /* Triggers a data-open-modal or button click in the iframe after navigation */
  try{
    const frame = document.getElementById('pageFrame');
    const doc = frame.contentDocument;
    if(!doc) return;
    const actionMap = {
      'action-new-tx': 'modalNewTx',
      'action-new-inv': 'modalNewInv',
      'action-new-key': 'modalNewKey',
      'action-new-ticket': 'modalNewTicket',
    };
    const modalId = actionMap[actionId];
    if(modalId && doc.getElementById(modalId)){
      doc.getElementById(modalId).classList.add('open');
    }
  }catch(e){}
}
function openCmdk(){
  cmdkSelected = 0;
  document.getElementById('cmdkBackdrop').classList.add('open');
  const input = document.getElementById('cmdkInput');
  input.value=''; input.focus();
  renderCmdk('');
}
function closeCmdk(){ document.getElementById('cmdkBackdrop').classList.remove('open'); }
function initCommandPalette(){
  document.getElementById('searchBox').addEventListener('click', openCmdk);
  document.getElementById('cmdkBackdrop').addEventListener('click', e=>{ if(e.target.id==='cmdkBackdrop') closeCmdk(); });
  document.getElementById('cmdkInput').addEventListener('input', e=>{ cmdkSelected=0; renderCmdk(e.target.value); });
  document.addEventListener('keydown', e=>{
    if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='k'){ e.preventDefault(); openCmdk(); }
    if(e.key === 'Escape') closeCmdk();
    const backdrop = document.getElementById('cmdkBackdrop');
    if(backdrop.classList.contains('open')){
      const items = document.querySelectorAll('.cmdk-item');
      if(e.key==='ArrowDown'){ e.preventDefault(); cmdkSelected=Math.min(cmdkSelected+1, items.length-1); renderCmdk(document.getElementById('cmdkInput').value); }
      if(e.key==='ArrowUp'){ e.preventDefault(); cmdkSelected=Math.max(cmdkSelected-1, 0); renderCmdk(document.getElementById('cmdkInput').value); }
      if(e.key==='Enter'){ const sel=document.querySelector('.cmdk-item.selected'); if(sel){ const item=cmdkItems[+sel.dataset.idx]; executeCmdkItem(item); } }
    }
  });
}

/* Ticker */
function renderTicker(){
  document.getElementById('tickerTrack').innerHTML = Array(2).fill(NovaData.coins).flat().map(c=>`
    <div class="ticker-item">${c.sym} <b>$${c.price.toLocaleString('en-US',{maximumFractionDigits:2})}</b> <span class="${c.ch24>=0?'up':'down'}">${c.ch24>=0?'▲':'▼'} ${Math.abs(c.ch24)}%</span></div>
  `).join('');
}

/* Init on load */
window.addEventListener('DOMContentLoaded', ()=>{
  buildSidebar();
  initSidebarCollapse();
  initMobileSidebar();
  initNotifications();
  initProfileDropdown();
  initCommandPalette();
  renderTicker();

  document.getElementById('themeToggleBtn').addEventListener('click', ()=>{
    NovaTheme.toggle();
    updateThemeIcon();
  });
  updateThemeIcon();

  const initial = (location.hash||'').replace('#','') || 'dashboard';
  navigate(initial);
});
function updateThemeIcon(){
  const light = document.documentElement.classList.contains('light');
  document.getElementById('themeIcon').innerHTML = light
    ? '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'
    : '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>';
}
window.addEventListener('hashchange', ()=>{
  const p = (location.hash||'').replace('#','');
  if(p && p !== currentPage) navigate(p);
});
