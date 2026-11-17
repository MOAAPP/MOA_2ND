/** 2차 UX 시안: 배포 ZIP의 화면 배치/문구/스타일만 변경. API, 금융 계산, 이벤트 핸들러는 유지. */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const app = resolve(root, 'moa-web');
const cssName = 'ux-journey-v2.css';
function once(s, from, to, label) {
  if(s.includes(to))return s;
  const i=s.indexOf(from);
  if(i<0||s.indexOf(from,i+from.length)!==-1)throw Error('UX 시안 기준점 오류: '+label);
  return s.slice(0,i)+to+s.slice(i+from.length);
}
function between(s, start, end, result, label) {
  if(s.includes(result))return s;
  const i=s.indexOf(start), j=s.indexOf(end,i+start.length);
  if(i<0||j<0||s.indexOf(start,i+start.length)!==-1)throw Error('UX 시안 영역 오류: '+label);
  return s.slice(0,i)+result+s.slice(j);
}
function patch(path,fn){const file=resolve(app,path),prev=readFileSync(file,'utf8'),next=fn(prev);if(next!==prev)writeFileSync(file,next);console.log('[UX 2차]',path,prev===next?'기존':'수정');}
function home(s){
  s=once(s,`      <header className="mh-title">
        <p>{koreanDate}</p>
        <h1>{s.profile.name || '모아'}님, 오늘의 모아예요</h1>
        <p className="ux-home-lead">지금 쓸 수 있는 돈을 확인하고, 소비 전 다른 미래를 비교해 보세요.</p>
      </header>`,
`      <header className="mh-title ux-v2-home-header">
        <div className="ux-v2-home-top"><span>MOA / PARALLEL BANK</span><span>{koreanDate}</span></div>
        <h1>{s.profile.name || '모아'}님,<br /><em>그 소비, 지금 괜찮을까요?</em></h1>
        <p className="ux-home-lead">구매하기 전, 결제일과 잔액이 어떻게 달라지는지 확인해요.</p>
      </header>`, '홈 타이틀');
  s=between(s,`      <button type="button" className="mh-card mh-world"`, `      {/* 1. AI 브리핑 — 한 문장 + 한 가지 행동 */}`,
`      <button type="button" className="mh-card mh-world ux-v2-hero" onClick={() => navigate('/world/compare')}>
        <span className="ux-v2-hero-kicker"><span>✦</span> THE OTHER FUTURE <i>01 / 03</i></span>
        <span className="ux-v2-hero-heading">살까, 말까?<br /><em>두 선택을 비교해요.</em></span>
        <span className="ux-v2-hero-description">같은 돈, 다른 선택.<br />예정된 결제일까지 함께 살펴봐요.</span>
        <span className="ux-v2-world-split" aria-hidden="true">
          <span><small>WORLD A</small><strong>지금 사는 나</strong><i>결제일에 잔액은?</i></span>
          <b>↔</b>
          <span><small>WORLD B</small><strong>사지 않는 나</strong><i>얼마나 남을까?</i></span>
        </span>
        <span className="ux-v2-hero-bottom"><strong>내 소비의 미래 비교하기</strong><span>↗</span></span>
        {world.count > 0 && <span className="ux-v2-hero-record">저장된 선택 {world.count}개 · 5년 뒤 가정상 차이 {man(world.gap)}</span>}
        <span className="ux-v2-hero-mini"><MiniLines series={series} /></span>
      </button>

      `, '홈 주인공 카드');
  s=between(s,`      <button type="button" className="mh-ask"`,`{/* 3. 오늘의 학습 — 한 번 누르면 시작 */}`,
`      <button type="button" className="mh-ask ux-v2-next" onClick={() => navigate('/agent')}>
        <span className="ux-v2-next-icon"><Ico d={SPARK} size={21} w={1.6} /></span>
        <span className="ux-v2-next-copy"><small>다음 단계 · 선택지 넓히기</small><strong>내 조건에 맞는 다른 경로 찾기</strong><em>필수 결제 일정과 최소 잔액을 함께 검토해요</em></span>
        <span className="ux-v2-next-arrow">↗</span>
      </button>
      `,'AI 다음 선택 카드');
  const tags=['{/* 2. 결제일 안전 — 숫자 하나 */}','{/* 4. 같은 돈, 다른 미래 */}','{/* 1. AI 브리핑 — 한 문장 + 한 가지 행동 */}','{/* 5. AI에게 묻기 */}','{/* 3. 오늘의 학습 — 한 번 누르면 시작 */}'];
  const pos=tags.map(x=>s.indexOf(x));
  if(pos.some((v,i)=>v<0||(i&&v<=pos[i-1])))throw Error('홈 구성 원본 순서 불일치');
  const end=s.indexOf('    </main>',pos[4]);
  if(end<0)throw Error('홈 main 없음');
  const blocks=pos.map((v,i)=>s.slice(v,i===4?end:pos[i+1]));
  blocks[0]=`<div className="ux-v2-section-label"><span>MY WALLET</span><strong>오늘의 금융 안전</strong></div>\n      `+blocks[0];
  blocks[2]=`<div className="ux-v2-section-label"><span>DAILY INSIGHT</span><strong>오늘의 금융 브리핑</strong></div>\n      `+blocks[2];
  return s.slice(0,pos[0])+[1,0,3,2,4].map(i=>blocks[i]).join('')+s.slice(end);
}
function world(s){
  s=once(s,`        <div className="px-1">
          <span className="inline-flex items-center text-[11px] font-bold text-toss-blue bg-[#E8F3FF] rounded-full px-2.5 py-1">MOA · 선택의 다른 미래</span>
          <h1 className="text-[24px] font-extrabold text-toss-gray900 leading-snug tracking-tight mt-2">그때 샀다면,<br />사지 않았다면?</h1>
          <p className="text-[12.5px] leading-relaxed text-toss-gray500 mt-2">하나의 소비 선택이 오늘의 현금과 앞으로의 결제 일정에 만드는 차이를 살펴봐요.</p>
        </div>`,
`        <section className="ux-v2-world-intro" aria-label="평행세계 비교 안내">
          <span className="ux-v2-world-overline">YOUR CHOICE · TWO FUTURES <i>01 / 03</i></span>
          <h1>지금 산다면,<br /><em>사지 않는다면?</em></h1>
          <p>하나의 소비, 두 가지 선택.<br />같은 결제 일정에서 잔액이 어떻게 달라질까요?</p>
          <div className="ux-v2-world-visual" aria-hidden="true"><span>A <small>BUY</small></span><i>↔</i><span>B <small>KEEP</small></span></div>
        </section>`, '평행세계 소개');
  s=once(s,'<section className="bg-white rounded-[24px] p-4 shadow-card space-y-3" aria-label="비교할 소비 선택">','<section className="ux-v2-input-card bg-white rounded-[24px] p-4 shadow-card space-y-3" aria-label="비교할 소비 선택">','소비 입력 영역');
  s=between(s,'          <section className="ux-decision-summary" aria-live="polite" aria-label="소비 선택 결과 요약">', '          <section aria-label="구매 여부에 따른 두 세계"',
`          <section className="ux-v2-result" aria-live="polite" aria-label="소비 선택 결과 요약">
            <div className="ux-v2-result-top"><span>YOUR RESULT</span><span>{period === 7 ? '7일' : period === 30 ? '1개월' : '3개월'} 기준</span></div>
            <p className="ux-v2-result-caption">두 선택의 예상 결제계좌 잔액 차이</p>
            <strong className="ux-v2-result-number">{won(projection.delta)}</strong>
            <p className="ux-v2-result-sub">투자 수익이 아닌, 소비 여부에 따른 결제계좌 잔액 차이예요.</p>
            <div className="ux-v2-result-status">
              <div><span className="ux-v2-path-name"><i className="ux-v2-red" />지금 구매</span><strong>{won(projection.boughtEnd)}</strong><small className={projection.boughtRisk ? 'ux-v2-caution' : 'ux-v2-okay'}>{projection.boughtRisk ? short(projection.boughtRisk)+' 잔액 주의' : '등록 일정에서 잔액 미달 없음'}</small></div>
              <div><span className="ux-v2-path-name"><i className="ux-v2-blue" />구매 보류</span><strong>{won(projection.keptEnd)}</strong><small className={projection.keptRisk ? 'ux-v2-caution' : 'ux-v2-okay'}>{projection.keptRisk ? short(projection.keptRisk)+' 잔액 주의' : '등록 일정에서 잔액 미달 없음'}</small></div>
            </div>
            <p className="ux-v2-result-foot">등록된 지출·결제 일정만 반영한 가상 결과예요. 실제 잔액과 다를 수 있어요.</p>
          </section>

          `,'결과판');
  s=between(s,'          <section aria-label="구매 여부에 따른 두 세계"', '          <section className="bg-white rounded-[24px] p-4 shadow-card" aria-label="미래 현금흐름 비교">',
`          <section aria-label="구매 여부에 따른 두 세계" className="ux-v2-choice-pair">
            <div className="ux-v2-choice-tile ux-v2-buy">
              <span className="ux-v2-choice-kicker">WORLD A / BUY NOW</span><span className="ux-v2-choice-symbol" aria-hidden="true">↘</span>
              <h3>구매한 나</h3><p>지금 갖고 싶은 것을 얻어요.</p><strong>지출 {won(amount)}</strong>
              {projection.actual === 'bought' && <span className="ux-v2-choice-selected">내가 한 선택</span>}
            </div>
            <div className="ux-v2-choice-tile ux-v2-keep">
              <span className="ux-v2-choice-kicker">WORLD B / KEEP CASH</span><span className="ux-v2-choice-symbol" aria-hidden="true">↗</span>
              <h3>구매하지 않은 나</h3><p>다른 선택의 여력을 남겨요.</p><strong>남긴 소비 예산 {won(amount)}</strong>
              {projection.actual === 'kept' && <span className="ux-v2-choice-selected">내가 한 선택</span>}
            </div>
          </section>

          `,'세계선 비교');
  // 금융 계산이 아직 없거나 연결에 실패한 경우, 0원이나 안전 판정으로 대체하지 않음.
  // 기존 네트워크·데이터 상태만 읽는 표시 전용 상태 카드임.
  s=once(s,`        {valid && (MODE !== 'demo' || !!liveProjection) && <>`,
`        {valid && MODE === 'demo' && !liveProjection && (
          <section className="ux-v2-analysis-state" role="status" aria-live="polite">
            <span className="ux-v2-analysis-eyebrow">예상 잔액 비교 · 결과 확인</span>
            <div className="ux-v2-analysis-orbit" aria-hidden="true"><span>₩</span></div>
            <h2>{!s.demoFinanceReady
              ? '금융 데이터를 확인하고 있어요'
              : !supportedPayment
                ? '결제 시점을 확인해 주세요'
                : backendStatus === 'error'
                  ? '예상 잔액을 불러오지 못했어요'
                  : '두 선택의 잔액을 계산하고 있어요'}</h2>
            <p>{!s.demoFinanceReady
              ? '등록된 잔액과 예정 결제 정보를 확인한 뒤 비교 결과를 보여드릴게요.'
              : !supportedPayment
                ? '선택한 결제수단의 출금 시점을 확인해야 해요. 체크카드 또는 계좌이체로 비교해 주세요.'
                : backendStatus === 'error'
                  ? '서버 분석에 연결되지 않아 이번 비교 결과는 표시하지 않아요.'
                  : '구매·보류에 동일한 결제 일정을 적용해 계산하고 있어요.'}</p>
            <div className="ux-v2-analysis-flow" aria-hidden="true"><span>소비 금액</span><i>→</i><span>결제 일정</span><i>→</i><span>예상 잔액</span></div>
            <small>계산되지 않은 금액이나 위험도를 임의로 보여주지 않아요.</small>
          </section>
        )}
        {valid && (MODE !== 'demo' || !!liveProjection) && <>`, '분석 준비·실패 상태');
  return s;
}
function agent(s){
  s=between(s,'        <section className="ag-intro">','        <div className="ag-persona" role="radiogroup" aria-label="분석할 계정">',
`        <section className="ag-intro ux-v2-agent-intro">
          <div className="ux-v2-agent-ornament" aria-hidden="true">✦ <i>✧</i> ✳</div>
          <div className="ux-v2-agent-overline"><span>MOA INTELLIGENCE</span><span>02 / 03</span></div>
          <span className="ag-badge"><Svg d={<path d="M12 3.5l1.6 4.4 4.4 1.6-4.4 1.6L12 15.5l-1.6-4.4L6 9.5l4.4-1.6L12 3.5Z" />} size={14} />{MODE === 'demo' ? 'AI 경로 탐색' : '규칙 기반 금융 계산'}</span>
          <h1>{MODE === 'demo' ? <>목표만 입력하면,<br /><em>가능한 경로를 검토해요</em></> : <>내 조건을 기준으로,<br /><em>가능한 경로를 살펴봐요</em></>}</h1>
          <p>{MODE === 'demo' ? 'AI가 목표와 조건을 해석하고, 금융 계산 엔진이 가능한 경로를 검토해요.' : '입력한 금액과 일정으로 규칙 기반 계산을 진행해요. 이 모드에서는 AI·ML을 사용하지 않아요.'}</p>
          <div className="ux-v2-agent-proofs"><span>필수 결제 점검</span><span>잔액 조건 확인</span><span>선택지 비교</span></div>
        </section>
        <div className="ux-v2-agent-field-label"><span>STEP 01</span><strong>어떤 목표가 있나요?</strong><small>목표와 금액을 자유롭게 적어주세요</small></div>
        `,'Agent 상단');
  s=once(s,'        <div className="ag-chips">','        <div className="ux-v2-agent-example-label">이렇게 시작해 볼 수 있어요</div>\n        <div className="ag-chips">','Agent 예시');
  s=once(s,'              <section className="ag-card ag-result">\n                <div className="ag-sum">',
`              <section className="ag-card ag-result">
                <div className="ux-v2-agent-result-head"><span>검토 결과</span><h2>{res.search.valid_count > 0 ? '입력한 조건을 충족한 경로가 있어요' : '지금 조건을 충족하는 경로가 없어요'}</h2><p>검토한 경로와 제외된 이유를 확인해 보세요.</p></div>
                <div className="ag-sum">`,'Agent 결과 안내');
  s=once(s,'<h2>AI가 실행한 과정</h2>',
    '<h2>{res.source === \'ai\' ? \'AI 분석 과정\' : res.source === \'engine\' ? \'금융 엔진 검증 과정\' : \'저장된 분석 과정\'}</h2>',
    '분석 결과 출처를 반영한 단계 이름');
  return s;
}
function lab(s){
  s=once(s,`        <header className="lb-title">
          <h1>실험실</h1>
          <p>배우고, 실제 돈 없이 바로 해봐요</p>
        </header>`,
`        <header className="lb-title ux-v2-lab-hero">
          <div className="ux-v2-lab-overline"><span>MOA FINANCIAL LAB</span><span>03 / 03</span></div>
          <div className="ux-v2-lab-shape" aria-hidden="true">◎ <i>✧</i></div>
          <h1>배운 것을<br /><em>가상으로 연습해요.</em></h1>
          <p>금융 학습부터 가상 투자·적금까지,<br />실제 돈을 쓰지 않고 체험해요.</p>
          <div className="ux-v2-lab-sequence"><span>배우기</span><span>가상 투자</span><span>가상 예·적금</span></div>
        </header>`, '실험실 상단');
  s=once(s,'        <div className="lb-seg" role="tablist" aria-label="실험실 메뉴">',
'        <div className="ux-v2-lab-tabs-title">원하는 체험을 골라보세요</div>\n        <div className="lb-seg" role="tablist" aria-label="실험실 메뉴">','실험실 탭');
  return s;
}
if(process.argv.includes('--postbuild')){
  const file=resolve(app,'dist/index.html'),prev=readFileSync(file,'utf8');
  const link=`<link rel="stylesheet" href="/${cssName}" />`;
  if(!prev.includes(link))writeFileSync(file,once(prev,'</head>','    '+link+'\n  </head>','배포 CSS 링크'));
}else{
  patch('src/screens/Home.jsx',home);
  patch('src/pages/WorldChoice.tsx',world);
  patch('src/pages/Agent.tsx',agent);
  patch('src/pages/Lab.tsx',lab);
  mkdirSync(resolve(app,'public'),{recursive:true});
  copyFileSync(resolve(root,'design',cssName),resolve(app,'public',cssName));
  console.log('[UX 2차] 기능·API·데이터 연동 변경 없음');
}
