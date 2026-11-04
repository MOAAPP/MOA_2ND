import { JobView, type PublicJob } from './CardNews';
import { Notice, TopBar } from '../components/ui';
import { useNav } from '../state/nav';

const titles = ['시장 한눈에', '관심 종목', '변화 읽기', '오늘의 퀴즈'];
const cards = titles.map((title, index) => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="900">'
    + '<rect width="720" height="900" rx="32" fill="#f5f6ff"/>'
    + '<rect x="38" y="38" width="644" height="824" rx="30" fill="#fff"/>'
    + '<text x="76" y="150" font-size="27" fill="#4b47df" font-family="sans-serif">MOA · SAMPLE ' + (index + 1) + '/4</text>'
    + '<text x="76" y="320" font-size="57" font-weight="bold" fill="#171a36" font-family="sans-serif">' + title + '</text>'
    + '<text x="76" y="425" font-size="29" fill="#515973" font-family="sans-serif">이곳에서 카드 내용을 확인해요</text>'
    + '<text x="76" y="800" font-size="24" fill="#898b9c" font-family="sans-serif">실제 시장 정보가 아닌 UI 예시</text>'
    + '</svg>';
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
});

export const sampleCardNewsJob: PublicJob = {
  id: 'sample-ui', kind: 'daily', tradeId: 'sample-ui', dailyDate: null,
  createdAt: 0, updatedAt: 0, status: 'generated', stage: null, error: null,
  retryable: false, code: null, name: '카드뉴스 화면 샘플', side: null,
  qty: null, price: null, level: 1, autoSend: false, noPhoto: true,
  images: cards, titles, photos: [], news: [], quoteMeta: null,
  summary: '', headline: null, notice: null, sends: [],
};


/** Purely illustrative 4-page viewer available outside market hours. No API calls. */
export function CardNewsDemo() {
  const nav = useNav();
  return (
    <div className="page no-nav">
      <TopBar onBack={nav.pop} title="카드뉴스 화면 체험" center />
      <Notice kind="info">장 마감에도 볼 수 있는 화면 예시예요. 실제 가격이나 거래 내역이 아니며, 서버 요청·가상 매매·Discord 발송은 하지 않아요.</Notice>
      <JobView job={sampleCardNewsJob} setJob={() => undefined} reload={() => undefined} onError={() => undefined} />
    </div>
  );
}
