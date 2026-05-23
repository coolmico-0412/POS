/* ═══════════════════════════════════════════════════════════════════
   Firebase SDK v12 — Realtime Database only (no Firebase Auth)
   會員系統：姓名 + 電話 → Firebase 流水號 M0001, M0002…
             回訪者輸入編號 → 查詢 Firebase 取回資料
   商品同步：meta diff（省流量）
   去重：同名+同價只顯示一個
═══════════════════════════════════════════════════════════════════ */
import { initializeApp }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getDatabase, ref, get, set, runTransaction }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-database.js";

const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyCXL_BPUqT5UA2Ufxo8Byulm6-ATNxTr4c",
  authDomain:        "mico1-72831.firebaseapp.com",
  databaseURL:       "https://mico1-72831-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "mico1-72831",
  storageBucket:     "mico1-72831.firebasestorage.app",
  messagingSenderId: "706559929324",
  appId:             "1:706559929324:web:05cf28d33b9f770d332ec9",
};
const FB = {
  META:    'shop/meta',
  PROD:    'shop/products',
  NOBC:    'shop/nobc_products',
  ORDERS:  'shop/online_orders',
  MEMBERS: 'shop/members',
  COUNTER: 'shop/memberCounter',
  OOS:     'shop/outOfStock',     // 缺貨清單
};
const LS = {
  PROD:    'pos_products',
  NOBC:    'pos_nobc_products',
  SYNC_TS: 'shop_fb_sync_ts',
  MEMBER:  'shop_member',
  OOS:     'shop_out_of_stock',   // 缺貨清單快取
};

let _db   = null;
let _fbOK = false;
try {
  const app = initializeApp(FIREBASE_CONFIG);
  _db   = getDatabase(app);
  _fbOK = true;
} catch(e) { console.warn('[Shop] Firebase init failed:', e); }

/* ── App State ── */
let allProducts   = [];
let cart          = [];
let activeCat     = 'frozen';  // 預設顯示冷凍食品
let drawerOpen    = false;
let memberOpen    = false;
let currentMember = null;   // { memberId, name, phone, uid (=memberId), orderCount, totalSpent }
let isGuest       = false;

/* ══════════════════════════════════════════════
   Utilities
══════════════════════════════════════════════ */
function h(v) {
  return String(v ?? '').replace(/[&<>"']/g,
    c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function safeGetLS(key, fb) {
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : fb; }
  catch(e) { return fb; }
}
function safeSetLS(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); return true; }
  catch(e) { return false; }
}
function fmtDate(iso) {
  try {
    const d   = new Date(iso);
    const y   = d.getFullYear();
    const mo  = String(d.getMonth()+1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    const hh  = String(d.getHours()).padStart(2,'0');
    const mm  = String(d.getMinutes()).padStart(2,'0');
    return `${y}/${mo}/${day} ${hh}:${mm}`;
  } catch(e) { return iso || ''; }
}
function setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = String(v ?? ''); }
function setFbIndicator(state) {
  const el = document.getElementById('fb-indicator');
  if (!el) return;
  const MAP = {
    connecting:{ color:'#f59e0b', title:'กำลังเชื่อมต่อ…' },
    synced:    { color:'#10b981', title:'ซิงค์แล้ว ✓' },
    local:     { color:'#94a3b8', title:'ใช้ข้อมูลในเครื่อง' },
    error:     { color:'#ef4444', title:'Firebase ไม่พร้อม' },
  };
  const s = MAP[state] || MAP.local;
  el.style.background = s.color;
  el.title = s.title;
}

/* ══════════════════════════════════════════════
   Firebase: Product Sync
   強制從 server 拉取，不用 SDK 快取
══════════════════════════════════════════════ */
async function syncProducts() {
  if (!_fbOK || !_db) { setFbIndicator('local'); return; }
  setFbIndicator('connecting');

  // 強制從 Firebase server 拉取（非 SDK 本地快取）
  function serverGet(path, ms = 8000) {
    return Promise.race([
      get(ref(_db, path)),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`timeout: ${path}`)), ms)
      )
    ]);
  }

  try {
    // 先讀 meta 判斷是否需要更新
    const metaSnap = await serverGet(FB.META);
    const fbTs     = metaSnap.exists() ? (metaSnap.val()?.updatedAt ?? null) : null;
    const localTs  = safeGetLS(LS.SYNC_TS, null);

    // 計算本機商品數量
    const localProds     = safeGetLS(LS.PROD, null);
    const localProdCount = localProds ? Object.keys(localProds).length : 0;
    const localNobc      = safeGetLS(LS.NOBC, []);
    const localNobcCount = Array.isArray(localNobc) ? localNobc.length : 0;
    const totalLocal     = localProdCount + localNobcCount;

    // 判斷是否需要同步
    const forceByCount   = totalLocal < 20;          // 商品太少強制同步
    const forceByVersion = fbTs !== null && fbTs !== localTs; // 版本不同需同步
    const noMeta         = fbTs === null;             // meta 不存在也同步

    if (!forceByCount && !forceByVersion && !noMeta) {
      console.log('[Shop] 商品已是最新，跳過同步');
      setFbIndicator('local');
      return;
    }

    console.log('[Shop] 同步原因：',
      forceByCount   ? `商品數量 ${totalLocal} < 20` :
      forceByVersion ? `版本不符 (local:${localTs} fb:${fbTs})` :
      'meta 不存在，首次同步'
    );

    // 同時拉取商品資料 + 缺貨清單
    const [ps, ns, oosSnap] = await Promise.all([
      serverGet(FB.PROD),
      serverGet(FB.NOBC),
      serverGet(FB.OOS),
    ]);

    let updated = false;
    if (ps.exists()) {
      const d = ps.val();
      if (d && typeof d === 'object' && Object.keys(d).length > 0) {
        safeSetLS(LS.PROD, d);
        updated = true;
        console.log(`[Shop] 拉取商品 ${Object.keys(d).length} 筆`);
      }
    }
    if (ns.exists()) {
      const d = ns.val();
      const arr = Array.isArray(d) ? d : Object.values(d || {});
      if (arr.length > 0) {
        safeSetLS(LS.NOBC, arr);
        updated = true;
        console.log(`[Shop] 拉取無條碼商品 ${arr.length} 筆`);
      }
    }
    // 缺貨清單（即使是空的也要更新）
    const oosMap = oosSnap.exists() ? (oosSnap.val() || {}) : {};
    safeSetLS(LS.OOS, oosMap);
    console.log(`[Shop] 缺貨商品：${Object.keys(oosMap).length} 筆`);

    // 更新同步時間戳
    if (fbTs !== null) safeSetLS(LS.SYNC_TS, fbTs);

    if (updated) {
      setFbIndicator('synced');
    } else {
      console.warn('[Shop] Firebase 商品為空，保留本機資料');
      setFbIndicator('local');
    }

  } catch(e) {
    console.warn('[Shop] syncProducts failed:', e.message);
    setFbIndicator('error');
    throw e;
  }
}

/* ══════════════════════════════════════════════
   Firebase: Member System (no Auth SDK)
   ── Register: phone as unique key, serial No ──
   ── Lookup:   by memberId (M0001…) ──
══════════════════════════════════════════════ */

// Normalize phone → use as Firebase key (digits only)
function normPhone(p) { return String(p).replace(/\D/g, '').slice(-10) || null; }

// Register new member by name + phone → returns member record
async function createMember(name, phone, nationality = '') {
  if (!_fbOK) throw new Error('Firebase not available');
  const phoneKey = normPhone(phone);
  if (!phoneKey) throw new Error('invalid_phone');

  const phoneIndexRef = ref(_db, `shop/phoneIndex/${phoneKey}`);
  const existing = await get(phoneIndexRef);
  if (existing.exists()) {
    const existingId = existing.val();
    const snap = await get(ref(_db, `${FB.MEMBERS}/${existingId}`));
    if (snap.exists()) return snap.val();
  }

  let serial = 1;
  await runTransaction(ref(_db, FB.COUNTER), cur => { serial = (cur || 0) + 1; return serial; });
  const memberId = 'M' + String(serial).padStart(4, '0');
  const now = new Date().toISOString();
  const record = {
    memberId, serial,
    name:        name.trim(),
    phone:       phone.trim(),
    phoneKey,
    nationality: nationality || '',
    createdAt:   now,
    orderCount:  0,
    totalSpent:  0,
  };
  await set(ref(_db, `${FB.MEMBERS}/${memberId}`), record);
  await set(phoneIndexRef, memberId);
  return record;
}

// Lookup member by memberId (e.g. M0001)
async function lookupMemberById(memberId) {
  if (!_fbOK) return null;
  try {
    const snap = await get(ref(_db, `${FB.MEMBERS}/${memberId.toUpperCase()}`));
    return snap.exists() ? snap.val() : null;
  } catch(e) { return null; }
}

// Fetch this member's orders from Firebase
async function fetchMemberOrders(memberId) {
  if (!_fbOK || !memberId) return [];
  try {
    const snap = await get(ref(_db, FB.ORDERS));
    if (!snap.exists()) return [];
    return Object.values(snap.val())
      .filter(o => o?.memberId === memberId)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 20);
  } catch(e) { return []; }
}

// Write order, update member stats
async function writeOrderToFirebase(orderObj) {
  if (!_fbOK) return false;
  try {
    await set(ref(_db, `${FB.ORDERS}/${orderObj.id}`), orderObj);
    if (currentMember?.memberId) {
      const mid = currentMember.memberId;
      await runTransaction(ref(_db, `${FB.MEMBERS}/${mid}/orderCount`), n => (n||0)+1);
      await runTransaction(ref(_db, `${FB.MEMBERS}/${mid}/totalSpent`), n => (n||0)+orderObj.total);
      currentMember.orderCount = (currentMember.orderCount||0)+1;
      currentMember.totalSpent = (currentMember.totalSpent||0)+orderObj.total;
    }
    return true;
  } catch(e) { console.warn('[Shop] writeOrder:', e); return false; }
}

/* ══════════════════════════════════════════════
   Auth Modal UI
══════════════════════════════════════════════ */
function showAuthModal() {
  const o = document.getElementById('auth-overlay');
  if (!o) return;
  o.style.display = 'flex';
  requestAnimationFrame(() => requestAnimationFrame(() => o.classList.add('visible')));
}
function hideAuthModal() {
  const o = document.getElementById('auth-overlay');
  if (!o) return;
  o.classList.remove('visible');
  setTimeout(() => { o.style.display = 'none'; }, 300);
}

// ── A: Lookup by member ID + phone (both must match) ──
async function lookupMember() {
  const mid    = (document.getElementById('auth-mid-field')?.value    || '').trim().toUpperCase();
  const phone  = (document.getElementById('auth-lookup-phone')?.value || '').trim();
  const btn    = document.getElementById('auth-lookup-btn');
  if (!mid || !mid.match(/^M\d{1,6}$/)) { showLookupResult(t('lookupNotFound'), 'err'); return; }
  if (!phone)                             { showLookupResult(t('placeholderLookupPhone'), 'err'); return; }
  if (btn) { btn.disabled = true; btn.textContent = t('lookupSearching'); }
  try {
    const member = await lookupMemberById(mid);
    if (!member) { showLookupResult(t('lookupNotFound'), 'err'); return; }
    const inputLast4  = phone.replace(/\D/g,'').slice(-4);
    const storedLast4 = String(member.phone || '').replace(/\D/g,'').slice(-4);
    if (!inputLast4 || inputLast4 !== storedLast4) {
      showLookupResult(t('lookupPhoneMismatch'), 'err'); return;
    }
    if (member.nationality && NAT_TO_LANG[member.nationality]) setLang(NAT_TO_LANG[member.nationality]);
    setMember(member);
    hideAuthModal();
    showToast(`${t('welcomeBack')} ${member.name}！🎉 (${member.memberId})`, 'ok');
  } catch(e) {
    showLookupResult(t('lookupError'), 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = t('btnLookup'); }
  }
}
function showLookupResult(msg, type) {
  const el = document.getElementById('auth-lookup-result');
  if (!el) return;
  el.style.display = '';
  el.textContent = msg;
  el.style.background = type === 'err' ? 'rgba(201,78,110,.08)' : 'rgba(45,155,111,.08)';
  el.style.border = `1px solid ${type === 'err' ? 'rgba(201,78,110,.25)' : 'rgba(45,155,111,.25)'}`;
  el.style.color = type === 'err' ? 'var(--primary)' : 'var(--green)';
}

