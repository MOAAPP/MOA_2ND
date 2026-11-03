/**
 * 규칙(정규식) 기반 추출기.
 * 1) AI 연결 전 예시 응답으로 쓰고
 * 2) 기획서 「AI 활용 근거」의 비교군(정규식 파서 vs LLM 추출기)이 된다.
 * LLM과 같은 원칙: 글에 없는 값은 null로 둔다.
 */
import type { ParsedKind, ParsedMethod, ParsedSchedule, ParsedSpend, ParseScheduleIn, ParseScheduleOut, ParseSpendIn, ParseSpendOut } from '../../../shared/aiPrompts';
import { ruleClassify } from '../ml/classify';

const AMOUNT_WON = /(\d{1,3}(?:,\d{3})+|\d{3,8})\s*원/;
const AMOUNT_BARE = /(?:^|\s)(\d{1,3}(?:,\d{3})+)(?!\d)/;
const DATE = /(?:(\d{4})[./-])?(\d{1,2})[./월-]\s?(\d{1,2})일?/;
const TIME = /(\d{1,2}):(\d{2})/;
const BALANCE = /잔액\s*[:：]?\s*(\d{1,3}(?:,\d{3})+|\d+)/;
const INFO_LINE = /(누적|한도|포인트)/;
const ISSUERS = /(카카오뱅크|토스뱅크|케이뱅크|KB국민|신한|국민|KB|삼성|현대|롯데|하나|우리|농협|NH|비씨|BC|카카오페이|토스|씨티|IBK|기업|새마을|우체국)/i;
const NOISE = /(\[[^\]]*\]|\([^)]*\)|web발신|국외발신|승인|일시불|할부\s*\d*개?월?|체크|신용|카드|님|사용|결제|입금|출금|이체|잔액\s*[\d,]+|\d{1,2}:\d{2}|\d{1,3}(?:,\d{3})+\s*원?|\d{3,8}\s*원|(?:\d{4}[./-])?\d{1,2}[./월-]\s?\d{1,2}일?|[*＊]+)/gi;
const ESSENTIAL = /(월세|관리비|통신|공과금|보험|학원|등록금|전기|가스|수도)/;

const pad = (n: number) => String(n).padStart(2, '0');
const num = (s: string) => Number(s.replace(/,/g, ''));

function kindOf(c: string): ParsedKind {
  if (/(승인\s?취소|취소|환불)/.test(c)) return 'refund';
  if (/(카드\s?대금|결제\s?대금|카드값|청구\s?금액\s?출금)/.test(c)) return 'card_payment';
  if (/적금/.test(c) && /(출금|이체|납입)/.test(c)) return 'saving';
  if (/(내\s?계좌|본인\s?계좌)/.test(c)) return 'transfer_self';
  if (/입금/.test(c)) return 'income';
  return 'spend';
}

function methodOf(c: string, kind: ParsedKind): ParsedMethod | null {
  if (/(ATM|atm|인출)/.test(c)) return 'atm';
  if (/체크/.test(c)) return 'debit';
  if (/(신용|일시불|할부)/.test(c)) return 'credit';
  if (/현금/.test(c)) return 'cash';
  if (kind === 'income' || kind === 'card_payment' || kind === 'saving' || kind === 'transfer_self' || /(출금|이체|자동이체)/.test(c)) return 'transfer';
  return null; // '카드 승인'만으로는 체크인지 신용인지 알 수 없다
}

