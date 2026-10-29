/** Vercel 서버리스 함수 진입점 → api/index.mjs (npm run bundle:api) */
process.env.DAILY_SCHEDULER ??= 'off';
process.env.DATA_DIR ??= '/tmp/parallel-bank-data';
const { app } = await import('./index');
export default app;
