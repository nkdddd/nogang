/* ============================================================
 *  집중 사운드 — 브라우저에서 직접 만들어 재생하는 배경음 (파일·저작권 없음)
 *   rain  : 빗소리 (핑크·브라운 노이즈 + 빗방울)
 *   piano : 잔잔한 피아노 (5음계로 천천히 흐르는 앰비언트 + 잔향)
 *   alpha : 알파파 바이노럴 비트 (왼쪽 200Hz · 오른쪽 210Hz → 10Hz, 이어폰 권장)
 * ============================================================ */
window.FocusSound=(function(){
  const TRACKS={
    rain: {name:"빗소리",        emo:"🌧️", desc:"창밖에 비 오는 소리 · 잡음을 덮어 줘요"},
    piano:{name:"잔잔한 피아노", emo:"🎹", desc:"느리게 흐르는 가사 없는 피아노"},
    alpha:{name:"알파파",        emo:"🧠", desc:"10Hz 바이노럴 비트 · 이어폰 권장"},
  };
  let ctx=null, master=null, cur=null, parts=[], timers=[], vol=0.6, previewT=null, pending=[];
  const kill=list=>list.forEach(n=>{ try{ if(n.stop) n.stop(); }catch(_){} try{ n.disconnect(); }catch(_){} });

  function ensure(){
    if(!ctx){
      const AC=window.AudioContext||window.webkitAudioContext; if(!AC) return null;
      ctx=new AC(); master=ctx.createGain(); master.gain.value=0; master.connect(ctx.destination);
    }
    if(ctx.state==="suspended") ctx.resume().catch(()=>{});
    return ctx;
  }
  const keep=n=>{ parts.push(n); return n; };
  function noiseBuf(kind, sec){
    const len=Math.floor(ctx.sampleRate*(sec||4)), buf=ctx.createBuffer(2,len,ctx.sampleRate);
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
  function loopNoise(kind, gain, dest){
    const s=keep(ctx.createBufferSource()); s.buffer=noiseBuf(kind,4); s.loop=true;
    const g=keep(ctx.createGain()); g.gain.value=gain;
    s.connect(g); g.connect(dest||master); s.start();
    return g;
  }
  function reverb(sec){
    const len=Math.floor(ctx.sampleRate*sec), buf=ctx.createBuffer(2,len,ctx.sampleRate);
    for(let ch=0;ch<2;ch++){ const d=buf.getChannelData(ch); for(let i=0;i<len;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/len,2.6); }
    const c=keep(ctx.createConvolver()); c.buffer=buf; return c;
  }

  // 🌧️ 빗소리
  function buildRain(){
    const lp=keep(ctx.createBiquadFilter()); lp.type="lowpass"; lp.frequency.value=2600;
    const hp=keep(ctx.createBiquadFilter()); hp.type="highpass"; hp.frequency.value=220;
    const body=keep(ctx.createGain()); body.gain.value=0.55;
    lp.connect(hp); hp.connect(body); body.connect(master);
    loopNoise("pink", 0.9, lp);
    loopNoise("brown", 0.35);                       // 낮게 울리는 빗줄기
    const lfo=keep(ctx.createOscillator()), lg=keep(ctx.createGain());   // 빗줄기 세기가 천천히 바뀜
    lfo.frequency.value=0.06; lg.gain.value=0.12; lfo.connect(lg); lg.connect(body.gain); lfo.start();
    const dropBuf=noiseBuf("white",0.05);
    const drop=()=>{                                // 창에 떨어지는 빗방울
      if(!ctx||cur!=="rain") return;
      const s=ctx.createBufferSource(); s.buffer=dropBuf;
      const bp=ctx.createBiquadFilter(); bp.type="bandpass"; bp.frequency.value=2500+Math.random()*4000; bp.Q.value=8;
      const g=ctx.createGain(), t=ctx.currentTime, a=0.04+Math.random()*0.08;
      g.gain.setValueAtTime(a,t); g.gain.exponentialRampToValueAtTime(0.0001,t+0.04);
      const pan=ctx.createStereoPanner? ctx.createStereoPanner() : null;
      s.connect(bp); bp.connect(g);
      if(pan){ pan.pan.value=Math.random()*2-1; g.connect(pan); pan.connect(master); } else g.connect(master);
      s.start(t); s.stop(t+0.05);
      timers.push(setTimeout(drop, 40+Math.random()*180));
    };
    drop();
  }

  // 🎹 잔잔한 피아노 (C장조 5음계)
  const NOTES=[261.63,293.66,329.63,392.00,440.00,523.25,587.33,659.25,783.99];
  const CHORDS=[[130.81,196.00,329.63],[110.00,164.81,261.63],[87.31,130.81,220.00],[98.00,146.83,246.94]]; // C Am F G
  function pianoNote(freq, when, velo, dest){
    const g=ctx.createGain(); g.gain.setValueAtTime(0.0001,when);
    g.gain.exponentialRampToValueAtTime(velo,when+0.012);
    g.gain.exponentialRampToValueAtTime(velo*0.35,when+0.35);
    g.gain.exponentialRampToValueAtTime(0.0001,when+3.2);
    const lp=ctx.createBiquadFilter(); lp.type="lowpass"; lp.frequency.value=2200;
    [[1,"triangle",1],[2,"sine",0.35],[3,"sine",0.12]].forEach(([m,type,a])=>{
      const o=ctx.createOscillator(), og=ctx.createGain(); o.type=type; o.frequency.value=freq*m; og.gain.value=a;
      o.connect(og); og.connect(lp); o.start(when); o.stop(when+3.3);
    });
    lp.connect(g); g.connect(dest);
  }
  function buildPiano(){
    const rv=reverb(3.2), wet=keep(ctx.createGain()), dry=keep(ctx.createGain()), bus=keep(ctx.createGain());
    wet.gain.value=0.6; dry.gain.value=0.7; bus.gain.value=1.6;
    bus.connect(dry); dry.connect(master); bus.connect(rv); rv.connect(wet); wet.connect(master);
    const pad=keep(ctx.createGain()); pad.gain.value=0.05; pad.connect(bus);
    let ci=0, padOsc=[];
    const chord=()=>{                               // 16초마다 바뀌는 낮은 화음
      if(!ctx||cur!=="piano") return;
      const t=ctx.currentTime;
      padOsc.forEach(o=>{ try{ o.g.gain.setTargetAtTime(0,t,1.2); o.o.stop(t+5); }catch(_){} });
      padOsc=CHORDS[ci%CHORDS.length].map(f=>{
        const o=ctx.createOscillator(), g=ctx.createGain(); o.type="sine"; o.frequency.value=f;
        g.gain.value=0; g.gain.setTargetAtTime(1,t,1.5); o.connect(g); g.connect(pad); o.start(t); return {o,g};
      });
      pianoNote(CHORDS[ci%CHORDS.length][0]*2, t+0.05, 0.12, bus);
      ci++;
      timers.push(setTimeout(chord,16000));
    };
    let last=4;
    const melody=()=>{                              // 1.2~3초 간격으로 가까운 음을 골라 흐르듯이
      if(!ctx||cur!=="piano") return;
      last=Math.max(0,Math.min(NOTES.length-1,last+Math.round((Math.random()-0.5)*4)));
      const t=ctx.currentTime+0.05;
      pianoNote(NOTES[last], t, 0.09+Math.random()*0.05, bus);
      if(Math.random()<0.25) pianoNote(NOTES[Math.max(0,last-2)], t+0.18, 0.06, bus);
      timers.push(setTimeout(melody, 1200+Math.random()*1800));
    };
    chord(); timers.push(setTimeout(melody,900));
  }

  // 🧠 알파파 (바이노럴 10Hz)
  function buildAlpha(){
    const merger=keep(ctx.createChannelMerger(2)), g=keep(ctx.createGain()); g.gain.value=0.18;
    [[200,0],[210,1]].forEach(([f,ch])=>{
      const o=keep(ctx.createOscillator()); o.type="sine"; o.frequency.value=f; o.connect(merger,0,ch); o.start();
    });
    merger.connect(g); g.connect(master);
    const lp=keep(ctx.createBiquadFilter()); lp.type="lowpass"; lp.frequency.value=500; lp.connect(master);
    loopNoise("brown", 0.18, lp);                  // 부드러운 바닥 소리
  }

  function teardown(){
    timers.forEach(clearTimeout); timers=[];
    kill(parts); parts=[];
    kill(pending); pending=[];          // 멈추는 중이던 소리도 바로 정리
  }
  function play(id){
    if(!TRACKS[id]) return stop();
    if(!ensure()) return;
    clearTimeout(previewT); previewT=null;
    if(cur===id) { master.gain.setTargetAtTime(vol*0.5,ctx.currentTime,0.4); return; }
    teardown(); cur=id;
    ({rain:buildRain, piano:buildPiano, alpha:buildAlpha})[id]();
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(0,ctx.currentTime);
    master.gain.setTargetAtTime(vol*0.5,ctx.currentTime,0.6);   // 1~2초에 걸쳐 서서히
  }
  function stop(){
    clearTimeout(previewT); previewT=null;
    if(!ctx||!cur) return;
    const was=cur; cur=null;
    master.gain.setTargetAtTime(0,ctx.currentTime,0.25);
    timers.forEach(clearTimeout); timers=[];
    const fading=parts; parts=[]; pending.push(...fading);
    setTimeout(()=>{ kill(fading); pending=pending.filter(n=>!fading.includes(n)); }, 1500);
    return was;
  }
  function preview(id, sec){ play(id); previewT=setTimeout(stop,(sec||6)*1000); }
  function setVolume(v){ vol=Math.max(0,Math.min(1,Number(v)||0)); if(ctx&&cur) master.gain.setTargetAtTime(vol*0.5,ctx.currentTime,0.1); }
  // 끝났을 때 알림음 (배경음과 별개)
  function chime(){
    if(!ensure()) return;
    const t=ctx.currentTime;
    [659.25,783.99,1046.5].forEach((f,i)=>{
      const o=ctx.createOscillator(), g=ctx.createGain(); o.type="sine"; o.frequency.value=f;
      g.gain.setValueAtTime(0.0001,t+i*0.18); g.gain.exponentialRampToValueAtTime(0.25,t+i*0.18+0.02);
      g.gain.exponentialRampToValueAtTime(0.0001,t+i*0.18+1.2);
      o.connect(g); g.connect(ctx.destination); o.start(t+i*0.18); o.stop(t+i*0.18+1.3);
    });
  }
  return {TRACKS, play, stop, preview, setVolume, chime, playing:()=>cur, unlock:ensure};
})();
