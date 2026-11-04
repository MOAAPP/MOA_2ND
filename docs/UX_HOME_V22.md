# MOA Home v22 — UX, data semantics and navigation

## Active components and contract
- **Active home:** \`src/App.tsx\` → \`src/screens/V8Finance.tsx\` → \`V8Home\`. The historical \`src/screens/Home.tsx\` is not wired to the home tab.
- Navigation: \`src/state/nav.tsx\`; bottom tabs Home, Ledger, Parallel, Savings, Investment; detail screens are pushed onto the navigation stack.
- **Preserved from PR #31:** \`Onboarding\` first-screen “일단 예시 데이터로 시작하기”, secondary tour, and safe return for pre-existing users.
- **Real transactions are never fetched from a connected bank.** Personal mode is based on user-entered amounts and schedules; S01 data are deterministic synthetic observations.

## Information hierarchy (active home, top to bottom)
1. \`ShortfallCard\`: focus on the riskiest near-term obligatory payment, balance anchor and forecast status. The sole call-to-action is “결제일 영향 확인”; the detail screen receives that payment's key.
2. \`HomeSpend\`: today's observed or manually entered spending, **including essential fixed expenses**, visible row count and monthly cumulative total. “오늘 내역 보기” opens the calendar on today's day; “지출 추가하기” opens the existing expense sheet directly and returns after closing.
3. \`ux-home-decision\`: exactly **one** prominent “소비 선택 비교하기” CTA, navigating to the existing \`Choose\` input.
4. \`ux-home-world\`: recorded hypothetical choice effects, small differentiated SVG branches, recently recorded decision, detail link. No investment upsell.
5. \`ux-home-extras\`: virtual assets and AI, collapsed by default. Only nonzero held savings/ETF are listed when expanded. Risk of shortfall adds a text warning that a virtual asset does not settle a real account bill.

## Financial terms and sources
| Visible term | Source and formula | Clock | Identity |
|---|---|---|---|
| 결제계좌 잔액 | \`state.moa.anchor.balance\`, synchronized to \`state.profile.baseBalance\` | \`anchor.at\` | User-entered or S01 synthetic; **not live banking** |
| 결제일 부족/예상 잔고 | \`assessRisk(state.moa, appNow(state), appDay(state))\`; schedule + verified credit due + optional spending forecast | \`appDay\` | Dated projection, never an amount owned at present |
| 오늘 / 이번 달 기록 지출 | \`useSpending()\`: actual records + unique ID-matched S01 essential expenses; sum today/month, no future records | \`appDay\` | Recorded expenses (zero records does **not** mean a verified zero-spend day) |
| 가상 소비 가능 금액 | \`walletSummary(state.worldWallet).cash - protectedBills - WORLD_SAFETY_BUFFER\`; display floor zero with explanatory deficit | \`appDay\` for demo simulation | **Virtual**, not payment account balance; protectedBills originates from S01 schedule sum **486,000 KRW** |
| 가상 자산 합계 | \`walletSummary(...).cash + savings + stockValue\` | portfolio quote time / simulation wallet | **Virtual** ledger only; not added to real/entered account |
| 선택 누적 차이 | \`worldHistory(wallet,30,appNow).at(-1).gap\`; comparison against paying full price for included hypothetical decisions | 30 calendar days ending \`appDay\` | What-if comparison, not an actual saved amount or account asset |
| AI 설명 | \`useAi('brief', briefInput(...))\` loaded only after expanding | current recorded inputs | Interpretation only. Deterministic \`assessRisk\` owns all monetary/date calculations |

The legacy \`WORLD_FIXED_BILLS=530000\` and \`WORLD_MONTHLY_INCOME=800000\` remain as **backward-compatible fallbacks for unconfigured/legacy virtual worlds** and the separate non-demo payday model; they must not render as S01 monthly rent/bills. S01 uses schedule values, and BankClock suppresses the older first-of-month payday/expense replay for the demo.

## S01 date semantics and data integrity
- \`DEMO_SNAPSHOT_DAY=2026-11-04\`, \`DEMO_END_DAY=2026-12-11\` in \`src/lib/appClock.ts\`.
- Entering a fresh sample loads the same S01 snapshot into profile, Moa account, ledger, and virtual wallet. The selected \`demoDay\` is persisted; **device date does not silently advance demo records**.
- Home date-control steps from Nov 4 to Dec 11 explicitly; past records persist, later dates are **unobserved** unless the user manually records on them. No future oracle EOD balance is loaded into the observed account.
- Day-specific risk/date labels, home ledger, world graph and report use \`appDay/appNow\`. Separate bank product “time travel” remains clearly a virtual financial product experiment, not a real balance change.
- 2026-11-04 synthetic expected data: closing account 27,800 KRW; five variable spend entries totaling 31,000 KRW; rent 350,000 KRW per month; monthly essential schedule total 486,000 KRW. **These are assertions on the generator, not hardcoded UI strings.**
- Neither revisiting onboarding nor changing the demo presentation day deletes or silently overwrites user-entered records. “최신 예시 데이터 다시 불러오기” explicitly warns it resets the demo.

## Navigation/button contract
| Action | Route | Return / mutation |
|---|---|---|
| 결제일 영향 확인 | \`shortfall(paymentKey)\` | Same focused payment; back returns home |
| 오늘 내역 보기 | bottom \`ledger\` | Calendar starts at appDay |
| 지출 추가하기 | \`ledgerAdd\` | Direct expense sheet. On save: unique MOA txn and one ledger row, then home |
| 소비 선택 비교하기 | \`choose\` | Enter amount and optional item, compare debit/credit due-date effects; **no changes during preview** |
| 비교만 하고 닫기 | \`nav.pop()\` | Discard preview, keep state |
| 선택 기록하기 | \`saveChoice\` | One decision; only paid purchases produce one same-ID ledger/Moa spend, credit charges on the correct future statement |
| 선택 비교 결과 보기 | bottom \`forks\` | World timeline details and report |
| 가상 보유상품 | bottom \`save\` or \`invest\` | Deliberately virtual; cannot pay a real bill |
| AI 분석 더 보기 | expand → \`ask\` | Non-primary contextual explanation |

## Safeguards and limitations
- No user data reset in this redesign, no S02–S20 synthetic data modifications.
- Comparison decision is not moralized as good/bad. Buying may be a valid outcome.
- S01 saved **debit** on the already reconciled snapshot day reduces \`moa.anchor\` once; credit use does not reduce payment cash until its statement due day; the hypothetical wallet does not debit the same purchase twice.
- Historical scenario: S01 is intentionally short of cash. The home does not recommend buying simulated ETF or deposits in a shortage.
- Bank accounts, market feeds, credit card balances, actual account deposits and optional AI/ML APIs are not claimed to be connected or guaranteed. Market quotes and fallback AI may be stale or synthetic. 
- Automated tests and type/build checks must be reported separately from browser-based visual inspection. Pixel/interactive QA is not verified by unit tests.
