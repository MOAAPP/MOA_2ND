/**
 * 배움 탭 학습 경로 (듀오링고식 단계 학습)
 * - 6단원 × 4레슨. 레슨은 개념 → 예시 → 퀴즈 → (선택) 모의투자 실습 순서의 짧은 스텝.
 * - 레벨테스트 결과로 시작 단원을 정하고, 그 앞 단원은 '테스트로 통과' 처리(언제든 복습 가능).
 * - 설명 깊이: 같은 레슨이라도 수준(Level)에 따라 일부 스텝을 더하거나 뺀다.
 */
import type { Level } from './knowledge';

export type VisualKey = 'slices' | 'supplyDemand' | 'quoteBoard' | 'clock' | 'orderTypes' | 'avgPrice' | 'pnl' | 'basket' | 'recovery' | 'range' | 'factOpinion' | 'safetyFirst';

export type PracticeCheck = 'openStock' | 'buyAny' | 'limitOrder' | 'sellAny' | 'buyEtf' | 'decide' | 'viewPortfolio';

export type Step =
  | { kind: 'concept'; title: string; body: string[]; example?: string; visual?: VisualKey; levels?: Level[] }
  | { kind: 'quiz'; q: string; options: string[]; answer: number; explain: string; levels?: Level[] }
  | { kind: 'practice'; task: string; hint: string; check: PracticeCheck };

export interface Lesson {
  id: string;
  unit: number;
  title: string;
  goal: string;
  minutes: number;
  steps: Step[];
}

export interface Unit {
  id: number;
  title: string;
  desc: string;
  lessons: Lesson[];
}

const L = (unit: number, n: number, title: string, goal: string, minutes: number, steps: Step[]): Lesson => ({ id: `u${unit}l${n}`, unit, title, goal, minutes, steps });