export function ruleParseSpend(i: ParseSpendIn): ParseSpendOut {
  const year = Number(i.today.slice(0, 4));
  const blocks = i.text.split(/\n\s*\n|(?=\[web발신\])|(?=\[Web발신\])/).map((b) => b.trim()).filter(Boolean);
  const lineSplit = (b: string) => b.split('\n').map((l) => l.trim()).filter(Boolean);
  const chunks = blocks.flatMap((b) => {
    const amountLines = lineSplit(b).filter((l) => AMOUNT_WON.test(l) && !INFO_LINE.test(l) && !BALANCE.test(l)).length;
    return /web발신|\[[^\]]+\]/i.test(b) || amountLines <= 1 ? [b] : lineSplit(b);
  });
  const items: ParsedSpend[] = [];
  let skipped = 0;
  for (const raw of chunks) {
    const balM = raw.match(BALANCE);
    const body = raw.split('\n').filter((l) => !INFO_LINE.test(l)).join('\n').replace(BALANCE, ' ');
    const a = body.match(AMOUNT_WON) ?? body.match(AMOUNT_BARE);
    if (!a) { skipped += 1; continue; }
    const amount = num(a[1]);
    if (!amount) { skipped += 1; continue; }
    const kind = kindOf(raw);
    const method = methodOf(raw, kind);
    const d = body.match(DATE);
    let date: string | null = null;
    if (d) {
      const mm = Number(d[2]), dd = Number(d[3]);
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
        let y = d[1] ? Number(d[1]) : year;
        if (!d[1] && `${y}-${pad(mm)}-${pad(dd)}` > i.today) y -= 1;
        date = `${y}-${pad(mm)}-${pad(dd)}`;
      }
    }
    const t = body.match(TIME);
    const inst = raw.match(/할부\s*(\d{1,2})/);
    const issuer = raw.match(ISSUERS)?.[1] ?? null;
    const clean = (l: string) => l.replace(/\[[^\]]*\]/g, ' ').replace(NOISE, ' ').replace(ISSUERS, ' ').replace(/[^\p{L}\p{N}&·\s-]/gu, ' ').replace(/\s+/g, ' ').trim();
    const lines = body.split('\n').map(clean).filter((l) => l.length >= 2);
    const name = ((lines.at(-1) ?? clean(body)) || (kind === 'income' ? '입금' : kind === 'card_payment' ? '카드 대금' : '지출')).slice(0, 20);
    const cls = ruleClassify(name);
    const essential = ESSENTIAL.test(raw);
    let confidence = (cls ? 0.6 + cls.confidence * 0.3 : 0.45) + (date ? 0.05 : -0.1) + (method ? 0.03 : -0.05);
    confidence = Math.max(0.1, Math.min(0.97, Math.round(confidence * 100) / 100));
    items.push({
      date,
      time: t ? `${pad(Number(t[1]))}:${t[2]}` : null,
      amount,
      name,
      category: kind === 'income' ? '수입' : essential && cls?.category === '기타' ? '생활' : cls?.category ?? '기타',
      method,
      kind,
      issuer,
      installments: inst ? Number(inst[1]) : null,
      balanceAfter: balM ? num(balM[1]) : null,
      essential,
      confidence,
    });
  }
  return { items, skipped };
}

/* ───────── 일정 문장 ───────── */

function parseAmount(seg: string): number | null {
  const m = seg.match(/(\d+(?:\.\d+)?)\s?만(?:\s?(\d+)\s?천)?\s?원?|(\d{1,3}(?:,\d{3})+|\d+)\s?천\s?원?|(\d{1,3}(?:,\d{3})+|\d{3,})\s?원/);
  if (!m) return null;
  if (m[1]) return Math.round(Number(m[1]) * 10000 + (m[2] ? Number(m[2]) * 1000 : 0));
  if (m[3]) return num(m[3]) * 1000;
  return num(m[4]);
}

export function ruleParseSchedule(i: ParseScheduleIn): ParseScheduleOut {
  const [ty, tm, td] = i.today.split('-').map(Number);
  const segs = i.text.split(/[,\n]|그리고|(?<=고)\s|(?<=나가)\s|(?<=와)\s/).map((s) => s.trim()).filter(Boolean);
  const items: ParsedSchedule[] = [];
  let ctxMonth: 'this' | 'next' | null = null;
  for (const seg of segs) {
    const amount = parseAmount(seg);
    const dayM = seg.match(/(\d{1,2})\s?일/);
    if (amount === null && !dayM) continue;
    if (/다음\s?달/.test(seg)) ctxMonth = 'next';
    else if (/이번\s?달/.test(seg)) ctxMonth = 'this';
    const monthly = /(매달|매월|달마다)/.test(seg);
    const md = seg.match(/(\d{1,2})\s?월\s?(\d{1,2})\s?일/);
    let date: string | null = null;
    let day: number | null = null;
    if (monthly && dayM) day = Number(dayM[1]);
    else if (md) {
      let y = ty;
      if (Number(md[1]) < tm) y += 1;
      date = `${y}-${pad(Number(md[1]))}-${pad(Number(md[2]))}`;
    } else if (dayM) {
      const dd = Number(dayM[1]);
      let y = ty, m = tm;
      if (ctxMonth === 'next' || (ctxMonth === null && dd < td)) { m += 1; if (m > 12) { m = 1; y += 1; } }
      date = `${y}-${pad(m)}-${pad(Math.min(dd, 31))}`;
    }
    const direction: 'in' | 'out' | null = /(들어|받|입금|월급|급여|알바비|용돈|지원)/.test(seg) ? 'in' : /(나가|내고|내야|빠져|출금|월세|카드값|통신비|관리비|납부|결제)/.test(seg) ? 'out' : null;
    const name = seg
      .replace(/(다음|이번)\s?달|매달|매월|달마다/g, ' ')
      .replace(/\d+(?:\.\d+)?\s?만(?:\s?\d+\s?천)?\s?원?|\d[\d,]*\s?(?:천\s?)?원|\d{1,2}\s?월|\d{1,2}\s?일(?:에|에는)?/g, ' ')
      .replace(/(들어오고|들어와|들어옴|받고|받아|나가고|나가|빠져|내고|내야\s?해|있어|이고|에)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 16) || (direction === 'in' ? '입금' : '지출');
    items.push({ name, amount, direction, date, day, recurrence: monthly ? 'monthly' : date ? 'once' : null });
  }
  return { items };
}
