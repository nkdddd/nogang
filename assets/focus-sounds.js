/* ============================================================
 *  집중 사운드 — 브라우저에서 직접 만든 배경음 (음원 파일·저작권 없음)
 *   rain  : 빗소리 (핑크·브라운 노이즈 + 빗방울)
 *   piano : 잔잔한 피아노 (C·Am·F·G 위에 5음계 선율 + 잔향)
 *   alpha : 알파파 바이노럴 비트 (왼쪽 200Hz · 오른쪽 210Hz → 10Hz, 이어폰 권장)
 *
 *  화면이 꺼져도 들리게:
 *   소리를 OfflineAudioContext로 미리 '끊김 없는 반복 구간' WAV로 만들어 <audio>로 재생합니다.
 *   휴대폰 브라우저는 <audio> 재생을 잠금 화면에서도 이어 주므로 (Web Audio는 멈춤)
 *   배경음이 계속 나오고, 재생 중 timeupdate 신호로 타이머 종료를 확인해 같은 <audio>로 알림음을 울립니다.
 *   배경음을 고르지 않았을 때는 거의 들리지 않는 소리로 재생을 유지해 끝 알림이 울리게 합니다.
 * ============================================================ */
window.FocusSound=(function(){
  const TRACKS={
    rain: {name:"빗소리",        emo:"🌧️", desc:"창밖에 비 오는 소리 · 잡음을 덮어 줘요"},
    piano:{name:"잔잔한 피아노", emo:"🎹", desc:"느리게 흐르는 가사 없는 피아노"},
    alpha:{name:"알파파",        emo:"🧠", desc:"10Hz 바이노럴 비트 · 이어폰 권장"},
  };
  const SR=22050;                       // 용량을 줄이려고 22kHz로 (배경음에 충분)
  const urls={}, buffers={}, rendering={};
  let el=null, cur=null, vol=0.6, previewT=null, fadeT=null, tickFns=[], actions={};

  /* ---------- 오프라인 렌더링 ---------- */
  function noise(ctx, kind, sec){
    const len=Math.floor(ctx.sampleRate*sec), buf=ctx.createBuffer(2,len,ctx.sampleRate);
    for(let ch=0;ch<2;ch++){
      const d=buf.getChannelData(ch);
      let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0,last=0;
      for(let i=0;i<len;i++){
        const w=Math.random()*2-1;
        if(kind==="brown"){ last=(last+0.02*w)/1.02; d[i]=last*3.5; }
        else if(kind==="pink"){
          b0=0.99886*b0+w*0.0555179; b1=0.99332*b1+w*0.0750759; b2=0.96900*b2+w*0.1538520;
          b3=0.86650*b3+w*0.3104856; b4=0.55000*b4+w*0.5329522; b5=-0.7616*b5-w*0.0168980;
          d[i]=(b0+b1+b2+b3+b4+b5+b6+w*0.5362)*0.11; b6=w*0.115926;
        } else d[i]=w;
      }
    }
    return buf;
  }
  function src(ctx, buf, gain, dest, t0){
    const s=ctx.createBufferSource(); s.buffer=buf;
    const g=ctx.createGain(); g.gain.value=gain; s.connect(g); g.connect(dest); s.start(t0||0); return g;
  }
  function reverb(ctx, sec){
    const len=Math.floor(ctx.sampleRate*sec), buf=ctx.createBuffer(2,len,ctx.sampleRate);
    for(let ch=0;ch<2;ch++){ const d=buf.getChannelData(ch); for(let i=0;i<len;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/len,2.6); }
    const c=ctx.createConvolver(); c.buffer=buf; return c;
  }
  const BUILD={
    // 🌧️ 20초 반복
    rain:{loop:20, tail:2, build(ctx, out, T){
      const lp=ctx.createBiquadFilter(); lp.type="lowpass"; lp.frequency.value=2600;
      const hp=ctx.createBiquadFilter(); hp.type="highpass"; hp.frequency.value=220;
      const body=ctx.createGain(); body.gain.value=0.55;
      lp.connect(hp); hp.connect(body); body.connect(out);
      src(ctx, noise(ctx,"pink",T), 0.9, lp);
      src(ctx, noise(ctx,"brown",T), 0.35, out);
      const lfo=ctx.createOscillator(), lg=ctx.createGain(); lfo.frequency.value=1/20; lg.gain.value=0.12;
      lfo.connect(lg); lg.connect(body.gain); lfo.start();
      const drop=noise(ctx,"white",0.05);
      for(let t=0.05;t<T;t+=0.04+Math.random()*0.18){
        const s=ctx.createBufferSource(); s.buffer=drop;
        const bp=ctx.createBiquadFilter(); bp.type="bandpass"; bp.frequency.value=2500+Math.random()*4000; bp.Q.value=8;
        const g=ctx.createGain(), a=0.04+Math.random()*0.08;
        g.gain.setValueAtTime(a,t); g.gain.exponentialRampToValueAtTime(0.0001,t+0.04);
        const pan=ctx.createStereoPanner(); pan.pan.value=Math.random()*2-1;
        s.connect(bp); bp.connect(g); g.connect(pan); pan.connect(out); s.start(t); s.stop(t+0.05);
      }
    }},
    // 🎹 48초 반복 (화음 4개 × 12초)
    piano:{loop:48, tail:4, build(ctx, out, T){
      const NOTES=[261.63,293.66,329.63,392.00,440.00,523.25,587.33,659.25,783.99];
      const CHORDS=[[130.81,196.00,329.63],[110.00,164.81,261.63],[87.31,130.81,220.00],[98.00,146.83,246.94]];
      const rv=reverb(ctx,3.2), wet=ctx.createGain(), dry=ctx.createGain(), bus=ctx.createGain();
      wet.gain.value=0.6; dry.gain.value=0.7; bus.gain.value=1.6;
      bus.connect(dry); dry.connect(out); bus.connect(rv); rv.connect(wet); wet.connect(out);
      const note=(f,t,v)=>{
        const g=ctx.createGain(); g.gain.setValueAtTime(0.0001,t);
        g.gain.exponentialRampToValueAtTime(v,t+0.012); g.gain.exponentialRampToValueAtTime(v*0.35,t+0.35);
        g.gain.exponentialRampToValueAtTime(0.0001,t+3.2);
        const lp=ctx.createBiquadFilter(); lp.type="lowpass"; lp.frequency.value=2200;
        [[1,"triangle",1],[2,"sine",0.35],[3,"sine",0.12]].forEach(([m,type,a])=>{
          const o=ctx.createOscillator(), og=ctx.createGain(); o.type=type; o.frequency.value=f*m; og.gain.value=a;
          o.connect(og); og.connect(lp); o.start(t); o.stop(t+3.3);
        });
        lp.connect(g); g.connect(bus);
      };
      const pad=ctx.createGain(); pad.gain.value=0.05; pad.connect(bus);
      CHORDS.forEach((ch,i)=>{
        const t=i*12;
        ch.forEach(f=>{
          const o=ctx.createOscillator(), g=ctx.createGain(); o.type="sine"; o.frequency.value=f;
          g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(1,t+2.5);
          g.gain.setValueAtTime(1,t+10.5); g.gain.linearRampToValueAtTime(0,t+13.5);
          o.connect(g); g.connect(pad); o.start(t); o.stop(t+14);
        });
        note(ch[0]*2, t+0.05, 0.12);
      });
      let last=4;
      for(let t=0.9;t<T-0.5;t+=1.2+Math.random()*1.8){
        last=Math.max(0,Math.min(NOTES.length-1,last+Math.round((Math.random()-0.5)*4)));
        note(NOTES[last], t, 0.09+Math.random()*0.05);
        if(Math.random()<0.25) note(NOTES[Math.max(0,last-2)], t+0.18, 0.06);
      }
    }},
    // 🧠 30초 반복 (200·210Hz 모두 정수 주기라 이음새 없음)
    alpha:{loop:30, tail:2, build(ctx, out, T){
      const merger=ctx.createChannelMerger(2), g=ctx.createGain(); g.gain.value=0.18;
      [[200,0],[210,1]].forEach(([f,ch])=>{ const o=ctx.createOscillator(); o.type="sine"; o.frequency.value=f; o.connect(merger,0,ch); o.start(); });
      merger.connect(g); g.connect(out);
      const lp=ctx.createBiquadFilter(); lp.type="lowpass"; lp.frequency.value=500; lp.connect(out);
      src(ctx, noise(ctx,"brown",T), 0.18, lp);
    }},
    // 🔔 끝 알림음 (반복 없음)
    chime:{loop:2.6, tail:0, build(ctx, out){
      [659.25,783.99,1046.5].forEach((f,i)=>{
        const o=ctx.createOscillator(), g=ctx.createGain(), t=0.05+i*0.18; o.type="sine"; o.frequency.value=f;
        g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(0.5,t+0.02); g.gain.exponentialRampToValueAtTime(0.0001,t+1.2);
        o.connect(g); g.connect(out); o.start(t); o.stop(t+1.3);
      });
    }},
    // 🤫 배경음 없이 타이머만 쓸 때 재생 유지용 (거의 들리지 않음)
    silent:{loop:10, tail:0, build(ctx, out, T){ src(ctx, noise(ctx,"white",T), 0.0004, out); }},
  };
  async function render(id){
    if(buffers[id]) return buffers[id];
    if(rendering[id]) return rendering[id];
    const B=BUILD[id], OAC=window.OfflineAudioContext||window.webkitOfflineAudioContext;
    if(!B||!OAC) return null;
    rendering[id]=(async()=>{
      const T=B.loop+B.tail, ctx=new OAC(2, Math.ceil(T*SR), SR);
      const out=ctx.createGain(); out.connect(ctx.destination);
      B.build(ctx, out, T);
      const buf=await ctx.startRendering();
      // 끝부분(tail)을 앞부분에 겹쳐 넣어 반복할 때 이음새가 들리지 않게 (등전력 크로스페이드)
      const L=Math.floor(B.loop*SR), X=Math.floor(B.tail*SR), res=[];
      for(let ch=0;ch<2;ch++){
        const d=buf.getChannelData(ch), o=new Float32Array(L);
        o.set(d.subarray(0,L));
        for(let i=0;i<X;i++){ const a=i/X; o[i]=d[i]*Math.sin(a*Math.PI/2)+d[L+i]*Math.cos(a*Math.PI/2); }
        res.push(o);
      }
      buffers[id]=res; return res;
    })();
    return rendering[id];
  }
  function wavURL(chs){
    const n=chs[0].length, data=new DataView(new ArrayBuffer(44+n*4));
    const w=(o,s)=>{ for(let i=0;i<s.length;i++) data.setUint8(o+i,s.charCodeAt(i)); };
    let peak=0.0001; chs.forEach(c=>{ for(let i=0;i<n;i++){ const v=Math.abs(c[i]); if(v>peak) peak=v; } });
    const k=peak>0.95? 0.95/peak : 1;     // 넘침 방지
    w(0,"RIFF"); data.setUint32(4,36+n*4,true); w(8,"WAVE"); w(12,"fmt "); data.setUint32(16,16,true);
    data.setUint16(20,1,true); data.setUint16(22,2,true); data.setUint32(24,SR,true); data.setUint32(28,SR*4,true);
    data.setUint16(32,4,true); data.setUint16(34,16,true); w(36,"data"); data.setUint32(40,n*4,true);
    let o=44;
    for(let i=0;i<n;i++) for(let ch=0;ch<2;ch++){ const v=Math.max(-1,Math.min(1,chs[ch][i]*k)); data.setInt16(o, v<0? v*0x8000 : v*0x7FFF, true); o+=2; }
    return URL.createObjectURL(new Blob([data],{type:"audio/wav"}));
  }
  async function prepare(id){
    if(urls[id]) return urls[id];
    const b=await render(id); if(!b) return null;
    urls[id]=urls[id]||wavURL(b); return urls[id];
  }
  // 타이머 화면에 들어오면 미리 만들어 둠 (누르는 순간 바로 재생되도록)
  function prepareAll(){ ["silent","chime","rain","piano","alpha"].reduce((p,id)=>p.then(()=>prepare(id)).catch(()=>{}), Promise.resolve()); }

  /* ---------- <audio> 재생 ---------- */
  function audio(){
    if(el) return el;
    el=document.createElement("audio");
    el.setAttribute("playsinline",""); el.preload="auto"; el.loop=true;
    el.addEventListener("timeupdate", ()=>tickFns.forEach(fn=>{ try{ fn(); }catch(e){ console.error(e); } }));
    document.body.appendChild(el);
    return el;
  }
  function fadeTo(target, ms){
    clearInterval(fadeT); const a=audio(), start=a.volume, steps=Math.max(1,Math.round(ms/50)); let i=0;
    fadeT=setInterval(()=>{ i++; try{ a.volume=Math.max(0,Math.min(1,start+(target-start)*i/steps)); }catch(_){} if(i>=steps) clearInterval(fadeT); },50);
  }
  function setSrc(id){
    const a=audio(), u=urls[id];
    if(!u) return false;
    if(a.dataset.id!==id){ a.src=u; a.dataset.id=id; }
    return true;
  }
  async function play(id){
    clearTimeout(previewT); previewT=null;
    const a=audio(), level=id==="silent"? 1 : vol;
    if(!urls[id]){ await prepare(id); }
    if(!setSrc(id)) return;
    cur=id; a.loop=true;
    if(a.paused){ try{ a.volume=0; }catch(_){} }
    const p=a.play(); if(p&&p.catch) p.catch(e=>console.warn("재생이 막혔어요", e));
    fadeTo(level, 900);
    updateSession();
  }
  function stop(){
    clearTimeout(previewT); previewT=null;
    if(!el||!cur) { cur=null; return; }
    cur=null; fadeTo(0,400);
    setTimeout(()=>{ if(!cur && el){ el.pause(); } updateSession(); },450);
  }
  function preview(id, sec){ play(id); previewT=setTimeout(()=>{ stop(); }, (sec||6)*1000); }
  function setVolume(v){ vol=Math.max(0,Math.min(1,Number(v)||0)); if(el && cur && cur!=="silent") try{ el.volume=vol; }catch(_){} }
  // 끝 알림: 같은 <audio>로 재생해 화면이 꺼져 있어도 울리게
  function chime(){
    const a=audio();
    if(!setSrc("chime")) return;
    cur=null; clearInterval(fadeT); a.loop=false; a.currentTime=0; try{ a.volume=1; }catch(_){}
    const p=a.play(); if(p&&p.catch) p.catch(()=>{});
    updateSession();
  }

  /* ---------- 잠금 화면 컨트롤 (Media Session) ---------- */
  let meta={title:"포커스 타이머"};
  function updateSession(){
    const ms=navigator.mediaSession; if(!ms) return;
    try{
      ms.metadata=new MediaMetadata({title:meta.title, artist:"우리집 학습플래너",
        album:cur&&TRACKS[cur]? TRACKS[cur].name : "집중 타이머"});
      ms.playbackState= el && !el.paused ? "playing" : "paused";
    }catch(_){}
  }
  function setMeta(m){ meta=Object.assign(meta,m||{}); updateSession(); }
  function setActions(h){
    actions=h||{}; const ms=navigator.mediaSession; if(!ms) return;
    ["play","pause","stop"].forEach(k=>{ try{ ms.setActionHandler(k, actions[k]||null); }catch(_){} });
  }

  return {TRACKS, play, stop, preview, setVolume, chime, prepareAll, setMeta, setActions,
    onTick:fn=>tickFns.push(fn), playing:()=>cur, unlock:()=>{ audio(); }, _debug:{buffers, urls, el:()=>el}};
})();