export const UNITS: Unit[] = [
  {
    id: 1,
    title: '주식이 뭐예요?',
    desc: '주식의 뜻, 가격이 움직이는 이유, 시세표 읽는 법',
    lessons: [
      L(1, 1, '주식은 회사의 작은 조각', '주식을 산다는 게 무슨 뜻인지 말할 수 있어요', 2, [
        { kind: 'concept', title: '회사를 잘게 나눈 조각', visual: 'slices', body: ['회사는 사업에 필요한 돈을 모으려고 회사의 주인 자격을 잘게 나눠 팔아요. 이 조각 하나가 주식(1주)이에요.', '주식을 사면 아주 작은 비율이지만 그 회사의 주인(주주)이 돼요.'], example: '삼성전자 주식 1주를 사면, 삼성전자의 아주 작은 조각을 가진 주주가 되는 거예요.' },
        { kind: 'concept', title: '주주가 얻을 수 있는 것', body: ['회사가 성장해 주가가 오르면 팔 때 차익을 얻을 수 있어요.', '회사가 이익 일부를 나눠주는 배당을 받을 수도 있어요.', '반대로 회사가 어려워지면 주가가 내려 손실이 날 수 있어요. 예금처럼 원금이 보장되지 않아요.'] },
        { kind: 'concept', levels: [3], title: '조금 더: 보통주와 우선주', body: ['같은 회사에도 보통주와 우선주가 있어요. 우선주는 의결권이 없는 대신 배당을 먼저(또는 더) 받는 경우가 많아요.', '종목 이름 뒤에 "우"가 붙으면 우선주예요. 예: 삼성전자우'] },
        { kind: 'quiz', q: '주식을 산다는 것에 가장 가까운 설명은?', options: ['회사에 돈을 빌려주는 것', '회사의 소유권 일부를 사는 것', '원금이 보장되는 저축', '회사 제품을 미리 사는 것'], answer: 1, explain: '주식은 회사의 소유권 조각이에요. 돈을 빌려주는 건 채권, 원금 보장은 예금에 가까워요.' },
        { kind: 'quiz', q: '주식에 대해 맞는 말은?', options: ['회사가 망해도 원금은 돌려받는다', '주가는 오르기만 한다', '배당을 받을 수도 있고 손실이 날 수도 있다', '1주는 회사 전체를 뜻한다'], answer: 2, explain: '주식은 성장·배당의 기회와 손실 위험을 함께 가져요.' },
      ]),
      L(1, 2, '가격은 왜 움직일까', '수요와 공급으로 주가 변화를 설명할 수 있어요', 2, [
        { kind: 'concept', title: '사려는 사람 vs 팔려는 사람', visual: 'supplyDemand', body: ['주가는 사려는 사람과 팔려는 사람이 만나는 가격에서 정해져요.', '사려는 사람이 더 많으면 더 높은 가격에 거래되고, 팔려는 사람이 많으면 가격이 내려가요.'] },
        { kind: 'concept', title: '무엇이 마음을 바꿀까', body: ['실적 발표, 새 제품, 금리·환율 같은 경제 소식, 업종 분위기가 사람들의 기대를 바꿔요.', '같은 소식도 이미 예상했던 내용이면 가격이 별로 안 움직이기도 해요.'], example: '좋은 실적이 나왔는데도 주가가 내리는 날이 있어요. 사람들이 더 좋은 숫자를 기대했기 때문일 수 있어요.' },
        { kind: 'concept', levels: [1], title: '한 줄 정리', body: ['가격 = 그 순간 사람들이 합의한 값. 회사의 "진짜 가치"와 늘 같지는 않아요.'] },
        { kind: 'quiz', q: '사려는 사람이 팔려는 사람보다 훨씬 많아지면 보통 가격은?', options: ['오른다', '내린다', '변하지 않는다', '거래가 멈춘다'], answer: 0, explain: '수요가 공급보다 많으면 더 높은 가격에서 거래가 이뤄져요.' },
        { kind: 'quiz', q: '좋은 뉴스가 나왔는데 주가가 내렸어요. 가능한 이유는?', options: ['뉴스가 가짜라서만 가능하다', '이미 더 좋은 결과를 기대하고 있었다', '주가는 뉴스와 무관하다', '반드시 오류다'], answer: 1, explain: '가격은 기대를 반영해요. 기대보다 못하면 좋은 뉴스에도 내릴 수 있어요.' },
      ]),
      L(1, 3, '시세표 읽기', '현재가·전일 대비·등락률을 읽을 수 있어요', 3, [
        { kind: 'concept', title: '시세표의 세 숫자', visual: 'quoteBoard', body: ['현재가: 가장 최근에 거래된 가격', '전일 대비: 전 거래일 종가와 비교해 오른/내린 금액', '등락률: 그 변화를 %로 나타낸 값'] },
        { kind: 'concept', title: '등락률 계산', body: ['등락률 = (현재가 − 전 거래일 종가) ÷ 전 거래일 종가 × 100', '어제가 휴장일이었다면 그 전 마지막 거래일 종가와 비교해요.'], example: '전 거래일 종가 50,000원, 현재가 51,000원 → +1,000원, +2%' },
        { kind: 'concept', levels: [2, 3], title: '색과 기호', body: ['국내 앱에서는 보통 오르면 빨강(▲), 내리면 파랑(▼)이에요. 해외 앱은 반대로 초록이 상승인 경우가 많아요.', '평행통장은 색과 함께 ▲▼, +/− 기호를 같이 보여줘요.'] },
        { kind: 'quiz', q: '전 거래일 종가 20,000원, 현재가 19,000원이면 등락률은?', options: ['−1%', '−5%', '−10%', '+5%'], answer: 1, explain: '(19,000 − 20,000) ÷ 20,000 = −5%' },
        { kind: 'quiz', q: '월요일에 "전일 대비"는 보통 무엇과 비교할까요?', options: ['일요일 가격', '토요일 가격', '금요일 종가', '지난달 평균'], answer: 2, explain: '주말은 휴장이라 직전 거래일인 금요일 종가와 비교해요.' },
        { kind: 'practice', task: '배움 → 연습장에서 아무 종목이나 열어 현재가와 전일 대비를 확인해 보세요.', hint: '종목 화면 위쪽에 가격·전일 대비·기준 시각이 있어요.', check: 'openStock' },
      ]),
      L(1, 4, '시장이 열리는 시간', '장 운영 시간과 휴장일, 시세 지연을 알아요', 2, [
        { kind: 'concept', title: '정규장은 평일 9시~3시 30분', visual: 'clock', body: ['한국거래소 정규장은 평일 09:00~15:30이에요. 주말과 공휴일, 연말 마지막 날은 쉬어요.', '장 시작 전(08:30~09:00)과 마감 직전(15:20~15:30)에는 주문을 모았다가 한 번에 체결하는 방식으로 가격을 정해요.'] },
        { kind: 'concept', title: '하루에 움직일 수 있는 폭', body: ['국내 주식은 하루에 전 거래일 종가 기준 위아래 30%까지만 움직일 수 있어요(가격제한폭).'] },
        { kind: 'concept', title: '실시간과 지연 시세', body: ['무료로 보는 시세는 실시간이 아니라 몇 분~수십 분 늦은 "지연 시세"인 경우가 많아요.', '평행통장도 지연 시세를 써요. 화면의 "기준 시각"을 꼭 같이 보세요.'] },
        { kind: 'quiz', q: '토요일 오후에 주식 시세가 안 움직이는 이유는?', options: ['앱 오류', '휴장일이라서', '모두가 팔아서', '가격제한폭에 걸려서'], answer: 1, explain: '주말은 휴장이라 거래가 없어요.' },
        { kind: 'quiz', q: '국내 주식이 하루에 움직일 수 있는 최대 폭은?', options: ['±10%', '±30%', '±50%', '제한 없음'], answer: 1, explain: '전 거래일 종가 기준 ±30%가 가격제한폭이에요.' },
      ]),
    ],
  },
  {
    id: 2,
    title: '첫 주문 해보기',
    desc: '시장가와 지정가, 주문 금액 계산, 모의 매수·매도',
    lessons: [
      L(2, 1, '시장가 vs 지정가', '두 주문 방식의 차이를 설명할 수 있어요', 3, [
        { kind: 'concept', title: '두 가지 주문', visual: 'orderTypes', body: ['시장가: 지금 거래되는 가격에 바로 사거나 팔아요. 빠르지만 가격을 정할 수 없어요.', '지정가: "이 가격 이하면 살게(이상이면 팔게)"라고 가격을 정해요. 원하는 가격이 안 오면 체결되지 않아요.'] },
        { kind: 'concept', title: '언제 무엇을 쓸까', body: ['꼭 지금 사야 하면 시장가, 가격이 중요하면 지정가.', '평행통장 모의투자에서는 장이 열렸을 때만 시장가가 가능하고, 장 밖에서는 지정가로 예약해요.'] },
        { kind: 'concept', levels: [3], title: '조금 더: 슬리피지', body: ['거래가 적은 종목에 시장가로 큰 주문을 넣으면 생각보다 비싸게 체결될 수 있어요. 이 차이를 슬리피지라고 해요.'] },
        { kind: 'quiz', q: '"50,000원 이하에서만 사고 싶다"면 어떤 주문?', options: ['시장가 매수', '지정가 매수(50,000원)', '시장가 매도', '지정가 매도'], answer: 1, explain: '가격을 정하는 주문이 지정가예요. 50,000원 이하 시세에서만 체결돼요.' },
        { kind: 'quiz', q: '지정가 주문의 단점은?', options: ['너무 비싸게 산다', '원하는 가격이 안 오면 체결이 안 될 수 있다', '장중에만 가능하다', '수량을 정할 수 없다'], answer: 1, explain: '가격을 지키는 대신 체결이 보장되지 않아요.' },
      ]),
      L(2, 2, '주문 금액과 호가 단위', '주문 금액을 계산하고 호가 단위를 알아요', 2, [
        { kind: 'concept', title: '주문 금액 = 가격 × 수량', body: ['70,000원짜리 3주면 210,000원. 실제로는 여기에 수수료가 더해지고, 팔 때는 세금이 빠져요.'] },
        { kind: 'concept', title: '호가 단위', body: ['주식은 아무 가격에나 주문할 수 없고, 가격대별로 정해진 단위로만 주문해요.', '예: 2만~5만 원 구간은 50원, 5만~20만 원은 100원, 20만~50만 원은 500원 단위. ETF는 대부분 5원 단위예요.'], example: '63,250원 지정가는 불가 → 63,200원이나 63,300원으로 주문해요.' },
        { kind: 'quiz', q: '45,000원짜리 주식 4주의 주문 금액(수수료 제외)은?', options: ['145,000원', '180,000원', '190,000원', '45,004원'], answer: 1, explain: '45,000 × 4 = 180,000원' },
        { kind: 'quiz', q: '가격이 8만 원대인 주식의 지정가로 가능한 것은?', options: ['81,250원', '81,300원', '81,333원', '81,010원'], answer: 1, explain: '5만~20만 원 구간은 100원 단위라 81,300원이 가능해요.' },
      ]),
      L(2, 3, '첫 모의 매수', '모의투자로 직접 한 번 사봐요', 3, [
        { kind: 'concept', title: '연습용 1,000만 원', body: ['평행통장의 모의 자금은 생활비와 완전히 분리된 연습용 돈이에요. 실제 계좌와 연결되지 않아요.', '처음엔 1주만 사보는 걸 추천해요. 숫자가 어떻게 바뀌는지 보는 게 목적이에요.'] },
        { kind: 'concept', title: '주문 전 확인할 것', body: ['종목 이름이 맞는지, 시장가/지정가, 수량, 예상 금액, 주문 가능 금액.', '확인 화면을 한 번 더 보는 습관이 실수를 막아줘요.'] },
        { kind: 'quiz', q: '주문 확인 화면에서 꼭 볼 것이 아닌 것은?', options: ['종목 이름', '수량', '예상 금액', '다른 사람의 수익률'], answer: 3, explain: '내 주문 내용만 정확히 확인하면 돼요.' },
        { kind: 'practice', task: '연습장에서 관심 가는 종목을 1주 모의 매수해 보세요.', hint: '종목 화면 아래 "모의 매수" → 수량 1 → 다음 → 확인', check: 'buyAny' },
      ]),
      L(2, 4, '팔기와 실현손익', '매도와 실현손익을 이해해요', 2, [
        { kind: 'concept', title: '팔아야 확정돼요', visual: 'pnl', body: ['산 가격보다 비싸게 팔면 이익, 싸게 팔면 손실이 확정돼요. 이걸 실현손익이라고 해요.', '실현손익 = (판 가격 − 평균단가) × 판 수량'] },
        { kind: 'concept', title: '판 나와 계속 보유한 나', body: ['팔고 나서 가격이 더 오르면 "계속 보유했다면" 더 벌었을 수 있고, 내리면 판 게 나았을 수 있어요.', '평행통장은 판 뒤의 실제 가격으로 두 세계를 비교해 보여줘요. 미래 가격을 예측하지는 않아요.'] },
        { kind: 'quiz', q: '평균 10,000원에 산 주식 5주를 12,000원에 모두 팔았어요. 실현손익은?', options: ['+2,000원', '+10,000원', '+12,000원', '−10,000원'], answer: 1, explain: '(12,000 − 10,000) × 5 = +10,000원' },
        { kind: 'practice', task: '보유한 종목이 있다면 일부를 모의 매도해 보세요.', hint: '종목 화면 아래 "모의 매도"', check: 'sellAny' },
      ]),
    ],
  },
  {
    id: 3,
    title: '내 손익 이해하기',
    desc: '평균단가, 평가손익과 실현손익, 수수료와 세금',
    lessons: [
      L(3, 1, '평균단가', '여러 번 산 주식의 평균단가를 계산할 수 있어요', 3, [
        { kind: 'concept', title: '나눠 샀다면 평균으로', visual: 'avgPrice', body: ['평균단가 = 산 금액 합계 ÷ 보유 수량'], example: '10,000원에 2주(20,000원) + 13,000원에 1주 → 33,000원 ÷ 3주 = 11,000원' },
        { kind: 'concept', title: '평균단가가 바뀌는 때', body: ['더 싸게 추가로 사면 평균단가가 내려가고, 비싸게 사면 올라가요.', '일부를 팔아도 남은 주식의 평균단가는 그대로예요.'] },
        { kind: 'concept', levels: [3], title: '평균단가 낮추기의 함정', body: ['평균단가를 낮추려고 계속 사면 한 종목 비중이 커져요. 손익은 평균단가보다 "얼마를 걸었나"로 봐야 해요.'] },
        { kind: 'quiz', q: '20,000원에 1주, 10,000원에 3주를 샀어요. 평균단가는?', options: ['12,500원', '15,000원', '10,000원', '13,333원'], answer: 0, explain: '(20,000 + 30,000) ÷ 4 = 12,500원' },
        { kind: 'quiz', q: '일부를 팔면 남은 주식의 평균단가는?', options: ['오른다', '내린다', '그대로다', '0이 된다'], answer: 2, explain: '매도는 평균단가를 바꾸지 않고 수량만 줄여요.' },
      ]),
      L(3, 2, '평가손익과 실현손익', '팔기 전 손익과 판 뒤 손익을 구분해요', 2, [
        { kind: 'concept', title: '아직 바뀌는 숫자, 이미 정해진 숫자', body: ['평가손익: 팔지 않은 주식의 지금 가격 기준 손익. 가격이 바뀌면 계속 달라져요.', '실현손익: 팔아서 확정된 손익.'] },
        { kind: 'concept', title: '총자산으로 보기', body: ['모의투자 총자산 = 남은 현금 + 보유 주식 평가액.', '"산 나"와 "현금으로 둔 나"를 비교할 때도 총자산을 기준으로 봐야 공정해요.'] },
        { kind: 'quiz', q: '산 뒤 주가가 올랐지만 아직 안 팔았다면?', options: ['실현손익', '평가손익', '배당', '수수료'], answer: 1, explain: '팔기 전 손익은 평가손익이에요.' },
        { kind: 'practice', task: '연습장의 "보유 종목 · 주문 · 거래 내역"에서 내 평가손익을 확인해 보세요.', hint: '배움 → 연습장 → 보유 종목 버튼', check: 'viewPortfolio' },
      ]),
      L(3, 3, '수수료와 세금', '실제 거래에 붙는 비용을 알아요', 2, [
        { kind: 'concept', title: '사고팔 때 드는 비용', body: ['증권사 거래 수수료가 사고팔 때마다 붙어요. 비율은 증권사·이벤트마다 달라요.', '국내 주식은 팔 때 증권거래세가 붙어요.', '일반 개인투자자는 국내 상장 주식을 팔아 생긴 이익에 대체로 양도소득세를 내지 않아요(대주주 등 예외).'] },
        { kind: 'concept', title: '모의투자와의 차이', body: ['평행통장 모의투자는 수수료·세금을 반영하지 않아요. 그래서 실제보다 수익이 조금 좋게 보일 수 있어요.', '세율과 기준은 바뀔 수 있으니 실제 투자 전에는 증권사·국세청 안내를 확인하세요.'] },
        { kind: 'quiz', q: '자주 사고팔수록 커지는 것은?', options: ['배당', '거래 비용(수수료·세금)', '평균단가', '가격제한폭'], answer: 1, explain: '거래할 때마다 비용이 붙어서 잦은 매매는 비용이 쌓여요.' },
      ]),
      L(3, 4, '선택의 기회비용', '투자 돈과 생활비의 관계를 평행세계로 봐요', 2, [
        { kind: 'concept', title: '이 돈의 다른 세계', visual: 'safetyFirst', body: ['투자에 넣은 돈은 그 기간 동안 생활비나 비상금으로 쓸 수 없어요.', '평행통장 홈에서 "샀다면 / 안 샀다면"을 보듯, 투자도 "넣었다면 / 현금으로 뒀다면"으로 비교할 수 있어요.'] },
        { kind: 'quiz', q: '생활비가 빠듯한 달에 투자를 늘리기 전에 먼저 확인할 것은?', options: ['어제 오른 종목', '필수지출일의 잔고', '친구의 수익률', '종목 이름 길이'], answer: 1, explain: '필수지출일에 돈이 부족하지 않은지가 먼저예요.' },
        { kind: 'practice', task: '통장 탭에서 "사기 전 확인"을 한 번 해보세요. 소비와 투자 모두 같은 원리예요.', hint: '통장 탭 → 사기 전 확인', check: 'decide' },
      ]),
    ],
  },
  {
    id: 4,
    title: 'ETF와 나눠 담기',
    desc: 'ETF와 지수, 분산, 해외지수 ETF의 환율',
    lessons: [
      L(4, 1, 'ETF란', 'ETF가 무엇인지 설명할 수 있어요', 2, [
        { kind: 'concept', title: '여러 종목을 담은 바구니', visual: 'basket', body: ['ETF는 여러 종목을 한 바구니에 담아 주식처럼 사고팔 수 있게 만든 상품이에요.', '1주만 사도 바구니 안 여러 회사에 조금씩 투자하는 효과가 있어요.'] },
        { kind: 'concept', title: 'ETF도 원금 보장은 아니에요', body: ['담긴 종목들이 함께 내리면 ETF도 내려요.', '운용사가 받는 비용(총보수)이 매년 조금씩 빠져요.'] },
        { kind: 'quiz', q: 'ETF에 대한 설명으로 맞는 것은?', options: ['원금이 보장된다', '여러 종목을 묶어 지수 등을 따라간다', '하루에 한 번만 거래된다', '한 회사의 채권이다'], answer: 1, explain: 'ETF는 지수 등을 따라가도록 여러 종목을 담은 상품이고 주식처럼 거래돼요.' },
      ]),
      L(4, 2, '지수 읽기', '코스피200·S&P500·나스닥100을 구분해요', 3, [
        { kind: 'concept', title: '시장의 온도계, 지수', body: ['지수는 여러 종목 가격을 묶어 시장 전체 흐름을 보여주는 숫자예요.', '코스피200: 국내 대표 200개 종목 / S&P500: 미국 대형주 500개 / 나스닥100: 나스닥 상장 대형 비금융 100개(기술주 비중 높음)'] },
        { kind: 'concept', title: '연습장 ETF와 연결', body: ['KODEX 200 → 코스피200, TIGER 미국S&P500 → S&P500, TIGER 미국나스닥100 → 나스닥100을 따라가요.'] },
        { kind: 'quiz', q: '기술주 비중이 가장 높은 지수는?', options: ['코스피200', 'S&P500', '나스닥100', '모두 같다'], answer: 2, explain: '나스닥100은 기술 기업 비중이 높아요.' },
        { kind: 'practice', task: '연습장에서 ETF를 1주 모의 매수해 보세요.', hint: '검색창에 "KODEX"나 "TIGER"를 입력해 보세요.', check: 'buyEtf' },
      ]),
      L(4, 3, '분산', '분산이 위험을 줄이는 원리를 알아요', 2, [
        { kind: 'concept', title: '달걀을 한 바구니에 담지 않기', body: ['한 종목에만 넣으면 그 회사 소식에 크게 흔들려요.', '서로 다르게 움직이는 자산을 섞으면 전체 흔들림이 줄어들 수 있어요.'] },
        { kind: 'concept', levels: [2, 3], title: '같은 업종은 함께 움직여요', body: ['반도체 종목 3개를 사면 종목은 3개지만 "반도체"라는 같은 위험을 지고 있어요.', '업종·지역을 나눠야 분산 효과가 커요(상관관계가 낮을수록 효과 큼).'] },
        { kind: 'quiz', q: '분산 효과가 더 큰 조합은?', options: ['반도체 3종목', '반도체·자동차·금융 1종목씩', '같은 회사 보통주와 우선주', '한 종목 3번 나눠 사기'], answer: 1, explain: '다른 업종을 섞어야 함께 흔들릴 위험이 줄어요.' },
      ]),
      L(4, 4, '해외지수 ETF와 환율', '국내 상장 해외 ETF의 환율·세금을 알아요', 2, [
        { kind: 'concept', title: '달러 값도 함께 반영', body: ['국내에 상장된 미국 지수 ETF는 원화로 거래하지만, 안에 든 자산은 달러예요.', '이름에 (H)가 없으면 대체로 환율 영향을 받아요. 달러가 오르면 ETF 가격에 플러스, 내리면 마이너스로 작용해요.'] },
        { kind: 'concept', levels: [2, 3], title: '세금도 달라요', body: ['국내 상장 해외지수 ETF는 팔아서 생긴 이익에 배당소득세(현재 15.4%)가 붙어요. 국내 주식형 ETF와 다르게 과세돼요.', '세법은 바뀔 수 있으니 실제 투자 전 확인하세요.'] },
        { kind: 'quiz', q: 'S&P500 지수는 그대로인데 달러 환율이 올랐어요. 환노출 ETF 가격은?', options: ['오르는 경향', '내리는 경향', '항상 그대로', '거래 정지'], answer: 0, explain: '달러 자산의 원화 가치가 올라 가격에 플러스로 작용해요.' },
      ]),
    ],
  },
  {
    id: 5,
    title: '위험 읽기',
    desc: '변동성, 거래량, 뉴스 해석, 손실의 비대칭',
    lessons: [
      L(5, 1, '변동폭과 변동성', '가격이 얼마나 흔들리는지 숫자로 읽어요', 3, [
        { kind: 'concept', title: '하루 변동폭', visual: 'range', body: ['하루 변동폭 = 당일 고가 − 당일 저가. 하루 동안 얼마나 흔들렸는지 보여줘요.'] },
        { kind: 'concept', title: '변동성', body: ['최근 며칠 동안 하루 수익률이 얼마나 들쭉날쭉했는지를 숫자로 나타낸 거예요. 방향이 아니라 크기예요.', '평행통장은 최근 20거래일 일간 수익률의 표준편차를 보여줘요.'] },
        { kind: 'concept', levels: [3], title: '연환산 변동성', body: ['일간 변동성에 √252(1년 거래일 수의 제곱근)를 곱해 1년 기준으로 바꿔요. 과거 값이라 미래를 보장하지 않아요.'] },
        { kind: 'quiz', q: '"변동성이 크다"는 뜻은?', options: ['반드시 오른다', '오르내리는 폭이 크다', '거래가 없다', '배당이 많다'], answer: 1, explain: '변동성은 움직임의 크기예요. 크게 오를 수도, 크게 내릴 수도 있어요.' },
      ]),
      L(5, 2, '거래량', '거래량이 말해주는 것과 말해주지 않는 것', 2, [
        { kind: 'concept', title: '얼마나 많이 거래됐나', body: ['거래량은 그날 사고팔린 주식 수예요.', '평소(최근 20거래일 평균)보다 크게 늘면 관심이 몰렸다는 신호일 수 있어요.'] },
        { kind: 'concept', title: '거래량만으로 결론 내지 않기', body: ['거래량이 늘며 오른 날도, 늘며 내린 날도 있어요. 단일 지표로 판단하지 말고 뉴스·시장 흐름과 함께 봐요.'] },
        { kind: 'quiz', q: '오늘 거래량이 20일 평균의 3배예요. 가장 적절한 해석은?', options: ['무조건 오른다', '관심이 평소보다 몰렸다', '곧 상장폐지된다', '의미 없다'], answer: 1, explain: '평소보다 거래가 많다는 사실까지만 확실해요. 방향은 따로 봐야 해요.' },
      ]),
      L(5, 3, '뉴스와 가격: 사실과 해석', '확인된 사실과 추측을 구분해요', 2, [
        { kind: 'concept', title: '같은 날 = 원인은 아니에요', visual: 'factOpinion', body: ['주가가 오른 날 나온 기사가 그 원인이라고 단정할 수 없어요.', '시장 전체(지수)가 같이 움직였는지, 업종이 같이 움직였는지 먼저 봐요.'] },
        { kind: 'concept', title: '사실과 해석 나누기', body: ['사실: "실적 발표에서 영업이익이 전년보다 늘었다"', '해석: "그래서 주가가 올랐다" — 가능성일 뿐, 확인된 건 아니에요.'] },
        { kind: 'quiz', q: '다음 중 "확인된 사실"에 가까운 것은?', options: ['이 뉴스 때문에 올랐다', '같은 날 코스피200도 1% 올랐다', '내일도 오를 것이다', '모두가 이 종목을 좋아한다'], answer: 1, explain: '지수 등락은 확인 가능한 숫자예요. 나머지는 해석이나 예측이에요.' },
      ]),
      L(5, 4, '손실의 비대칭', '잃은 만큼 되찾기가 왜 어려운지 알아요', 2, [
        { kind: 'concept', title: '−50%를 회복하려면 +100%', visual: 'recovery', body: ['100만 원이 −50%가 되면 50만 원. 다시 100만 원이 되려면 50만 원에서 +100%가 필요해요.', '−10% → +11.1%, −30% → +42.9%, −50% → +100%'] },
        { kind: 'concept', title: '그래서 크기 조절이 중요해요', body: ['한 번의 큰 손실을 피하는 게 장기적으로 중요해요. 감당 가능한 금액만, 나눠서.'] },
        { kind: 'quiz', q: '−20%가 된 투자금이 원래대로 돌아오려면 몇 % 올라야 할까요?', options: ['+20%', '+25%', '+30%', '+40%'], answer: 1, explain: '80 → 100이 되려면 20 ÷ 80 = +25%' },
      ]),
    ],
  },
  {
    id: 6,
    title: '나만의 원칙',
    desc: '생활비 먼저, 매수 이유 적기, 나눠 사기, 복기',
    lessons: [
      L(6, 1, '투자보다 생활비 먼저', '투자 전에 지켜야 할 돈을 정해요', 2, [
        { kind: 'concept', title: '순서가 있어요', visual: 'safetyFirst', body: ['① 필수지출(월세·카드값) → ② 지켜둘 금액·비상금 → ③ 그다음 남는 돈으로 투자.', '평행통장 홈의 "지켜둘 금액"이 바로 ②예요.'] },
        { kind: 'quiz', q: '이번 달 카드값이 부족할 것 같은데 오른다는 종목이 있어요. 먼저 할 일은?', options: ['일단 산다', '카드값과 필수지출부터 확인한다', '빌려서 산다', '친구에게 물어본다'], answer: 1, explain: '생활이 흔들리지 않는 게 먼저예요.' },
      ]),
      L(6, 2, '사는 이유 한 문장', '매수 근거를 미리 적는 습관을 들여요', 2, [
        { kind: 'concept', title: '이유가 있어야 복기할 수 있어요', body: ['"왜 사는가"를 한 문장으로 적어두면, 나중에 그 이유가 아직 맞는지 확인할 수 있어요.', '"얼마까지 내리면 다시 본다"도 같이 정해두면 감정적인 결정을 줄일 수 있어요.'] },
        { kind: 'quiz', q: '좋은 매수 이유에 가까운 것은?', options: ['그냥 느낌이 좋아서', '친구가 샀으니까', '시장 전체에 나눠 투자하려고 지수 ETF를 산다', '어제 많이 올라서'], answer: 2, explain: '나중에 맞는지 확인할 수 있는 구체적인 이유가 좋아요.' },
      ]),
      L(6, 3, '나눠서 사기', '시간을 나눠 투자하는 방법을 알아요', 2, [
        { kind: 'concept', title: '한 번에 vs 나눠서', body: ['같은 금액을 매달 일정하게 나눠 사면, 비쌀 땐 적게 싸게 땐 많이 사게 돼요(정액 적립).', '언제가 저점인지 맞추기 어려울 때 타이밍 부담을 줄여줘요. 수익을 보장하지는 않아요.'] },
        { kind: 'quiz', q: '매달 10만 원씩 같은 ETF를 사면, 가격이 내린 달에는?', options: ['더 적은 수량을 산다', '더 많은 수량을 산다', '살 수 없다', '수량이 같다'], answer: 1, explain: '같은 금액이면 가격이 낮을수록 더 많은 수량을 사요.' },
      ]),
      L(6, 4, '복기하는 법', '결과가 아니라 과정을 돌아봐요', 2, [
        { kind: 'concept', title: '결과와 판단은 달라요', body: ['좋은 판단도 결과가 나쁠 수 있고, 나쁜 판단도 운 좋게 결과가 좋을 수 있어요.', '복기는 "그때 근거가 타당했나, 계획대로 했나"를 보는 거예요.'] },
        { kind: 'concept', title: '카드뉴스로 복기하기', body: ['모의 매수·매도 직후와 매일 아침 Discord로 오는 카드뉴스 4장째가 복기 카드예요. 질문에 한 문장씩 답해보세요.'] },
        { kind: 'quiz', q: '복기할 때 가장 중요한 질문은?', options: ['얼마 벌었나', '남보다 잘했나', '그때의 근거와 계획대로 행동했나', '다음엔 뭐가 오를까'], answer: 2, explain: '과정을 돌아봐야 다음 판단이 나아져요.' },
      ]),
    ],
  },
];