// ── B: Register new member ──
async function registerMember() {
  const name  = (document.getElementById('auth-name')?.value  || '').trim();
  const phone = (document.getElementById('auth-phone')?.value || '').trim();
  const nat   = (document.getElementById('auth-nationality')?.value || '').trim();
  if (!name)  { showToast(t('nameRequired'), 'err'); return; }
  if (!phone) { showToast(t('phoneRequired'), 'err'); return; }

  const btn = document.getElementById('auth-register-btn');
  if (btn) { btn.disabled = true; btn.textContent = t('registering'); }
  try {
    const member = await createMember(name, phone, nat);
    // 依國籍自動設語言
    if (nat && NAT_TO_LANG[nat]) setLang(NAT_TO_LANG[nat]);
    setMember(member);
    safeSetLS(LS.MEMBER, member);
    hideAuthModal();
    const isNew = (member.orderCount === 0);
    if (isNew) {
      showToast(`${t('registerSuccess')} ${member.memberId} 🎉`, 'ok');
    } else {
      showToast(`${t('foundExisting')} ${member.name}！(${member.memberId})`, 'ok');
    }
    try { ['auth-name','auth-phone'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; }); } catch(e){}
  } catch(e) {
    showToast('เกิดข้อผิดพลาด: ' + (e.message || ''), 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = t('btnRegister'); }
  }
}

function continueAsGuest() {
  isGuest = true;
  hideAuthModal();
  updateAuthUI();
  showToast(t('guestMode'), 'ok');
}

function setMember(member) {
  currentMember = member;
  isGuest = false;
  safeSetLS(LS.MEMBER, member);
  // 依會員國籍設語言
  if (!localStorage.getItem('shop_lang') && member?.nationality && LANGS[member.nationality]) {
    _lang = member.nationality;
    try { localStorage.setItem('shop_lang', _lang); } catch(e) {}
  }
  updateAuthUI();
  applyLang(); // 含 buildLangSwitcher (→折疊) + renderTabs
}

function logout() {
  currentMember = null;
  isGuest = false;
  cart = [];
  safeSetLS(LS.MEMBER, null);
  detectLang();
  updateAllCartUI();
  renderProducts();
  updateAuthUI();
  closeMemberDrawer();
  setTimeout(() => showAuthModal(), 400);
  buildLangSwitcher(); // 登出後展開
  showToast(t('loggedOut'));
}

/* ── Update Header ── */
function updateAuthUI() {
  const lo = document.getElementById('auth-area-loggedout');
  const li = document.getElementById('auth-area-loggedin');
  if (!lo || !li) return;
  if (!currentMember) {
    lo.style.display = ''; li.style.display = 'none'; return;
  }
  lo.style.display = 'none'; li.style.display = '';
  const name   = currentMember.name    || '—';
  const membId = currentMember.memberId || '—';
  const nat    = currentMember.nationality || '';
  const natObj = NATIONALITIES.find(n=>n.code===nat);
  const flag   = natObj ? natObj.flag : '';
  const initial = (name[0] || '?').toUpperCase();
  const avatarEl = document.getElementById('hdr-avatar');
  if (avatarEl) avatarEl.innerHTML = flag ? `<span style="font-size:16px">${flag}</span>` : initial;
  setText('hdr-uname', name.split(' ')[0]);
  setText('hdr-mid',   membId);
}

