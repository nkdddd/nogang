/* 공용 디자인: 학습앱 아래쪽 메뉴의 이모지 아이콘을 플래너와 같은 선 아이콘으로 바꿉니다. */
(function(){
  const A='viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
  const I={
    home:`<svg ${A}><path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H5.5A1.5 1.5 0 0 1 4 19z"/></svg>`,
    doc:`<svg ${A}><rect x="5" y="3.5" width="14" height="17" rx="3"/><path d="M9 8.5h6M9 12h6M9 15.5h4"/></svg>`,
    book:`<svg ${A}><path d="M12 6.5C10 5 7.2 4.5 4 4.8v13.4c3.2-.3 6 .2 8 1.8 2-1.6 4.8-2.1 8-1.8V4.8c-3.2-.3-6 .2-8 1.7Z"/><path d="M12 6.5V20"/></svg>`,
    cards:`<svg ${A}><rect x="3.5" y="7" width="13" height="13" rx="2.5"/><path d="M7.5 4h10a3 3 0 0 1 3 3v10"/></svg>`,
    leaf:`<svg ${A}><path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14"/><path d="M5 19c3-4 6-7 10-9"/></svg>`,
    bars:`<svg ${A}><rect x="4" y="13" width="4" height="7" rx="1.2"/><rect x="10" y="9" width="4" height="11" rx="1.2"/><rect x="16" y="4" width="4" height="16" rx="1.2"/></svg>`,
    trophy:`<svg ${A}><path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7"/></svg>`,
    gear:`<svg ${A}><circle cx="12" cy="12" r="3"/><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M5.6 18.4l1.6-1.6M16.8 7.2l1.6-1.6"/></svg>`,
    people:`<svg ${A}><circle cx="9" cy="8.5" r="3"/><circle cx="17" cy="9.5" r="2.3"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5M14.5 14.6c.8-.4 1.6-.6 2.5-.6 2.2 0 3.8 1.5 4 4"/></svg>`,
    check:`<svg ${A}><rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="m8 12 3 3 5-6"/></svg>`,
  };
  const BY_LABEL=[
    [/^홈/,'home'], [/문장/,'doc'], [/문법|학습/,'book'], [/단어장/,'cards'], [/어근/,'leaf'], [/암기/,'cards'],
    [/통계|기록/,'bars'], [/랭킹/,'trophy'], [/설정/,'gear'], [/자녀|가족/,'people'], [/오늘|할 ?일/,'check'],
  ];
  function iconFor(btn){
    const ic=btn.querySelector('.ic');
    const label=(btn.textContent||'').replace(ic?ic.textContent:'','').trim();
    const hit=BY_LABEL.find(([re])=>re.test(label));
    return hit? I[hit[1]] : null;
  }
  function apply(){
    document.querySelectorAll('.nav button .ic:not([data-ui])').forEach(ic=>{
      const svg=iconFor(ic.closest('button'));
      ic.setAttribute('data-ui','1');
      if(svg) ic.innerHTML=svg;
    });
  }
  function start(){
    apply();
    new MutationObserver(apply).observe(document.body,{childList:true,subtree:true});
  }
  if(document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
