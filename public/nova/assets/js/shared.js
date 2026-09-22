/* ============================================================
   NOVA — shared.js
   Theme sync, toasts, modals, validation helpers, shared data.
   Loaded by every page (shell + all /pages/*.html files).
   ============================================================ */

/* ---------- XSS-safe escape ---------- */
function esc(str){
  return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

/* ---------- Theme ---------- */
const NovaTheme = {
  key: 'nova-theme',
  init(){
    const light = localStorage.getItem(this.key) === 'light';
    document.documentElement.classList.toggle('light', light);
    return light;
  },
  set(light){
    localStorage.setItem(this.key, light ? 'light' : 'dark');
    document.documentElement.classList.toggle('light', light);
    // notify parent (if inside iframe) and children (if this is the shell)
    try{ window.parent && window.parent !== window && window.parent.postMessage({novaTheme: light}, '*'); }catch(e){}
    document.querySelectorAll('iframe').forEach(f=>{
      try{ f.contentWindow.postMessage({novaTheme: light}, '*'); }catch(e){}
    });
  },
  toggle(){ this.set(!document.documentElement.classList.contains('light')); }
};
NovaTheme.init();
window.addEventListener('message', e=>{
  if(e.data && typeof e.data.novaTheme === 'boolean'){
    document.documentElement.classList.toggle('light', e.data.novaTheme);
  }
});
window.addEventListener('storage', e=>{
  if(e.key === NovaTheme.key){
    document.documentElement.classList.toggle('light', e.newValue === 'light');
  }
});

/* ---------- Toasts ---------- */
function ensureToastContainer(){
  let c = document.getElementById('toast-container');
  if(!c){ c = document.createElement('div'); c.id = 'toast-container'; document.body.appendChild(c); }
  return c;
}
const ICONS = {
  success:'<path d="M20 6 9 17l-5-5"/>',
  error:'<circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/>',
  info:'<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>'
};
function showToast(message, type='info', duration=3200){
  const c = ensureToastContainer();
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${ICONS[type]||ICONS.info}</svg><span>${esc(message)}</span>`;
  c.appendChild(t);
  if(duration > 0){
    setTimeout(()=>{ t.style.transition='opacity .25s ease, transform .25s ease'; t.style.opacity='0'; t.style.transform='translateY(6px)'; setTimeout(()=>t.remove(), 250); }, duration);
  }
}
function showPersistentToast(message, type='info', toastId=''){
  const c = ensureToastContainer();
  const t = document.createElement('div');
  t.className = `toast ${type} persistent`;
  if(toastId) t.id = toastId;
  t.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${ICONS[type]||ICONS.info}</svg><span>${esc(message)}</span><button class="toast-close" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M18 6 6 18M6 6l12 12"/></svg></button>`;
  c.appendChild(t);
  t.querySelector('.toast-close').addEventListener('click', ()=>{
    t.style.transition='opacity .25s ease, transform .25s ease';
    t.style.opacity='0'; t.style.transform='translateY(6px)';
    setTimeout(()=>t.remove(), 250);
  });
  return t;
}

/* ---------- Modals ---------- */
function openModal(id){
  const m = document.getElementById(id);
  if(!m) return;
  m.classList.add('open');
  document.body.style.overflow='hidden';
}
function closeModal(id){
  const m = document.getElementById(id);
  if(!m) return;
  m.classList.remove('open');
  document.body.style.overflow='';
}
document.addEventListener('click', e=>{
  if(e.target.classList && e.target.classList.contains('modal-backdrop')){
    e.target.classList.remove('open');
    document.body.style.overflow='';
  }
  if(e.target.closest('[data-close-modal]')){
    const id = e.target.closest('[data-close-modal]').dataset.closeModal;
    closeModal(id);
  }
  if(e.target.closest('[data-open-modal]')){
    const id = e.target.closest('[data-open-modal]').dataset.openModal;
    openModal(id);
  }
});
document.addEventListener('keydown', e=>{
  if(e.key === 'Escape'){
    document.querySelectorAll('.modal-backdrop.open').forEach(m=>{ m.classList.remove('open'); document.body.style.overflow=''; });
  }
});

/* ---------- Switch toggle (generic) ---------- */
document.addEventListener('click', e=>{
  const sw = e.target.closest('[data-switch]');
  if(sw) sw.classList.toggle('on');
  const tab = e.target.closest('[data-tabgroup] .tab');
  if(tab){
    tab.parentElement.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
    tab.classList.add('active');
  }
  const chip = e.target.closest('[data-chipgroup] .chip');
  if(chip && !chip.dataset.multi){
    chip.parentElement.querySelectorAll('.chip').forEach(x=>x.classList.remove('active'));
    chip.classList.add('active');
  }
  const acc = e.target.closest('.accordion-q');
  if(acc) acc.parentElement.classList.toggle('open');
});

/* ---------- Password strength ---------- */
function passwordStrength(pwd){
  let score = 0;
  if(pwd.length >= 8) score++;
  if(/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
  if(/\d/.test(pwd)) score++;
  if(/[^A-Za-z0-9]/.test(pwd)) score++;
  return score; // 0-4
}
function attachPasswordStrength(inputId, barId, labelId){
  const input = document.getElementById(inputId);
  const bar = document.getElementById(barId);
  const label = document.getElementById(labelId);
  if(!input || !bar) return;
  input.addEventListener('input', ()=>{
    const s = passwordStrength(input.value);
    const labels = ['Very weak','Weak','Medium','Good','Excellent'];
    bar.className = 'pw-strength' + (s<=1?' weak':s<=2?' mid':'');
    [...bar.children].forEach((el,i)=> el.classList.toggle('on', i < s));
    if(label) label.textContent = input.value ? labels[s] : '';
  });
}
function togglePasswordVisibility(inputId, btn){
  const input = document.getElementById(inputId);
  if(!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
  btn.innerHTML = input.type === 'password'
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.6 21.6 0 0 1 5.06-6.06M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a21.6 21.6 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/></svg>';
}

/* ---------- Form validation ---------- */
function validateEmail(v){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function setFieldError(fieldEl, message){
  fieldEl.classList.toggle('invalid', !!message);
  const err = fieldEl.querySelector('.field-error');
  if(err) err.textContent = message || '';
}

/* ---------- CSV export ---------- */
function exportCSV(filename, rows){
  const csv = rows.map(r => r.map(cell=>{
    const s = String(cell ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
  }).join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

/* ---------- Copy to clipboard ---------- */
function copyToClipboard(text, successMsg='Copied to clipboard'){
  navigator.clipboard?.writeText(text).then(()=> showToast(successMsg, 'success'))
    .catch(()=> showToast('Failed to copy', 'error'));
}

/* ---------- Shared demo data ---------- */
const NovaData = {
  coins: [
    {sym:'BTC', name:'Bitcoin', price:64230.12, ch24:2.4, ch7:5.1, cap:'1.26T', vol:'28.4B', color:'#F7931A'},
    {sym:'ETH', name:'Ethereum', price:3412.87, ch24:-1.1, ch7:3.2, cap:'410.2B', vol:'14.1B', color:'#627EEA'},
    {sym:'SOL', name:'Solana', price:171.34, ch24:5.8, ch7:12.4, cap:'78.5B', vol:'4.2B', color:'#00FFA3'},
    {sym:'BNB', name:'BNB', price:582.10, ch24:0.6, ch7:-2.1, cap:'86.9B', vol:'1.8B', color:'#F3BA2F'},
    {sym:'XRP', name:'XRP', price:0.612, ch24:-0.8, ch7:1.4, cap:'34.1B', vol:'980M', color:'#00AAE4'},
    {sym:'ADA', name:'Cardano', price:0.451, ch24:1.9, ch7:-0.6, cap:'16.0B', vol:'420M', color:'#0033AD'},
  ],
  wallets: [
    {name:'Main Wallet', chip:'Active', balance:'$142,830.20', addr:'0x8f3a...9e21'},
    {name:'Staking Vault', chip:'Locked', balance:'$76,412.55', addr:'0x1c92...4bd7'},
    {name:'Fast Trading', chip:'Active', balance:'$34,905.90', addr:'0xa04e...77f2'},
  ],
  coinIcon(c){ return `<div class="coin-icon" style="background:${c.color}">${c.sym.slice(0,1)}</div>`; }
};
function genTx(n){
  const txTypes = ['Deposit','Withdrawal','Swap','Transfer'];
  const statuses = [['Completed','success'],['Pending','pending'],['Failed','failed']];
  const rows=[];
  for(let i=0;i<n;i++){
    const c = NovaData.coins[Math.floor(Math.random()*NovaData.coins.length)];
    const type = txTypes[Math.floor(Math.random()*txTypes.length)];
    const st = statuses[Math.floor(Math.random()*(i<n*0.7?1:3))];
    const up = Math.random()>0.45;
    rows.push({c,type,st,amt:(Math.random()*4+0.02).toFixed(3),up,
      date:`2026-07-${String(Math.floor(Math.random()*20)+1).padStart(2,'0')}`,
      addr:'0x'+Math.random().toString(16).slice(2,6)+'...'+Math.random().toString(16).slice(2,6)});
  }
  return rows;
}
