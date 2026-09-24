/* ============================================================
 *  사용 환경 판별: PC / 모바일
 *  <html data-device="pc|mobile"> 을 붙여 CSS가 환경에 맞는 레이아웃을 고르게 합니다.
 *  - 자동: 화면 너비가 1024px 이상이거나, 860px 이상이면서 마우스(정밀 포인터)를 쓰면 PC
 *  - 수동: localStorage 'planner_layout' = 'pc' | 'mobile' (플래너 ⋯ 메뉴 → 화면 보기)
 *  <head>에서 가장 먼저 불러와 화면이 깜빡이지 않게 합니다.
 * ============================================================ */
(function(){
  const KEY="planner_layout";
  const html=document.documentElement;
  const pref=()=>{ try{ return localStorage.getItem(KEY)||"auto"; }catch(_){ return "auto"; } };
  function detect(){
    const p=pref(); if(p==="pc"||p==="mobile") return p;
    const w=window.innerWidth||html.clientWidth;
    const fine=window.matchMedia && matchMedia("(pointer:fine)").matches;
    return (w>=1024 || (w>=860 && fine))? "pc" : "mobile";
  }
  const listeners=[];
  function apply(){
    const d=detect();
    if(html.getAttribute("data-device")!==d){
      html.setAttribute("data-device", d);
      listeners.forEach(fn=>{ try{ fn(d); }catch(e){ console.error(e); } });
    }
  }
  let t=null;
  window.addEventListener("resize", ()=>{ clearTimeout(t); t=setTimeout(apply,150); });
  window.addEventListener("orientationchange", apply);
  // 다른 창(플래너 ↔ 학습앱)에서 설정을 바꾸면 따라감
  window.addEventListener("storage", e=>{ if(e.key===KEY) apply(); });
  apply();
  window.Device={
    get:()=>html.getAttribute("data-device"),
    pref,
    set(p){ try{ if(p==="auto") localStorage.removeItem(KEY); else localStorage.setItem(KEY,p); }catch(_){} apply(); },
    onChange(fn){ listeners.push(fn); },
  };
})();