export const ALL_LESSONS: Lesson[] = UNITS.flatMap((u) => u.lessons);
export const LESSON_BY_ID: Record<string, Lesson> = Object.fromEntries(ALL_LESSONS.map((l) => [l.id, l]));

/** 수준에 맞는 스텝만 */
export function stepsFor(lesson: Lesson, level: Level): Step[] {
  return lesson.steps.filter((s) => s.kind === 'practice' || !s.levels || s.levels.includes(level));
}

/* ── 레벨테스트(배치고사) ── */
export interface PlacementQ {
  id: string;
  unit: number;
  q: string;
  options: string[];
  answer: number;
  explain: string;
}

const DONT = '모르겠어요';

export const PLACEMENT: PlacementQ[] = [
  { id: 'p1', unit: 1, q: '주식을 산다는 것은?', options: ['회사에 돈을 빌려주는 것', '회사의 소유권 일부를 사는 것', '원금이 보장되는 저축', DONT], answer: 1, explain: '주식은 회사의 소유권 조각이에요.' },
  { id: 'p2', unit: 1, q: '10,000원이던 주식이 11,000원이 됐어요. 등락률은?', options: ['+1%', '+10%', '+11%', DONT], answer: 1, explain: '(11,000 − 10,000) ÷ 10,000 = 10%' },
  { id: 'p3', unit: 2, q: '"50,000원 이하에서만 사겠다"는 주문은?', options: ['시장가 매수', '지정가 매수', '지정가 매도', DONT], answer: 1, explain: '가격을 정하는 주문이 지정가예요.' },
  { id: 'p4', unit: 2, q: '평균 10,000원에 산 5주를 12,000원에 모두 팔면 실현손익은?', options: ['+2,000원', '+10,000원', '+60,000원', DONT], answer: 1, explain: '(12,000 − 10,000) × 5 = 10,000원' },
  { id: 'p5', unit: 3, q: '10,000원에 2주, 13,000원에 1주를 샀어요. 평균단가는?', options: ['11,000원', '11,500원', '12,000원', DONT], answer: 0, explain: '33,000원 ÷ 3주 = 11,000원' },
  { id: 'p6', unit: 3, q: '산 뒤 올랐지만 아직 팔지 않은 이익은?', options: ['실현손익', '평가손익', '배당', DONT], answer: 1, explain: '팔기 전에는 평가손익이에요.' },
  { id: 'p7', unit: 4, q: 'ETF에 대한 설명으로 맞는 것은?', options: ['원금이 보장된다', '여러 종목을 묶어 지수 등을 따라간다', '한 회사의 채권이다', DONT], answer: 1, explain: 'ETF는 여러 종목을 담아 지수 등을 따라가요.' },
  { id: 'p8', unit: 4, q: '분산 효과가 더 큰 조합은?', options: ['반도체 3종목', '반도체·자동차·금융 1종목씩', '한 종목 나눠 사기', DONT], answer: 1, explain: '다른 업종을 섞을수록 함께 흔들릴 위험이 줄어요.' },
];