/* ══════════════════════════════════════════════
   Member Drawer
══════════════════════════════════════════════ */
function openMemberDrawer() {
  if (memberOpen) return;
  memberOpen = true;
  renderMemberDrawer();
  const overlay = document.getElementById('member-overlay');
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeMemberDrawer() {
  if (!memberOpen) return;
  memberOpen = false;
  document.getElementById('member-overlay')?.classList.remove('open');
  document.body.style.overflow = '';
}
function handleMemberOutsideClick(e) {
  if (e.target === document.getElementById('member-overlay')) closeMemberDrawer();
}
async function renderMemberDrawer() {
  if (!currentMember) return;
  const m = currentMember;
  const initial = (m.name?.[0] || '?').toUpperCase();
  const avEl = document.getElementById('m-avatar-lg');
  if (avEl) avEl.textContent = initial;
  setText('m-dname',   m.name    || '—');
  setText('m-id-chip', `🪪 ${m.memberId || '—'}`);
  setText('m-provider',`📞 ${m.phone || ''}`);

  const histEl = document.getElementById('m-order-hist');
  if (histEl) histEl.innerHTML = `<div style="text-align:center;color:var(--muted2);font-size:13px;padding:12px">กำลังโหลด… / 載入中…</div>`;
  const orders = await fetchMemberOrders(m.memberId);
  if (!histEl) return;

  if (!orders.length) {
    histEl.innerHTML = `<div style="text-align:center;color:var(--muted2);font-size:13px;padding:16px">
      ยังไม่มีประวัติ<br><span style="font-family:'Noto Sans TC',sans-serif;font-size:12px">尚無訂單記錄</span>
    </div>`;
    return;
  }

  histEl.innerHTML = orders.map(o => {
    const itemsHtml = (o.items||[]).map(i => `
      <div style="display:flex;justify-content:space-between;font-size:11px;padding:3px 0;border-bottom:1px solid var(--border);color:var(--text2)">
        <span>${h(i.name||'')}</span>
        <span style="font-family:'Courier New',monospace;color:var(--muted)">×${i.qty} NT$${(i.price||0)*i.qty}</span>
      </div>`).join('');

    return `<div class="order-hist-item" style="cursor:pointer" onclick="this.querySelector('.ohi-detail').style.display=this.querySelector('.ohi-detail').style.display==='none'?'block':'none'">
      <div class="ohi-top">
        <span class="ohi-id">${h(o.id)}</span>
        <span class="ohi-date">${h(fmtDate(o.date))}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:2px">
        <span class="ohi-total">NT$ ${h(String(o.total ?? 0))}</span>
        <span style="font-size:10px;color:var(--muted2)">${(o.items||[]).length} รายการ ▾</span>
      </div>
      <div class="ohi-detail" style="display:none;margin-top:8px;padding-top:6px;border-top:1px dashed var(--border2)">
        ${itemsHtml}
        ${o.deliveryLocation ? `<div style="font-size:11px;color:var(--muted);margin-top:4px">📍 ${h(o.deliveryLocation)}</div>` : ''}
        ${o.note ? `<div style="font-size:11px;color:var(--muted);margin-top:2px">💬 ${h(o.note)}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

/* ══════════════════════════════════════════════
   多語言系統 i18n
   支援：th（泰文）、id（印尼文）、vi（越南文）
══════════════════════════════════════════════ */
const LANGS = {
  th: {
    flag:'🇹🇭', label:'ภาษาไทย',
    brandSub:'คลิกสินค้าเพื่อเพิ่มลงตะกร้า',
    loginBtn:'🪪 สมาชิก',
    authTitle:'ร้านค้าออนไลน์',
    authTagline:'ระบุรหัสสมาชิกหรือลงทะเบียนใหม่',
    authDescLookup:'🪪 มีรหัสสมาชิกแล้ว?',
    placeholderMid:'รหัสสมาชิก เช่น M0001',
    placeholderLookupPhone:'เบอร์โทรที่ลงทะเบียนไว้',
    btnLookup:'🔍 ค้นหาและเข้าสู่ระบบ',
    orDivider:'หรือ',
    newMemberTitle:'📝 สมัครสมาชิกใหม่',
    placeholderName:'ชื่อ-นามสกุล (บังคับ)',
    placeholderPhone:'เบอร์โทรศัพท์ (บังคับ)',
    labelNationality:'สัญชาติ / ภาษา',
    btnRegister:'✓ สมัครสมาชิก',
    btnGuest:'ดำเนินการในฐานะแขก',
    cartTitle:'ตะกร้าสินค้า',
    cartEmpty:'ตะกร้าว่างเปล่า\nกดที่สินค้าเพื่อเพิ่ม',
    cartPcs:'ชิ้น', cartItems:'รายการ', cartTotal:'ยอดรวม',
    btnCheckout:'🎉 สั่งซื้อ', drawerView:'ดูตะกร้า',
    barEmpty:'ตะกร้าว่างเปล่า กดที่สินค้าเพื่อเพิ่ม 🛒',
    orderTitle:'📋 ยืนยันคำสั่งซื้อ',
    customerInfo:'👤 ข้อมูลลูกค้า',
    labelName:'ชื่อ', labelPhone:'เบอร์โทร',
    customerHint:'ชื่อและเบอร์โทรไม่บังคับ',
    labelDelivery:'📍 สถานที่จัดส่ง',
    placeholderDelivery:'กดรับพิกัดปัจจุบัน',
    deliveryRequired:'กรุณากดรับพิกัดสถานที่จัดส่ง',
    btnCurrentLocation:'⌖ พิกัดปัจจุบัน',
    btnMapPick:'ปักหมุดแผนที่',
    labelNote:'หมายเหตุ', placeholderNote:'เช่น ไม่ใส่น้ำแข็ง',
    orderSummary:'🧾 รายการสินค้า',
    thProduct:'สินค้า', thQty:'จำนวน', thSub:'รวม',
    orderTotalLabel:'ยอดรวมทั้งหมด',
    btnBack:'← แก้ไข', btnConfirm:'✓ ยืนยันสั่งซื้อ',
    successTitle:'ส่งคำสั่งซื้อแล้ว！',
    successMsg:'ขอบคุณที่สั่งซื้อ！\nเราจะเตรียมสินค้าให้คุณโดยเร็ว',
    successOrderId:'เลขที่ออเดอร์', btnContinue:'สั่งซื้อต่อ',
    historyTitle:'ประวัติ', historyEmpty:'ยังไม่มีประวัติการสั่งซื้อ',
    btnLogout:'🚪 ออกจากระบบ', btnEditProfile:'✏ แก้ไขข้อมูล',
    editProfileTitle:'✏ แก้ไขข้อมูลสมาชิก', btnSaveProfile:'บันทึก',
    minOrder:'ยอดขั้นต่ำ NT$1,000',
    toastAdded:'เพิ่มแล้ว', toastCleared:'ล้างตะกร้าแล้ว',
    toastCartEmpty:'ตะกร้าว่างเปล่า！', toastOrderSent:'ส่งออเดอร์ไปยัง Firebase ✓',
    toastFail:'ส่งไม่สำเร็จ กรุณาลองใหม่',
    deliveryRule:'🛵 NT$1,000→3km/1วัน | NT$2,000→6km/2วัน | NT$3,000→9km/3วัน',
    deliveryRuleNote:'(เพิ่มทุก NT$1,000 ได้ +3km +1วัน)',
    deliveryYours:'📍 ออเดอร์ของคุณ NT$%t：%kkm ภายใน %d วัน',
    clearCart:'ล้างตะกร้า',
    lookupNotFound:'ไม่พบรหัสสมาชิกนี้',
    lookupPhoneMismatch:'เบอร์โทรไม่ตรงกัน',
    lookupError:'เกิดข้อผิดพลาด กรุณาลองใหม่',
    lookupSearching:'กำลังตรวจสอบ…', registering:'กำลังสมัคร…',
    nameRequired:'กรุณากรอกชื่อ', phoneRequired:'กรุณากรอกเบอร์โทร',
    guestMode:'กำลังใช้งานในฐานะแขก', loggedOut:'ออกจากระบบแล้ว',
    welcomeBack:'ยินดีต้อนรับ',
    registerSuccess:'สมัครสำเร็จ！ รหัสของคุณคือ',
    foundExisting:'พบข้อมูลสมาชิกเดิม ยินดีต้อนรับ',
    mbrId:'รหัสสมาชิก',
    cats:{ frozen:'อาหารแช่แข็ง', seasoning:'เครื่องปรุง', drink:'เครื่องดื่ม',
           rice:'ข้าว', alcohol:'เครื่องดื่มแอลกอฮอล์', hygiene:'ของใช้ส่วนตัว',
           food:'อาหาร', other:'อื่นๆ' },
  },
  vi: {
    flag:'🇻🇳', label:'Tiếng Việt',
    brandSub:'Nhấp vào sản phẩm để thêm vào giỏ hàng',
    loginBtn:'🪪 Thành viên',
    authTitle:'Cửa hàng trực tuyến',
    authTagline:'Nhập mã thành viên hoặc đăng ký mới',
    authDescLookup:'🪪 Đã có mã thành viên?',
    placeholderMid:'Mã thành viên, vd. M0001',
    placeholderLookupPhone:'Số điện thoại đã đăng ký',
    btnLookup:'🔍 Tìm và Đăng nhập',
    orDivider:'hoặc',
    newMemberTitle:'📝 Đăng ký thành viên mới',
    placeholderName:'Họ và tên (bắt buộc)',
    placeholderPhone:'Số điện thoại (bắt buộc)',
    labelNationality:'Quốc tịch / Ngôn ngữ',
    btnRegister:'✓ Đăng ký ngay',
    btnGuest:'Tiếp tục với tư cách khách',
    cartTitle:'Giỏ hàng',
    cartEmpty:'Giỏ hàng trống\nNhấp vào sản phẩm để thêm',
    cartPcs:'sản phẩm', cartItems:'loại', cartTotal:'Tổng cộng',
    btnCheckout:'🎉 Đặt hàng', drawerView:'Xem giỏ hàng',
    barEmpty:'Giỏ hàng trống, nhấp vào sản phẩm để thêm 🛒',
    orderTitle:'📋 Xác nhận đơn hàng',
    customerInfo:'👤 Thông tin khách hàng',
    labelName:'Họ tên', labelPhone:'Điện thoại',
    customerHint:'Họ tên và điện thoại không bắt buộc',
    labelDelivery:'📍 Vị trí giao hàng',
    placeholderDelivery:'Bấm lấy tọa độ hiện tại',
    deliveryRequired:'Vui lòng lấy tọa độ giao hàng',
    btnCurrentLocation:'⌖ Vị trí hiện tại',
    btnMapPick:'Chọn trên bản đồ',
    labelNote:'Ghi chú', placeholderNote:'vd. Không đá',
    orderSummary:'🧾 Chi tiết đơn hàng',
    thProduct:'Sản phẩm', thQty:'Số lượng', thSub:'Thành tiền',
    orderTotalLabel:'Tổng đơn hàng',
    btnBack:'← Sửa lại', btnConfirm:'✓ Xác nhận đặt hàng',
    successTitle:'Đã gửi đơn hàng！',
    successMsg:'Cảm ơn bạn đã đặt hàng！\nChúng tôi sẽ chuẩn bị hàng ngay cho bạn.',
    successOrderId:'Mã đơn hàng', btnContinue:'Tiếp tục mua',
    historyTitle:'Lịch sử', historyEmpty:'Chưa có lịch sử mua hàng',
    btnLogout:'🚪 Đăng xuất', btnEditProfile:'✏ Sửa thông tin',
    editProfileTitle:'✏ Sửa thông tin thành viên', btnSaveProfile:'Lưu',
    minOrder:'Đơn tối thiểu NT$1.000',
    toastAdded:'Đã thêm', toastCleared:'Đã xóa giỏ hàng',
    toastCartEmpty:'Giỏ hàng đang trống！', toastOrderSent:'Đã gửi đơn hàng lên Firebase ✓',
    toastFail:'Gửi thất bại, vui lòng thử lại',
    deliveryRule:'🛵 NT$1.000→3km/1ng | NT$2.000→6km/2ng | NT$3.000→9km/3ng',
    deliveryRuleNote:'(Mỗi NT$1.000 thêm được +3km +1 ngày)',
    deliveryYours:'📍 Đơn của bạn NT$%t：%kkm trong %d ngày',
    clearCart:'Xóa giỏ',
    lookupNotFound:'Không tìm thấy mã thành viên',
    lookupPhoneMismatch:'Số điện thoại không khớp',
    lookupError:'Có lỗi xảy ra, thử lại',
    lookupSearching:'Đang kiểm tra…', registering:'Đang đăng ký…',
    nameRequired:'Vui lòng nhập họ tên', phoneRequired:'Vui lòng nhập số điện thoại',
    guestMode:'Đang dùng với tư cách khách', loggedOut:'Đã đăng xuất',
    welcomeBack:'Chào mừng trở lại',
    registerSuccess:'Đăng ký thành công！ Mã của bạn：',
    foundExisting:'Tìm thấy tài khoản cũ, xin chào',
    mbrId:'Mã thành viên',
    cats:{ frozen:'Thực phẩm đông lạnh', seasoning:'Gia vị', drink:'Đồ uống',
           rice:'Gạo', alcohol:'Rượu bia', hygiene:'Vệ sinh & làm đẹp',
           food:'Thực phẩm', other:'Khác' },
  },
  id: {
    flag:'🇮🇩', label:'Bahasa Indonesia',
    brandSub:'Klik produk untuk tambah ke keranjang',
    loginBtn:'🪪 Anggota',
    authTitle:'Toko Online',
    authTagline:'Masukkan kode anggota atau daftar baru',
    authDescLookup:'🪪 Sudah punya kode anggota?',
    placeholderMid:'Kode anggota, mis. M0001',
    placeholderLookupPhone:'Nomor HP saat mendaftar',
    btnLookup:'🔍 Cari dan Masuk',
    orDivider:'atau',
    newMemberTitle:'📝 Daftar Anggota Baru',
    placeholderName:'Nama lengkap (wajib)',
    placeholderPhone:'Nomor HP (wajib)',
    labelNationality:'Kebangsaan / Bahasa',
    btnRegister:'✓ Daftar Sekarang',
    btnGuest:'Lanjutkan sebagai Tamu',
    cartTitle:'Keranjang Belanja',
    cartEmpty:'Keranjang kosong\nKlik produk untuk tambah',
    cartPcs:'item', cartItems:'produk', cartTotal:'Total',
    btnCheckout:'🎉 Pesan Sekarang', drawerView:'Lihat Keranjang',
    barEmpty:'Keranjang kosong, klik produk untuk tambah 🛒',
    orderTitle:'📋 Konfirmasi Pesanan',
    customerInfo:'👤 Data Pelanggan',
    labelName:'Nama', labelPhone:'Nomor HP',
    customerHint:'Nama dan nomor HP tidak wajib',
    labelDelivery:'📍 Lokasi Pengiriman',
    placeholderDelivery:'Tekan untuk ambil koordinat saat ini',
    deliveryRequired:'Harap ambil koordinat pengiriman',
    btnCurrentLocation:'⌖ Lokasi saat ini',
    btnMapPick:'Pilih peta',
    labelNote:'Catatan', placeholderNote:'mis. Tanpa es batu',
    orderSummary:'🧾 Rincian Pesanan',
    thProduct:'Produk', thQty:'Jumlah', thSub:'Subtotal',
    orderTotalLabel:'Total Keseluruhan',
    btnBack:'← Ubah', btnConfirm:'✓ Konfirmasi Pesanan',
    successTitle:'Pesanan Terkirim！',
    successMsg:'Terima kasih telah memesan！\nKami akan segera menyiapkan pesanan Anda.',
    successOrderId:'No. Pesanan', btnContinue:'Lanjut Belanja',
    historyTitle:'Riwayat', historyEmpty:'Belum ada riwayat pembelian',
    btnLogout:'🚪 Keluar', btnEditProfile:'✏ Edit Profil',
    editProfileTitle:'✏ Edit Data Anggota', btnSaveProfile:'Simpan',
    minOrder:'Minimal pembelian NT$1.000',
    toastAdded:'Ditambahkan', toastCleared:'Keranjang dikosongkan',
    toastCartEmpty:'Keranjang masih kosong！', toastOrderSent:'Pesanan dikirim ke Firebase ✓',
    toastFail:'Gagal mengirim, coba lagi',
    deliveryRule:'🛵 NT$1.000→3km/1hr | NT$2.000→6km/2hr | NT$3.000→9km/3hr',
    deliveryRuleNote:'(Setiap tambah NT$1.000 dapat +3km +1 hari)',
    deliveryYours:'📍 Pesanan Anda NT$%t：%kkm dalam %d hari',
    clearCart:'Kosongkan',
    lookupNotFound:'Kode anggota tidak ditemukan',
    lookupPhoneMismatch:'Nomor HP tidak sesuai',
    lookupError:'Terjadi kesalahan, coba lagi',
    lookupSearching:'Memeriksa…', registering:'Mendaftarkan…',
    nameRequired:'Harap isi nama', phoneRequired:'Harap isi nomor HP',
    guestMode:'Melanjutkan sebagai tamu', loggedOut:'Berhasil keluar',
    welcomeBack:'Selamat datang kembali',
    registerSuccess:'Berhasil daftar！ Kode Anda：',
    foundExisting:'Data anggota ditemukan, selamat datang',
    mbrId:'Kode Anggota',
    cats:{ frozen:'Makanan Beku', seasoning:'Bumbu', drink:'Minuman',
           rice:'Beras', alcohol:'Minuman Keras', hygiene:'Kebersihan & Kecantikan',
           food:'Makanan', other:'Lainnya' },
  },
  ph: {
    flag:'🇵🇭', label:'English',
    brandSub:'Click products to add to cart',
    loginBtn:'🪪 Member',
    authTitle:'Online Shop',
    authTagline:'Enter your member code or register new',
    authDescLookup:'🪪 Already have a member code?',
    placeholderMid:'Member code, e.g. M0001',
    placeholderLookupPhone:'Phone number used at registration',
    btnLookup:'🔍 Search & Login',
    orDivider:'or',
    newMemberTitle:'📝 Register New Member',
    placeholderName:'Full name (required)',
    placeholderPhone:'Phone number (required)',
    labelNationality:'Nationality / Language',
    btnRegister:'✓ Register Now',
    btnGuest:'Continue as Guest',
    cartTitle:'Shopping Cart',
    cartEmpty:'Cart is empty\nClick products to add',
    cartPcs:'items', cartItems:'types', cartTotal:'Total',
    btnCheckout:'🎉 Place Order', drawerView:'View Cart',
    barEmpty:'Cart is empty, click products to add 🛒',
    orderTitle:'📋 Confirm Order',
    customerInfo:'👤 Customer Information',
    labelName:'Name', labelPhone:'Phone',
    customerHint:'Name and phone are optional',
    labelDelivery:'📍 Delivery Location',
    placeholderDelivery:'Press current location to capture coordinates',
    deliveryRequired:'Please capture your delivery coordinates',
    btnCurrentLocation:'⌖ Current location',
    btnMapPick:'Map PIN',
    labelNote:'Notes', placeholderNote:'e.g. No ice',
    orderSummary:'🧾 Order Summary',
    thProduct:'Product', thQty:'Qty', thSub:'Subtotal',
    orderTotalLabel:'Order Total',
    btnBack:'← Edit', btnConfirm:'✓ Confirm Order',
    successTitle:'Order Submitted！',
    successMsg:'Thank you for your order！\nWe will prepare it as soon as possible.',
    successOrderId:'Order No.', btnContinue:'Continue Shopping',
    historyTitle:'History', historyEmpty:'No purchase history yet',
    btnLogout:'🚪 Logout', btnEditProfile:'✏ Edit Profile',
    editProfileTitle:'✏ Edit Member Profile', btnSaveProfile:'Save',
    minOrder:'Minimum order NT$1,000',
    toastAdded:'Added', toastCleared:'Cart cleared',
    toastCartEmpty:'Cart is empty！', toastOrderSent:'Order sent to Firebase ✓',
    toastFail:'Failed to send, please try again',
    deliveryRule:'🛵 NT$1,000→3km/1day | NT$2,000→6km/2days | NT$3,000→9km/3days',
    deliveryRuleNote:'(Every NT$1,000 more = +3km +1 day)',
    deliveryYours:'📍 Your order NT$%t：%kkm within %d day(s)',
    clearCart:'Clear Cart',
    lookupNotFound:'Member code not found',
    lookupPhoneMismatch:'Phone number does not match',
    lookupError:'An error occurred, please try again',
    lookupSearching:'Verifying…', registering:'Registering…',
    nameRequired:'Please enter your name', phoneRequired:'Please enter your phone number',
    guestMode:'Continuing as guest', loggedOut:'Logged out',
    welcomeBack:'Welcome back',
    registerSuccess:'Registration successful！ Your code：',
    foundExisting:'Existing member found, welcome',
    mbrId:'Member Code',
    cats:{ frozen:'Frozen Food', seasoning:'Seasonings', drink:'Beverages',
           rice:'Rice', alcohol:'Alcoholic Drinks', hygiene:'Hygiene & Beauty',
           food:'Food', other:'Others' },
  },
  tw: {
    flag:'🇹🇼', label:'中文',
    brandSub:'點擊商品加入購物車',
    loginBtn:'🪪 會員',
    authTitle:'線上商店',
    authTagline:'輸入會員編號或新建會員',
    authDescLookup:'🪪 已有會員編號？',
    placeholderMid:'會員編號，如 M0001',
    placeholderLookupPhone:'註冊時的電話號碼',
    btnLookup:'🔍 查詢並登入',
    orDivider:'或',
    newMemberTitle:'📝 新會員註冊',
    placeholderName:'姓名（必填）',
    placeholderPhone:'電話號碼（必填）',
    labelNationality:'國籍 / 語言',
    btnRegister:'✓ 立即註冊',
    btnGuest:'以訪客身份繼續',
    cartTitle:'購物車',
    cartEmpty:'購物車是空的\n點擊商品開始選購',
    cartPcs:'件', cartItems:'種商品', cartTotal:'合計',
    btnCheckout:'🎉 送出訂單', drawerView:'查看購物車',
    barEmpty:'購物車是空的，點擊商品開始選購 🛒',
    orderTitle:'📋 確認訂單',
    customerInfo:'👤 顧客資料',
    labelName:'姓名', labelPhone:'電話',
    customerHint:'姓名與電話選填',
    labelDelivery:'📍 送貨地點',
    placeholderDelivery:'按「取得目前座標」自動帶入',
    deliveryRequired:'請先取得送貨座標',
    btnCurrentLocation:'⌖ 取得目前座標',
    btnMapPick:'地圖選點',
    labelNote:'備註', placeholderNote:'例：不加冰',
    orderSummary:'🧾 訂單明細',
    thProduct:'商品', thQty:'數量', thSub:'小計',
    orderTotalLabel:'訂單總金額',
    btnBack:'← 返回修改', btnConfirm:'✓ 確認送出',
    successTitle:'訂單已送出！',
    successMsg:'感謝您的訂購！\n我們將盡快為您備貨。',
    successOrderId:'訂單編號', btnContinue:'繼續選購',
    historyTitle:'訂單歷史', historyEmpty:'尚無訂單記錄',
    btnLogout:'🚪 登出', btnEditProfile:'✏ 編輯資料',
    editProfileTitle:'✏ 編輯會員資料', btnSaveProfile:'儲存',
    minOrder:'最低消費 NT$1,000',
    toastAdded:'已加入', toastCleared:'購物車已清空',
    toastCartEmpty:'購物車是空的！', toastOrderSent:'訂單已寫入 Firebase ✓',
    toastFail:'送出失敗，請再試一次',
    deliveryRule:'🛵 NT$1,000→3km/1日 | NT$2,000→6km/2日 | NT$3,000→9km/3日',
    deliveryRuleNote:'（每增加 NT$1,000 多 3km、多 1 天）',
    deliveryYours:'📍 您的訂單 NT$%t：%kkm 以內 / %d 日內送達',
    clearCart:'清空購物車',
    lookupNotFound:'找不到此會員編號',
    lookupPhoneMismatch:'電話號碼不符，請確認後重試',
    lookupError:'發生錯誤，請再試一次',
    lookupSearching:'驗證中…', registering:'註冊中…',
    nameRequired:'請填寫姓名', phoneRequired:'請填寫電話號碼',
    guestMode:'以訪客模式繼續', loggedOut:'已登出',
    welcomeBack:'歡迎回來',
    registerSuccess:'註冊成功！您的會員編號：',
    foundExisting:'找到既有帳號，歡迎回來',
    mbrId:'會員編號',
    cats:{ frozen:'冷凍食品', seasoning:'調味品', drink:'飲料',
           rice:'米', alcohol:'酒', hygiene:'清潔保養品',
           food:'食品', other:'其他' },
  },
};

// 國籍/語言 對應（nat code = lang code，一對一）
const NAT_LANG_OPTIONS = [
  { code:'th', flag:'🇹🇭', label:'ไทย / ภาษาไทย',            labelShort:'🇹🇭 TH' },
  { code:'vi', flag:'🇻🇳', label:'Việt Nam / Tiếng Việt',     labelShort:'🇻🇳 VI' },
  { code:'id', flag:'🇮🇩', label:'Indonesia / Bahasa Indonesia',labelShort:'🇮🇩 ID' },
  { code:'ph', flag:'🇵🇭', label:'Philippines / English',      labelShort:'🇵🇭 EN' },
  { code:'tw', flag:'🇹🇼', label:'台灣 / 中文',               labelShort:'🇹🇼 中' },
];
// 向下相容
const NATIONALITIES = NAT_LANG_OPTIONS.map(o=>({ code:o.code, flag:o.flag, label:o.label }));
const NAT_TO_LANG   = { th:'th', vi:'vi', id:'id', ph:'ph', tw:'tw' };

let _lang = 'th';  // 目前語言

function t(key) {
  return (LANGS[_lang] || LANGS.th)[key] || LANGS.th[key] || key;
}
function setLang(lang) {
  if (!LANGS[lang]) return;
  _lang = lang;
  try { localStorage.setItem('shop_lang', lang); } catch(e) {}
  applyLang(); // applyLang 內已呼叫 buildLangSwitcher + renderTabs
}
function detectLang() {
  try {
    // 1. localStorage 明確選擇優先
    const saved = localStorage.getItem('shop_lang');
    if (saved && LANGS[saved]) { _lang = saved; return; }
    // 2. 已登入會員的國籍
    const m = safeGetLS(LS.MEMBER, null);
    if (m?.nationality && LANGS[m.nationality]) { _lang = m.nationality; return; }
    // 3. 手機/瀏覽器語言
    const navLangs = navigator.languages || [navigator.language || 'th'];
    for (const nl of navLangs) {
      const code = nl.slice(0,2).toLowerCase();
      // 瀏覽器 language code → LANGS key 對應
      const MAP = { th:'th', vi:'vi', id:'id', ms:'id', en:'ph', zh:'tw', 'zh-tw':'tw', 'zh-hant':'tw' };
      const full = nl.toLowerCase().replace('_','-');
      if (MAP[full]) { _lang = MAP[full]; return; }
      if (MAP[code]) { _lang = MAP[code]; return; }
    }
  } catch(e) {}
  _lang = 'th'; // 最終預設
}

/* 套用語言到所有靜態 UI 元素 */
function applyLang() {
  const L = LANGS[_lang] || LANGS.th;
  const set = (id, val) => { const el=document.getElementById(id); if(el) el.textContent=val; };
  const setP = (id, val) => { const el=document.getElementById(id); if(el) el.placeholder=val; };

  // Header
  set('brand-sub-text', L.brandSub);
  set('login-btn-text', L.loginBtn);

  // Auth modal
  set('auth-store-name-text', L.authTitle);
  set('auth-tagline-text', L.authTagline);
  set('auth-desc-lookup', L.authDescLookup);
  setP('auth-mid-field', L.placeholderMid);
  setP('auth-lookup-phone', L.placeholderLookupPhone);
  set('auth-lookup-btn', L.btnLookup);
  set('auth-or-1', L.orDivider);
  set('auth-new-title-text', L.newMemberTitle);
  setP('auth-name', L.placeholderName);
  setP('auth-phone', L.placeholderPhone);
  set('auth-nat-label', L.labelNationality);
  set('auth-register-btn', L.btnRegister);
  set('auth-guest-btn-text', L.btnGuest);

  // Sidebar cart
  set('sb-cart-title', L.cartTitle);
  set('sb-clear-btn', L.clearCart);
  set('sb-total-label', L.cartTotal);
  set('sb-checkout-btn', L.btnCheckout);

  // Drawer cart
  set('drawer-cart-title', L.cartTitle);
  set('drawer-total-label', L.cartTotal);
  set('drawer-checkout-btn', L.btnCheckout);

  // Order modal
  set('modal-order-title', L.orderTitle);
  set('modal-customer-info-title', L.customerInfo);
  set('modal-name-label', L.labelName);
  setP('customer-name', L.labelName);
  set('modal-phone-label', L.labelPhone);
  setP('customer-phone', L.labelPhone);
  set('modal-customer-hint', L.customerHint);
  set('modal-delivery-label', L.labelDelivery);
  setP('order-delivery', L.placeholderDelivery);
  set('modal-delivery-err', L.deliveryRequired);
  set('geo-btn', L.btnCurrentLocation);
  set('map-pick-btn', L.btnMapPick);
  set('modal-note-label', L.labelNote);
  setP('order-note', L.placeholderNote);
  set('modal-summary-title', L.orderSummary);
  set('modal-th-product', L.thProduct);
  set('modal-th-qty', L.thQty);
  set('modal-th-sub', L.thSub);
  set('modal-order-total-label', L.orderTotalLabel);
  set('modal-btn-back', L.btnBack);
  set('modal-btn-confirm-text', L.btnConfirm);

  // Success modal
  set('success-title-text', L.successTitle);
  set('success-msg-text', L.successMsg.replace('\n','\n'));
  set('btn-done-text', L.btnContinue);

  // Member drawer
  set('m-history-title', L.historyTitle);
  set('m-logout-btn', L.btnLogout);
  set('m-edit-profile-btn', L.btnEditProfile);

  // Edit profile
  set('edit-profile-title', L.editProfileTitle);
  set('ep-name-label', L.labelName);
  set('ep-phone-label', L.labelPhone);
  set('ep-nat-label', L.labelNationality);
  set('ep-nat-hint', L.authTagline);
  set('ep-save-btn', L.btnSaveProfile);

  // Update delivery range hint if order modal is open
  const hintEl = document.getElementById('delivery-range-hint');
  if(hintEl && hintEl.style.display !== 'none') {
    const total = getTotal();
    const tier  = Math.max(1, Math.floor(total / 1000));
    const km    = tier * 3;
    const days  = tier;
    const yourMsg = total >= 1000
      ? t('deliveryYours').replace('%t',total).replace('%k',km).replace('%d',days)
      : `⚠ ${t('minOrder')}`;
    const yourColor = total >= 1000 ? 'var(--green)' : 'var(--primary)';
    hintEl.innerHTML = `${t('deliveryRule')}<br>
      <span style="opacity:.8">${t('deliveryRuleNote')}</span><br>
      <b style="color:${yourColor}">${yourMsg}</b>`;
  }

  // Update page title + PWA meta to match language
  updatePageTitle();

  // Update lang switcher to reflect current selection
  buildLangSwitcher();

  // Re-render dynamic content
  renderTabs();
  updateAllCartUI();
}

/* 左下角語言切換面板 — 登入前展開，登入後折疊為國籍旗幟，點擊 toggle */
let _lsOpen = false;

function buildLangSwitcher() {
  let el = document.getElementById('lang-switcher');
  if (!el) {
    el = document.createElement('div');
    el.id = 'lang-switcher';
    document.body.appendChild(el);
  }
  const isLoggedIn = !!(currentMember);
  // 登入前始終展開；登入後依 _lsOpen 決定
  const showExpanded = !isLoggedIn || _lsOpen;

  if (showExpanded) {
    el.innerHTML = `<div class="ls-expanded">
      <div class="ls-label">🌐</div>
      ${NAT_LANG_OPTIONS.map(o => `
        <button class="ls-opt${_lang===o.code?' active':''}" onclick="setLang('${o.code}')" title="${o.label}">
          <span class="ls-flag">${o.flag}</span>
          <span class="ls-txt">${o.labelShort.replace(/^[^\s]+\s/,'')}</span>
        </button>`).join('')}
      ${isLoggedIn ? `<button class="ls-opt" onclick="_lsOpen=false;buildLangSwitcher()" style="justify-content:center;opacity:.5;font-size:11px;padding:4px">▼</button>` : ''}
    </div>`;
  } else {
    el.innerHTML = `<div class="ls-collapsed" onclick="_lsOpen=true;buildLangSwitcher()" title="${(LANGS[_lang]||LANGS.th).label}">
      <span style="font-size:20px">${(LANGS[_lang]||LANGS.th).flag}</span>
    </div>`;
  }
}

function lsExpand() { _lsOpen = true; buildLangSwitcher(); }

/* 國籍/語言 選單選項 HTML */
function buildNatOptions(selectedCode) {
  return NAT_LANG_OPTIONS.map(o =>
    `<option value="${o.code}"${o.code===selectedCode?' selected':''}>${o.flag} ${o.label}</option>`
  ).join('');
}
const CATEGORIES = [
  {id:'frozen',    icon:'🧊',  th:'อาหารแช่แข็ง',              zh:'冷凍食品'},
  {id:'seasoning', icon:'🌶',  th:'เครื่องปรุง',               zh:'調味品'},
  {id:'drink',     icon:'🥤',  th:'เครื่องดื่ม',               zh:'飲料'},
  {id:'rice',      icon:'🌾',  th:'ข้าว',                     zh:'米'},
  {id:'alcohol',   icon:'🍺',  th:'เครื่องดื่มแอลกอฮอล์',     zh:'酒'},
  {id:'hygiene',   icon:'🧴',  th:'ของใช้ส่วนตัว',             zh:'清潔保養品'},
  {id:'food',      icon:'🍜',  th:'อาหาร',                    zh:'食品'},
  {id:'other',     icon:'📦',  th:'อื่นๆ',                    zh:'其他'},
];
const CAT_GRAD = {
  frozen:'grad-frozen', drink:'grad-drink', food:'grad-food',
  rice:'grad-rice', alcohol:'grad-alcohol', seasoning:'grad-seasoning',
  hygiene:'grad-hygiene', other:'grad-other',
};

/* ══════════════════════════════════════════════
   Products: Load + Deduplicate
   去重規則：name.trim().toLowerCase() + price 相同 → 只保留第一個
══════════════════════════════════════════════ */
const DEFAULT_PRODUCTS = {
  '4710088001001':{name:'統一麥香奶茶',price:25,category:'drink'},
  '4710088001002':{name:'光泉鮮乳',price:65,category:'drink'},
  '4714771060000':{name:'旺旺仙貝',price:35,category:'food'},
  '4719854210008':{name:'義美小泡芙',price:39,category:'food'},
  '4710085081026':{name:'統一布丁',price:15,category:'food'},
  '4710438001234':{name:'御茶園煎茶',price:25,category:'drink'},
  '4712345678900':{name:'農夫山泉礦泉水',price:15,category:'drink'},
  '4711234000001':{name:'小美冰淇淋',price:25,category:'frozen'},
};
function loadAllProducts() {
  const barcodeMap = safeGetLS(LS.PROD, null) || DEFAULT_PRODUCTS;
  const nobcList   = safeGetLS(LS.NOBC, []);
  const oosMap     = safeGetLS(LS.OOS, {});   // 缺貨清單 {id: {name, type}}
  const raw = [];
  try {
    Object.entries(barcodeMap).forEach(([bc, p]) => {
      if (!p || typeof p !== 'object') return;
      const name = String(p.name ?? '').trim();
      if (!name) return;
      if (oosMap[bc] || p.outOfStock) return;   // 缺貨 → 跳過
      raw.push({ id:bc, name, price:Number(p.price??0),
        category:String(p.category??'other'), image:p.image??null, type:'barcode' });
    });
  } catch(e) {}
  try {
    (Array.isArray(nobcList) ? nobcList : []).forEach(p => {
      if (!p || typeof p !== 'object') return;
      const name = String(p.name ?? '').trim();
      if (!name) return;
      if (oosMap[p.id] || p.outOfStock) return;  // 缺貨 → 跳過
      raw.push({ id:p.id??('NOBC-'+Math.random().toString(36).slice(2)),
        name, price:Number(p.price??0),
        category:String(p.category??'other'), image:p.image??null, type:'nobc' });
    });
  } catch(e) {}
  // Deduplicate: same name (case+space insensitive) + same price
  const seen = new Set();
  return raw.filter(p => {
    const key = `${p.name.toLowerCase().replace(/\s+/g,'_')}::${p.price}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

/* ══════════════════════════════════════════════
   Render: Tabs + Products
══════════════════════════════════════════════ */
function renderTabs() {
  const c = document.getElementById('tabs-container');
  if (!c) return;
  const counts = {};
  allProducts.forEach(p => { const cat=p.category||'other'; counts[cat]=(counts[cat]||0)+1; });
  const available = CATEGORIES.filter(x => counts[x.id] > 0);
  if (!counts[activeCat] && available.length > 0) activeCat = available[0].id;
  const L = LANGS[_lang] || LANGS.th;
  c.innerHTML = available.map(x => {
    const active  = activeCat===x.id ? ' active' : '';
    const catName = (L.cats && L.cats[x.id]) ? L.cats[x.id] : x.th;
    return `<button class="tab-btn${active}" onclick="switchCat('${h(x.id)}')">
      <span class="tab-emoji">${h(x.icon)}</span>
      <span>${h(catName)}</span>
      <span class="tab-count">${counts[x.id]||0}</span>
    </button>`;
  }).join('');
}
function getCatIcon(catId) { return (CATEGORIES.find(x=>x.id===catId)||{}).icon||'📦'; }
function renderProducts() {
  const grid = document.getElementById('product-grid');
  if (!grid) return;
  const filtered = allProducts.filter(p => (p.category||'other') === activeCat);
  if (!filtered.length) {
    grid.innerHTML = `<div class="empty-state">
      <div class="ei">🔍</div><div class="et">ไม่มีสินค้าในหมวดนี้</div>
      <div class="es">กรุณาเพิ่มสินค้าในระบบ POS แล้วรีเฟรช<br>
        <span style="font-family:'Noto Sans TC',sans-serif;font-size:12px">請至 POS 系統新增商品後重新整理</span>
      </div></div>`; return;
  }
  grid.innerHTML = filtered.map((p, i) => {
    const qty  = (cart.find(c=>c.id===p.id)||{}).qty||0;
    const grad = CAT_GRAD[p.category||'other']||'grad-other';
    const icon = getCatIcon(p.category||'other');
    const init = (p.name||'?')[0];
    const imgHtml = p.image
      ? `<img class="card-img" src="${h(p.image)}" alt="${h(p.name)}" loading="lazy"
             onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
         <div class="card-placeholder ${grad}" style="display:none">
           <div class="ph-emoji">${h(icon)}</div><div class="ph-initial">${h(init)}</div></div>`
      : `<div class="card-placeholder ${grad}">
           <div class="ph-emoji">${h(icon)}</div><div class="ph-initial">${h(init)}</div></div>`;
    return `<div class="product-card" onclick="addToCart('${h(p.id)}')"
          style="animation-delay:${Math.min(i*.04,.5)}s">
      <div class="card-img-wrap">
        ${imgHtml}
        ${qty>0?`<div class="in-cart-badge">${qty}</div>`:''}
      </div>
      <div class="card-body">
        <div class="card-name">${h(p.name)}</div>
        <div class="card-footer">
          <div class="card-price"><span>NT$</span> ${h(String(p.price))}</div>
          <button class="add-btn" onclick="event.stopPropagation();addToCart('${h(p.id)}')" aria-label="เพิ่ม">＋</button>
        </div>
      </div></div>`;
  }).join('');
}

/* ══════════════════════════════════════════════
   Cart Logic
══════════════════════════════════════════════ */
function addToCart(id) {
  try {
    const p = allProducts.find(x=>x.id===id);
    if (!p) return;
    const ex = cart.find(c=>c.id===id);
    if (ex) ex.qty+=1; else cart.push({id:p.id,name:p.name,price:p.price,category:p.category,qty:1});
    updateAllCartUI(); renderProducts();
    showToast(`${t('toastAdded')}：${p.name}`,'ok');
    const b = document.getElementById('hdr-badge');
    if (b) { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
  } catch(e) {}
}

function changeQty(id, delta) {
  const item = cart.find(c=>c.id===id);
  if (!item) return;
  item.qty = Math.max(1, item.qty+delta);
  updateAllCartUI(); renderProducts();
}
function removeFromCart(id) { cart=cart.filter(c=>c.id!==id); updateAllCartUI(); renderProducts(); }
function clearCart() {
  if (!cart.length) return;
  cart=[]; updateAllCartUI(); renderProducts();
  showToast(t('toastCleared'));
}
function getTotal()    { return cart.reduce((s,i)=>s+Number(i.price||0)*Number(i.qty||0),0); }
function getTotalQty() { return cart.reduce((s,i)=>s+Number(i.qty||0),0); }

function buildCartHTML() {
  if (!cart.length) return `<div class="cart-empty"><div class="cart-empty-icon">🛒</div>
    <div class="cart-empty-text">${t('cartEmpty').replace('\n','<br>')}</div></div>`;
  return cart.map(item=>`
    <div class="cart-item">
      <div class="ci-name">${h(item.name)}</div>
      <button class="ci-remove" onclick="removeFromCart('${h(item.id)}')">×</button>
      <div class="ci-controls">
        <button class="qty-btn-sm" onclick="changeQty('${h(item.id)}',-1)">−</button>
        <span class="qty-num">${item.qty}</span>
        <button class="qty-btn-sm" onclick="changeQty('${h(item.id)}',1)">＋</button>
      </div>
      <div class="ci-sub">NT$ ${item.price*item.qty}</div>
    </div>`).join('');
}

function updateAllCartUI() {
  const total=getTotal(), tq=getTotalQty(), has=cart.length>0;
  const emptyHTML = `<div class="cart-empty"><div class="cart-empty-icon">🛒</div><div class="cart-empty-text">${t('cartEmpty').replace('\n','<br>')}</div></div>`;
  const cartH = has ? buildCartHTML() : emptyHTML;
  // Header
  setText('hdr-cart-txt', `NT$ ${total}`);
  const b = document.getElementById('hdr-badge');
  if (b) { b.style.display=has?'flex':'none'; b.textContent=tq; }
  // Sidebar
  const sbc=document.getElementById('sb-cart-body'),
        sbco=document.getElementById('sb-count'),
        sbt=document.getElementById('sb-total'),
        sbck=document.getElementById('sb-checkout-btn'),
        sbl=document.getElementById('sb-items-lbl');
  if(sbc) sbc.innerHTML=cartH;
  if(sbco) sbco.textContent=`${tq} ${t('cartPcs')}`;
  if(sbt) sbt.textContent=`NT$ ${total}`;
  if(sbck) sbck.disabled=!has;
  if(sbl) sbl.textContent=has?`${t('cartItems')}: ${cart.length}`:'';
  // Drawer
  const db=document.getElementById('drawer-cart-body'),
        dt=document.getElementById('drawer-total'),
        dc=document.getElementById('drawer-checkout-btn');
  if(db) db.innerHTML=cartH;
  if(dt) dt.textContent=`NT$ ${total}`;
  if(dc) dc.disabled=!has;
  // Mobile bar
  const mb=document.getElementById('mcb-inner');
  if(mb) mb.innerHTML = has
    ? `<div class="mcb-icon">🛒</div>
       <div class="mcb-info"><div class="mcb-count">${t('cartItems')}: ${tq}</div><div class="mcb-amt">NT$ ${total}</div></div>
       <div class="mcb-go">${t('drawerView')}</div>`
    : `<div class="mcb-empty">${t('barEmpty')}</div>`;
}

/* ══════════════════════════════════════════════
   Drawer / Modals
══════════════════════════════════════════════ */
function openDrawer() {
  if(drawerOpen) return; drawerOpen=true;
  const o=document.getElementById('drawer-overlay');
  o.classList.add('open');
  requestAnimationFrame(()=>requestAnimationFrame(()=>o.classList.add('visible')));
  document.body.style.overflow='hidden';
}
function closeDrawer() {
  if(!drawerOpen) return; drawerOpen=false;
  const o=document.getElementById('drawer-overlay');
  o.classList.remove('visible');
  setTimeout(()=>{o.classList.remove('open');},300);
  document.body.style.overflow='';
}
function handleDrawerOutsideClick(e) { if(e.target===document.getElementById('drawer-overlay')) closeDrawer(); }

function openModal(id) {
  const o=document.getElementById(id); if(!o) return;
  o.classList.add('open');
  requestAnimationFrame(()=>requestAnimationFrame(()=>o.classList.add('visible')));
  document.body.style.overflow='hidden';
}
function closeModal(id) {
  const o=document.getElementById(id); if(!o) return;
  o.classList.remove('visible');
  setTimeout(()=>{o.classList.remove('open'); document.body.style.overflow='';},280);
}
function handleModalOutsideClick(e,id) { if(e.target===document.getElementById(id)) closeModal(id); }

function openOrderModal() {
  if(!cart.length) { showToast(t('toastCartEmpty'),'err'); return; }

  const total = getTotal();

  // Pre-fill from member / last saved
  if(currentMember) {
    const n=document.getElementById('customer-name');
    const p=document.getElementById('customer-phone');
    if(n && !n.value) n.value=currentMember.name||'';
    if(p && !p.value) p.value=currentMember.phone||'';
  }
  const deliveryEl = document.getElementById('order-delivery');
  if(deliveryEl && !getDeliveryCoords()) deliveryEl.value = '';
  const errEl = document.getElementById('modal-delivery-err');
  if(errEl) errEl.style.display = 'none';

  // 動態送貨範圍說明（金額不足時顯示最低消費提醒）
  const hintEl = document.getElementById('delivery-range-hint');
  if(hintEl) {
    hintEl.style.display = '';
    const tier = Math.max(1, Math.floor(total / 1000));
    const km   = tier * 3;
    const days = tier;
    const yourMsg = total >= 1000
      ? t('deliveryYours').replace('%t',total).replace('%k',km).replace('%d',days)
      : `⚠ ${t('minOrder')}`;
    const yourColor = total >= 1000 ? 'var(--green)' : 'var(--primary)';
    hintEl.innerHTML = `${t('deliveryRule')}<br>
      <span style="opacity:.8">${t('deliveryRuleNote')}</span><br>
      <b style="color:${yourColor}">${yourMsg}</b>`;
  }

  // Fill order table
  const tb=document.getElementById('modal-order-body');
  if(tb) tb.innerHTML=cart.map(item=>{
    const sub=item.price*item.qty;
    return `<tr>
      <td class="item-name">${h(item.name)}</td>
      <td class="item-qty">${item.qty}</td>
      <td>NT$ ${sub}</td>
    </tr>`;
  }).join('');
  const tel=document.getElementById('modal-order-total');
  if(tel) {
    tel.textContent=`NT$ ${total}`;
    tel.style.color = total >= 1000 ? 'var(--primary)' : 'var(--red)';
  }
  const chip=document.getElementById('modal-member-chip');
  if(chip) {
    chip.style.display=currentMember?'':'none';
    chip.textContent=currentMember?`🪪 ${currentMember.memberId} · ${currentMember.name}`:'';
  }
  openModal('order-modal');
}

/* ══════════════════════════════════════════════
   Submit Order
══════════════════════════════════════════════ */
async function submitOrder() {
  if(!cart.length) return;

  // 最低 1000 元在確認送出時攔截
  const total = getTotal();
  if(total < 1000) {
    const need = 1000 - total;
    showToast(`${t('minOrder')} — 還差 NT$${need}`, 'err');
    return;
  }

  // 送貨座標必填驗證：不再要求手動輸入地址。
  const deliveryCoordsForSubmit = getDeliveryCoords();
  if(!deliveryCoordsForSubmit) {
    const errEl = document.getElementById('modal-delivery-err');
    if(errEl) errEl.style.display = '';
    setGeoStatus('請先按「取得目前座標」，讓訂單存入送貨座標\n若瀏覽器無法定位，可使用「地圖選點」。', 'err');
    document.getElementById('geo-btn')?.focus();
    showToast(t('deliveryRequired'), 'err');
    return;
  }
  const deliveryVal = (document.getElementById('order-delivery')?.value || deliveryCoordsForSubmit.address || `${deliveryCoordsForSubmit.lat}, ${deliveryCoordsForSubmit.lng}`).trim();
  // 記住本次地點
  try{ localStorage.setItem('shop_last_delivery', deliveryVal); }catch(e){}

  const btn=document.getElementById('confirm-btn');
  if(btn){btn.disabled=true;btn.textContent='กำลังส่ง…';}
  try {
    const nameVal  = (document.getElementById('customer-name')?.value||'').trim();
    const phoneVal = (document.getElementById('customer-phone')?.value||'').trim();
    const noteVal  = (document.getElementById('order-note')?.value||'').trim();
    const now=new Date(), orderId='ONL-'+now.getTime().toString(36).toUpperCase();
    const total=getTotal();

    const tier = Math.floor(total / 1000);
    const coords = deliveryCoordsForSubmit;
    const distKm = coords ? calcDistKm(STORE.lat, STORE.lng, coords.lat, coords.lng) : null;
    const maxKm  = tier * 3;

    // 如果有座標，驗證距離
    if (distKm !== null && distKm > maxKm) {
      showToast(`距離 ${distKm.toFixed(1)} km 超出本訂單可配送範圍（${maxKm} km）`, 'err');
      if(btn){btn.disabled=false; const el=document.getElementById('modal-btn-confirm-text'); if(el) el.textContent=t('btnConfirm');}
      return;
    }

    const orderObj = {
      id: orderId, date: now.toISOString(), source: 'online',
      memberId:         currentMember?.memberId || null,
      memberName:       currentMember?.name     || null,
      isGuest:          !currentMember,
      customerName:     nameVal  || currentMember?.name  || 'แขก / 訪客',
      customerPhone:    phoneVal || currentMember?.phone || '',
      deliveryLocation: deliveryVal,
      deliveryCoords:   coords,
      deliveryLat:      coords.lat,
      deliveryLng:      coords.lng,
      deliveryGeoSource: coords.source,
      deliveryResolvedAddress: coords.address,
      deliveryKm:       distKm !== null ? Math.round(distKm * 10) / 10 : null,
      storeAddress:     STORE.name,
      storeCoords:      { lat: STORE.lat, lng: STORE.lng },
      deliveryDays:     tier,
      note:             noteVal,
      items: cart.map(i=>({id:i.id,name:i.name,price:i.price,qty:i.qty})),
      subtotal:total, total, status:'pending',
    };

    // 本機先存
    const lo=safeGetLS('pos_online_orders',[]);
    if(Array.isArray(lo)) lo.push(orderObj);
    safeSetLS('pos_online_orders',Array.isArray(lo)?lo:[orderObj]);
    const tx=safeGetLS('pos_transactions',[]);
    if(Array.isArray(tx)) tx.push(orderObj);
    safeSetLS('pos_transactions',Array.isArray(tx)?tx:[orderObj]);

    // Firebase 非同步寫入
    writeOrderToFirebase(orderObj).then(ok=>{
      if(ok) showToast(t('toastOrderSent'),'ok');
    });

    const si=document.getElementById('success-order-id');
    if(si) si.textContent=`${t('successOrderId')}：${orderId}`;

    cart=[]; updateAllCartUI(); renderProducts();
    closeModal('order-modal');
    setTimeout(()=>openModal('success-modal'),300);

    if(currentMember && memberOpen) renderMemberDrawer();
    try {
      ['customer-name','customer-phone','order-note','order-delivery'].forEach(id=>{
        const el=document.getElementById(id); if(el) el.value='';
      });
      resetDeliveryCoords({ clearDisplay: true });
      clearGeoStatus();
    } catch(e){}
  } catch(err) {
    console.error('[Shop] submitOrder:',err);
    showToast(t('toastFail'),'err');
  } finally {
    if(btn){
      btn.disabled=false;
      const el = document.getElementById('modal-btn-confirm-text');
      if(el) el.textContent = t('btnConfirm');
    }
  }
}

/* 國籍變更 → 自動切語言 */
function onNatChange(natCode) {
  if (natCode && NAT_TO_LANG[natCode]) setLang(NAT_TO_LANG[natCode]);
}

/* 編輯會員資料 */
function openEditProfile() {
  if (!currentMember) return;
  closeMemberDrawer();
  const m = currentMember;
  const nameEl = document.getElementById('ep-name');
  const phoneEl = document.getElementById('ep-phone');
  const natEl   = document.getElementById('ep-nationality');
  if (nameEl)  nameEl.value  = m.name  || '';
  if (phoneEl) phoneEl.value = m.phone || '';
  if (natEl)   natEl.innerHTML = `<option value="">— Select —</option>` + buildNatOptions(m.nationality || '');
  // Update labels in current language
  setText('edit-profile-title', t('editProfileTitle'));
  setText('ep-name-label',  t('labelName'));
  setText('ep-phone-label', t('labelPhone'));
  setText('ep-nat-label',   t('labelNationality'));
  setText('ep-save-btn',    t('btnSaveProfile'));
  openModal('edit-profile-modal');
}

async function saveEditProfile() {
  const name  = (document.getElementById('ep-name')?.value  || '').trim();
  const phone = (document.getElementById('ep-phone')?.value || '').trim();
  const nat   = (document.getElementById('ep-nationality')?.value || '').trim();
  if (!name || !phone) { showToast(t('nameRequired'), 'err'); return; }

  // Update local
  if (currentMember) {
    currentMember.name        = name;
    currentMember.phone       = phone;
    currentMember.nationality = nat;
    safeSetLS(LS.MEMBER, currentMember);
    updateAuthUI();

    // Update Firebase
    if (_fbOK && _db && currentMember.memberId) {
      try {
        await set(ref(_db, `${FB.MEMBERS}/${currentMember.memberId}/name`),        name);
        await set(ref(_db, `${FB.MEMBERS}/${currentMember.memberId}/phone`),       phone);
        await set(ref(_db, `${FB.MEMBERS}/${currentMember.memberId}/nationality`), nat);
      } catch(e) { console.warn('[Shop] saveEditProfile Firebase:', e); }
    }
    // 依新國籍切語言
    if (nat && NAT_TO_LANG[nat]) setLang(NAT_TO_LANG[nat]);
  }
  closeModal('edit-profile-modal');
  showToast(t('btnSaveProfile') + ' ✓', 'ok');
  setTimeout(() => openMemberDrawer(), 300);
}

/* 依語言動態設定頁面標題 */
const TITLES = {
  th:'ร้านค้าออนไลน์', vi:'Cửa hàng trực tuyến',
  id:'Toko Online', ph:'Online Shop', tw:'線上商店',
};
function updatePageTitle() {
  const title = TITLES[_lang] || TITLES.th;
  document.title = title;
  // 更新 PWA manifest name 動態覆蓋（部分瀏覽器支援）
  const metaAppName = document.querySelector('meta[name="application-name"]');
  if (metaAppName) metaAppName.content = title;
  const metaApple = document.querySelector('meta[name="apple-mobile-web-app-title"]');
  if (metaApple) metaApple.content = title;
  // 更新 brand name
  setText('shop-name', title);
}

function switchCat(catId) { activeCat=catId; renderTabs(); renderProducts(); }
function closeSuccess() { closeModal('success-modal'); }

/* ══════════════════════════════════════════════
   Toast
══════════════════════════════════════════════ */
let _tt=null;
function showToast(msg,type) {
  try {
    const t=document.getElementById('toast'); if(!t) return;
    t.textContent=String(msg??'');
    t.className='toast show'+(type?' '+type:'');
    clearTimeout(_tt); _tt=setTimeout(()=>{t.className='toast';},2800);
  } catch(e){}
}

/* ══════════════════════════════════════════════
   Init — 修正版
   順序：① 立即渲染本機商品  ② 立即判斷會員
         ③ Firebase 背景同步（有 timeout，不阻塞 UI）
══════════════════════════════════════════════ */
async function init() {
  // ① 偵測語言（從 localStorage / 會員資料 / 瀏覽器語言）
  detectLang();

  // ② PWA 初始化
  initPWA();

  // ③ 建立語言切換按鈕
  buildLangSwitcher();

  // ④ 填充國籍/語言下拉選單（Auth + Edit Profile）
  const natOpts = buildNatOptions('');
  const authNat = document.getElementById('auth-nationality');
  if (authNat) authNat.innerHTML = `<option value="">— ${(LANGS[_lang]||LANGS.th).labelNationality||'Select'} —</option>` + natOpts;

  // ⑤ 套用語言 + 設定頁面標題（依語言顯示）
  applyLang();
  updatePageTitle();

  // ⑥ 立即從本機快取渲染商品（不等 Firebase）
  allProducts = loadAllProducts();
  renderTabs();
  renderProducts();
  updateAllCartUI();

  // ⑦ 立即判斷會員狀態（不等 Firebase）
  const savedMember = safeGetLS(LS.MEMBER, null);
  if (savedMember?.memberId) {
    const o = document.getElementById('auth-overlay');
    if (o) { o.style.display = 'none'; o.classList.remove('visible'); }
    setMember(savedMember);  // setMember 內已含語言偵測
    if (_fbOK) {
      lookupMemberById(savedMember.memberId)
        .then(fresh => { if (fresh) setMember(fresh); })
        .catch(() => {});
    }
  } else {
    showAuthModal();
  }

  // ⑧ Firebase 背景同步商品（10 秒 timeout，失敗不影響 UI）
  syncProductsBackground();
}

// Firebase 商品同步（背景執行，不阻塞 UI）
async function syncProductsBackground() {
  if (!_fbOK) { setFbIndicator('local'); return; }

  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('timeout')), 10000)
  );

  try {
    setFbIndicator('connecting');
    await Promise.race([syncProducts(), timeout]);

    // 同步成功後重新載入並比對，若有變化就重新渲染
    const fresh = loadAllProducts();
    const prevIds  = allProducts.map(p => p.id + p.price).sort().join(',');
    const freshIds = fresh.map(p => p.id + p.price).sort().join(',');

    if (prevIds !== freshIds || fresh.length !== allProducts.length) {
      console.log(`[Shop] 商品已更新：${allProducts.length} → ${fresh.length} 筆，重新渲染`);
      allProducts = fresh;
      renderTabs();
      renderProducts();
    } else {
      console.log('[Shop] 商品無變化，保持現有畫面');
    }
  } catch(e) {
    console.warn('[Shop] Background sync failed/timeout:', e.message);
    setFbIndicator('error');
  }
}

window.addEventListener('storage', e => {
  if(e.key===LS.PROD || e.key===LS.NOBC) {
    try { allProducts=loadAllProducts(); renderTabs(); renderProducts(); } catch(e){}
  }
});

/* ══════════════════════════════════════════════
   PWA: Service Worker Registration
══════════════════════════════════════════════ */
let _deferredInstallPrompt = null;

function initPWA() {
  // Register Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js', { scope: './' })
      .then(reg => {
        console.log('[PWA] SW registered:', reg.scope);

        // 偵測到新版 SW 等待中 → 提示使用者更新
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // 有新版本可用
              showUpdateBar(reg);
            }
          });
        });

        // 頁面載入時也檢查是否有等待中的新版
        if (reg.waiting && navigator.serviceWorker.controller) {
          showUpdateBar(reg);
        }
      })
      .catch(err => console.warn('[PWA] SW registration failed:', err));

    // SW 控制權切換時自動重新載入（套用新版）
    let swRefreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!swRefreshing) { swRefreshing = true; location.reload(); }
    });
  }

  // Offline / online detection
  const offlineBar = document.getElementById('offline-bar');
  function updateOnlineStatus() {
    if (!offlineBar) return;
    if (!navigator.onLine) {
      offlineBar.classList.add('show');
    } else {
      offlineBar.classList.remove('show');
    }
  }
  window.addEventListener('online',  updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  updateOnlineStatus();

  // Install banner (Android Chrome / Edge)
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    _deferredInstallPrompt = e;
    // Only show if not already installed and not dismissed this session
    if (!sessionStorage.getItem('pwa-dismissed')) {
      const banner = document.getElementById('pwa-banner');
      if (banner) banner.classList.add('show');
    }
  });

  // Hide banner if already installed
  window.addEventListener('appinstalled', () => {
    const banner = document.getElementById('pwa-banner');
    if (banner) banner.classList.remove('show');
    _deferredInstallPrompt = null;
    showToast('ติดตั้งแอปสำเร็จ！🎉 / 已成功安裝 App！', 'ok');
  });
}

function showUpdateBar(reg) {
  // 顯示更新提示條
  let bar = document.getElementById('sw-update-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'sw-update-bar';
    bar.style.cssText = `
      position:fixed;top:var(--hdr-h,64px);left:0;right:0;z-index:600;
      background:var(--primary);color:#fff;display:flex;align-items:center;
      gap:10px;padding:10px 16px;font-size:13px;font-family:var(--th);
      box-shadow:0 3px 12px rgba(0,0,0,.2);animation:slide-dn .3s ease;
    `;
    bar.innerHTML = `
      <span style="flex:1">🔄 มีเวอร์ชันใหม่！/ 有新版本！</span>
      <button onclick="applySwUpdate()" style="
        background:rgba(255,255,255,.25);border:1.5px solid rgba(255,255,255,.5);
        color:#fff;border-radius:50px;padding:6px 14px;font-size:12px;
        font-weight:700;cursor:pointer;white-space:nowrap">
        อัปเดตเลย / 立即更新
      </button>
      <button onclick="this.parentNode.remove()" style="
        background:transparent;border:none;color:rgba(255,255,255,.7);
        font-size:18px;cursor:pointer;padding:2px 4px;line-height:1">×</button>
    `;
    document.body.appendChild(bar);
  }
  // 存 reg 供 apply 使用
  window._pendingSwReg = reg;
}

function applySwUpdate() {
  const reg = window._pendingSwReg;
  if (reg?.waiting) {
    reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    // controllerchange 會觸發自動 reload
  } else {
    location.reload();
  }
}

window.applySwUpdate = applySwUpdate;

function pwaInstall() {
  if (!_deferredInstallPrompt) return;
  _deferredInstallPrompt.prompt();
  _deferredInstallPrompt.userChoice.then(choice => {
    if (choice.outcome === 'accepted') {
      console.log('[PWA] User accepted install');
    }
    _deferredInstallPrompt = null;
    const banner = document.getElementById('pwa-banner');
    if (banner) banner.classList.remove('show');
  });
}

function pwaDismiss() {
  const banner = document.getElementById('pwa-banner');
  if (banner) banner.classList.remove('show');
  sessionStorage.setItem('pwa-dismissed', '1');
}

/* ══════════════════════════════════════════════
   送貨座標距離驗證系統
   店家位置：苗栗縣通霄鎮通南里中山路109號1樓
   使用瀏覽器 Geolocation 取得目前座標，Nominatim 只做反查顯示。
   允許範圍：苗栗縣、台中市
   超出範圍：直接拒絕
══════════════════════════════════════════════ */

// 店家座標（苗栗縣通霄鎮通南里中山路109號1樓）
const STORE = {
  lat: 24.4889,
  lng: 120.6723,
  name: '苗栗縣通霄鎮通南里中山路109號1樓',
};

// 免費方案：Browser Geolocation + Nominatim reverse geocode + Leaflet/OpenStreetMap 圖磚，不需要 API key。
const ALLOWED_REGIONS = ['苗栗縣', '苗栗市', '台中市', '臺中市', 'Miaoli', 'Taichung'];
const TAIWAN_REGION_NAMES = [
  '臺北市','台北市','新北市','桃園市','新竹縣','新竹市','苗栗縣','苗栗市',
  '臺中市','台中市','彰化縣','南投縣','雲林縣','嘉義縣','嘉義市','臺南市','台南市',
  '高雄市','屏東縣','宜蘭縣','花蓮縣','臺東縣','台東縣','澎湖縣','金門縣','連江縣',
  'Keelung','Taipei','New Taipei','Taoyuan','Hsinchu','Miaoli','Taichung','Changhua',
  'Nantou','Yunlin','Chiayi','Tainan','Kaohsiung','Pingtung','Yilan','Hualien','Taitung',
  'Penghu','Kinmen','Lienchiang'
];
const GEOLOCATION_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 12000,
  maximumAge: 60000,
};

let _pinLat = null;
let _pinLng = null;
let _pinAddress = '';
let _pinSource = '';
let _pinAccuracy = null;
let _pinConfirmed = false;
let _mapInstance = null;
let _pinMarker = null;
let _storeMarker = null;

function calcDistKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2
          + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

async function nominatimReverse(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=zh-TW`;
  const res = await fetch(url, { headers: { 'Accept-Language': 'zh-TW,zh;q=0.9' } });
  if (!res.ok) throw new Error('Reverse geocode error');
  return await res.json();
}

function normalizeRegionText(text) {
  return String(text || '').replace(/臺/g, '台');
}

function isAddressAllowed(text) {
  const normalized = normalizeRegionText(text);
  return ALLOWED_REGIONS.some(r => normalized.includes(normalizeRegionText(r)));
}

function getTaiwanRegionMention(text) {
  const normalized = normalizeRegionText(text);
  const hit = TAIWAN_REGION_NAMES.find(r => normalized.includes(normalizeRegionText(r)));
  return hit || '';
}

function isKnownTaiwanRegionTooFar(text) {
  const region = getTaiwanRegionMention(text);
  return !!region && !isAddressAllowed(region);
}

function formatCoords(lat, lng) {
  return `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`;
}

function shortAddress(address) {
  return String(address || '').split(',').slice(0, 4).join('').trim();
}

function setDeliveryDisplay(text) {
  const addrEl = document.getElementById('order-delivery');
  if (addrEl) addrEl.value = text || '';
  const errEl = document.getElementById('modal-delivery-err');
  if (errEl) errEl.style.display = 'none';
}

function resetDeliveryCoords(options = {}) {
  _pinLat = null;
  _pinLng = null;
  _pinAddress = '';
  _pinSource = '';
  _pinAccuracy = null;
  _pinConfirmed = false;
  if (options.clearDisplay) setDeliveryDisplay('');
  const mapBtn = document.getElementById('map-confirm-btn');
  if (mapBtn) mapBtn.disabled = true;
}

function commitDeliveryCoords(lat, lng, options = {}) {
  _pinLat = Number(lat);
  _pinLng = Number(lng);
  _pinAddress = options.address || formatCoords(_pinLat, _pinLng);
  _pinSource = options.source || 'current';
  _pinAccuracy = Number.isFinite(options.accuracy) ? Number(options.accuracy) : null;
  _pinConfirmed = options.confirmed !== false;

  if (options.updateInput !== false) {
    setDeliveryDisplay(shortAddress(_pinAddress) || formatCoords(_pinLat, _pinLng));
  }

  const distKm = calcDistKm(STORE.lat, STORE.lng, _pinLat, _pinLng);
  updateDeliveryHintWithDist(distKm);
  return distKm;
}

function getCurrentPositionAsync() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('unsupported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, GEOLOCATION_OPTIONS);
  });
}

function getLocationErrorMessage(err) {
  if (err?.message === 'unsupported') {
    return '此瀏覽器不支援定位，請改用「地圖選點」。';
  }
  if (err?.code === 1) {
    return '定位權限被拒絕，請允許瀏覽器定位，或改用「地圖選點」。';
  }
  if (err?.code === 2) {
    return '目前無法取得定位訊號，請移到訊號較好的地方再試，或改用「地圖選點」。';
  }
  if (err?.code === 3) {
    return '定位逾時，請再試一次，或改用「地圖選點」。';
  }
  return '取得目前座標失敗，請再試一次或改用「地圖選點」。';
}

function showTooFarStatus(region) {
  const label = region ? `（${region}）` : '';
  setGeoStatus(`距離過遠${label}，目前僅配送苗栗縣與台中市`, 'err');
  updateDeliveryHintWithDist(Number.POSITIVE_INFINITY);
}

function setGeoStatus(msg, type) {
  const el = document.getElementById('geo-status');
  if (!el) return;
  el.textContent = msg;
  el.className = `geo-status ${type}`;
}
function clearGeoStatus() {
  const el = document.getElementById('geo-status');
  if (el) el.className = 'geo-status';
}

function updateDeliveryHintWithDist(distKm) {
  const total   = getTotal();
  const tier    = Math.max(1, Math.floor(total / 1000));
  const maxKm   = tier * 3;
  const days    = tier;
  const hintEl  = document.getElementById('delivery-range-hint');
  if (!hintEl) return;
  hintEl.style.display = '';

  if (total < 1000) {
    hintEl.innerHTML = `${t('deliveryRule')}<br>
      <span style="opacity:.8">${t('deliveryRuleNote')}</span><br>
      <b style="color:var(--primary)">⚠ ${t('minOrder')}</b>`;
    return;
  }

  if (distKm === Number.POSITIVE_INFINITY) {
    hintEl.innerHTML = `${t('deliveryRule')}<br>
      <span style="opacity:.8">${t('deliveryRuleNote')}</span><br>
      <b style="color:var(--red)">⚠ 距離過遠，目前僅配送苗栗縣與台中市</b>`;
    return;
  }

  const distStr = distKm !== null ? `（距離店家 ${distKm.toFixed(1)} km）` : '';
  const canDeliver = distKm === null || distKm <= maxKm;
  hintEl.innerHTML = `${t('deliveryRule')}<br>
    <span style="opacity:.8">${t('deliveryRuleNote')}</span><br>
    <b style="color:${canDeliver?'var(--green)':'var(--red)'}">
      ${canDeliver
        ? t('deliveryYours').replace('%t',total).replace('%k',maxKm).replace('%d',days) + distStr
        : `⚠ 距離 ${distKm?.toFixed(1)} km 超出本訂單可配送範圍（${maxKm} km）`}
    </b>`;
}

async function getCurrentLocation() {
  const btn = document.getElementById('geo-btn');
  const originalText = btn?.textContent || t('btnCurrentLocation');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '定位中…';
  }
  setGeoStatus('正在取得目前座標，請允許瀏覽器定位…', 'loading');

  try {
    const pos = await getCurrentPositionAsync();
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    const accuracy = pos.coords.accuracy;
    let displayName = '';
    let reverseFailed = false;

    try {
      setGeoStatus('已取得座標，正在確認地址與配送範圍…', 'loading');
      const rev = await nominatimReverse(lat, lng);
      displayName = rev?.display_name || '';
    } catch(e) {
      reverseFailed = true;
    }

    if (displayName && !isAddressAllowed(displayName)) {
      resetDeliveryCoords({ clearDisplay: true });
      showTooFarStatus(getTaiwanRegionMention(displayName));
      return;
    }

    const distKm = commitDeliveryCoords(lat, lng, {
      address: displayName || formatCoords(lat, lng),
      source: 'current',
      accuracy,
    });
    const accuracyText = Number.isFinite(accuracy) ? `，誤差約 ${Math.round(accuracy)} m` : '';
    const locationText = shortAddress(displayName) || formatCoords(lat, lng);
    const reverseText = reverseFailed ? '\n地址反查暫時失敗，已改用座標保存。' : '';
    setGeoStatus(`✓ 已取得目前座標${accuracyText}
📍 ${locationText}
📏 距店家 ${distKm.toFixed(1)} km${reverseText}`, 'ok');

  } catch(e) {
    resetDeliveryCoords({ clearDisplay: true });
    setGeoStatus(getLocationErrorMessage(e), 'err');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }
}

// 保留舊名稱，避免舊版 onclick 或快取頁面呼叫時失效。
function geocodeAddress() {
  return getCurrentLocation();
}

function openMapPicker() {
  const overlay = document.getElementById('map-overlay');
  if (!overlay) return;
  if (!window.L) {
    setGeoStatus('地圖元件尚未載入，請稍後再試。', 'err');
    return;
  }
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';

  setTimeout(() => {
    if (!_mapInstance) {
      _mapInstance = L.map('map-container').setView([STORE.lat, STORE.lng], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(_mapInstance);

      const storeIcon = L.divIcon({
        html: '<div style="background:#C94E6E;width:14px;height:14px;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4)"></div>',
        iconSize: [14,14], iconAnchor: [7,7],
      });
      _storeMarker = L.marker([STORE.lat, STORE.lng], { icon: storeIcon })
        .addTo(_mapInstance)
        .bindPopup(`🏪 ${STORE.name}`);

      _mapInstance.on('click', async (e) => {
        const { lat, lng } = e.latlng;
        await placePinAt(lat, lng);
      });
    } else {
      _mapInstance.invalidateSize();
    }
    const mapInfo = document.getElementById('map-info');
    if (mapInfo) {
      mapInfo.innerHTML = '可點選地圖修正送貨位置<br>若瀏覽器定位不準，請用 PIN 選擇實際位置';
    }
    if (_pinLat && _pinMarker) {
      _mapInstance.setView([_pinLat, _pinLng], 14);
    } else if (Number.isFinite(_pinLat) && Number.isFinite(_pinLng)) {
      _mapInstance.setView([_pinLat, _pinLng], 14);
    }
  }, 100);
}

async function placePinAt(lat, lng) {
  if (_pinMarker) { _mapInstance.removeLayer(_pinMarker); _pinMarker = null; }

  const pinIcon = L.divIcon({
    html: '<div style="background:#E8892B;width:16px;height:16px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.4)"></div>',
    iconSize: [16,16], iconAnchor: [8,16],
  });
  _pinMarker = L.marker([lat, lng], { icon: pinIcon }).addTo(_mapInstance);

  const mapInfo = document.getElementById('map-info');
  if (mapInfo) mapInfo.textContent = '正在確認座標…';

  const distKm = calcDistKm(STORE.lat, STORE.lng, lat, lng);

  try {
    const rev = await nominatimReverse(lat, lng);
    const displayName = rev?.display_name || '';

    if (displayName && !isAddressAllowed(displayName)) {
      const region = getTaiwanRegionMention(displayName);
      if (mapInfo) mapInfo.innerHTML = `⚠ 距離過遠${region ? `（${region}）` : ''}，目前僅配送苗栗縣與台中市<br>${displayName}<br>📏 距店家 <b>${distKm.toFixed(1)} km</b>`;
      _pinMarker.bindPopup(`⚠ 距離過遠<br>📏 ${distKm.toFixed(1)} km`).openPopup();
      const btn = document.getElementById('map-confirm-btn');
      if (btn) btn.disabled = true;
      resetDeliveryCoords({ clearDisplay: true });
      updateDeliveryHintWithDist(Number.POSITIVE_INFINITY);
      return;
    }

    _pinLat = Number(lat); _pinLng = Number(lng);
    _pinAddress = displayName || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    _pinSource = 'pin';
    _pinAccuracy = null;
    _pinConfirmed = false;

    const shortAddr = shortAddress(displayName) || _pinAddress;
    if (mapInfo) mapInfo.innerHTML = `📍 ${shortAddr}<br>📏 距店家 <b>${distKm.toFixed(1)} km</b>`;
    _pinMarker.bindPopup(`📍 ${shortAddr}<br>📏 ${distKm.toFixed(1)} km`).openPopup();

    const btn = document.getElementById('map-confirm-btn');
    if (btn) btn.disabled = false;
  } catch(e) {
    _pinLat = Number(lat); _pinLng = Number(lng);
    _pinAddress = formatCoords(lat, lng);
    _pinSource = 'pin';
    _pinAccuracy = null;
    _pinConfirmed = false;
    if (mapInfo) mapInfo.textContent = `📍 ${_pinAddress}，距店家 ${distKm.toFixed(1)} km`;
    const btn = document.getElementById('map-confirm-btn');
    if (btn) btn.disabled = false;
  }
}

function confirmMapPin() {
  if (!Number.isFinite(_pinLat) || !Number.isFinite(_pinLng)) return;

  _pinConfirmed = true;
  setDeliveryDisplay(shortAddress(_pinAddress) || formatCoords(_pinLat, _pinLng));

  const distKm = calcDistKm(STORE.lat, STORE.lng, _pinLat, _pinLng);
  setGeoStatus(`✓ PIN 座標已確認
📏 距店家 ${distKm.toFixed(1)} km`, 'ok');
  updateDeliveryHintWithDist(distKm);
  closeMapPicker();
}

function closeMapPicker() {
  const overlay = document.getElementById('map-overlay');
  if (overlay) overlay.classList.remove('open');
  document.body.style.overflow = '';
}

function getDeliveryCoords() {
  return (_pinConfirmed && Number.isFinite(_pinLat) && Number.isFinite(_pinLng)) ? {
    lat: Number(_pinLat.toFixed(6)),
    lng: Number(_pinLng.toFixed(6)),
    address: _pinAddress,
    source: _pinSource || 'current',
    accuracy: Number.isFinite(_pinAccuracy) ? Math.round(_pinAccuracy) : null,
  } : null;
}
Object.assign(window, {
  switchCat, addToCart, changeQty, removeFromCart, clearCart,
  openDrawer, closeDrawer, handleDrawerOutsideClick,
  openOrderModal, closeModal, handleModalOutsideClick,
  submitOrder, closeSuccess,
  showAuthModal, lookupMember, registerMember, continueAsGuest, logout,
  openMemberDrawer, closeMemberDrawer, handleMemberOutsideClick,
  pwaInstall, pwaDismiss,
  setLang, onNatChange,
  openEditProfile, saveEditProfile,
  getCurrentLocation, geocodeAddress, openMapPicker, closeMapPicker, confirmMapPin,
  lsExpand, updatePageTitle,
});

document.addEventListener('DOMContentLoaded', init);
document.addEventListener('input', (e) => {
  if (e.target && e.target.id === 'order-delivery' && !e.target.readOnly) {
    resetDeliveryCoords();
    clearGeoStatus();
  }
});

Object.assign(window, { h, safeGetLS, safeSetLS, fmtDate, setText, setFbIndicator, syncProducts, normPhone, createMember, lookupMemberById, fetchMemberOrders, writeOrderToFirebase, showAuthModal, hideAuthModal, lookupMember, showLookupResult, registerMember, continueAsGuest, setMember, logout, updateAuthUI, openMemberDrawer, closeMemberDrawer, handleMemberOutsideClick, renderMemberDrawer, t, setLang, detectLang, applyLang, buildLangSwitcher, lsExpand, buildNatOptions, loadAllProducts, renderTabs, getCatIcon, renderProducts, addToCart, changeQty, removeFromCart, clearCart, getTotal, getTotalQty, buildCartHTML, updateAllCartUI, openDrawer, closeDrawer, handleDrawerOutsideClick, openModal, closeModal, handleModalOutsideClick, openOrderModal, submitOrder, onNatChange, openEditProfile, saveEditProfile, updatePageTitle, switchCat, closeSuccess, showToast, init, syncProductsBackground, initPWA, showUpdateBar, applySwUpdate, pwaInstall, pwaDismiss, calcDistKm, nominatimReverse, normalizeRegionText, isAddressAllowed, getTaiwanRegionMention, isKnownTaiwanRegionTooFar, formatCoords, shortAddress, setDeliveryDisplay, resetDeliveryCoords, commitDeliveryCoords, getCurrentPositionAsync, getLocationErrorMessage, showTooFarStatus, setGeoStatus, clearGeoStatus, updateDeliveryHintWithDist, getCurrentLocation, geocodeAddress, openMapPicker, placePinAt, confirmMapPin, closeMapPicker, getDeliveryCoords });

