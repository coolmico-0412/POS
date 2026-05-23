// ????ZXing 頛 ????(function(){
  const s=document.createElement('script');
  s.src='https://unpkg.com/@zxing/library@0.20.0/umd/index.min.js';
  s.onerror=()=>{
    const s2=document.createElement('script');
    s2.src='https://cdn.jsdelivr.net/npm/@zxing/library@0.19.2/umd/index.min.js';
    document.head.appendChild(s2);
  };
  document.head.appendChild(s);
})();

// ??????摰儔嚗陸?? 銝剜?敺?????const CATEGORIES = [
  {id:'frozen',   icon:'??', th:'鉊冢葡鉊徇葡鉊??鉊?鉆?鉆?',           zh:'?瑕?憌?'},
  {id:'seasoning',icon:'?', th:'鉆鉊腦鉊獅?鉊冢?鉊腦鉊詮?',             zh:'隤踹??},
  {id:'drink',    icon:'?奶', th:'鉆鉊腦鉊獅?鉊冢?鉊虞鉆腹',             zh:'憌脫?'},
  {id:'rice',     icon:'?', th:'鉊?鉊耜葷',                   zh:'蝐?},
  {id:'alcohol',  icon:'?', th:'鉆鉊腦鉊獅?鉊冢?鉊虞鉆腹鉆葉鉊丞?鉊冢葬鉊冢艇鉆?,   zh:'??},
  {id:'hygiene',  icon:'?妥', th:'鉊葉鉊?鉊?鉊芹?鉊抉?鉊萵鉊?,           zh:'皜?靽???},
  {id:'food',     icon:'??', th:'鉊冢葡鉊徇葡鉊?,                  zh:'憌?'},
  {id:'other',    icon:'?', th:'鉊冢虞鉆?鉆?,                  zh:'?嗡?'},
];
function getCatLabel(catId){
  const c=CATEGORIES.find(x=>x.id===catId);
  return c ? c.th+' '+c.zh : '';
}
function getCatIcon(catId){
  const c=CATEGORIES.find(x=>x.id===catId);
  return c ? c.icon : '?';
}
function buildCatOptions(selectId, selectedId){
  const sel=document.getElementById(selectId); if(!sel)return;
  sel.innerHTML=CATEGORIES.map(c=>
    `<option value="${c.id}" ${c.id===selectedId?'selected':''}>${c.icon} ${c.th} ${c.zh}</option>`
  ).join('');
}

// ????鞈?撅?????const DEFAULT_PRODUCTS = {
  '4710088001001':{name:'蝯曹?暻仿?憟嗉',price:25,category:'drink'},
  '4710088001002':{name:'??擙桐像',price:65,category:'drink'},
  '4714771060000':{name:'?箸隞?',price:35,category:'food'},
  '4719854210008':{name:'蝢拍?撠部??,price:39,category:'food'},
  '4710085081026':{name:'蝯曹?撣?',price:15,category:'food'},
  '4710438001234':{name:'敺∟????,price:25,category:'drink'},
  '4901340000003':{name:'Pocky撌批???,price:45,category:'food'},
  '4710088002003':{name:'蝯曹?蝵??',price:30,category:'drink'},
  '4712345678900':{name:'颲脣井撅望?蝷行?瘞?,price:15,category:'drink'},
  '4711234000001':{name:'撠??唳?瘛?,price:25,category:'frozen'},
};
const PROD_ORDER_KEY='pos_product_order';

// ????????File System Access API + IndexedDB嚗???
let _fileHandle=null, _saveTimer=null;
const IDB_NAME='pos_fsa', IDB_STORE='handles', IDB_KEY='dataFile';

function _openIDB(){
  return new Promise((res,rej)=>{
    const req=indexedDB.open(IDB_NAME,1);
    req.onupgradeneeded=e=>e.target.result.createObjectStore(IDB_STORE);
    req.onsuccess=e=>res(e.target.result);
    req.onerror=e=>rej(e.target.error);
  });
}
async function _getSavedHandle(){
  try{const db=await _openIDB();return new Promise((res,rej)=>{const tx=db.transaction(IDB_STORE,'readonly');const req=tx.objectStore(IDB_STORE).get(IDB_KEY);req.onsuccess=e=>res(e.target.result||null);req.onerror=e=>rej(e.target.error);});}catch(e){return null;}
}
async function _saveHandle(handle){
  try{const db=await _openIDB();return new Promise((res,rej)=>{const tx=db.transaction(IDB_STORE,'readwrite');tx.objectStore(IDB_STORE).put(handle,IDB_KEY);tx.oncomplete=res;tx.onerror=rej;});}catch(e){}
}
async function _readFile(handle){const file=await handle.getFile();const text=await file.text();return JSON.parse(text);}
async function _writeFile(handle,data){const writable=await handle.createWritable();await writable.write(JSON.stringify(data,null,2));await writable.close();}
async function _loadFromFile(){
  if(!_fileHandle)return;
  try{
    const data=await _readFile(_fileHandle);
    if(data.products)     localStorage.setItem('pos_products',      JSON.stringify(data.products));
    if(data.product_order)localStorage.setItem(PROD_ORDER_KEY,       JSON.stringify(Array.isArray(data.product_order)?data.product_order:Object.values(data.product_order)));
    if(data.nobc_products)localStorage.setItem('pos_nobc_products', JSON.stringify(data.nobc_products));
    if(data.transactions) localStorage.setItem('pos_transactions',  JSON.stringify(data.transactions));
  }catch(e){setFileStatus('error','??霈?仃??);}
}
function _scheduleSave(){
  clearTimeout(_saveTimer);
  _saveTimer=setTimeout(async()=>{
    if(!_fileHandle)return;
    setFileStatus('saving','???脣?銝?..');
    try{
      await _writeFile(_fileHandle,{version:1,savedAt:new Date().toISOString(),products:getProds(),product_order:getProdOrder(getProds()),nobc_products:getNobcProds(),transactions:getTx()});
      setFileStatus('linked','??撌脣摮?);
      setTimeout(()=>setFileStatus('linked','??'+(_fileHandle.name||'鞈?瑼?')),1500);
    }catch(e){setFileStatus('error','???脣?憭望?嚗???豢?');}
  },800);
}

function setFileStatus(cls,label){
  const el=document.getElementById('file-status-prod');
  const lb=document.getElementById('file-label-prod');
  if(!el||!lb)return;
  el.classList.remove('linked','saving','error');
  if(cls)el.classList.add(cls);
  lb.textContent=label;
}

async function initPersistence(){
  if(!('showOpenFilePicker' in window)){
    const el=document.getElementById('file-label-prod');
    if(el)el.textContent='localStorage 璅∪?';
    return;
  }
  // ?岫?Ｗ儔銝活??獢?handle
  const saved=await _getSavedHandle();
  if(saved){
    _fileHandle=saved;
    try{
      let perm=await _fileHandle.queryPermission({mode:'readwrite'});
      if(perm==='granted'){
        await _loadFromFile();
        setFileStatus('linked','??'+(_fileHandle.name||'pos_data.json'));
        return;
      }
      if(perm==='prompt'){
        // ?閬蝙?刻??Ｘ???requestPermission嚗?暺?????
        setFileStatus('','?? 暺????摮?');
        return;
      }
    }catch(e){}
  }
  // 瘝?撌脣摮? handle ???芸??岫撱箇? pos_data.json
  // 瘜冽?嚗howSaveFilePicker ?閬蝙?刻??ｇ??ㄐ?芾蝑???  setFileStatus('','? 暺??豢?鞈?瑼?');
}

async function pickDataFile(){
  if(!('showOpenFilePicker' in window)){showToast('甇斤汗?其??舀?芸??脣?嚗?雿輻 Chrome ??Edge','err');return;}
  // ?亙歇??handle 銝????
  if(_fileHandle){
    try{
      const perm=await _fileHandle.requestPermission({mode:'readwrite'});
      if(perm==='granted'){
        await _loadFromFile();
        setFileStatus('linked','??'+(_fileHandle.name||'pos_data.json'));
        showToast('撌脤??圈??嚗?+_fileHandle.name,'ok');
        renderProdGrid();renderStats();renderMonthly();renderWeekly();renderDaily();
        return;
      }
    }catch(e){}
  }
  // ?湔??瑼??豢??剁??豢??暹?瑼? ??撱箇??唳?獢?
  // 雿輻 showOpenFilePicker嚗?雿輻?銵???交撱箇??唳????摮?楝敺?  try{
    // ??雿輻??????撱箇??唳?嚗 showSaveFilePicker ?臬????拐辣鈭?    _fileHandle=await window.showSaveFilePicker({
      suggestedName:'pos_data.json',
      types:[{description:'POS 鞈?瑼?',accept:{'application/json':['.json']}}]
    });
    await _saveHandle(_fileHandle);
    // ?岫霈??摰對?雿輻?鈭歇摮??json嚗?    try{
      const existing=await _readFile(_fileHandle);
      if(existing && (existing.products||existing.transactions)){
        if(existing.products)     localStorage.setItem('pos_products',      JSON.stringify(existing.products));
        if(existing.product_order)localStorage.setItem(PROD_ORDER_KEY,       JSON.stringify(Array.isArray(existing.product_order)?existing.product_order:Object.values(existing.product_order)));
        if(existing.nobc_products)localStorage.setItem('pos_nobc_products', JSON.stringify(existing.nobc_products));
        if(existing.transactions) localStorage.setItem('pos_transactions',  JSON.stringify(existing.transactions));
        setFileStatus('linked','??'+_fileHandle.name);
        showToast('撌脰??亦????'+_fileHandle.name,'ok');
      }else{
        throw new Error('empty');
      }
    }catch(readErr){
      // 瑼??舐征???啣遣??撖怠?桀?鞈?
      await _writeFile(_fileHandle,{version:1,savedAt:new Date().toISOString(),products:getProds(),product_order:getProdOrder(getProds()),nobc_products:getNobcProds(),transactions:getTx()});
      setFileStatus('linked','??'+_fileHandle.name);
      showToast('撌脣遣蝡???獢?'+_fileHandle.name,'ok');
    }
    renderProdGrid();renderStats();renderMonthly();renderWeekly();renderDaily();
  }catch(e){
    if(e.name!=='AbortError') showToast('????','err');
  }
}

// ????鞈?撅?????function getProds(){try{const s=localStorage.getItem('pos_products');if(s)return JSON.parse(s);}catch(e){}localStorage.setItem('pos_products',JSON.stringify(DEFAULT_PRODUCTS));return{...DEFAULT_PRODUCTS};}
function getRawProdOrder(){try{const a=JSON.parse(localStorage.getItem(PROD_ORDER_KEY)||'[]');return Array.isArray(a)?a.map(String):[];}catch(e){return[];}}
function getProdOrder(prods=getProds()){
  const keys=Object.keys(prods);
  const raw=getRawProdOrder();
  const seen=new Set(), order=[];
  raw.forEach(bc=>{if(Object.prototype.hasOwnProperty.call(prods,bc)&&!seen.has(bc)){seen.add(bc);order.push(bc);}});
  keys.forEach(bc=>{if(!seen.has(bc)){seen.add(bc);order.push(bc);}});
  if(order.length!==raw.length||order.length!==keys.length||order.some((bc,i)=>bc!==raw[i]))localStorage.setItem(PROD_ORDER_KEY,JSON.stringify(order));
  return order;
}
function saveProdOrder(order){localStorage.setItem(PROD_ORDER_KEY,JSON.stringify(order));_scheduleSave();}
function saveProds(o){localStorage.setItem('pos_products',JSON.stringify(o));getProdOrder(o);_scheduleSave();}
function getNobcProds(){try{return JSON.parse(localStorage.getItem('pos_nobc_products')||'[]');}catch(e){return[];}}
function saveNobcProds(a){localStorage.setItem('pos_nobc_products',JSON.stringify(a));_scheduleSave();}
function getTx(){try{return JSON.parse(localStorage.getItem('pos_transactions')||'[]');}catch(e){return[];}}
function saveTx(a){localStorage.setItem('pos_transactions',JSON.stringify(a));_scheduleSave();}

// ?????典????????let cart=[], scanning=false, codeReader=null;
let pendingBC=null, editingBC=null;
let lastCode='', lastCodeTime=0;
const DEBOUNCE=1000; // 1蝘??璇Ⅳ?芣??甈?let allowNewBc=false;
let nobcSelectedCat=null; // null=???豢??? 'frozen'蝑???皜??
// ????璇Ⅳ撽?嚗?游?蝔桀虜?冽撘?????// ?舀嚗AN-13, EAN-8, UPC-A, UPC-E, Code 39, Code 128, ITF, Codabar, QR Code 蝑?function isValidBarcode(code){
  code=(code||'').trim();
  if(code.length<3||code.length>80)return false;
  // ?迂?望摮征?賢?璇Ⅳ撣貊?寞?摮?嚗? . / + % $ * 蝛箸嚗?  return /^[A-Za-z0-9\-\.\/\+\%\$\* ]+$/.test(code);
}
// ???詨捆嚗??澆暺??isValidBarcode嚗?const isEAN13 = isValidBarcode;

function h(value){
  return String(value ?? '').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function jsArg(value){
  return h(JSON.stringify(String(value ?? '')));
}

// EAN-13 checksum 瑼Ｘ嚗??冽?啣???甈???憭?蝷綽??撥?塚?
function checkEAN13(code){
  if(!/^\d{13}$/.test(code))return false;
  let sum=0;
  for(let i=0;i<12;i++)sum+=parseInt(code[i])*(i%2===0?1:3);
  return (10-(sum%10))%10===parseInt(code[12]);
}

// ????????????async function startScanner(){
  try{
    const constraints={video:{facingMode:{ideal:'environment'},width:{ideal:1920,min:1280},height:{ideal:1080,min:720},focusMode:'continuous',advanced:[{focusMode:'continuous'}]}};
    let stream;
    try{stream=await navigator.mediaDevices.getUserMedia(constraints);}
    catch(e){stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}}});}
    const v=document.getElementById('preview');
    v.srcObject=stream; v.style.display='block';
    document.getElementById('cam-ph').style.display='none';
    document.getElementById('scan-ol').style.display='block';
    await new Promise((res,rej)=>{v.onloadedmetadata=()=>v.play().then(res).catch(rej);v.onerror=rej;setTimeout(rej,7000);});
    try{const track=stream.getVideoTracks()[0];const caps=track.getCapabilities&&track.getCapabilities();if(caps&&caps.focusMode&&caps.focusMode.includes('continuous')){await track.applyConstraints({advanced:[{focusMode:'continuous'}]});}}catch(e){}
    document.getElementById('btn-start').disabled=true;
    document.getElementById('btn-stop').disabled=false;
    scanning=true;
    startDecodeLoop(v);
  }catch(e){
    setSt('鉆腹鉆葵鉊耜腹鉊耜腦鉊?鉊?鉊耜?鉊嗣?鉊艇鉆葉鉊? '+(e.message||'鉊腦鉊詮?鉊耜葉鉊虜鉊葡鉊葵鉊毯?鉊葩鉆?鉊丞?鉊冢?'),'err');
    showToast('鉊艇鉆葉鉊?鉊﹤?鉊芹葡鉊﹤葡鉊??鉆鉊?葩鉆腹鉆?鉆?,'err');
  }
}

function startDecodeLoop(v){
  if('BarcodeDetector' in window){useNative(v);}
  else if(typeof ZXing!=='undefined'){useZXing(v);}
  else{
    let r=0;
    const t=setInterval(()=>{r++;if(typeof ZXing!=='undefined'){clearInterval(t);useZXing(v);}else if(r>25){clearInterval(t);setSt('鉆葦鉊丞?鉆艇鉊腦鉊耜腦鉊菽葵鉆?鉊?鉊﹤?鉊芹董鉆鉊??鉊?鉊腦鉊詮?鉊耜腦鉊菽?鉊腦鉊葦鉊?鉊?,'err');}},300);
  }
}
async function useNative(v){
  const BC_FORMATS=['ean_13','ean_8','upc_a','upc_e','code_39','code_128','itf','codabar','data_matrix','qr_code','pdf417','aztec'];
  let det;try{det=new BarcodeDetector({formats:BC_FORMATS});}catch(e){try{det=new BarcodeDetector({formats:['ean_13','ean_8','upc_a','code_128','code_39']});}catch(e2){det=new BarcodeDetector();}}
  const loop=async()=>{if(!scanning)return;try{if(v.readyState>=2){const bs=await det.detect(v);if(bs.length)onCode(bs[0].rawValue);}}catch(e){}if(scanning)setTimeout(loop,80);};loop();
}
function useZXing(v){
  try{codeReader=new ZXing.BrowserMultiFormatReader();codeReader.decodeFromVideoElement(v,(r)=>{if(scanning&&r)onCode(r.getText());});}
  catch(e){useZXingCanvas(v);}
}
function useZXingCanvas(v){
  const c=document.createElement('canvas');const ctx=c.getContext('2d');const reader=new ZXing.BrowserMultiFormatReader();
  const loop=async()=>{if(!scanning)return;try{if(v.readyState>=2&&v.videoWidth>0){c.width=v.videoWidth;c.height=v.videoHeight;ctx.drawImage(v,0,0);const r=await reader.decodeFromCanvas(c);if(r)onCode(r.getText());}}catch(e){}if(scanning)setTimeout(loop,250);};loop();
}
function onCode(raw){
  const code=(raw||'').trim();
  if(!isValidBarcode(code))return;
  const now=Date.now();
  if(code===lastCode&&now-lastCodeTime<DEBOUNCE)return;
  lastCode=code;lastCodeTime=now;
  addByBarcode(code);
}
function stopScanner(){
  scanning=false;
  const v=document.getElementById('preview');
  if(v.srcObject){v.srcObject.getTracks().forEach(t=>t.stop());v.srcObject=null;}
  v.style.display='none';
  document.getElementById('cam-ph').style.display='flex';
  document.getElementById('scan-ol').style.display='none';
  document.getElementById('btn-start').disabled=false;
  document.getElementById('btn-stop').disabled=true;
  if(codeReader){try{codeReader.reset();}catch(e){}codeReader=null;}
  lastCode='';setSt('鉊徇腺鉊詮?鉊芹?鉊?鉆艇鉆葷');
}

// ???????交 ????function addByBarcode(code){
  const prods=getProds();
  if(!prods[code]){
    if(allowNewBc){
      pendingBC=code;
      document.getElementById('np-bc').textContent='璇Ⅳ嚗?+code;
      document.getElementById('np-name').value='';
      document.getElementById('np-price').value='';
      buildCatOptions('np-cat','other');
      openModal('m-newprod');
      setSt('??鉆腹鉆?鉊葵鉊毯?鉊?鉊? '+code+' ??鉊腦鉊詮?鉊耜?鉊葩鉆腹鉊?鉊冢腹鉊嫩艇','warn');
    }else{setSt('??鉆腹鉆?鉊葵鉊毯?鉊?鉊? '+code+' (鉊葩鉊?鉊耜腦鉆鉊葩鉆腹鉆葦鉊﹤?)','warn');}
    return;
  }
  const p=prods[code];
  addToCart(code,p.name,p.price);
  setSt('??鉆鉊葩鉆腹鉆艇鉆葷: '+p.name+' ??NT$ '+p.price,'ok');
  playBeep();
}

function saveNewProduct(){
  const name=document.getElementById('np-name').value.trim();
  const price=parseFloat(document.getElementById('np-price').value);
  const category=document.getElementById('np-cat').value||'other';
  if(!name){showToast('隢撓?亙???蝔?,'err');return;}
  if(isNaN(price)||price<0){showToast('隢撓?交迤蝣箏??,'err');return;}
  const prods=getProds();
  prods[pendingBC]={name,price,category};
  saveProds(prods);
  closeModal('m-newprod');
  addToCart(pendingBC,name,price);
  setSt('??鉊萵鉊?鉊嗣?鉆艇鉊啤?鉊葩鉆腹鉆艇鉆葷: '+name,'ok');
  playBeep();renderProdGrid();
  showToast('撌脫憓???'+name,'ok');
  pendingBC=null;
}

// ????鞈潛頠?????function setQty(bc,input){
  const val=parseInt(input.value);
  if(isNaN(val)||val<1){const item=cart.find(i=>i.barcode===bc);if(item)input.value=item.qty;return;}
  const item=cart.find(i=>i.barcode===bc);if(!item)return;
  item.qty=val;
  const sub=cart.reduce((s,i)=>s+i.price*i.qty,0);
  const totalQty=cart.reduce((s,i)=>s+i.qty,0);
  document.getElementById('item-count').textContent=totalQty;
  document.getElementById('grand-total').textContent='NT$ '+sub;
  document.getElementById('btn-checkout').disabled=cart.length===0;
}
function changeQty(bc,d){
  const item=cart.find(i=>i.barcode===bc);if(!item)return;
  item.qty=Math.max(1,item.qty+d);
  renderCart();
}
function editQty(bc){
  const item=cart.find(i=>i.barcode===bc); if(!item)return;
  openNumpad(bc, item.qty, item.name);
}

// ?? Custom Numpad ??
let _npBc=null, _npVal='';

function openNumpad(bc, currentQty, itemName){
  _npBc=bc;
  _npVal='0';
  document.getElementById('numpad-title').textContent=(itemName||'') + ' ???賊? / 鉊董鉊葷鉊?;
  document.getElementById('numpad-display').textContent='0';
  document.getElementById('numpad-overlay').classList.add('open');
}
function closeNumpad(){
  document.getElementById('numpad-overlay').classList.remove('open');
  _npBc=null; _npVal='';
}
function npKey(k){
  if(_npVal==='0') _npVal=k;
  else if(_npVal.length<4) _npVal+=k;
  document.getElementById('numpad-display').textContent=_npVal||'0';
}
function npDel(){
  _npVal=_npVal.slice(0,-1)||'0';
  document.getElementById('numpad-display').textContent=_npVal;
}
function npConfirm(){
  const val=parseInt(_npVal);
  if(!isNaN(val)&&val>=1&&_npBc){
    const item=cart.find(i=>i.barcode===_npBc);
    if(item){ item.qty=val; renderCart(); }
  }
  closeNumpad();
}
function addToCart(bc,name,price,qty=1){
  const ex=cart.find(i=>i.barcode===bc);
  if(ex){ex.qty+=qty;}else{cart.push({barcode:bc,name,price,qty,noBarcode:bc.startsWith('NOBC-')});}
  renderCart();
}
function removeItem(bc){cart=cart.filter(i=>i.barcode!==bc);renderCart();}
function clearCart(){cart=[];renderCart();}

function renderCart(){
  const body=document.getElementById('cart-body');
  if(!cart.length){
    body.innerHTML=`<div class="empty-st"><div class="ei">??</div><div>鉊芹?鉊?鉊葡鉊??鉆?鉆?鉆鉊虞鉆葉鉆鉊葩鉆腹鉊芹葩鉊?鉆葡</div><div class="zh">撠??嚗???璇Ⅳ?憓璇Ⅳ??</div></div>`;
    document.getElementById('item-count').textContent='0';
    document.getElementById('grand-total').textContent='NT$ 0';
    document.getElementById('btn-checkout').disabled=true;
    const bh=document.getElementById('btn-hold');if(bh)bh.disabled=true;
    return;
  }
  const totalQty=cart.reduce((s,i)=>s+i.qty,0);
  const sub=cart.reduce((s,i)=>s+i.price*i.qty,0);
  body.innerHTML=cart.map((item,idx)=>`
    <div class="t-row">
      <div class="t-num">${idx+1}</div>
      <div class="t-name">
        ${h(item.name)}
        ${item.noBarcode?'<span class="nobc-tag">?⊥?蝣?/span>':''}
      </div>
      <div class="t-price">NT$ ${item.price}</div>
      <div class="qty-ctrl" style="display:flex;align-items:center;gap:4px;">
        <button class="qty-btn" onclick="changeQty(${jsArg(item.barcode)},1)">嚗?/button>
        <span class="qty-display" onclick="editQty(${jsArg(item.barcode)})">${item.qty}</span>
        <button class="qty-btn" onclick="changeQty(${jsArg(item.barcode)},-1)">??/button>
      </div>
      <button class="del-btn" onclick="removeItem(${jsArg(item.barcode)})">?</button>
    </div>`).join('');
  document.getElementById('item-count').textContent=totalQty;
  document.getElementById('btn-checkout').disabled=false;
  document.getElementById('grand-total').textContent='NT$ '+sub;
  const bh=document.getElementById('btn-hold');if(bh)bh.disabled=false;
}

// ?????⊥?蝣澆????殷????豢? ????皜嚗???
function openNobcList(){
  nobcSelectedCat=null;
  const stickyHd=document.getElementById('nobc-sticky-header');
  if(stickyHd){stickyHd.style.display='none';stickyHd.innerHTML='';}
  renderNobcListModal();
  openModal('m-nobc-list');
}

function renderNobcListModal(){
  const body=document.getElementById('nobc-list-body');
  const stickyHd=document.getElementById('nobc-sticky-header');
  const titleEl=document.getElementById('nobc-modal-title');

  if(nobcSelectedCat===null){
    // 蝚砌??????”
    titleEl.innerHTML='鉊芹葩鉊?鉆葡鉆腹鉆腹鉊菽?鉊耜腦鉆?鉊?鉊?span class="zh">?⊥?蝣澆??????豢???</span>';
    stickyHd.style.display='none';
    stickyHd.innerHTML='';

    const prods=getNobcProds();
    const countMap={};
    prods.forEach(p=>{const c=p.category||'other';countMap[c]=(countMap[c]||0)+1;});
    const totalCount=prods.length;

    // ?券?? ???瑟?敶ｇ???憿??桃?見撘?    const allBtn=`<div class="nobc-cat-btn" style="background:var(--aglow);border-bottom:2px solid var(--border)" onclick="nobcSelectedCat='__all__';renderNobcListModal()">
      <div class="cat-icon">??</div>
      <div class="cat-zh" style="color:var(--accent)">鉊萵鉆?鉊徇腹鉊??券??</div>
      <div class="cat-count" style="background:var(--aglow);color:var(--accent);border:1px solid var(--accent)">${totalCount} 蝔?/div>
    </div>`;

    if(!totalCount){
      body.innerHTML=allBtn+`<div class="empty-st" style="padding:28px 20px"><div class="ei" style="font-size:26px">?</div><div class="zh">撠撌脣摮??⊥?蝣澆???/div><div style="font-size:12px;color:var(--muted);margin-top:6px;font-family:var(--zh)">隢??蝞∠??憓??蝙?具??????/div></div>`;
      return;
    }

    const catBtns=CATEGORIES.map(c=>{
      const cnt=countMap[c.id]||0;
      return`<div class="nobc-cat-btn${cnt===0?' empty':''}" onclick="nobcSelectedCat='${c.id}';renderNobcListModal()">
        <div class="cat-icon">${c.icon}</div>
        <div style="flex:1">
          <div class="cat-th">${c.th}</div>
          <div class="cat-zh">${c.zh}</div>
        </div>
        <div class="cat-count">${cnt} 蝔?/div>
      </div>`;
    }).join('');

    body.innerHTML=`<div class="nobc-cat-grid">${allBtn}${catBtns}</div>`;
  } else {
    // 蝚砌??????” ??餈??蔭?????脣?
    const prods=getNobcProds();
    let filtered, catLabel;
    if(nobcSelectedCat==='__all__'){
      filtered=prods.map((p,i)=>({...p,_idx:i}));
      catLabel='?? 鉊萵鉆?鉊徇腹鉊??券??';
    }else{
      filtered=prods.map((p,i)=>({...p,_idx:i})).filter(p=>(p.category||'other')===nobcSelectedCat);
      const cat=CATEGORIES.find(c=>c.id===nobcSelectedCat);
      catLabel=cat?cat.icon+' '+cat.th+' '+cat.zh:'??';
    }
    titleEl.innerHTML='鉊芹葩鉊?鉆葡鉆腹鉆腹鉊菽?鉊耜腦鉆?鉊?鉊?span class="zh">?⊥?蝣澆???/span>';

    // 餈??葡? sticky div嚗??典????
    stickyHd.style.display='block';
    stickyHd.innerHTML=`<div class="nobc-cat-header">
      <button class="nobc-cat-back" onclick="nobcSelectedCat=null;renderNobcListModal()">??鉊艇鉊晤? / 餈???</button>
      <div class="nobc-cat-title">${catLabel} <span style="font-family:var(--mono);font-size:11px;color:var(--muted)">(${filtered.length})</span></div>
    </div>`;

    if(!filtered.length){
      body.innerHTML=`<div class="empty-st" style="padding:32px 20px"><div class="ei" style="font-size:26px">?</div><div class="zh">甇文?憿??∪???/div></div>`;
      return;
    }
    body.innerHTML=`<div class="nobc-product-grid">${filtered.map(p=>`
      <button type="button" class="nobc-list-item" onclick="addNobcProdToCart(${p._idx})" title="?鞈潛頠?>
        <div class="nobc-list-name">${h(p.name)}</div>
        <div class="nobc-list-price">NT$ ${p.price}</div>
      </button>`).join('')}</div>`;
  }
}

function addNobcProdToCart(idx){
  const p=getNobcProds()[idx];if(!p)return;
  const bc='NOBC-'+Date.now()+'-'+idx;
  cart.push({barcode:bc,name:p.name,price:p.price,qty:1,noBarcode:true});
  renderCart();playBeep();
  setSt('??鉆鉊葩鉆腹鉆艇鉆葷: '+p.name+' ??NT$ '+p.price,'ok');
  showToast('撌脣??伐?'+p.name,'ok');
  closeModal('m-nobc-list');
}
function openTempNobc(){
  closeModal('m-nobc-list');
  document.getElementById('temp-price').value='';
  document.getElementById('temp-qty').value='1';
  openModal('m-temp-nobc');
}
function saveTempNobc(){
  const price=parseFloat(document.getElementById('temp-price').value);
  const qty=Math.max(1,parseInt(document.getElementById('temp-qty').value)||1);
  if(isNaN(price)||price<0){showToast('隢撓?交迤蝣粹?憿?,'err');return;}
  const bc='NOBC-'+Date.now();
  const name='?寞??? NT$'+price;
  cart.push({barcode:bc,name,price,qty,noBarcode:true});
  renderCart();playBeep();
  closeModal('m-temp-nobc');
  showToast('撌脣??交????NT$ '+price,'ok');
}

function savePermNobcProduct(){
  const name=document.getElementById('addnobc-name').value.trim();
  const price=parseFloat(document.getElementById('addnobc-price').value);
  const category=document.getElementById('addnobc-cat').value||'other';
  if(!name){showToast('隢撓?亙???蝔?,'err');return;}
  if(isNaN(price)||price<0){showToast('隢撓?交迤蝣箏??,'err');return;}
  const prods=getNobcProds();
  prods.push({id:'NB'+Date.now(),name,price,category});
  saveNobcProds(prods);
  closeModal('m-addnobc');
  renderProdGrid();
  showToast('撌脫憓璇Ⅳ??嚗?+name,'ok');
  document.getElementById('addnobc-name').value='';
  document.getElementById('addnobc-price').value='';
}
function editNobcProd(idx){
  const prods=getNobcProds();const p=prods[idx];if(!p)return;
  const newName=prompt('???迂嚗?,p.name);if(newName===null)return;
  const newPrice=parseFloat(prompt('?桀嚗T$嚗?',p.price));
  if(!newName.trim()||isNaN(newPrice)||newPrice<0){showToast('鞈??炊','err');return;}
  // ???函陛??prompt ?豢?
  const catIds=CATEGORIES.map(c=>c.id);
  const catLabels=CATEGORIES.map((c,i)=>`${i+1}. ${c.icon}${c.th} ${c.zh}`).join('\n');
  const curIdx=catIds.indexOf(p.category||'other');
  const catInput=prompt('?豢???嚗撓?交摮?嚗n'+catLabels,curIdx+1);
  const catNum=parseInt(catInput)-1;
  const newCat=(catNum>=0&&catNum<catIds.length)?catIds[catNum]:(p.category||'other');
  prods[idx]={...p,name:newName.trim(),price:newPrice,category:newCat};
  saveNobcProds(prods);renderProdGrid();
  showToast('撌脫?堆?'+newName,'ok');
}
function delNobcProd(idx){
  if(!confirm('蝣箏??芷甇斤璇Ⅳ??嚗?))return;
  const prods=getNobcProds();prods.splice(idx,1);
  saveNobcProds(prods);renderProdGrid();
  showToast('撌脣?斤璇Ⅳ??','ok');
}

function moveNobcProd(idx,dir){
  const prods=getNobcProds();
  if(!prods[idx])return;
  const inScope=p=>prodSelectedCat==='__all__'||prodSelectedCat===null||(p.category||'other')===prodSelectedCat;
  let target=-1;
  for(let i=idx+dir;i>=0&&i<prods.length;i+=dir){
    if(inScope(prods[i])){target=i;break;}
  }
  if(target<0)return;
  [prods[idx],prods[target]]=[prods[target],prods[idx]];
  saveNobcProds(prods);
  renderProdGrid();
  showToast('撌脰矽?游???摨?,'ok');
}

// ????蝯董瘚? ????function openReview(){
  if(!cart.length)return;
  let total=0;
  const tbody=document.getElementById('review-body');
  tbody.innerHTML=cart.map((item,i)=>{
    const sub=item.price*item.qty;total+=sub;
    return`<tr>
      <td class="num" style="color:var(--muted2)">${i+1}</td>
      <td>${h(item.name)}${item.noBarcode?'<span class="nobc-tag">?⊥?蝣?/span>':''}</td>
      <td class="num">NT$ ${item.price}</td>
      <td class="num">${item.qty}</td>
      <td class="sub">NT$ ${sub}</td>
    </tr>`;
  }).join('');
  document.getElementById('review-total-amt').textContent='NT$ '+total;
  const rh=document.getElementById('rv-change-hint');
  if(rh&&total>0){
    function chg(d){const pay=Math.ceil(total/d)*d;return{pay,c:pay-total};}
    function row(icon,d){return d.c===0?`${icon} NT$${d.pay} 鉊腦鉊?鉊冢?鉊?/ ?末 ?:`${icon} NT$${d.pay} ??鉊葉鉊?/ ?暸 NT$${d.c}`;}
    rh.style.display='block';
    rh.innerHTML=row('?',chg(1000))+'<br>'+row('?',chg(500))+'<br>'+row('??',chg(100));
  }else if(rh){rh.style.display='none';}
  document.getElementById('review-overlay').classList.add('open');
  // 隤?勗
  speak('鉊Ｒ葉鉊腦鉊抉腹 '+amountToThai(total));
}
function closeReview(){document.getElementById('review-overlay').classList.remove('open');}
function confirmCheckout(){
  closeReview();
  const sub=cart.reduce((s,i)=>s+i.price*i.qty,0);
  const now=new Date();
  const tx={
    id:'TX'+now.getTime().toString(36).toUpperCase(),
    date:now.toISOString(),
    source:'pos',
    items:JSON.parse(JSON.stringify(cart)),
    subtotal:sub,
    total:sub,
  };
  const txList=getTx();txList.push(tx);saveTx(txList);
  cart=[];renderCart();stopScanner();
  showToast('鉊董鉊?萼鉆鉊葩鉊?鉊?葭鉊Ｒ?鉊??鉊冢腺! / 蝯董摰? ??,'ok');
  setTimeout(()=>speak('鉊葉鉊?鉊詮?鉊葭鉆?鉊?鉊腦鉊毯?鉊耜腦鉊腦鉊晤?'),300);
}

// ?????唳?蝣潮???????function toggleNewBcMode(){
  allowNewBc=!allowNewBc;
  const btn=document.getElementById('toggle-new-bc');
  const knob=document.getElementById('toggle-knob');
  const lbl=document.getElementById('toggle-label');
  if(allowNewBc){btn.style.background='var(--green)';knob.style.left='21px';lbl.style.color='var(--green)';lbl.textContent='ON';}
  else{btn.style.background='var(--muted2)';knob.style.left='3px';lbl.style.color='var(--muted)';lbl.textContent='OFF';}
}

// ??????蝞∠? ????// ??????蝞∠??????????let prodSelectedCat = null; // null=??擐?, 'frozen'/...'__all__'=???”

function renderProdGrid(){
  const prods = getProds();
  const nobcProds = getNobcProds();
  const bcKeys = getProdOrder(prods);

  const mainArea = document.getElementById('prod-main-area');
  const stickyBar = document.getElementById('prod-cat-sticky');
  if(!mainArea) return;

  if(prodSelectedCat === null){
    // ?? 擐?嚗?憿?銵???
    stickyBar.style.display = 'none';
    stickyBar.innerHTML = '';

    // 撱箇???憿???    const nobcCountMap = {}, bcCountMap = {};
    nobcProds.forEach(p=>{ const c=p.category||'other'; nobcCountMap[c]=(nobcCountMap[c]||0)+1; });
    bcKeys.forEach(bc=>{ const c=prods[bc].category||'other'; bcCountMap[c]=(bcCountMap[c]||0)+1; });
    const totalNobc = nobcProds.length, totalBc = bcKeys.length;

    const allRow = `<div class="prod-cat-row all-row" onclick="prodSelectedCat='__all__';renderProdGrid()">
      <div class="pci">??</div>
      <div class="pct">
        <div class="pct-th">鉊萵鉆?鉊徇腹鉊?/div>
        <div class="pct-zh" style="color:var(--accent)">?券??</div>
      </div>
      <div class="pct-counts">
        <span class="pct-badge nobc${totalNobc===0?' zero':''}">?⊥?蝣?${totalNobc}</span>
        <span class="pct-badge bc${totalBc===0?' zero':''}">璇Ⅳ ${totalBc}</span>
      </div>
      <div class="pct-arrow">??/div>
    </div>`;

    const catRows = CATEGORIES.map(c=>{
      const nb = nobcCountMap[c.id]||0;
      const bc = bcCountMap[c.id]||0;
      const empty = nb===0 && bc===0;
      return `<div class="prod-cat-row${empty?' ':' '}" style="${empty?'opacity:.4;pointer-events:none':''}" onclick="prodSelectedCat='${c.id}';renderProdGrid()">
        <div class="pci">${c.icon}</div>
        <div class="pct">
          <div class="pct-th">${c.th}</div>
          <div class="pct-zh">${c.zh}</div>
        </div>
        <div class="pct-counts">
          <span class="pct-badge nobc${nb===0?' zero':''}">?⊥?蝣?${nb}</span>
          <span class="pct-badge bc${bc===0?' zero':''}">璇Ⅳ ${bc}</span>
        </div>
        <div class="pct-arrow">??/div>
      </div>`;
    }).join('');

    mainArea.innerHTML = `<div class="prod-cat-grid">${allRow}${catRows}</div>`;

  } else {
    // ?? ???”嚗????蕪嚗椰?⊥?蝣澆璇Ⅳ ??
    let filteredNobc, filteredBc, catLabel;
    if(prodSelectedCat === '__all__'){
      filteredNobc = nobcProds.map((p,i)=>({...p,_idx:i}));
      filteredBc = bcKeys.map(bc=>({bc,p:prods[bc]}));
      catLabel = '?? 鉊萵鉆?鉊徇腹鉊??券??';
    } else {
      filteredNobc = nobcProds.map((p,i)=>({...p,_idx:i})).filter(p=>(p.category||'other')===prodSelectedCat);
      filteredBc = bcKeys.filter(bc=>(prods[bc].category||'other')===prodSelectedCat).map(bc=>({bc,p:prods[bc]}));
      const cat = CATEGORIES.find(c=>c.id===prodSelectedCat);
      catLabel = cat ? cat.icon+' '+cat.th+' '+cat.zh : '';
    }

    // 蝵桅?餈???    stickyBar.style.display = 'block';
    stickyBar.innerHTML = `<div class="prod-back-bar">
      <button class="prod-back-btn" onclick="prodSelectedCat=null;renderProdGrid()">??鉊艇鉊晤? / 餈???</button>
      <div class="prod-detail-title">${catLabel}
        <span style="font-family:var(--mono);font-size:11px;color:var(--muted);font-weight:400;margin-left:6px">?⊥?蝣?${filteredNobc.length} / 璇Ⅳ ${filteredBc.length}</span>
      </div>
    </div>`;

    // ?⊥?蝣澆????    const nobcCards = filteredNobc.length
      ? filteredNobc.map((p,pos)=>{
          const isOos = p.outOfStock === true;
          return `<div class="prod-card" style="border-color:#e9d5ff${isOos?';opacity:.6;background:var(--surface2)':''}">
            <div class="prod-card-top">
              <div class="prod-bc" style="color:var(--purple)">?⊥?蝣?/div>
              ${isOos?`<span style="font-size:9px;background:var(--red);color:#fff;border-radius:4px;padding:1px 5px;font-weight:700">蝻箄疏</span>`:''}
            </div>
            <div class="prod-name">${h(p.name)}</div>
            <div class="prod-price">NT$ ${p.price}</div>
            <div class="prod-acts">
              <button class="btn btn-ghost" style="font-size:10px;padding:4px 7px;font-family:var(--zh);border-color:var(--purple);color:var(--purple)" onclick="editNobcProd(${p._idx})">??/button>
              <button class="btn btn-danger" style="font-size:10px;padding:4px 7px" onclick="delNobcProd(${p._idx})">??</button>
              <button class="btn btn-ghost" style="font-size:10px;padding:4px 7px;font-family:var(--zh);${isOos?'border-color:var(--green);color:var(--green)':'border-color:var(--red);color:var(--red)'}" onclick="toggleNobcOos(${p._idx})">${isOos?'??鞎?:'蝻箄疏'}</button>
              <div class="prod-order">
                <button class="prod-order-btn" title="銝宏" onclick="moveNobcProd(${p._idx},-1)" ${pos===0?'disabled':''}>??/button>
                <button class="prod-order-btn" title="銝宏" onclick="moveNobcProd(${p._idx},1)" ${pos===filteredNobc.length-1?'disabled':''}>??/button>
              </div>
            </div>
          </div>`;}).join('')
      : `<div class="empty-st" style="padding:28px 16px"><div class="ei" style="font-size:24px">?</div><div class="zh">甇文?憿?⊥?蝣澆???/div></div>`;

    // 璇Ⅳ???∠?
    const bcCards = filteredBc.length
      ? filteredBc.map(({bc,p},pos)=>{
          const isOos = p.outOfStock === true;
          return `<div class="prod-card"${isOos?' style="opacity:.6;background:var(--surface2)"':''}>
            <div class="prod-card-top">
              <div class="prod-bc">${h(bc)}</div>
              ${isOos?`<span style="font-size:9px;background:var(--red);color:#fff;border-radius:4px;padding:1px 5px;font-weight:700">蝻箄疏</span>`:''}
            </div>
            <div class="prod-name">${h(p.name)}</div>
            <div class="prod-price">NT$ ${p.price}</div>
            <div class="prod-acts">
              <button class="btn btn-ghost" style="font-size:10px;padding:4px 7px;font-family:var(--zh)" onclick="openEditProd(${jsArg(bc)})">??/button>
              <button class="btn btn-danger" style="font-size:10px;padding:4px 7px" onclick="delProduct(${jsArg(bc)})">??</button>
              <button class="btn btn-ghost" style="font-size:10px;padding:4px 7px;font-family:var(--zh);${isOos?'border-color:var(--green);color:var(--green)':'border-color:var(--red);color:var(--red)'}" onclick="toggleBcOos(${jsArg(bc)})">${isOos?'??鞎?:'蝻箄疏'}</button>
              <div class="prod-order">
                <button class="prod-order-btn" title="銝宏" onclick="moveBarcodeProduct(${jsArg(bc)},-1)" ${pos===0?'disabled':''}>??/button>
                <button class="prod-order-btn" title="銝宏" onclick="moveBarcodeProduct(${jsArg(bc)},1)" ${pos===filteredBc.length-1?'disabled':''}>??/button>
              </div>
            </div>
          </div>`;}).join('')
      : `<div class="empty-st" style="padding:28px 16px"><div class="ei" style="font-size:24px">?</div><div class="zh">甇文?憿璇Ⅳ??</div></div>`;

    mainArea.innerHTML = `<div class="prod-two-col">
      <div class="prod-col">
        <div class="prod-col-hd">
          <span class="pch-label" style="color:var(--purple)">? 鉊芹葩鉊?鉆葡鉆腹鉆腹鉊菽?鉊耜腦鉆?鉊?鉊??⊥?蝣澆???/span>
          <span class="pch-count">(${filteredNobc.length})</span>
        </div>
        <div class="prod-grid">${nobcCards}</div>
      </div>
      <div class="prod-col">
        <div class="prod-col-hd">
          <span class="pch-label" style="color:var(--accent)">? 鉊芹葩鉊?鉆葡鉊﹤葭鉊葡鉊??鉆?鉆? 璇Ⅳ??</span>
          <span class="pch-count">(${filteredBc.length})</span>
        </div>
        <div class="prod-grid">${bcCards}</div>
      </div>
    </div>`;
  }
}

function _resetProdCat(){ prodSelectedCat=null; const s=document.getElementById('prod-cat-sticky'); if(s){s.style.display='none';s.innerHTML='';} }

function saveAddProduct(){
  const bc=document.getElementById('ap-bc').value.trim();
  const name=document.getElementById('ap-name').value.trim();
  const price=parseFloat(document.getElementById('ap-price').value);
  const category=document.getElementById('ap-cat').value||'other';
  if(!isValidBarcode(bc)){showToast('璇Ⅳ?澆?銝迤蝣綽??喳? 3 蝣潘??望摮?','err');return;}
  if(!name){showToast('隢撓?亙???蝔?,'err');return;}
  if(isNaN(price)||price<0){showToast('隢撓?交迤蝣箏??,'err');return;}
  const prods=getProds();prods[bc]={name,price,category};saveProds(prods);
  closeModal('m-addprod');renderProdGrid();
  showToast('撌脫憓?'+name,'ok');
}
function openEditProd(bc){
  const p=getProds()[bc];if(!p)return;editingBC=bc;
  document.getElementById('ep-bc').textContent='璇Ⅳ嚗?+bc;
  document.getElementById('ep-name').value=p.name;
  document.getElementById('ep-price').value=p.price;
  buildCatOptions('ep-cat',p.category||'other');
  openModal('m-editprod');
}
function saveEditProduct(){
  const name=document.getElementById('ep-name').value.trim();
  const price=parseFloat(document.getElementById('ep-price').value);
  const category=document.getElementById('ep-cat').value||'other';
  if(!name||isNaN(price)){showToast('隢‵撖怠??渲???,'err');return;}
  const prods=getProds();prods[editingBC]={name,price,category};saveProds(prods);
  closeModal('m-editprod');renderProdGrid();
  showToast('撌脫?堆?'+name,'ok');editingBC=null;
}
function delProduct(bc){
  if(!confirm('蝣箏??芷甇文???'))return;
  const prods=getProds();delete prods[bc];saveProds(prods);
  renderProdGrid();showToast('撌脣?文???,'ok');
}
function moveBarcodeProduct(bc,dir){
  const prods=getProds();
  if(!prods[bc])return;
  const order=getProdOrder(prods);
  const idx=order.indexOf(String(bc));
  if(idx<0)return;
  const inScope=key=>prodSelectedCat==='__all__'||prodSelectedCat===null||(prods[key].category||'other')===prodSelectedCat;
  let target=-1;
  for(let i=idx+dir;i>=0&&i<order.length;i+=dir){
    if(inScope(order[i])){target=i;break;}
  }
  if(target<0)return;
  [order[idx],order[target]]=[order[target],order[idx]];
  saveProdOrder(order);
  renderProdGrid();
  showToast('撌脰矽?游???摨?,'ok');
}
function exportProducts(){
  const prods=getProds();const nobcProds=getNobcProds();
  const rows=[['憿?/Type','璇Ⅳ/Barcode','???迂/Name','?桀/Price嚗T$嚗?,'??ID/CategoryID','??/Category']];
  Object.entries(prods).forEach(([bc,p])=>rows.push(['barcode',bc,p.name,p.price,p.category||'other',getCatLabel(p.category||'other')]));
  nobcProds.forEach(p=>rows.push(['nobarcode','',p.name,p.price,p.category||'other',getCatLabel(p.category||'other')]));
  const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\r\n');
  downloadFile('\uFEFF'+csv,'products_all_'+dateStamp()+'.csv','text/csv;charset=utf-8');
  showToast('撌脣?箏?典???CSV','ok');
}
function importProducts(e){
  const file=e.target.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=ev=>{
    try{
      const text=ev.target.result.replace(/^\uFEFF/,'');
      const lines=text.split(/\r?\n/).filter(l=>l.trim());
      if(lines.length<2)throw 0;
      const prods=getProds();const nobcList=getNobcProds();
      const existNobcNames=new Set(nobcList.map(p=>p.name));
      let bcCount=0,nobcCount=0;
      const catIds=new Set(CATEGORIES.map(c=>c.id));
      lines.slice(1).forEach(line=>{
        const cols=parseCsvRow(line);if(cols.length<3)return;
        const type=cols[0].trim().toLowerCase();
        const rawCat=(cols[4]||'').trim();
        const category=catIds.has(rawCat)?rawCat:'other';
        if(type==='nobarcode'||type==='?⊥?蝣?){
          const name=cols[2].trim(),price=parseFloat(cols[3]);
          if(name&&!isNaN(price)&&!existNobcNames.has(name)){nobcList.push({id:'NB'+Date.now()+nobcCount,name,price,category});existNobcNames.add(name);nobcCount++;}
        }else{
          let bc,name,price;
          if(type==='barcode'||type==='璇Ⅳ'){bc=cols[1].trim();name=cols[2].trim();price=parseFloat(cols[3]);}
          else{bc=cols[0].trim();name=cols[1].trim();price=parseFloat(cols[2]);}
          if(bc&&name&&!isNaN(price)){prods[bc]={name,price,category};bcCount++;}
        }
      });
      saveProds(prods);saveNobcProds(nobcList);
      renderProdGrid();
      showToast('撌脣??'+bcCount+' 蝑?蝣?+ '+nobcCount+' 蝑璇Ⅳ??','ok');
    }catch{showToast('瑼??澆??航炊','err');}
    e.target.value='';
  };
  reader.readAsText(file,'UTF-8');
}
function clearAllProducts(){
  const bcCount=Object.keys(getProds()).length;const nbCount=getNobcProds().length;const total=bcCount+nbCount;
  if(total===0){showToast('?桀?瘝?隞颱???鞈?','err');return;}
  if(!confirm('??霅血?嚗撠?蝛箸???????\n\n?餅?蝣澆???'+bcCount+' 蝔娉n?餌璇Ⅳ??嚗?+nbCount+' 蝔娉n\n甇斗?雿瘜儔??撱箄降??箏?隞賬n\n蝣箏?閬匱蝥?嚗?))return;
  if(!confirm('?活蝣箄?嚗Ⅱ摰??芷?券 '+total+' 蝔桀???嚗?))return;
  localStorage.removeItem('pos_products');localStorage.removeItem('pos_nobc_products');
  renderProdGrid();showToast('撌脫?蝛箸???????,'ok');
}

// ?????梯” ????function renderStats(){
  const txList=getTx();const now=new Date();
  const today=fd(now),month=fm(now),week=fweek(now);
  let tT=0,tC=0,mT=0,mC=0,wT=0,wC=0;
  txList.forEach(tx=>{
    const d=new Date(tx.date);
    if(fd(d)===today){tT+=tx.total;tC++;}
    if(fm(d)===month){mT+=tx.total;mC++;}
    if(fweek(d)===week){wT+=tx.total;wC++;}
  });
  document.getElementById('stat-today').textContent='NT$ '+tT;
  document.getElementById('stat-today-count').textContent=tC;
  document.getElementById('stat-month').textContent='NT$ '+mT;
  document.getElementById('stat-month-count').textContent=mC;
  const sw=document.getElementById('stat-week');
  const swc=document.getElementById('stat-week-count');
  if(sw)sw.textContent='NT$ '+wT;
  if(swc)swc.textContent=wC;
}
function renderMonthly(){
  const txList=getTx();const grouped={};
  txList.forEach(tx=>{const k=fm(new Date(tx.date));if(!grouped[k])grouped[k]={total:0,count:0};grouped[k].total+=tx.total;grouped[k].count++;});
  const keys=Object.keys(grouped).sort().reverse();
  const el=document.getElementById('monthly-list');
  if(!keys.length){el.innerHTML=`<div class="empty-st"><div class="ei">??</div><div class="zh">撠?瑕鞈?</div></div>`;return;}
  el.innerHTML=keys.map(k=>`<div class="r-row" onclick="showDrilldown('${k}','monthly')"><div class="rdate">${k}</div><div class="ramt">NT$ ${grouped[k].total}</div><div class="rcnt">${grouped[k].count} 蝑?/div><div class="rarrow">??/div></div>`).join('');
}
function renderWeekly(){
  const txList=getTx();const grouped={};
  txList.forEach(tx=>{
    const k=fweek(new Date(tx.date));
    if(!grouped[k])grouped[k]={total:0,count:0,label:fweekLabel(new Date(tx.date))};
    grouped[k].total+=tx.total;grouped[k].count++;
  });
  const keys=Object.keys(grouped).sort().reverse();
  const el=document.getElementById('weekly-list');
  if(!keys.length){el.innerHTML=`<div class="empty-st"><div class="ei">??</div><div class="zh">撠?瑕鞈?</div></div>`;return;}
  el.innerHTML=keys.map(k=>`<div class="r-row" onclick="showDrilldown('${k}','weekly')">
    <div class="rdate" style="width:auto;min-width:80px;font-size:11px">${grouped[k].label}</div>
    <div class="ramt">NT$ ${grouped[k].total}</div>
    <div class="rcnt">${grouped[k].count} 蝑?/div>
    <div class="rarrow">??/div>
  </div>`).join('');
}
function renderDaily(){
  const txList=getTx();const grouped={};
  txList.forEach(tx=>{const k=fd(new Date(tx.date));if(!grouped[k])grouped[k]={total:0,count:0};grouped[k].total+=tx.total;grouped[k].count++;});
  const keys=Object.keys(grouped).sort().reverse();
  const el=document.getElementById('daily-list');
  if(!keys.length){el.innerHTML=`<div class="empty-st"><div class="ei">??</div><div class="zh">撠?瑕鞈?</div></div>`;return;}
  el.innerHTML=keys.map(k=>`<div class="r-row" onclick="showDrilldown('${k}','daily')"><div class="rdate">${k}</div><div class="ramt">NT$ ${grouped[k].total}</div><div class="rcnt">${grouped[k].count} 蝑?/div><div class="rarrow">??/div></div>`).join('');
}
function showDrilldown(key,mode){
  const txList=getTx();
  const filtered=txList.filter(tx=>{
    const d=new Date(tx.date);
    if(mode==='daily')  return fd(d)===key;
    if(mode==='monthly')return fm(d)===key;
    if(mode==='weekly') return fweek(d)===key;
    return false;
  });
  const itemMap={};
  filtered.forEach(tx=>{tx.items.forEach(item=>{if(!itemMap[item.name])itemMap[item.name]={qty:0,total:0};itemMap[item.name].qty+=item.qty;itemMap[item.name].total+=item.price*item.qty;});});
  const items=Object.entries(itemMap).sort((a,b)=>b[1].total-a[1].total);
  const grand=items.reduce((s,[,v])=>s+v.total,0);
  const modeLabel={daily:'瘥',monthly:'瘥?',weekly:'瘥?};
  document.getElementById('drill-title').textContent=(modeLabel[mode]||mode)+'?瑕?敦';
  document.getElementById('drill-sub').textContent=key.replace('~',' ~ ')+'???'+filtered.length+' 蝑漱??;
  document.getElementById('drill-body').innerHTML=items.map(([name,v])=>`<tr><td>${h(name)}</td><td class="num">${v.qty} 隞?/td><td class="num" style="color:var(--gold);font-weight:700">NT$ ${v.total}</td></tr>`).join('');
  document.getElementById('drill-total-amt').textContent='NT$ '+grand;
  openModal('m-drill');
}
function exportCSV(){
  const txList=getTx();if(!txList.length){showToast('?∟???臬','err');return;}
  const rows=[['鈭斗?蝺刻?','?交???','????','??']];
  txList.forEach(tx=>{const items=tx.items.map(i=>`${i.name}x${i.qty}`).join('; ');rows.push([tx.id,tx.date,items,tx.total]);});
  const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\r\n');
  downloadFile('\uFEFF'+csv,'transactions_'+dateStamp()+'.csv','text/csv;charset=utf-8');
  showToast('撌脣??CSV ?梯”','ok');
}
function importReport(e){
  const file=e.target.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=ev=>{
    try{
      const data=JSON.parse(ev.target.result);if(!Array.isArray(data))throw 0;
      const existing=getTx();const ids=new Set(existing.map(t=>t.id));let added=0;
      data.forEach(tx=>{if(!ids.has(tx.id)){existing.push(tx);added++;}});
      existing.sort((a,b)=>new Date(a.date)-new Date(b.date));
      saveTx(existing);renderStats();renderMonthly();renderWeekly();renderDaily();
      showToast('撌脣??'+added+' 蝑漱????,'ok');
    }catch{showToast('瑼??澆??航炊','err');}
    e.target.value='';
  };
  reader.readAsText(file);
}
function clearAllData(){
  if(!confirm('蝣箏?皜???株???甇斗?雿瘜儔??))return;
  localStorage.removeItem('pos_transactions');
  renderStats();renderMonthly();renderWeekly();renderDaily();
  showToast('撌脫??斗?????,'ok');
}

// ??????? ????function showPage(id,btn){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
  document.getElementById('page-'+id).classList.add('active');
  if(btn)btn.classList.add('active');
  if(id==='report'){renderStats();renderMonthly();renderWeekly();renderDaily();}
  if(id==='products'){_resetProdCat();renderProdGrid();}
}

// ????Modal 頛 ????function openModal(id){
  // ????select ?賊?
  if(id==='m-addprod')buildCatOptions('ap-cat','other');
  if(id==='m-addnobc')buildCatOptions('addnobc-cat','other');
  document.getElementById(id).classList.add('open');
}
function closeModal(id){document.getElementById(id).classList.remove('open');}
document.querySelectorAll('.overlay').forEach(ol=>{
  ol.addEventListener('click',e=>{if(e.target===ol)ol.classList.remove('open');});
});

// ????撌亙?賢? ????function setSt(msg,type=''){const el=document.getElementById('scan-st');el.textContent=msg;el.className='scan-st'+(type?' '+type:'');}
function showToast(msg,type=''){const t=document.getElementById('toast');t.textContent=msg;t.className='show '+type;clearTimeout(t._t);t._t=setTimeout(()=>t.className='',3000);}
function playBeep(){try{const ctx=new(window.AudioContext||window.webkitAudioContext)();const o=ctx.createOscillator(),g=ctx.createGain();o.connect(g);g.connect(ctx.destination);o.frequency.value=960;o.type='sine';g.gain.setValueAtTime(.18,ctx.currentTime);g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.1);o.start();o.stop(ctx.currentTime+.1);}catch(e){}}
function fd(d){return`${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;}
function fm(d){return`${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}`;}
// ?梢嚗誑?曹??箇洵銝憭抬???梢曹?????箏銝??function fweek(d){
  const day=d.getDay(); // 0=Sun,1=Mon,...,6=Sat
  const diff=day===0?-6:1-day; // 頝曹?憭拇嚗望敺??憭抬?
  const mon=new Date(d);
  mon.setDate(d.getDate()+diff);
  const sun=new Date(mon);
  sun.setDate(mon.getDate()+6);
  return fd(mon)+'~'+fd(sun); // ?菜撘??曹?~?望
}
// ?梢＊蝷箸?蝐?function fweekLabel(d){
  const day=d.getDay();
  const diff=day===0?-6:1-day;
  const mon=new Date(d);mon.setDate(d.getDate()+diff);
  const sun=new Date(mon);sun.setDate(mon.getDate()+6);
  const fmt=x=>`${String(x.getMonth()+1).padStart(2,'0')}/${String(x.getDate()).padStart(2,'0')}`;
  return`${mon.getFullYear()} ${fmt(mon)}~${fmt(sun)}`;
}function dateStamp(){const n=new Date();return`${n.getFullYear()}${String(n.getMonth()+1).padStart(2,'0')}${String(n.getDate()).padStart(2,'0')}`;}
function downloadFile(content,filename,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type}));a.download=filename;a.click();URL.revokeObjectURL(a.href);}
function parseCsvRow(row){const result=[];let cur='',inQ=false;for(let i=0;i<row.length;i++){const c=row[i];if(c==='"'){if(inQ&&row[i+1]==='"'){cur+='"';i++;}else{inQ=!inQ;}}else if(c===','&&!inQ){result.push(cur);cur='';}else cur+=c;}result.push(cur);return result;}

// ????蝷箇?鞈? ????function seedDemo(){
  if(getTx().length)return;
  const prods=getProds();const pkeys=Object.keys(prods);const txs=[];const now=new Date();
  for(let i=30;i>=0;i--){
    const d=new Date(now);d.setDate(d.getDate()-i);
    for(let j=0;j<Math.floor(Math.random()*6)+1;j++){
      d.setHours(9+Math.floor(Math.random()*12),Math.floor(Math.random()*60));
      const items=[];
      for(let k=0;k<Math.floor(Math.random()*4)+1;k++){
        const bc=pkeys[Math.floor(Math.random()*pkeys.length)];const p=prods[bc];
        const ex=items.find(x=>x.barcode===bc);
        if(ex)ex.qty++;else items.push({barcode:bc,name:p.name,price:p.price,qty:1});
      }
      const sub=items.reduce((s,i)=>s+i.price*i.qty,0);
      txs.push({id:'TX'+d.getTime().toString(36).toUpperCase(),date:d.toISOString(),items,subtotal:sub,total:sub});
    }
  }
  saveTx(txs);
}

// ??????璅∪??? ????let scanMode = 'hw'; // 'cam' | 'hw'

function switchScanMode(mode){
  scanMode = mode;
  // tabs
  document.getElementById('tab-hw').classList.toggle('active', mode==='hw');
  document.getElementById('tab-cam').classList.toggle('active', mode==='cam');
  // panels
  document.getElementById('panel-hw').style.display = mode==='hw' ? 'flex' : 'none';
  document.getElementById('panel-cam').style.display = mode==='cam' ? 'flex' : 'none';
  // stop camera if switching away
  if(mode==='hw' && scanning) stopScanner();
  // ???冽芋撘?銝??虫遙雿撓?交?嚗ID ????keydown ?湔? document
  if(mode==='hw'){
    setTimeout(()=>{ initHwInput(); }, 80);
  }
  setSt(mode==='hw' ? '?? 鉊腦鉆葉鉊﹤腦鉊晤?鉊?鉊冢腹鉊嫩艇鉊葡鉊?鉊腦鉊獅?鉊冢?鉊芹?鉊? / 蝑????刻撓?? : '鉊?葉鉊芹?鉊?... / 蝑???', '');
}

// ???????剁?HID Keyboard嚗撓?亥???????//
// ?寞閫??嚗w-input 雿輻 inputmode="none"
//   ??Android 銝????萇嚗?銝??遙雿?IME
//   ??蝖祇? HID ???函??鈭辣?湔??嚗.key ?舀迤蝣箇? ASCII 摮?
//   ??銝?閬?type="password"嚗??孛?澆?蝣潛恣?
//
// ?惜?嚗?//   1. hw-input keydown嚗??阡?????舫?嚗?//   2. document keydown嚗暺???hw-input ??靽?嚗?
const SCANNER_MAX_INTERVAL = 80;
let _hwBuf = '';
let _hwLastTime = 0;
let _hwTimer = null;

// CODE_MAP嚗.key==='Process' ? e.code ?嚗??Android 鋆蔭?閬?
const CODE_MAP = {};
'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach(k => { CODE_MAP['Key'+k] = k; });
'0123456789'.split('').forEach(k => { CODE_MAP['Digit'+k] = k; CODE_MAP['Numpad'+k] = k; });
Object.assign(CODE_MAP, {
  Minus:'-', Period:'.', Slash:'/', Space:' ',
  NumpadAdd:'+', NumpadSubtract:'-', NumpadMultiply:'*', NumpadDecimal:'.'
});

function hwAppend(ch){
  const now = Date.now();
  if(now - _hwLastTime > SCANNER_MAX_INTERVAL * 4 && _hwBuf.length > 0) _hwBuf = '';
  _hwLastTime = now;
  if(/[\x20-\x7E]/.test(ch)){
    _hwBuf += ch;
    const inp = document.getElementById('hw-input');
    if(inp && inp !== document.activeElement) inp.value = _hwBuf; // ??暺????郊
  }
  clearTimeout(_hwTimer);
  _hwTimer = setTimeout(()=>{
    _hwBuf = '';
    const inp = document.getElementById('hw-input');
    if(inp) inp.value = '';
  }, 3000);
}

function hwSubmit(){
  clearTimeout(_hwTimer);
  // ?芸???hw-input.value嚗??阡??汗?函?亙神?伐?
  const inp = document.getElementById('hw-input');
  const raw = inp ? inp.value.trim() : _hwBuf.trim();
  _hwBuf = '';
  if(inp) inp.value = '';
  if(raw.length >= 3) handleHwCode(raw);
}

// ?? hw-input ?湔??嚗??阡? + inputmode=none嚗ME 銝?隞嚗??
function initHwInput(){
  const inp = document.getElementById('hw-input');
  if(!inp || inp._hwInit) return;
  inp._hwInit = true;

  inp.addEventListener('keydown', function(e){
    if(e.key === 'Enter'){ e.preventDefault(); hwSubmit(); return; }
    if(e.key === 'Backspace'){ e.preventDefault(); return; } // 霈汗?刻?嗉????
    let ch = '';
    if(e.key.length === 1 && /[\x20-\x7E]/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey){
      ch = e.key;
    } else if(e.key === 'Process' || e.key === 'Unidentified'){
      // Android 銝?e.code ?航銋蝛綽??湔敹賜嚗? input 鈭辣
      ch = CODE_MAP[e.code] || '';
    }
    // 銝?preventDefault嚗?摮??芰?脣 input.value嚗汗?典鼠?敞蝛?
    if(ch) _hwLastTime = Date.now(); // ?湔???喉?摮??祈澈??input 鈭辣?交
  });

  // input 鈭辣嚗nputmode=none 銝?IME 銝?閫貊嚗ㄐ?交??舀????撖血???  // ??雿摰蝬莎??蕪隞颱???ASCII 摮?嚗銝 IME ???嚗?  inp.addEventListener('input', function(){
    const clean = inp.value.replace(/[^\x20-\x7E]/g, '');
    if(inp.value !== clean) inp.value = clean;
    // 頞? 80 摮??芸??
    if(inp.value.length >= 80){
      const val = inp.value.trim();
      inp.value = '';
      handleHwCode(val);
    }
  });

  // compositionstart嚗 IME ???嚗扔撠?瘜?嚗???blur ??focus ?
  inp.addEventListener('compositionstart', function(){
    const saved = inp.value.replace(/[^\x20-\x7E]/g, '');
    inp.blur();
    inp.value = saved;
  });
}

// ?? document keydown 靽?嚗暺???hw-input ????
document.addEventListener('keydown', function(e){
  if(!document.getElementById('page-pos').classList.contains('active')) return;
  if(document.querySelector('.overlay.open') || document.querySelector('.review-overlay.open')) return;

  const tag = document.activeElement ? document.activeElement.tagName : '';
  // ?交??祕頛詨獢??阡?嚗漱?梯府 input ?芾???嚗ty-input ??qtyKeydown嚗?  if(tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

  if(e.key === 'Enter'){
    e.preventDefault();
    hwSubmit();
    return;
  }

  let ch = '';
  if(e.key.length === 1 && /[\x20-\x7E]/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey){
    ch = e.key;
  } else if(e.key === 'Process' || e.key === 'Unidentified'){
    ch = CODE_MAP[e.code] || '';
  }
  if(ch){ e.preventDefault(); hwAppend(ch); }
});

// ?詨捆??恍?
function onHwKeydown(e){}
function onHwInput(inp){}
function onHwCompose(inp){}
function initHwCapture(){}
function focusHwCapture(){}
function refocusCapture(){}

function handleHwCode(raw){
  const code = (raw || '').trim().replace(/[^\x20-\x7E]/g, '');
  if(!isValidBarcode(code)) {
    if(code.length > 0) setSt('??璇Ⅳ?澆??⊥?颲刻?嚗? + code, 'err');
    flashHwInput('err');
    return;
  }
  const now = Date.now();
  if(code === lastCode && now - lastCodeTime < DEBOUNCE) return;
  lastCode = code; lastCodeTime = now;
  addByBarcode(code);
  flashHwInput('ok');
}

function flashHwInput(type){
  const inp = document.getElementById('hw-input');
  if(!inp) return;
  inp.classList.remove('flash-ok','flash-err');
  void inp.offsetWidth;
  inp.classList.add(type === 'ok' ? 'flash-ok' : 'flash-err');
  setTimeout(()=>inp.classList.remove('flash-ok','flash-err'), 500);
}


function focusHwIfNeeded(){
  // HID ???其??閬遙雿?input ?暺?global keydown ?湔?交
}
function blurHwInput(){
  // 銝??閬?靽??詨捆??}

// ?? ?賊?甈???菜葫 ??
// HID ???其??閬遙雿?input ?暺??⊿?暺?????

// ????Scroll-to-top ????// 1. ?券? FAB嚗蜓??脣?嚗?window.addEventListener('scroll', function(){
  const fab=document.getElementById('scroll-fab');
  if(fab) fab.classList.toggle('show', window.scrollY>200);
}, {passive:true});

// 2. ??脣?摰孵?抒?蝵桀? ????
function attachInnerScrollTop(el){
  if(!el || el._fabAttached) return;
  el._fabAttached = true;
  const btn = document.createElement('button');
  btn.className = 'inner-fab';
  btn.textContent = '??;
  btn.title = '??';
  btn.addEventListener('click', ()=>el.scrollTo({top:0,behavior:'smooth'}));
  el.addEventListener('scroll', ()=>{
    btn.classList.toggle('show', el.scrollTop > 80);
  }, {passive:true});
  // ?曉摰孵?敺?sticky bottom ??摰筑?典閬?摨
  el.appendChild(btn);
}

// ??摰孵嚗銵典?銵具?撣?review
function initStaticScrollTops(){
  ['monthly-list','daily-list','review-body'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) attachInnerScrollTop(el);
  });
}

// ??摰孵嚗odal嚗?甈⊿?????嚗obc-list-body嚗enderNobcListModal 敺?
const _origOpenModal = openModal;
window.openModal = function(id){
  _origOpenModal(id);
  // mbox ?批捆?脣?
  const overlay=document.getElementById(id);
  if(overlay){
    const mbox=overlay.querySelector('.mbox');
    if(mbox) setTimeout(()=>attachInnerScrollTop(mbox), 50);
    // nobc-list modal ??nobc-list-body
    const nb=overlay.querySelector('#nobc-list-body');
    if(nb) setTimeout(()=>attachInnerScrollTop(nb), 50);
  }
};

// nobc-list-body ??renderNobcListModal ?遣敺??圈???const _origRenderNobc = renderNobcListModal;
window.renderNobcListModal = function(){
  _origRenderNobc();
  const nb=document.getElementById('nobc-list-body');
  if(nb){ nb._fabAttached=false; setTimeout(()=>attachInnerScrollTop(nb),30); }
};

// prod-main-area ??renderProdGrid ?遣敺??圈???const _origRenderProd = renderProdGrid;
window.renderProdGrid = function(){
  _origRenderProd();
  // prod-main-area ?祈澈銝?overflow嚗蜓??脣?嚗AB 撌脰???};

document.addEventListener('DOMContentLoaded', initStaticScrollTops);
setTimeout(initStaticScrollTops, 500);


// ?????脖????????let _touchStartY=0;
document.addEventListener('touchstart',e=>{_touchStartY=e.touches[0].clientY;},{passive:true});
document.addEventListener('touchmove',e=>{
  // ?芸??敺銝????餅迫嚗 pull-to-refresh嚗?  // ?亥孛?折??典?脣???摰孵?改?銝??迎?霈捆?冽迤撣豢??
  if(!e.cancelable) return;
  const dy = e.touches[0].clientY - _touchStartY;
  if(dy <= 0) return; // 敺銝?銝甇?  if(window.scrollY > 0) return; // ??祈澈撌脣?銝嚗???pull-to-refresh

  // 瑼Ｘ閫豢?格??臬?典?脣?摰孵??  let el = e.target;
  while(el && el !== document.body){
    const st = el.scrollTop;
    const sh = el.scrollHeight;
    const ch = el.clientHeight;
    // 摰孵?臬?銝嚗?脣?嚗? 霈?甇?虜?脣?
    if(sh > ch && st > 0){ return; }
    el = el.parentElement;
  }
  // 蝣箄??舫??ａ??函?銝???嚗甇?  e.preventDefault();
},{passive:false});

// ????TTS 隤?? ????function speak(text){
  if(!window.speechSynthesis)return;
  window.speechSynthesis.cancel();
  const utt=new SpeechSynthesisUtterance(text);
  const voices=window.speechSynthesis.getVoices();
  const thVoice=voices.find(v=>v.lang&&v.lang.startsWith('th'));
  if(thVoice)utt.voice=thVoice;
  utt.lang='th-TH'; utt.rate=0.92; utt.pitch=1;
  window.speechSynthesis.speak(utt);
}
if(window.speechSynthesis){
  window.speechSynthesis.onvoiceschanged=()=>window.speechSynthesis.getVoices();
  window.speechSynthesis.getVoices();
}
function amountToThai(total){
  const u=['','鉊徇?鉊嗣?鉊?,'鉊芹葉鉊?,'鉊芹葡鉊?,'鉊芹葭鉆?,'鉊徇?鉊?,'鉊徇?','鉆鉊?鉊?,'鉆?鉊?,'鉆鉊?鉊?];
  const t=['','鉊芹葩鉊?,'鉊Ｒ葭鉆葵鉊毯?','鉊芹葡鉊﹤葵鉊毯?','鉊芹葭鉆葵鉊毯?','鉊徇?鉊耜葵鉊毯?','鉊徇?鉊芹葩鉊?,'鉆鉊?鉊葵鉊毯?','鉆?鉊葵鉊毯?','鉆鉊?鉊耜葵鉊毯?'];
  if(total===0)return'鉊兒號鉊腺鉆?;
  let n=Math.round(total),res='';
  if(n>=10000){res+=u[Math.floor(n/10000)]+'鉊徇腹鉊獅?鉊?;n%=10000;}
  if(n>=1000) {res+=u[Math.floor(n/1000)] +'鉊萵鉊?; n%=1000;}
  if(n>=100)  {res+=u[Math.floor(n/100)]  +'鉊??鉊冢腺';n%=100;}
  if(n>=10)   {res+=t[Math.floor(n/10)];  n%=10;}
  if(n>0)     res+=u[n];
  return res;
}
let heldCarts = []; // [{id, items, savedAt}]

function holdCart(){
  if(!cart.length) return;
  const id = 'H' + Date.now();
  heldCarts.push({ id, items: JSON.parse(JSON.stringify(cart)), savedAt: new Date() });
  cart = [];
  renderCart();
  renderHoldBar();
  showToast('撌脫摮頃?抵?嚗蝜潛???銝?雿恥鈭?,'ok');
}

function resumeHeld(id){
  const idx = heldCarts.findIndex(h=>h.id===id);
  if(idx===-1) return;
  // ?亦?頃?抵??????芸??摮?銝岷??  if(cart.length){
    heldCarts.push({id:'H'+Date.now(), items:JSON.parse(JSON.stringify(cart)), savedAt:new Date()});
  }
  cart = JSON.parse(JSON.stringify(heldCarts[idx].items));
  heldCarts.splice(idx,1);
  renderCart();
  renderHoldBar();
  showToast('撌脫敺拇摮頃?抵?','ok');
}

function deleteHeld(id, e){
  e.stopPropagation();
  heldCarts = heldCarts.filter(h=>h.id!==id);
  renderHoldBar();
  showToast('撌脣?斗摮頃?抵?','ok');
}

function renderHoldBar(){
  const wrap = document.getElementById('hold-bar-wrap');
  if(!wrap) return;
  if(!heldCarts.length){
    wrap.innerHTML = '';
    return;
  }
  const slots = heldCarts.map((h,i)=>{
    const total = h.items.reduce((s,item)=>s+item.price*item.qty,0);
    const count = h.items.reduce((s,item)=>s+item.qty,0);
    const t = h.savedAt;
    const timeStr = String(t.getHours()).padStart(2,'0')+':'+String(t.getMinutes()).padStart(2,'0');
    return `<div class="hold-slot" onclick="resumeHeld('${h.id}')" title="暺??Ｗ儔甇方頃?抵?">
      <div class="hs-num">${i+1}</div>
      <div class="hs-info">
        <div class="hs-count">${count} 隞?繚 ${timeStr}</div>
        <div class="hs-amt">NT$ ${total}</div>
      </div>
      <span class="hs-del" onclick="deleteHeld('${h.id}',event)" title="?芷">?</span>
    </div>`;
  }).join('');
  wrap.innerHTML = `<div class="hold-bar">${slots}</div>`;
}

// ????Firebase ?游?嚗?銝嚗???

// ????????????????????????????????????????????????????????//  Firebase Realtime Database ?游?
// ????????????????????????????????????????????????????????// ????Firebase v12 璅∠????????const FB_CFG_KEY = 'pos_firebase_cfg';
let _fbConnected = false;
let _fbListeners = {};
let _fbSaveTimer = null;

function setFbStatus(cls, label){
  const el=document.getElementById('fb-status'), lb=document.getElementById('fb-label');
  if(!el||!lb) return;
  el.className=cls; lb.textContent=label;
}
function setFbModalStatus(msg, color='var(--muted)'){
  const el=document.getElementById('fb-modal-status');
  if(!el) return;
  el.style.display='block'; el.style.color=color; el.textContent=msg;
}

// ?? 閮剖? Modal ??
function loadFbConfigToModal(){
  try{
    const cfg=JSON.parse(localStorage.getItem(FB_CFG_KEY)||'null'); if(!cfg)return;
    const m={'apiKey':'fb-apiKey','authDomain':'fb-authDomain','databaseURL':'fb-dbUrl',
             'projectId':'fb-projectId','appId':'fb-appId'};
    Object.entries(m).forEach(([k,id])=>{ const el=document.getElementById(id); if(el)el.value=cfg[k]||''; });
  }catch(e){}
}
async function saveFirebaseConfig(){
  const apiKey      = (document.getElementById('fb-apiKey')?.value||'').trim();
  const databaseURL = (document.getElementById('fb-dbUrl')?.value||'').trim();

  if(apiKey && !databaseURL){
    setFbModalStatus('??隢‵撖?Database URL嚗?憛恬?','var(--red)');
    return;
  }
  if(!apiKey && !databaseURL){
    // ?函征 ??皜?芾?閮剖?嚗敺拚?閮?    localStorage.removeItem(FB_CFG_KEY);
    setFbModalStatus('??撌脫敺拚?閮剛身摰??頛銝?..','var(--green)');
    setTimeout(()=>location.reload(), 1000);
    return;
  }
  const cfg={
    apiKey,
    authDomain:   (document.getElementById('fb-authDomain')?.value||'').trim(),
    databaseURL,
    projectId:    (document.getElementById('fb-projectId')?.value||'').trim(),
    appId:        (document.getElementById('fb-appId')?.value||'').trim(),
  };
  localStorage.setItem(FB_CFG_KEY, JSON.stringify(cfg));
  setFbModalStatus('??閮剖?撌脣摮??頛?隞仿??...','var(--green)');
  setTimeout(()=>location.reload(), 1200);
}
function clearFirebaseConfig(){
  if(!confirm('蝣箏?皜 Firebase 閮剖?嚗??文???閮剖???)) return;
  localStorage.removeItem(FB_CFG_KEY);
  closeModal('m-firebase');
  setFbStatus('off','Firebase ?芾身摰?);
  showToast('撌脫???Firebase 閮剖?嚗??頛?','ok');
}

// Firebase modal 撌脩宏?歹?銝?閬?openModal override

// ?? 敺?Firebase ?????????
async function fbPullAll(){
  if(!window._fbGet) return;
  try{
    setFbStatus('connecting','???郊銝?..');
    const snap = await window._fbGet('pos');
    const data = snap.val() || {};
    if(data.products)      localStorage.setItem('pos_products',      JSON.stringify(data.products));
    if(data.product_order) localStorage.setItem(PROD_ORDER_KEY,       JSON.stringify(Array.isArray(data.product_order)?data.product_order:Object.values(data.product_order)));
    if(data.nobc_products) localStorage.setItem('pos_nobc_products', JSON.stringify(data.nobc_products));
    if(data.transactions){
      const arr = Array.isArray(data.transactions) ? data.transactions : Object.values(data.transactions);
      localStorage.setItem('pos_transactions', JSON.stringify(arr));
    }
    setFbStatus('connected','??Firebase 撌脤??');
    renderProdGrid(); renderStats(); renderMonthly(); renderDaily();
    showToast('Firebase 鞈??郊摰?','ok');
  }catch(e){
    console.error('[Firebase pull]',e);
    setFbStatus('error','???郊憭望?嚗?+e.message);
  }
}

// ?? ?單??? ??
function fbListenAll(){
  if(!window._fbOnValue) return;
  [['pos/products','pos_products',0],['pos/nobc_products','pos_nobc_products',1],['pos/transactions','pos_transactions',2],['pos/product_order',PROD_ORDER_KEY,3]]
  .forEach(([path,lsKey,type])=>{
    if(_fbListeners[path]) try{_fbListeners[path]();}catch(e){}
    const unsub = window._fbOnValue(path, snap=>{
      const val=snap.val(); if(val===null) return;
      const toStore = (type===2||type===3) ? (Array.isArray(val)?val:Object.values(val)) : val;
      localStorage.setItem(lsKey, JSON.stringify(toStore));
      if(type===2){ renderStats(); renderMonthly(); renderDaily(); }
      else renderProdGrid();
    }, err=>console.warn('[Firebase listen]',err));
    _fbListeners[path]=unsub;
  });
}

// ?? 撖怠 Firebase嚗??600ms嚗??
function fbScheduleSave(){
  if(!_fbConnected||!window._fbSet) return;
  clearTimeout(_fbSaveTimer);
  _fbSaveTimer=setTimeout(async()=>{
    setFbStatus('connecting','???脣?銝?..');
    try{
      const now = new Date().toISOString();
      const prods = getProds();
      const nobcProds = getNobcProds();
      const txList = getTx();
      const prodOrder = getProdOrder(prods);

      // ?? 1. ?? pos/ 頝臬?嚗雁??銝摰對???
      await window._fbSet('pos',{
        updatedAt: now,
        products: prods,
        product_order: prodOrder,
        nobc_products: nobcProds,
        transactions: txList,
      });

      // ?? 2. shop/ 頝臬?嚗?摰Ｘ蝡?Shop 蝟餌絞雿輻嚗??
      await window._fbSet('shop/products',     prods);
      await window._fbSet('shop/nobc_products', nobcProds);
      // meta.updatedAt 霈?Shop 蝡臬?撌桃瘥?嚗霈??蝭暺?瘚?嚗?      await window._fbSet('shop/meta', {
        updatedAt: now,
        productCount: Object.keys(prods).length,
        nobcCount: nobcProds.length,
      });

      setFbStatus('connected','??Firebase 撌脤??');
    }catch(e){
      console.error('[Firebase save]',e);
      setFbStatus('error','???脣?憭望?嚗?+e.message);
    }
  },600);
}

// ?? 閬神 save ?賢? ??
const _origSaveProds2=saveProds, _origSaveProdOrder2=saveProdOrder, _origSaveNobcProds2=saveNobcProds, _origSaveTx2=saveTx;
window.saveProds     = function(o){ _origSaveProds2(o);       fbScheduleSave(); };
window.saveProdOrder = function(a){ _origSaveProdOrder2(a);   fbScheduleSave(); };
window.saveNobcProds = function(a){ _origSaveNobcProds2(a);   fbScheduleSave(); };
window.saveTx        = function(a){ _origSaveTx2(a);          fbScheduleSave(); };

// ?? 蝑? module 撠梁?敺?? ??
function waitFbReady(cb){
  if(window._fbReady||window._fbNeedSetup){ cb(); return; }
  document.addEventListener('firebase-ready', cb, {once:true});
  setTimeout(()=>{ if(!window._fbReady&&!window._fbNeedSetup) setFbStatus('error','??Firebase 頛頞?'); },10000);
}

waitFbReady(async()=>{
  if(window._fbNeedSetup){
    setFbStatus('off','??暺?閮剖? Firebase');
    document.getElementById('fb-status').style.cursor='pointer';
    document.getElementById('fb-status').onclick=()=>openModal('m-firebase');
    return;
  }
  setFbStatus('connecting','?????銝?..');
  try{
    // 蝑? .info/connected ??true嚗irebase ?迤???嚗??臬?憪? false嚗?    await new Promise((resolve, reject)=>{
      const t = setTimeout(()=>reject(new Error('timeout')), 12000);
      const unsub = window._fbOnValue('.info/connected', snap=>{
        if(snap.val() === true){   // ??敹???true ???????
          clearTimeout(t);
          unsub();
          resolve();
        }
        // val() === false ?臬?憪???蝜潛?蝑?
      }, err=>{ clearTimeout(t); reject(err); });
    });
    _fbConnected=true;
    setFbStatus('connected','??Firebase 撌脤??');
    await fbPullAll();
    fbListenAll();
    document.getElementById('fb-status').style.cursor='pointer';
    document.getElementById('fb-status').onclick=()=>openModal('m-firebase');
  }catch(e){
    console.error('[Firebase init]',e);
    setFbStatus('error','?????憭望?嚗?+e.message);
    showToast('Firebase ???憭望?嚗蝙?冽?啗???,'err');
    document.getElementById('fb-status').style.cursor='pointer';
    document.getElementById('fb-status').onclick=()=>openModal('m-firebase');
  }
});

// ??????????????????????????????????????????????????????????
//  蝺?閮蝞∠?
// ??????????????????????????????????????????????????????????
let _onlineOrders  = [];
let _ooFilter      = 'all';   // 'all' | 'pending' | 'done'

/* 镼踹?撟?+ ?踵?隡舀摮?隞?*/
function fmtDateTh(iso){
  try{
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    const hh  = String(d.getHours()).padStart(2,'0');
    const mm  = String(d.getMinutes()).padStart(2,'0');
    return `${y}/${m}/${day} ${hh}:${mm}`;
  }catch(e){ return iso||''; }
}

async function loadOnlineOrders(){
  if(!window._fbGet){ renderOnlineOrders(); return; }
  try{
    const snap = await window._fbGet('shop/online_orders');
    _onlineOrders = snap && snap.val()
      ? Object.values(snap.val()).filter(o=>o&&o.id).sort((a,b)=>new Date(b.date)-new Date(a.date))
      : [];
  }catch(e){ console.warn('[POS] loadOnlineOrders:',e); }
  renderOnlineOrders();
  updateOnlineBadge();
}

function listenOnlineOrders(){
  if(!window._fbOnValue) return;
  window._fbOnValue('shop/online_orders', snap=>{
    _onlineOrders = snap && snap.val()
      ? Object.values(snap.val()).filter(o=>o&&o.id).sort((a,b)=>new Date(b.date)-new Date(a.date))
      : [];
    renderOnlineOrders();
    updateOnlineBadge();
  }, e=>console.warn('[POS] listen orders:',e));
}

function updateOnlineBadge(){
  const pending = _onlineOrders.filter(o=>(o.status||'pending')==='pending').length;
  const badge = document.getElementById('online-badge');
  if(!badge) return;
  badge.style.display = pending>0 ? '' : 'none';
  badge.textContent   = pending>99 ? '99+' : String(pending);
}

/* 蝯梯????? filter */
function ooSetFilter(f){
  _ooFilter = (_ooFilter === f) ? 'all' : f;  // ??銝甈∪?瘨祟??  renderOnlineOrders();
}

function renderOnlineOrders(){
  // ?湔蝯梯??詨?
  const pending = _onlineOrders.filter(o=>(o.status||'pending')==='pending').length;
  const done    = _onlineOrders.filter(o=>o.status==='done').length;
  const members = new Set(_onlineOrders.filter(o=>o.memberId).map(o=>o.memberId)).size;

  const sp = id=>{ const el=document.getElementById(id); return el||{textContent:''}; };
  sp('oo-stat-pending').textContent = pending;
  sp('oo-stat-done').textContent    = done;
  sp('oo-stat-members').textContent = members;

  // ??擃漁
  const bPending = document.getElementById('oo-btn-pending');
  const bDone    = document.getElementById('oo-btn-done');
  if(bPending) bPending.style.borderColor = _ooFilter==='pending' ? 'var(--red)'   : 'transparent';
  if(bDone)    bDone.style.borderColor    = _ooFilter==='done'    ? 'var(--green)' : 'transparent';

  // 蝭拚?內??  const filterBar   = document.getElementById('oo-filter-bar');
  const filterLabel = document.getElementById('oo-filter-label');
  if(filterBar && filterLabel){
    if(_ooFilter==='all'){
      filterBar.style.display = 'none';
    } else {
      filterBar.style.display = 'flex';
      filterLabel.textContent = _ooFilter==='pending' ? '??憿舐內敺??? : '??憿舐內撌脣???;
      filterLabel.style.background = _ooFilter==='pending' ? 'rgba(220,38,38,.1)' : 'rgba(5,150,105,.1)';
      filterLabel.style.color      = _ooFilter==='pending' ? 'var(--red)' : 'var(--green)';
    }
  }

  const filtered = _ooFilter==='all' ? _onlineOrders
    : _onlineOrders.filter(o=>(o.status||'pending')===_ooFilter);

  const list = document.getElementById('oo-list');
  if(!list) return;

  if(!filtered.length){
    const msg = _ooFilter==='pending' ? '?桀?瘝?敺???????'
              : _ooFilter==='done'    ? '撠撌脣?????
              : '撠蝺?閮';
    list.innerHTML = `<div style="text-align:center;padding:40px 20px;color:var(--muted2)">
      <div style="font-size:32px;margin-bottom:8px">??</div>
      <div style="font-family:var(--zh);font-size:13px">${msg}</div>
    </div>`;
    return;
  }

  list.innerHTML = filtered.map(o=>{
    const isPending = (o.status||'pending')==='pending';
    const memberTag = o.memberId
      ? `<span style="font-size:10px;background:rgba(124,58,237,.1);color:var(--purple);border-radius:4px;padding:1px 6px;font-family:var(--mono)">${o.memberId}</span>`
      : `<span style="font-size:10px;background:var(--surface2);color:var(--muted2);border-radius:4px;padding:1px 6px">鉆?鉊?閮芸恥</span>`;
    const statusTag = isPending
      ? `<span style="font-size:11px;background:rgba(220,38,38,.1);color:var(--red);border-radius:4px;padding:2px 8px;font-weight:600">??鉊?葉鉊董鉆鉊葩鉊?鉊耜腦</span>`
      : `<span style="font-size:11px;background:rgba(5,150,105,.1);color:var(--green);border-radius:4px;padding:2px 8px;font-weight:600">??鉆鉊芹腦鉆?鉊芹葩鉆?</span>`;
    const itemSummary = (o.items||[]).slice(0,2).map(i=>i.name).join('??)
      + ((o.items||[]).length>2 ? ` +${(o.items||[]).length-2}...` : '');

    return `<div onclick="openOnlineOrder('${o.id}')" style="
        display:grid;grid-template-columns:1fr auto;gap:5px 12px;
        padding:12px 14px;border-bottom:1px solid var(--border);
        cursor:pointer;transition:background .15s;
        border-left:3px solid ${isPending?'var(--red)':'var(--green)'};
      " onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
      <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap">
        <span style="font-family:var(--mono);font-size:12px;font-weight:700;color:var(--accent)">${o.id}</span>
        ${statusTag} ${memberTag}
      </div>
      <div style="text-align:right;font-family:var(--mono);font-size:15px;font-weight:700;color:var(--text)">${o.total!=null?'NT$'+o.total:''}</div>
      <div style="font-size:12px;color:var(--muted)">${o.customerName||''} ${o.customerPhone?'繚 '+o.customerPhone:''}</div>
      <div style="font-size:11px;color:var(--muted2);text-align:right">${fmtDateTh(o.date)}</div>
      ${itemSummary?`<div style="font-size:12px;color:var(--text2);grid-column:1/-1">? ${itemSummary}</div>`:''}
      ${o.note?`<div style="font-size:11px;color:var(--gold);grid-column:1/-1">? ${o.note}</div>`:''}
    </div>`;
  }).join('');
}

/* ??閮?敦 */
function openOnlineOrder(orderId){
  const o = _onlineOrders.find(x=>x.id===orderId);
  if(!o) return;
  const isPending = (o.status||'pending')==='pending';

  const body = document.getElementById('ood-body');
  const acts = document.getElementById('ood-acts');
  if(!body||!acts) return;

  body.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;align-items:center">
      ${isPending
        ? `<span style="background:rgba(220,38,38,.1);color:var(--red);border-radius:6px;padding:3px 10px;font-size:12px;font-weight:600">??鉊?葉鉊董鉆鉊葩鉊?鉊耜腦 / 敺???/span>`
        : `<span style="background:rgba(5,150,105,.1);color:var(--green);border-radius:6px;padding:3px 10px;font-size:12px;font-weight:600">??鉆鉊芹腦鉆?鉊芹葩鉆? / 撌脣???/span>`}
      <span style="font-family:var(--mono);font-size:11px;color:var(--muted)">${o.id}</span>
      <span style="font-size:11px;color:var(--muted2)">${fmtDateTh(o.date)}</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
      <div style="background:var(--surface2);border-radius:8px;padding:10px 12px">
        <div style="font-size:10px;color:var(--muted);margin-bottom:2px;font-family:var(--zh)">憿批恥</div>
        <div style="font-size:13px;font-weight:600">${o.customerName||'??}</div>
        <div style="font-size:11px;color:var(--muted)">${o.customerPhone||''}</div>
      </div>
      <div style="background:var(--surface2);border-radius:8px;padding:10px 12px">
        <div style="font-size:10px;color:var(--muted);margin-bottom:2px;font-family:var(--zh)">?</div>
        <div style="font-size:13px;font-weight:600;font-family:var(--mono);color:var(--purple)">${o.memberId||'閮芸恥'}</div>
        <div style="font-size:11px;color:var(--muted)">${o.memberName||''}</div>
      </div>
    </div>
    ${o.note?`<div style="background:rgba(217,119,6,.08);border:1px solid rgba(217,119,6,.2);border-radius:8px;padding:10px 12px;margin-bottom:12px;font-size:13px;color:var(--gold)">? ${o.note}</div>`:''}
    ${o.deliveryLocation?`<div style="background:var(--surface2);border-radius:8px;padding:8px 12px;margin-bottom:12px;font-size:12px;color:var(--text2)">?? ${o.deliveryLocation}${o.deliveryKm?` &nbsp;繚&nbsp; ? ${o.deliveryKm}km / ${o.deliveryDays}?亙`:''}</div>`:''}
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:14px">
      <thead>
        <tr style="background:var(--surface2)">
          <th style="text-align:left;padding:7px 8px;font-size:11px;color:var(--muted);font-weight:500;border-bottom:1px solid var(--border)">鉊芹葩鉊?鉆葡 / ??</th>
          <th style="text-align:center;padding:7px 8px;font-size:11px;color:var(--muted);font-weight:500;border-bottom:1px solid var(--border)">鉊董鉊葷鉊?/ ?賊?</th>
          <th style="text-align:right;padding:7px 8px;font-size:11px;color:var(--muted);font-weight:500;border-bottom:1px solid var(--border)">鉊?葷鉊?/ 撠?</th>
        </tr>
      </thead>
      <tbody>
        ${(o.items||[]).map(i=>`<tr>
          <td style="padding:8px;border-bottom:1px solid var(--border)">${i.name||''}</td>
          <td style="text-align:center;padding:8px;border-bottom:1px solid var(--border);color:var(--muted)">${i.qty}</td>
          <td style="text-align:right;padding:8px;border-bottom:1px solid var(--border);font-family:var(--mono);font-weight:600">NT$${i.price*i.qty}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-top:2px solid var(--border)">
      <span style="font-size:14px;font-weight:600;font-family:var(--zh)">閮蝮賡?憿?/span>
      <span style="font-size:20px;font-weight:700;font-family:var(--mono);color:var(--accent)">NT$${o.total||0}</span>
    </div>`;

  if(isPending){
    acts.innerHTML = `
      <button class="btn btn-accent" style="flex:1" onclick="markOrderDone('${o.id}')">??鉊Ｒ虞鉊腺鉊晤?鉆鉊芹腦鉆?鉊芹葩鉆? / 蝣箄?摰?</button>
      <button class="btn" style="background:var(--red);color:#fff;border:none" onclick="confirmDeleteOrder('${o.id}')">?? 鉊丞? / ?芾???/button>
      <button class="btn btn-ghost" onclick="closeModal('m-online-order')">鉊葩鉊?/button>`;
  } else {
    acts.innerHTML = `
      <button class="btn" style="background:var(--green);color:#fff;border:none" onclick="confirmReportOrder('${o.id}')">?? 閮?梯”</button>
      <button class="btn btn-ghost" onclick="revertOrderPending('${o.id}')">???????</button>
      <button class="btn btn-ghost" onclick="closeModal('m-online-order')">鉊葩鉊?/button>`;
  }
  openModal('m-online-order');
}

/* 蝣箄??芷閮嚗 Firebase嚗?/
function confirmDeleteOrder(orderId){
  const btn = document.getElementById('confirm-delete-btn');
  if(btn) btn.onclick = ()=>executeDeleteOrder(orderId);
  closeModal('m-online-order');
  openModal('m-confirm-delete');
}
async function executeDeleteOrder(orderId){
  closeModal('m-confirm-delete');
  // ?祆?蝘駁
  _onlineOrders = _onlineOrders.filter(o=>o.id!==orderId);
  const local = JSON.parse(localStorage.getItem('pos_online_orders')||'[]');
  localStorage.setItem('pos_online_orders', JSON.stringify(local.filter(o=>o.id!==orderId)));
  renderOnlineOrders(); updateOnlineBadge();
  // Firebase ?芷
  if(window._fbSet){
    try{ await window._fbSet(`shop/online_orders/${orderId}`, null); }
    catch(e){ console.warn('[POS] delete order Firebase fail:',e); }
  }
  showToast('鉊丞?鉊冢葉鉆鉊葉鉊??鉆鉊?葭鉊Ｒ?鉊??鉊冢腺 / 閮撌脣??,'ok');
}

/* 蝣箄?閮?梯”嚗蝘餉?甇瑕嚗?/
function confirmReportOrder(orderId){
  const btn = document.getElementById('confirm-report-btn');
  if(btn) btn.onclick = ()=>executeReportOrder(orderId);
  closeModal('m-online-order');
  openModal('m-confirm-report');
}
async function executeReportOrder(orderId){
  closeModal('m-confirm-report');
  const o = _onlineOrders.find(x=>x.id===orderId);
  if(!o){ showToast('?曆??啗??株???,'err'); return; }

  // 1. 閮?嗆?梯”嚗遣蝡?蝑?TX 閮?嚗ource 璅???online嚗?  const now = new Date();
  const tx = {
    id:       o.id,
    date:     now.toISOString(),
    source:   'online',
    memberId: o.memberId||null,
    items:    o.items||[],
    subtotal: o.total||0,
    total:    o.total||0,
  };
  const txList = getTx();
  // ?脫迫??閮
  if(!txList.find(t=>t.id===o.id)){
    txList.push(tx);
    saveTx(txList);
  }

  // 2. ?交??嚗宏?唾府?閮甇瑕嚗irebase嚗?  if(o.memberId && window._fbSet){
    try{
      await window._fbSet(`shop/members/${o.memberId}/orderHistory/${o.id}`, {
        ...o, reportedAt: now.toISOString()
      });
      // ?湔?蝯梯?
      if(window._fbGet){
        const mSnap = await window._fbGet(`shop/members/${o.memberId}`);
        if(mSnap && mSnap.val()){
          const m = mSnap.val();
          await window._fbSet(`shop/members/${o.memberId}/orderCount`, (m.orderCount||0)+1);
          await window._fbSet(`shop/members/${o.memberId}/totalSpent`, (m.totalSpent||0)+(o.total||0));
        }
      }
    }catch(e){ console.warn('[POS] reportOrder member update fail:',e); }
  }

  // 3. 璅?閮??reported
  const ord = _onlineOrders.find(x=>x.id===orderId);
  if(ord) ord.status = 'reported';
  if(window._fbSet){
    try{ await window._fbSet(`shop/online_orders/${orderId}/status`, 'reported'); }
    catch(e){}
  }

  renderOnlineOrders(); updateOnlineBadge();
  showToast('閮?梯”摰?嚗? 撌脰??乩??亙銵???','ok');
}

async function markOrderDone(orderId){
  await updateOrderStatus(orderId,'done');
  closeModal('m-online-order');
  showToast('鉊Ｒ虞鉊腺鉊晤?鉊冢葉鉆鉊葉鉊??鉆鉊?葭鉊Ｒ?鉊??鉊冢腺 / 閮撌脣???,'ok');
}
async function revertOrderPending(orderId){
  await updateOrderStatus(orderId,'pending');
  closeModal('m-online-order');
  showToast('鉊虞鉊葵鉊葡鉊萼鉆鉊?鉊腦鉊冢?鉊喪?鉊葩鉊?鉊耜腦 / 撌脤????','ok');
}
async function updateOrderStatus(orderId,status){
  const o=_onlineOrders.find(x=>x.id===orderId);
  if(o) o.status=status;
  renderOnlineOrders(); updateOnlineBadge();
  if(window._fbSet){
    try{ await window._fbSet(`shop/online_orders/${orderId}/status`,status); }
    catch(e){ console.warn('[POS] updateOrderStatus Firebase fail:',e); }
  }
}

/* ??” */
async function ooOpenMemberList(){
  const body = document.getElementById('member-list-body');
  if(!body) return;
  body.innerHTML = `<div style="text-align:center;padding:20px;color:var(--muted2)">鉊董鉊丞萵鉊?鉊徇艇鉊?/ 頛銝凌?/div>`;
  openModal('m-member-list');

  let members = {};
  // 敺?Firebase 霈??shop/members
  if(window._fbGet){
    try{
      const snap = await window._fbGet('shop/members');
      if(snap && snap.val()) members = snap.val();
    }catch(e){ console.warn('[POS] load members fail:',e); }
  }
  // 敺??桐葉鋆?瘝? Firebase 閮?????  _onlineOrders.filter(o=>o.memberId && !members[o.memberId]).forEach(o=>{
    members[o.memberId] = { memberId:o.memberId, name:o.memberName||o.customerName||'??, phone:o.customerPhone||'', orderCount:0, totalSpent:0 };
  });

  const list = Object.values(members).sort((a,b)=>(a.memberId||'').localeCompare(b.memberId||''));
  if(!list.length){
    body.innerHTML = `<div style="text-align:center;padding:20px;color:var(--muted2);font-family:var(--zh)">撠?鞈?</div>`;
    return;
  }

  body.innerHTML = list.map(m=>{
    const orderCount = _onlineOrders.filter(o=>o.memberId===m.memberId).length;
    return `<div onclick="ooOpenMemberHistory('${m.memberId}')" style="
      display:grid;grid-template-columns:auto 1fr auto;gap:6px 12px;align-items:center;
      padding:12px 14px;border-bottom:1px solid var(--border);cursor:pointer;transition:background .15s;
    " onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
      <div style="font-family:var(--mono);font-size:12px;font-weight:700;color:var(--purple);
        background:rgba(124,58,237,.08);border-radius:6px;padding:4px 8px">${m.memberId||'??}</div>
      <div>
        <div style="font-size:13px;font-weight:600;color:var(--text)">${m.name||'??}</div>
        <div style="font-size:11px;color:var(--muted)">${m.phone||''}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:13px;font-weight:700;color:var(--accent);font-family:var(--mono)">NT$${m.totalSpent||0}</div>
        <div style="font-size:10px;color:var(--muted2)">${orderCount} 鉊冢葉鉆鉊葉鉊??</div>
      </div>
    </div>`;
  }).join('');
}

/* ?閮甇瑕 */
async function ooOpenMemberHistory(memberId){
  closeModal('m-member-list');
  const titleEl = document.getElementById('mh-title');
  const body    = document.getElementById('mh-body');
  if(!body) return;
  if(titleEl) titleEl.innerHTML = `?? 鉊腦鉊啤葷鉊晤?鉊毯葉鉊冢?鉊葉鉊?? <span style="font-family:var(--mono);color:var(--purple)">${memberId}</span>`;
  body.innerHTML = `<div style="text-align:center;padding:20px;color:var(--muted2)">鉊董鉊丞萵鉊?鉊徇艇鉊?/div>`;
  openModal('m-member-history');

  // 敺璈??桅?瞈?  const memberOrders = _onlineOrders.filter(o=>o.memberId===memberId)
    .sort((a,b)=>new Date(b.date)-new Date(a.date));

  // 敺?Firebase 霈??orderHistory
  let historyOrders = [];
  if(window._fbGet){
    try{
      const snap = await window._fbGet(`shop/members/${memberId}/orderHistory`);
      if(snap && snap.val()){
        historyOrders = Object.values(snap.val()).filter(o=>o&&o.id)
          .filter(o=>!memberOrders.find(mo=>mo.id===o.id)); // ?駁?
      }
    }catch(e){}
  }

  const allOrders = [...memberOrders, ...historyOrders]
    .sort((a,b)=>new Date(b.date)-new Date(a.date));

  if(!allOrders.length){
    body.innerHTML = `<div style="text-align:center;padding:30px;color:var(--muted2);font-family:var(--zh)">甇斗??∪??∟??株???/div>`;
    return;
  }

  const totalSpent = allOrders.reduce((s,o)=>s+(o.total||0),0);
  body.innerHTML = `
    <div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap">
      <div style="background:var(--surface2);border-radius:8px;padding:10px 16px;flex:1;text-align:center">
        <div style="font-size:20px;font-weight:700;color:var(--accent);font-family:var(--mono)">NT$${totalSpent}</div>
        <div style="font-size:11px;color:var(--muted);font-family:var(--zh)">蝝航?瘨祥</div>
      </div>
      <div style="background:var(--surface2);border-radius:8px;padding:10px 16px;flex:1;text-align:center">
        <div style="font-size:20px;font-weight:700;color:var(--purple)">${allOrders.length}</div>
        <div style="font-size:11px;color:var(--muted);font-family:var(--zh)">閮蝮賣</div>
      </div>
    </div>
    ${allOrders.map(o=>{
      const status = o.status||'pending';
      const statusColor = status==='pending'?'var(--red)':status==='done'?'var(--green)':'var(--muted)';
      const statusLabel = status==='pending'?'??敺???:status==='done'?'??撌脣???:'?? 撌脰???;
      return `<div style="border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;flex-wrap:wrap;gap:6px">
          <span style="font-family:var(--mono);font-size:11px;color:var(--accent)">${o.id}</span>
          <span style="font-size:11px;font-weight:600;color:${statusColor}">${statusLabel}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div style="font-size:11px;color:var(--muted2)">${fmtDateTh(o.date)}</div>
          <div style="font-family:var(--mono);font-weight:700;color:var(--text)">NT$${o.total||0}</div>
        </div>
        <div style="font-size:12px;color:var(--text2);margin-top:4px">${(o.items||[]).slice(0,3).map(i=>i.name).join('??)}${(o.items||[]).length>3?` +${(o.items||[]).length-3}...`:''}</div>
        ${o.note?`<div style="font-size:11px;color:var(--gold);margin-top:3px">? ${o.note}</div>`:''}
      </div>`;
    }).join('')}`;
}

// ?? fbPullAll ?游? ??
window._fbPullAllExtended = true;
const _origFbPullAllRef = { fn: null };
document.addEventListener('DOMContentLoaded', () => {
  if (typeof fbPullAll === 'function') {
    _origFbPullAllRef.fn = fbPullAll;
    window.fbPullAll = async function() {
      if (_origFbPullAllRef.fn) await _origFbPullAllRef.fn();
      await loadOnlineOrders();
      listenOnlineOrders();
    };
  }
});

/* ??????????????????????????????????????????????
   POS PWA嚗ervice Worker + 摰? + ?Ｙ??菜葫
?????????????????????????????????????????????? */
let _posInstallPrompt = null;
let _posSwReg         = null;
let _posSwRefreshing  = false;

function initPosPWA() {
  // ?? Service Worker 閮餃? ??
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./pos-sw.js', { scope: './' })
      .then(reg => {
        _posSwReg = reg;
        console.log('[POS-SW] registered:', reg.scope);

        // ?菜葫?啁???        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              document.getElementById('pwa-update-bar')?.classList.add('show');
            }
          });
        });

        // 撌脫?蝑?銝剔??啁?
        if (reg.waiting && navigator.serviceWorker.controller) {
          document.getElementById('pwa-update-bar')?.classList.add('show');
        }
      })
      .catch(e => console.warn('[POS-SW] registration failed:', e));

    // ?啁? SW ?亦恣敺??reload
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!_posSwRefreshing) { _posSwRefreshing = true; location.reload(); }
    });
  }

  // ?? ?Ｙ? / 銝??菜葫 ??
  const offBar = document.getElementById('pwa-offline-bar');
  function updateOnline() {
    if (!offBar) return;
    offBar.classList.toggle('show', !navigator.onLine);
  }
  window.addEventListener('online',  updateOnline);
  window.addEventListener('offline', updateOnline);
  updateOnline();

  // ?? Android 摰??內 ??
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    _posInstallPrompt = e;
    if (!sessionStorage.getItem('pos-pwa-dismissed')) {
      document.getElementById('pwa-install-bar')?.classList.add('show');
    }
  });
  window.addEventListener('appinstalled', () => {
    document.getElementById('pwa-install-bar')?.classList.remove('show');
    _posInstallPrompt = null;
    showToast('鉊葩鉊?鉊晤?鉊?POS App 鉊芹董鉆鉊??鉊??? / 撌脣?鋆?POS App嚗?, 'ok');
  });
}

function posApplyUpdate() {
  if (_posSwReg?.waiting) {
    _posSwReg.waiting.postMessage({ type: 'SKIP_WAITING' });
  } else {
    location.reload();
  }
}
function posInstallPWA() {
  if (!_posInstallPrompt) return;
  _posInstallPrompt.prompt();
  _posInstallPrompt.userChoice.then(() => {
    _posInstallPrompt = null;
    document.getElementById('pwa-install-bar')?.classList.remove('show');
  });
}
function posInstallDismiss() {
  document.getElementById('pwa-install-bar')?.classList.remove('show');
  sessionStorage.setItem('pos-pwa-dismissed', '1');
}

// ?? ?? PWA ??
initPosPWA();

/* 蝻箄疏?? ??璇Ⅳ?? */
function toggleBcOos(bc){
  const prods = getProds();
  if(!prods[bc]) return;
  prods[bc].outOfStock = !prods[bc].outOfStock;
  saveProds(prods);
  syncOosToFirebase();
  renderProdGrid();
  showToast(prods[bc].outOfStock ? `蝻箄疏璅?嚗?{prods[bc].name}` : `鋆疏?Ｗ儔嚗?{prods[bc].name}`, prods[bc].outOfStock?'err':'ok');
}

/* 蝻箄疏?? ???⊥?蝣澆???*/
function toggleNobcOos(idx){
  const prods = getNobcProds();
  if(!prods[idx]) return;
  prods[idx].outOfStock = !prods[idx].outOfStock;
  saveNobcProds(prods);
  syncOosToFirebase();
  renderProdGrid();
  showToast(prods[idx].outOfStock ? `蝻箄疏璅?嚗?{prods[idx].name}` : `鋆疏?Ｗ儔嚗?{prods[idx].name}`, prods[idx].outOfStock?'err':'ok');
}

/* 蝡撠撩鞎冽??桀?甇亥 Firebase shop/outOfStock */
async function syncOosToFirebase(){
  if(!window._fbSet) return;
  try {
    const prods    = getProds();
    const nobcProds = getNobcProds();
    // ?園???撩鞎典??? id嚗?蝣?or nobc id嚗?    const oosMap = {};
    Object.entries(prods).forEach(([bc,p])=>{
      if(p.outOfStock) oosMap[bc] = { name:p.name, type:'barcode' };
    });
    nobcProds.forEach(p=>{
      if(p.outOfStock && p.id) oosMap[p.id] = { name:p.name, type:'nobc' };
    });
    await window._fbSet('shop/outOfStock', oosMap);
    // ???湔 meta.updatedAt 霈?Shop 蝡舀??亙??霈?
    await window._fbSet('shop/meta/updatedAt', new Date().toISOString());
  } catch(e){ console.warn('[POS] syncOosToFirebase fail:',e); }
}
// ???????園??堆??芸?????刻撓?交?
const _origShowPage = showPage;
window.showPage = function(id, btn){
  _origShowPage(id, btn);
  if(id==='pos') setTimeout(focusHwIfNeeded, 150);
};
Object.assign(window, { getCatLabel, getCatIcon, buildCatOptions, _openIDB, _getSavedHandle, _saveHandle, _readFile, _writeFile, _loadFromFile, _scheduleSave, setFileStatus, initPersistence, pickDataFile, getRawProdOrder, getProdOrder, saveProdOrder, saveProds, getNobcProds, saveNobcProds, getTx, saveTx, h, jsArg, checkEAN13, startDecodeLoop, useNative, useZXing, useZXingCanvas, onCode, stopScanner, saveNewProduct, changeQty, editQty, openNumpad, closeNumpad, npKey, npDel, npConfirm, addToCart, removeItem, clearCart, renderCart, openNobcList, renderNobcListModal, addNobcProdToCart, openTempNobc, saveTempNobc, savePermNobcProduct, editNobcProd, delNobcProd, moveNobcProd, closeReview, confirmCheckout, renderProdGrid, _resetProdCat, saveAddProduct, openEditProd, saveEditProduct, delProduct, moveBarcodeProduct, exportProducts, importProducts, clearAllProducts, renderMonthly, renderWeekly, renderDaily, showDrilldown, exportCSV, importReport, clearAllData, closeModal, showToast, playBeep, fd, fm, downloadFile, parseCsvRow, switchScanMode, hwAppend, hwSubmit, initHwInput, onHwKeydown, onHwInput, onHwCompose, initHwCapture, focusHwCapture, refocusCapture, handleHwCode, flashHwInput, focusHwIfNeeded, blurHwInput, attachInnerScrollTop, initStaticScrollTops, amountToThai, holdCart, resumeHeld, deleteHeld, renderHoldBar, setFbStatus, setFbModalStatus, loadFbConfigToModal, saveFirebaseConfig, clearFirebaseConfig, fbPullAll, fbListenAll, fbScheduleSave, waitFbReady, fmtDateTh, loadOnlineOrders, listenOnlineOrders, updateOnlineBadge, ooSetFilter, renderOnlineOrders, openOnlineOrder, confirmDeleteOrder, executeDeleteOrder, confirmReportOrder, executeReportOrder, markOrderDone, revertOrderPending, updateOrderStatus, ooOpenMemberList, ooOpenMemberHistory, initPosPWA, posApplyUpdate, posInstallPWA, posInstallDismiss, toggleBcOos, toggleNobcOos, syncOosToFirebase });