export interface PlacementResult {
  startUnit: number;
  level: Level;
  correctByUnit: Record<number, number>;
  correct: number;
}

/**
 * 1~4단원 순서로, 그 단원 두 문제를 모두 맞혀야 다음 단원으로 넘어간다.
 * 처음으로 틀리거나 '모르겠어요'를 고른 단원에서 시작. 모두 맞히면 5단원부터.
 */
export function placeFromAnswers(answers: Record<string, number>): PlacementResult {
  const correctByUnit: Record<number, number> = {};
  let correct = 0;
  for (const q of PLACEMENT) {
    const ok = answers[q.id] === q.answer;
    if (ok) {
      correct += 1;
      correctByUnit[q.unit] = (correctByUnit[q.unit] ?? 0) + 1;
    }
  }
  let startUnit = 5;
  for (const u of [1, 2, 3, 4]) {
    const total = PLACEMENT.filter((q) => q.unit === u).length;
    if ((correctByUnit[u] ?? 0) < total) {
      startUnit = u;
      break;
    }
  }
  const level: Level = startUnit <= 1 ? 1 : startUnit <= 3 ? 2 : 3;
  return { startUnit, level, correctByUnit, correct };
}

/* ── 진행 ── */
export interface LessonRecord {
  at: number;
  xp: number;
  perfect: boolean;
  practiceDone: boolean;
}

