import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './styles.css';
import './ux-refresh.css';
import './ux-v3.css';
import './ux-fintech.css';
import './ux-v5.css';
import './ux-v6.css';
import './ux-v7.css';
import './ux-v8.css';
import './ux-v9.css';
import './ux-v12.css';
import './ux-v15.css';
import './ux-v16-bank.css';
import './ux-v16-ds.css';
import './ux-v16-choose.css';
import './ux-v17.css';
import './ux-v18.css';
import './ux-v19.css';
import './ux-moa.css';
import './ux-v21-schedule-ledger.css';
import './ux-v22-home.css';
import './design/tokens.css';
import './design/stage3.css';
import './design/stage6.css';
import './design/stage3-ai.css';
import './design/home-ai-restore.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// PWA: 프로덕션에서만 서비스 워커 등록 (앱 껍데기 캐시, API는 캐시하지 않음)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
