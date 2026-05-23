// Firebase 閮剖?嚗?? localStorage嚗靘踹???獢?嚗????券?閮剛身摰?  const FB_CFG_KEY = 'pos_firebase_cfg';
  const FB_DEFAULT = {
    apiKey:            "AIzaSyCXL_BPUqT5UA2Ufxo8Byulm6-ATNxTr4c",
    authDomain:        "mico1-72831.firebaseapp.com",
    databaseURL:       "https://mico1-72831-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId:         "mico1-72831",
    storageBucket:     "mico1-72831.firebasestorage.app",
    messagingSenderId: "706559929324",
    appId:             "1:706559929324:web:05cf28d33b9f770d332ec9",
  };

  let cfg;
  try { cfg = JSON.parse(localStorage.getItem(FB_CFG_KEY) || 'null'); } catch(e) {}
  // 瘝? localStorage 閮剖???雿輻?身閮剖?
  if (!cfg || !cfg.databaseURL) cfg = FB_DEFAULT;

  try {
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js");
    const { getDatabase, ref, set, get, onValue, off } = await import("https://www.gstatic.com/firebasejs/12.13.0/firebase-database.js");

    const app = initializeApp(cfg, 'pos-app');
    const db  = getDatabase(app);

    window._fbDb      = db;
    window._fbRef     = (path) => ref(db, path);
    window._fbSet     = (path, val) => set(ref(db, path), val);
    window._fbGet     = (path) => get(ref(db, path));
    window._fbOnValue = (path, cb, errCb) => onValue(ref(db, path), cb, errCb);
    window._fbOff     = (refObj) => off(refObj);
    window._fbReady   = true;
    document.dispatchEvent(new Event('firebase-ready'));
  } catch(e) {
    console.error('[POS Firebase init]', e);
    window._fbNeedSetup = true;
    document.dispatchEvent(new Event('firebase-ready'));
  }
