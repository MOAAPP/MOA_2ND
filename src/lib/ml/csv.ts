import { addDays, isISODate, type ISODate } from '../../../shared/dates';
import { CATEGORIES } from '../categories';
import { ruleClassify } from './classify';
import type { SpendEntry } from './types';

export interface CsvResult {
  entries: SpendEntry[];
  skippedFixed: number;
  total: number;
  lastDate: ISODate | null;
  errors: string[];
}

/** 고정지출은 일정에 이미 있으므로 생활비 예측에서 뺀다 */
const FIXED = ['월세', '관리비', '통신', '구독', '보험', '대출', '적금', '공과금'];
const MAX_ROWS = 50000;
const KEEP_DAYS = 90;

const COLS = {
  date: ['date', '날짜', '일자', '거래일', '거래일자'],
  amount: ['amount', '금액', '출금액', '지출', '사용금액'],
  category: ['category', '카테고리', '분류'],
  name: ['name', '내용', '상품명', '적요', '가맹점', '사용처', 'memo', '메모'],
};

function splitLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else q = !q;
    } else if (c === ',' && !q) {
      out.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  out.push(cur.trim());
  return out;
}

function toISO(v: string): ISODate | null {
  const m = v.trim().match(/^(\d{4})[-./]?(\d{1,2})[-./]?(\d{1,2})/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return isISODate(iso) ? iso : null;
}

/**
 * 지출 CSV → 생활비 기록. 파일은 브라우저 안에서만 읽는다.
 * 필수 컬럼: 날짜, 금액 / 선택: 카테고리, 내용(없으면 내용으로 자동 분류)
 */
export function parseSpendCsv(text: string, today: ISODate, memory: Record<string, string> = {}): CsvResult {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const errors: string[] = [];
  if (!lines.length) return { entries: [], skippedFixed: 0, total: 0, lastDate: null, errors: ['빈 파일이에요'] };
  const head = splitLine(lines[0]).map((h) => h.toLowerCase());
  const find = (names: string[]) => head.findIndex((h) => names.includes(h));
  const iDate = find(COLS.date);
  const iAmount = find(COLS.amount);
  const iCat = find(COLS.category);
  const iName = find(COLS.name);
  if (iDate < 0 || iAmount < 0) return { entries: [], skippedFixed: 0, total: 0, lastDate: null, errors: [`필수 컬럼(날짜, 금액)이 없어요. 헤더: ${head.join(', ')}`] };
  if (lines.length - 1 > MAX_ROWS) errors.push(`최대 ${MAX_ROWS}줄까지만 읽었어요`);

  const since = addDays(today, -KEEP_DAYS);
  const entries: SpendEntry[] = [];
  let skippedFixed = 0;
  let lastDate: ISODate | null = null;
  for (let r = 1; r < Math.min(lines.length, MAX_ROWS + 1); r++) {
    const cells = splitLine(lines[r]);
    const date = toISO(cells[iDate] ?? '');
    const amount = Math.abs(Number(String(cells[iAmount] ?? '').replace(/[^\d.-]/g, '')));
    if (!date) {
      if (errors.length < 5) errors.push(`${r + 1}번째 줄: 날짜를 읽을 수 없어요`);
      continue;
    }
    if (!Number.isFinite(amount) || amount <= 0) continue;
    if (date > today || date < since) continue;
    const name = iName >= 0 ? cells[iName] : undefined;
    let category = iCat >= 0 ? cells[iCat] : '';
    if (FIXED.some((f) => `${category}${name ?? ''}`.includes(f))) {
      skippedFixed++;
      continue;
    }
    if (!(CATEGORIES as readonly string[]).includes(category)) category = name ? ruleClassify(name, memory)?.category ?? '기타' : '기타';
    entries.push({ date, amount: Math.round(amount), category, name: name || undefined, from: 'csv' });
    if (!lastDate || date > lastDate) lastDate = date;
  }
  return { entries, skippedFixed, total: lines.length - 1, lastDate, errors };
}

export function sampleCsv(today: ISODate): string {
  const rows = ['날짜,금액,카테고리,내용'];
  const items: [number, string, string][] = [
    [8500, '식비', '학식'],
    [4700, '카페', '아메리카노'],
    [23000, '식비', '배달 마라탕'],
    [1450, '교통', '지하철'],
    [12000, '문화·여가', '영화'],
    [6900, '생활', '다이소'],
  ];
  for (let i = 28; i >= 1; i--) {
    const d = addDays(today, -i);
    const pick = items[i % items.length];
    rows.push(`${d},${pick[0]},${pick[1]},${pick[2]}`);
    if (i % 3 === 0) rows.push(`${d},${items[(i + 2) % items.length][0]},${items[(i + 2) % items.length][1]},${items[(i + 2) % items.length][2]}`);
  }
  rows.push(`${addDays(today, -5)},350000,월세,월세`);
  return rows.join('\n');
}