export interface Progress {
  startUnit: number;
  completed: Record<string, LessonRecord>;
}

export function isUnitSkipped(p: Progress, unit: number) {
  return unit < p.startUnit;
}

export function isLessonDone(p: Progress, id: string) {
  return !!p.completed[id];
}

/** 열린 레슨: 시작 단원 이전(테스트로 통과) 또는 바로 앞 레슨을 끝낸 경우 */
export function isLessonUnlocked(p: Progress, id: string): boolean {
  const idx = ALL_LESSONS.findIndex((l) => l.id === id);
  if (idx < 0) return false;
  const lesson = ALL_LESSONS[idx];
  if (lesson.unit < p.startUnit) return true;
  if (idx === 0) return true;
  const prev = ALL_LESSONS[idx - 1];
  if (prev.unit < p.startUnit) return true; // 시작 단원 첫 레슨
  return isLessonDone(p, prev.id);
}

/** 다음에 할 레슨: 시작 단원부터 아직 안 끝낸 첫 레슨 */
export function nextLesson(p: Progress): Lesson | null {
  return ALL_LESSONS.find((l) => l.unit >= p.startUnit && !p.completed[l.id]) ?? null;
}

export function unitProgress(p: Progress, unit: Unit): { done: number; total: number } {
  return { done: unit.lessons.filter((l) => p.completed[l.id]).length, total: unit.lessons.length };
}

