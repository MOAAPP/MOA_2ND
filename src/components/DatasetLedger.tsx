import { useEffect, useMemo, useState } from 'react';
import { won } from '../../shared/format';
import {
  getConfirmedSmsLedger, getDatasetSnapshot, getDatasetUsers,
  type ConfirmedSmsLedger, type DatasetSnapshot,
} from '../lib/financeApi';
import { Stage2Sms } from './Stage2Sms';

interface LedgerRow {
  key: string;
  occurred: number;
  name: string;
  amount: number | null;
  kind: string;
  method: string;
  source: '원본 관측' | '문자 확인';
}

const asKst = (timestamp: number) => timestamp
  ? new Date(timestamp).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  : '일시 확인 필요';

function confirmedRow(rec: ConfirmedSmsLedger, i: number): LedgerRow {
  const t = rec.transaction;
  const occurred = t.occurred_at ? Date.parse(t.occurred_at) : 0;
  return {
    key: t.source_id || `confirmed-${i}`,
    occurred: Number.isFinite(occurred) ? occurred : 0,
    name: t.merchant || t.kind,
    amount: t.amount,
    kind: t.kind,
    method: t.payment_method,
    source: '문자 확인',
  };
}

/** Transparent read-only browser for the *same* 20-person dataset used by Python finance. */
export function DatasetLedger() {
  const [ids, setIds] = useState<string[]>(['S01']);
  const [userId, setUserId] = useState('S01');
  const [snapshot, setSnapshot] = useState<DatasetSnapshot | null>(null);
  const [confirmed, setConfirmed] = useState<ConfirmedSmsLedger[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(30);
  const [smsOpen, setSmsOpen] = useState(false);

  useEffect(() => {
    const ctl = new AbortController();
    void getDatasetUsers(ctl.signal).then(data => {
      if (!ctl.signal.aborted && data.synthetic && data.users.length) setIds(data.users);
    }).catch(() => {});
    return () => ctl.abort();
  }, []);

  useEffect(() => {
    const ctl = new AbortController();
    setLoading(true);
    setError('');
    setLimit(30);
    Promise.all([
      getDatasetSnapshot(userId, ctl.signal),
      getConfirmedSmsLedger(userId, ctl.signal),
    ])
      .then(([source, ledger]) => {
        if (ctl.signal.aborted) return;
        if (source.user_id !== ledger.user_id) throw new Error('사용자별 데이터셋이 일치하지 않습니다.');
        setSnapshot(source);
        setConfirmed(ledger.transactions);
      })
      .catch((e: unknown) => {
        if (ctl.signal.aborted) return;
        setSnapshot(null); setConfirmed([]);
        setError(e instanceof Error ? e.message : '거래 데이터를 읽지 못했습니다.');
      })
      .finally(() => { if (!ctl.signal.aborted) setLoading(false); });
    return () => ctl.abort();
  }, [userId, retry]);

  useEffect(() => {
    const handler = () => setRetry(n => n + 1);
    window.addEventListener('moa:financial-updated', handler);
    return () => window.removeEventListener('moa:financial-updated', handler);
  }, []);

  const rows = useMemo(() => {
    if (!snapshot) return [];
    const source: LedgerRow[] = snapshot.transactions.map((t, i) => ({
      key: t.id ?? `source-${i}`,
      occurred: t.occurred_at ?? 0,
      name: t.name || t.kind || '내역 확인 필요',
      amount: typeof t.amount === 'number' ? t.amount : null,
      kind: t.kind || '기타',
      method: t.method || '미확인',
      source: '원본 관측',
    }));
    return [...source, ...confirmed.map(confirmedRow)]
      .sort((a, b) => b.occurred - a.occurred);
  }, [snapshot, confirmed]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? rows.filter(r => [r.name, r.kind, r.method, r.source].some(t => t.toLowerCase().includes(q)))
      : rows;
  }, [rows, query]);

  return (
    <div className="page t-page ux-dataset-ledger">
      <header className="ux-dataset-ledger-header">
        <div><small>FINANCIAL RECORDS · 합성 금융 데이터</small><h1>가계부</h1></div>
        <span>원본 데이터 조회</span>
      </header>
      <p className="ux-dataset-ledger-lead">합성 데이터셋에 기록된 거래를 그대로 표시해요. 미래 가정 시나리오와 이미지로 읽은 구매 후보는 실제 거래에 섞지 않아요.</p>
      <div className="ux-dataset-toolbar">
        <label><span>합성 사용자</span>
          <select className="input" value={userId} onChange={e => setUserId(e.target.value)}>
            {ids.map(id => <option key={id} value={id}>{id}{id === 'S01' ? ' · 메인 시연' : ''}</option>)}
          </select>
        </label>
        <label><span>거래 검색</span>
          <input className="input" value={query} onChange={e => { setQuery(e.target.value); setLimit(30); }}
            placeholder="가맹점·거래 유형 검색" />
        </label>
      </div>
      {userId === 'S01' && <button className="btn primary" type="button" onClick={() => setSmsOpen(true)}>결제 문자 가져오기 · 규칙 분석</button>}
      {smsOpen && <Stage2Sms onClose={() => { setSmsOpen(false); setRetry(n => n + 1); }} />}
      {loading && <p className="ux-dataset-status" role="status">공통 금융 데이터셋을 읽고 있어요…</p>}
      {error && <div className="ux-dataset-error" role="alert">
        <b>공통 금융 데이터 연결 오류</b><p>{error}</p>
        <button className="btn ghost" type="button" onClick={() => setRetry(n => n + 1)}>다시 불러오기</button>
      </div>}
      {snapshot && <>
        <div className="ux-dataset-summary">
          <div><small>기준일</small><b>{snapshot.snapshot_date}</b></div>
          <div><small>관측 거래</small><b>{snapshot.transactions.length.toLocaleString('ko-KR')}건</b></div>
          <div><small>확인 문자</small><b>{confirmed.length.toLocaleString('ko-KR')}건</b></div>
          <div><small>일별 기록</small><b>{snapshot.daily.length.toLocaleString('ko-KR')}일</b></div>
        </div>
        <section className="ux-dataset-ledger-list">
          <div className="ux-dataset-ledger-list-head"><h2>전체 거래 내역</h2><small>{matches.length.toLocaleString('ko-KR')}건 표시 가능</small></div>
          {matches.length ? (
            <ul>
              {matches.slice(0, limit).map(item => (
                <li key={item.source + item.key}>
                  <div className="ux-dataset-ledger-info">
                    <strong>{item.name}</strong>
                    <small>{asKst(item.occurred)} · {item.kind} · {item.source}</small>
                  </div>
                  <b className="num">{item.amount == null ? '금액 확인 필요' : won(item.amount)}</b>
                </li>
              ))}
            </ul>
          ) : <p className="ux-dataset-status">검색 조건에 맞는 거래가 없어요.</p>}
          {limit < matches.length && (
            <button className="ux-dataset-more" type="button" onClick={() => setLimit(x => x + 30)}>다음 30건 더 보기</button>
          )}
        </section>
        <p className="ux-dataset-ledger-foot">
          출처 {snapshot.dataset_id} · 원본 ZIP 읽기 전용 · {userId} 전용 데이터
          {userId !== 'S01' ? ' · 홈과 평행세계의 기본 시연은 S01입니다.' : ''}
        </p>
      </>}
    </div>
  );
}
