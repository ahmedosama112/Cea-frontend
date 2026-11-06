// تأكيد الخروج عند الضغط على زرار الرجوع (نوفمبر 2026 — طلب صاحب المشروع)
// - جوه APK الكابسيتور: لو إضافة App موجودة بنستخدم حدث backButton و exitApp.
// - على أندرويد (كروم 120+): CloseWatcher — زرار الرجوع بيقفله بدل ما يخرج، وكروم بيسمح بواحد
//   من غير أي لمسة، فالتأكيد بيشتغل من أول ما البرنامج يفتح.
// - غير كده (متصفحات أقدم): بنحط خطوة "حارسة" في الـ history، والرجوع بيشيلها فبنعرض التأكيد.
//   كروم بيتجاهل خطوات الـ history اللي اتحطت من غير لمسة من المستخدم، فبنحطها بعد أول لمسة.
// confirm() النظامي بيتكتم في الـ PWA، فالتأكيد نافذة جوه البرنامج.
(function(){
  'use strict';
  var GUARD = 'cea-exit-guard';
  var modal = null, armed = false, watcher = null, useWatcher = false;

  function watch(){
    try{
      if(watcher) return;
      watcher = new CloseWatcher();
      watcher.onclose = function(){ watcher = null; if(shown()) stay(); else ask(); };
    }catch(e){ watcher = null; }
  }
  function shown(){ return !!(modal && modal.style.display === 'flex'); }

  function capApp(){
    try{
      return (window.isCapacitor && window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) || null;
    }catch(e){ return null; }
  }

  function arm(){
    try{
      if(armed || (modal && modal.style.display === 'flex')) return; // ضغطة «نعم» متعملش خطوة جديدة
      if(!(history.state && history.state[GUARD])) history.pushState({[GUARD]:true}, '');
      armed = true;
    }catch(e){}
  }

  function hide(){ if(modal) modal.style.display = 'none'; }

  function build(){
    modal = document.createElement('div');
    modal.id = 'exit-confirm';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.55);display:none;align-items:center;justify-content:center;padding:16px';
    modal.innerHTML =
      '<div style="background:var(--card,#fff);color:inherit;border-radius:16px;padding:22px 18px 16px;max-width:320px;width:100%;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.35);direction:rtl">'
      + '<div style="font-size:34px;line-height:1">🚪</div>'
      + '<div style="font-size:17px;font-weight:800;margin:10px 0 18px">هل تريد الخروج من البرنامج؟</div>'
      + '<div style="display:flex;gap:10px">'
      + '<button type="button" id="exit-confirm-yes" style="flex:1;padding:11px;border:0;border-radius:10px;background:var(--red,#c62828);color:#fff;font:inherit;font-weight:800;cursor:pointer">نعم</button>'
      + '<button type="button" id="exit-confirm-no" style="flex:1;padding:11px;border:1px solid rgba(128,128,128,.4);border-radius:10px;background:transparent;color:inherit;font:inherit;font-weight:800;cursor:pointer">لا</button>'
      + '</div></div>';
    document.body.appendChild(modal);
    modal.querySelector('#exit-confirm-no').addEventListener('click', stay);
    modal.querySelector('#exit-confirm-yes').addEventListener('click', leave);
    modal.addEventListener('click', function(e){ if(e.target === modal) stay(); });
  }

  function ask(){
    try{
      if(!modal) build();
      modal.style.display = 'flex';
      if(useWatcher) watch(); // رجوع والرسالة مفتوحة = «لا»
      var no = modal.querySelector('#exit-confirm-no'); if(no) no.focus();
    }catch(e){}
  }

  function stay(){
    hide();
    if(useWatcher){ watch(); return; }
    armed = false;
    if(!capApp()) arm(); // نرجّع الخطوة الحارسة (الضغطة دي لمسة مستخدم فكروم بيقبلها)
  }

  function leave(){
    hide();
    var app = capApp();
    if(app && app.exitApp){ try{ app.exitApp(); return; }catch(e){} }
    if(watcher){ try{ watcher.destroy(); }catch(e){} watcher = null; }
    // الـ PWA: الخطوة الحارسة اتشالت خلاص — نحاول نقفل النافذة، ولو المتصفح منع ده
    // فضغطة الرجوع الجاية هتخرج على طول من غير سؤال.
    try{ window.close(); }catch(e){}
    setTimeout(function(){
      try{ if(typeof showToast === 'function') showToast('اضغط رجوع مرة كمان للخروج'); }catch(e){}
    }, 300);
  }

  try{
    var app = capApp();
    if(app && app.addListener){
      app.addListener('backButton', function(){
        if(modal && modal.style.display === 'flex') stay(); else ask();
      });
      return;
    }
  }catch(e){}

  try{
    var standalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
    // على الكمبيوتر CloseWatcher بيتقفل بزرار Esc — فبنستخدمه على الموبايل / التطبيق المثبّت بس
    if(typeof CloseWatcher === 'function' && (standalone || /Android/i.test(navigator.userAgent))){
      useWatcher = true;
      watch();
      return;
    }
  }catch(e){}

  window.addEventListener('popstate', function(){
    if(!armed) return;
    armed = false;
    ask();
  });
  ['pointerdown', 'keydown', 'touchstart'].forEach(function(ev){
    window.addEventListener(ev, arm, {capture:true, passive:true});
  });
})();
