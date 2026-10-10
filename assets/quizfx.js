/* ============================================================
 *  🎉 학습 퀴즈 효과 (그래머인사이드 · 영단어 · 천문장 공용)
 *  - 정답: 맑은 '띵동' 소리 · 초록빛 번쩍 · 반짝이 · "정답!" · 연속으로 맞히면 소리가 점점 높아지고 🔥콤보
 *  - 오답: 낮은 '뿌부' 소리 · 화면이 흔들흔들 · 빨간 번쩍 · 진동
 *  - 소리는 파일 없이 Web Audio로 만들어요. 움직임 줄이기 설정이면 흔들림 · 반짝이는 빼요
 *  쓰는 법: QuizFX.answer(맞았나, {el: 누른 버튼, sound: 소리 켜짐 여부})
 *          QuizFX.finish(정답률 0~100)  — 한 세트를 끝냈을 때 팡파르
 * ============================================================ */
(function(){
  const reduce=window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  let ac=null, bus=null, streak=0, css=false;
  const ctx=()=>{
    try{
      if(!ac){
        ac=new (window.AudioContext||window.webkitAudioContext)();
        const comp=ac.createDynamicsCompressor(); comp.threshold.value=-12; comp.ratio.value=4; comp.attack.value=.003; comp.release.value=.15;
        const out=ac.createGain(); out.gain.value=.9; comp.connect(out).connect(ac.destination); bus=comp;
      }
      if(ac.state==="suspended") ac.resume();
    }catch(_){ ac=null; }
    return ac;
  };
  // 종 · 실로폰처럼: 배음(1 · 2.76 · 5.4배)을 겹쳐 두드린 소리
  function bell(f, t, vol, dur){
    const c=ac;
    [[1,1],[2.76,.35],[5.4,.12]].forEach(([m,a])=>{
      const o=c.createOscillator(), g=c.createGain(); o.type="sine"; o.frequency.setValueAtTime(f*m, t);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol*a, t+.004); g.gain.exponentialRampToValueAtTime(.0008, t+dur*(m>1? .5 : 1));
      o.connect(g).connect(bus); o.start(t); o.stop(t+dur+.05);
    });
  }
  function buzz(f0, f1, t, dur, vol){
    const c=ac, o=c.createOscillator(), o2=c.createOscillator(), g=c.createGain(), lp=c.createBiquadFilter();
    o.type="sawtooth"; o2.type="square"; lp.type="lowpass"; lp.frequency.value=900;
    o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f1, t+dur);
    o2.frequency.setValueAtTime(f0*1.01, t); o2.frequency.linearRampToValueAtTime(f1*1.01, t+dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t+.01); g.gain.setValueAtTime(vol, t+dur*.7); g.gain.exponentialRampToValueAtTime(.0008, t+dur);
    o.connect(lp); o2.connect(lp); lp.connect(g).connect(bus); o.start(t); o2.start(t); o.stop(t+dur+.02); o2.stop(t+dur+.02);
  }
  function thud(t, vol){
    const c=ac, o=c.createOscillator(), g=c.createGain();
    o.type="sine"; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t+.15);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t+.2);
    o.connect(g).connect(bus); o.start(t); o.stop(t+.22);
  }
  const NOTE=n=>440*Math.pow(2,(n-69)/12);
  function okSound(k){
    if(!ctx()) return; const t=ac.currentTime+.01, up=Math.min(k-1,7);       // 연속 정답일수록 반음씩 올라가요
    bell(NOTE(84+up), t, .32, .45); bell(NOTE(88+up), t+.09, .3, .6);
    if(k>0 && k%5===0){ bell(NOTE(91+up), t+.18, .28, .7); bell(NOTE(96+up), t+.27, .26, .9); }   // 5 · 10 · 15… 콤보 팡파르
  }
  function noSound(){
    if(!ctx()) return; const t=ac.currentTime+.01;
    thud(t, .5); buzz(220, 200, t, .16, .16); buzz(165, 130, t+.19, .3, .16);
  }
  function fanfare(acc){
    if(!ctx()) return; const t=ac.currentTime+.02;
    const seq= acc>=80? [72,76,79,84,88] : acc>=50? [72,76,79,84] : [72,74,76];
    seq.forEach((n,i)=>bell(NOTE(n), t+i*.11, .3, .7+(i===seq.length-1? .6 : 0)));
  }
  /* ----- 화면 효과 ----- */
  function addCss(){
    if(css) return; css=true;
    const st=document.createElement("style");
    st.textContent=`
@keyframes qfxShake{0%,100%{transform:translate(0,0)}15%{transform:translate(-9px,2px) rotate(-.6deg)}30%{transform:translate(8px,-2px) rotate(.5deg)}45%{transform:translate(-6px,1px)}60%{transform:translate(5px,-1px)}75%{transform:translate(-3px,0)}90%{transform:translate(2px,0)}}
.qfx-shake{animation:qfxShake .42s cubic-bezier(.36,.07,.19,.97)}
.qfx-flash{position:fixed;inset:0;z-index:2147483000;pointer-events:none;opacity:0;animation:qfxFlash .5s ease-out forwards}
.qfx-flash.ok{background:radial-gradient(ellipse at center,rgba(74,222,128,0) 45%,rgba(74,222,128,.38) 100%)}
.qfx-flash.no{background:radial-gradient(ellipse at center,rgba(239,68,68,0) 40%,rgba(239,68,68,.42) 100%)}
@keyframes qfxFlash{0%{opacity:0}20%{opacity:1}100%{opacity:0}}
.qfx-pop{animation:qfxPop .35s cubic-bezier(.3,1.6,.5,1)}
@keyframes qfxPop{0%{transform:scale(1)}40%{transform:scale(1.09)}100%{transform:scale(1)}}
.qfx-word{position:fixed;z-index:2147483001;pointer-events:none;font:900 26px/1 system-ui,-apple-system,"Apple SD Gothic Neo",sans-serif;color:#16a34a;text-shadow:0 2px 0 #fff,0 0 12px rgba(255,255,255,.9);transform:translate(-50%,-50%);animation:qfxWord .9s cubic-bezier(.2,.9,.3,1) forwards;white-space:nowrap}
.qfx-word.no{color:#dc2626}.qfx-word.combo{color:#ea580c;font-size:30px}
@keyframes qfxWord{0%{opacity:0;transform:translate(-50%,-30%) scale(.5)}20%{opacity:1;transform:translate(-50%,-60%) scale(1.15)}70%{opacity:1;transform:translate(-50%,-110%) scale(1)}100%{opacity:0;transform:translate(-50%,-150%) scale(.95)}}
.qfx-spark{position:fixed;z-index:2147483001;pointer-events:none;width:9px;height:9px;border-radius:2px;transform:translate(-50%,-50%);animation:qfxSpark .7s ease-out forwards}
@keyframes qfxSpark{0%{opacity:1;transform:translate(-50%,-50%) rotate(0) scale(1)}100%{opacity:0;transform:translate(calc(-50% + var(--dx)),calc(-50% + var(--dy))) rotate(220deg) scale(.4)}}
@media (prefers-reduced-motion:reduce){.qfx-shake,.qfx-pop{animation:none}}`;
    document.head.appendChild(st);
  }
  const centerOf=el=>{ if(el && el.getBoundingClientRect){ const r=el.getBoundingClientRect(); if(r.width) return {x:r.left+r.width/2, y:r.top+r.height/2}; } return {x:innerWidth/2, y:innerHeight*.42}; };
  function flash(kind){ const f=document.createElement("div"); f.className="qfx-flash "+kind; document.body.appendChild(f); setTimeout(()=>f.remove(), 560); }
  function word(text, p, cls){ const w=document.createElement("div"); w.className="qfx-word "+(cls||""); w.textContent=text; w.style.left=p.x+"px"; w.style.top=p.y+"px"; document.body.appendChild(w); setTimeout(()=>w.remove(), 950); }
  function sparks(p, n){
    if(reduce) return;
    const C=["#fde047","#4ade80","#38bdf8","#f472b6","#fb923c"];
    for(let i=0;i<n;i++){ const s=document.createElement("i"); s.className="qfx-spark"; const a=Math.random()*Math.PI*2, d=40+Math.random()*70;
      s.style.left=p.x+"px"; s.style.top=p.y+"px"; s.style.background=C[i%C.length];
      s.style.setProperty("--dx",(Math.cos(a)*d).toFixed(0)+"px"); s.style.setProperty("--dy",(Math.sin(a)*d).toFixed(0)+"px");
      document.body.appendChild(s); setTimeout(()=>s.remove(), 750); }
  }
  function shake(){
    if(reduce) return;
    const t=document.querySelector("#app, main, .app, .wrap, .container")||document.body;   // 고정 메뉴는 빼고 내용만 흔들어요
    t.classList.remove("qfx-shake"); void t.offsetWidth; t.classList.add("qfx-shake"); setTimeout(()=>t.classList.remove("qfx-shake"), 460);
  }
  function pop(el){ if(!el || reduce) return; el.classList.remove("qfx-pop"); void el.offsetWidth; el.classList.add("qfx-pop"); setTimeout(()=>el.classList.remove("qfx-pop"), 380); }
  const vib=p=>{ try{ navigator.vibrate && navigator.vibrate(p); }catch(_){} };

  function answer(ok, o){
    o=o||{}; addCss();
    if(!o.el && lastEl && document.body.contains(lastEl)) o.el=lastEl;
    const p=centerOf(o.el), sound=o.sound!==false;
    if(ok){
      streak++;
      if(sound) okSound(streak);
      flash("ok"); pop(o.el); sparks(p, streak%5===0? 22 : 10); vib(15);
      word(streak>=3? `🔥 ${streak}연속!` : "정답!", {x:p.x, y:p.y-10}, streak>=3? "combo" : "");
    }else{
      streak=0;
      if(sound) noSound();
      flash("no"); shake(); vib([60,40,60]);
      word("앗, 틀렸어!", {x:p.x, y:p.y-10}, "no");
    }
  }
  function finish(acc, o){
    o=o||{}; addCss();
    if(o.sound!==false) fanfare(acc||0);
    if(acc>=50){ const p={x:innerWidth/2, y:innerHeight*.35}; sparks(p, 30); setTimeout(()=>sparks({x:innerWidth*.3, y:innerHeight*.4}, 16), 180); setTimeout(()=>sparks({x:innerWidth*.7, y:innerHeight*.4}, 16), 320); }
    streak=0;
  }
  // 버튼을 처음 누를 때 소리를 켜 둬요 (휴대폰은 터치해야 소리가 나요)
  let lastEl=null;                                                     // 방금 누른 버튼 (그 자리에서 반짝여요)
  ["pointerdown","keydown"].forEach(t=>addEventListener(t, e=>{ if(t==="pointerdown") lastEl=e.target && e.target.closest? (e.target.closest("button,.choice,[data-v],input,li,.opt")||e.target) : null; if(ac && ac.state==="suspended") ac.resume(); }, {passive:true, capture:true}));
  window.QuizFX={answer, finish, get streak(){ return streak; }, reset(){ streak=0; }};
})();