/* ── 오늘의 퀴즈 (데일리 카드뉴스 4장째 & 앱) ── */
export interface DailyQuiz {
  date: string;
  lessonId: string;
  q: string;
  options: string[];
  answer: number;
  explain: string;
}

/** 날짜와 다음 레슨으로 정해지는 퀴즈 — 서버(카드뉴스)와 앱이 같은 문제를 계산한다 */
export function dailyQuizFor(date: string, nextLessonId: string | null): DailyQuiz {
  const upto = nextLessonId ? ALL_LESSONS.findIndex((l) => l.id === nextLessonId) : ALL_LESSONS.length - 1;
  const pool = ALL_LESSONS.slice(0, Math.max(1, upto + 1)).flatMap((l) =>
    l.steps.filter((s): s is Extract<Step, { kind: 'quiz' }> => s.kind === 'quiz').map((s) => ({ lessonId: l.id, s })),
  );
  let h = 0;
  for (const c of date) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const pick = pool[h % pool.length];
  return { date, lessonId: pick.lessonId, q: pick.s.q, options: pick.s.options, answer: pick.s.answer, explain: pick.s.explain };
}

/* ── XP·스트릭 ── */
export const XP = { lesson: 10, perfect: 5, practice: 5, dailyCorrect: 3, dailyTry: 1 } as const;

export interface Streak {
  count: number;
  lastDate: string | null;
  best: number;
}

function prevDay(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, day - 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

/** 학습 활동(레슨 완료 또는 오늘의 퀴즈)이 있는 날 호출 */
export function bumpStreak(s: Streak, today: string): Streak {
  if (s.lastDate === today) return s;
  const count = s.lastDate === prevDay(today) ? s.count + 1 : 1;
  return { count, lastDate: today, best: Math.max(s.best, count) };
}

/** 화면에 보이는 현재 스트릭: 어제나 오늘 활동이 있어야 이어짐 */
export function currentStreak(s: Streak, today: string): number {
  return s.lastDate === today || s.lastDate === prevDay(today) ? s.count : 0;
}
