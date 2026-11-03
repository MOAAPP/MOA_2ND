#!/usr/bin/env python3
"""Deterministic, DB-free MOA synthetic fixture: 2026-09-11..2026-12-11 inclusive.

Run from repository root: python3 scripts/data/generate_common_92.py
All values are fabricated for demo/model testing, never real bank/stock records.
The future after AS_OF is a *simulation*, not observed history.
"""
from __future__ import annotations

import csv
import json
import math
import random
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "moa-2026-fall"
FRONT = ROOT / "src" / "data" / "moa92.json"
START, END, AS_OF = date(2026, 9, 11), date(2026, 12, 11), date(2026, 11, 4)
KST = timezone(timedelta(hours=9))
SEED = 20260911
CODES = ("360750", "069500")  # all prices below are synthetic examples, never live quotes
STOCK_NAMES = {"360750": "TIGER 미국S&P500", "069500": "KODEX 200"}
MENU = [
    ("식비", "학교 식당", 6500), ("식비", "편의점 도시락", 5900),
    ("식비", "배달 한 끼", 19500), ("카페", "아메리카노", 4500),
    ("카페", "카페 디저트", 7900), ("교통", "지하철·버스", 1550),
    ("생활", "생필품", 8500), ("쇼핑", "온라인 소품", 14900),
    ("문화·여가", "영화·모임", 13500), ("식비", "분식", 7600),
]
CHOICE_MENU = [
    ("배달 야식", 23500, "식비"), ("무선 이어폰", 159000, "쇼핑"),
    ("택시", 14800, "교통"), ("카페 라떼", 5500, "카페"),
    ("러닝 스니커즈", 129000, "패션"), ("OTT 연간권", 99000, "구독"),
    ("디저트", 12000, "카페"), ("친구와 저녁", 28000, "식비"),
]
# id, scenario, starting pay account, salary(day, amount), rent, monthly savings, missing recording probability
CONFIGS = [
    ("S01", "기본 대학생·평행세계 체험", 800000, 1, 800000, 400000, 45000, .04),
    ("S02", "소액 지출 반복", 1050000, 10, 1050000, 380000, 35000, .06),
    ("S03", "주말 집중 소비", 1100000, 5, 900000, 420000, 65000, .08),
    ("S04", "월급 입금 지연", 380000, 23, 750000, 450000, 10000, .12),
    ("S05", "식비 비중 높음", 1250000, 15, 900000, 450000, 30000, .05),
    ("S06", "결제일 잔액 부족", 320000, 28, 720000, 500000, 10000, .13),
    ("S07", "소비가 불규칙", 1100000, 1, 820000, 400000, 65000, .14),
    ("S08", "신용카드 비중 높음", 1120000, 10, 950000, 390000, 50000, .09),
    ("S09", "월말 지출 급증", 550000, 27, 900000, 470000, 20000, .11),
    ("S10", "안정적 저축형", 1350000, 5, 1050000, 360000, 95000, .04),
]
TRAN_FIELDS = ["id","user_id","date","at_kst","kind","category","merchant","amount_krw",
               "method","account","essential","recorded","stage","bank_delta_krw",
               "card_id","linked_id"]
DAY_FIELDS = ["user_id","date","stage","weekday","recorded_day","actual_variable_spend_krw",
              "recorded_variable_spend_krw","income_krw","fixed_paid_krw","card_paid_krw",
              "txn_count","bank_delta_krw","bank_balance_end_krw","deficit_flag"]
CHOICE_FIELDS = ["id","user_id","date","at_kst","item","category","original_price_krw",
                 "paid_krw","choice","saved_vs_buy_krw","stage"]
TRADE_FIELDS = ["id","user_id","date","at_kst","code","stock_name","side","qty",
                "price_krw","amount_krw","stage","note"]
FEAT_FIELDS = ["user_id","as_of_date","target_date","split","as_of_weekday",
               "days_to_salary","days_to_rent","observed_days_14","mean_recorded_14_krw",
               "last_recorded_spend_krw","prev_day_recorded","target_actual_spend_krw",
               "target_recorded","target_stage"]
DATE_LIST = [START + timedelta(days=i) for i in range((END-START).days+1)]


def epoch_ms(day: date, hour=12, minute=0) -> int:
    return int(datetime(day.year, day.month, day.day, hour, minute, tzinfo=KST).timestamp()*1000)


def kst_iso(day: date, hour=12, minute=0) -> str:
    return datetime(day.year, day.month, day.day, hour, minute, tzinfo=KST).isoformat(timespec="minutes")


def stage(day: date) -> str:
    return "future_scenario" if day > AS_OF else "historical_synthetic"


def month_day(day: date, n: int) -> bool:
    # All configured dates are <= 28, so there is no missing-day roll-over.
    return day.day == n


def market_price(day: date, code: str) -> int:
    # Deterministic fictional price series, not fetched market quotes.
    i = (day - START).days
    origin = 25500 if code == "360750" else 33000
    return round((origin + 90*math.sin(i/5.0) + i*(12 if code == "360750" else -4))/100)*100


def csv_write(path: Path, fields: list[str], rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        for row in rows:
            w.writerow(row)


def build() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    FRONT.parent.mkdir(parents=True, exist_ok=True)
    transactions, daily, choices, trades, schedules, profiles = [], [], [], [], [], []
    demo_source = {}
    for index, (uid, scenario, start_cash, salary_day, income, rent, saving, missing) in enumerate(CONFIGS):
        rng = random.Random(SEED + index*1009)
        cash = start_cash
        card_pending: list[dict] = []
        all_user_tx, all_user_days, all_user_choices, all_user_trades = [], [], [], []
        salary_delay_months = {"2026-10": 3, "2026-11": 4} if uid == "S04" else (
            {"2026-10": 5, "2026-11": 3} if uid == "S06" else {}
        )
        schedule = [
            {"id": f"{uid}-salary", "name": "알바비", "direction": "in", "amount": income,
             "recurrence": "monthly", "day": salary_day, "essential": False, "status": "scheduled"},
            {"id": f"{uid}-rent", "name": "월세", "direction": "out", "amount": rent,
             "recurrence": "monthly", "day": 25 if uid != "S01" else 1, "essential": True},
            {"id": f"{uid}-phone", "name": "통신비", "direction": "out", "amount": 55000,
             "recurrence": "monthly", "day": 1 if uid == "S01" else 16, "essential": True},
            {"id": f"{uid}-bills", "name": "관리비·구독", "direction": "out", "amount": 75000 if uid == "S01" else 19000,
             "recurrence": "monthly", "day": 1 if uid == "S01" else 8, "essential": True},
        ]
        schedules.append({"user_id": uid, "scenario": scenario, "start_cash_krw": start_cash,
                          "salary_delays": salary_delay_months, "schedule": schedule})
        profiles.append({"user_id": uid, "scenario": scenario, "start_cash_krw": start_cash,
                         "salary_day": salary_day, "salary_krw": income, "rent_krw": rent,
                         "savings_goal_krw": saving, "missing_record_rate_assumption": missing})
        tx_no, choice_no, trade_no = 0, 0, 0
        for day in DATE_LIST:
            start_idx = len(all_user_tx)
            ds = day.isoformat()
            month = ds[:7]
            # Reference 'actual' cash-flow scenario; only recorded=true transactions enter the demo ledger.
            def put(kind, category, merchant, amount, hour, method="transfer", account="pay", 
                    essential=False, recorded=True, bank_delta=None, card_id="", linked_id=""):
                nonlocal cash, tx_no
                tx_no += 1
                if bank_delta is None:
                    bank_delta = amount if kind == "income" else (-amount if account == "pay" else 0)
                row = {"id": f"{uid}-t{tx_no:05d}", "user_id": uid, "date": ds,
                       "at_kst": kst_iso(day, hour, tx_no%59), "kind": kind,
                       "category": category, "merchant": merchant, "amount_krw": amount,
                       "method": method, "account": account, "essential": int(essential),
                       "recorded": int(recorded), "stage": stage(day), 
                       "bank_delta_krw": bank_delta, "card_id": card_id, "linked_id": linked_id}
                all_user_tx.append(row)
                cash += bank_delta
                return row

            if day.day == 14:
                last_month = f"{day.year-1}-12" if day.month == 1 else f"{day.year}-{day.month-1:02d}"
                billed = [x for x in card_pending if x["date"][:7] == last_month]
                if billed:
                    put("card_payment", "카드대금", "신용카드 자동결제", sum(x["amount_krw"] for x in billed), 7,
                        method="transfer", account="pay", essential=True)
                card_pending = [x for x in card_pending if x not in billed]

            actual_salary = salary_day + salary_delay_months.get(month, 0)
            if month_day(day, actual_salary):
                put("income", "급여", "알바비", income, 9, method="transfer", essential=False)
            for fixed in schedule[1:]:
                if month_day(day, fixed["day"]):
                    put("fixed_bill", "필수결제", fixed["name"], fixed["amount"], 8,
                        method="transfer", essential=True)

            weekend = day.weekday() >= 5
            # There are intentionally zero-spend days; an unlogged day is NOT assumed to be zero.
            zero_day = (rng.random() < (.10 if weekend else .17))
            count = 0 if zero_day else (1 + (1 if weekend else 0) + (1 if rng.random() < .4 else 0))
            if uid in ("S03", "S09") and (weekend or day.day >= 26):
                count += 1
            if uid == "S02" and not zero_day:
                count += 1
            logged = rng.random() >= missing
            for j in range(count):
                cat, merchant, amount = rng.choice(MENU)
                if uid in ("S03", "S09") and (weekend or day.day >= 26):
                    amount = int(amount*1.65)
                if uid == "S05" and cat == "식비":
                    amount = int(amount*1.4)
                amount = max(1000, round(amount*(.8+rng.random()*.45)/100)*100)
                credit = rng.random() < (.53 if uid == "S08" else .2)
                method = "credit" if credit else ("cash" if rng.random() < .07 else "debit")
                account = "other" if credit else "cash" if method == "cash" else "pay"
                row = put("spend", cat, merchant, amount, 11+min(j,8)*2, method=method,
                          account=account, recorded=logged or rng.random() < .08,
                          bank_delta=0 if account != "pay" else -amount,
                          card_id=f"{uid}-credit" if credit else (f"{uid}-check" if method == "debit" else ""))
                if credit:
                    card_pending.append(row)

            if (day-START).days % 4 == index % 4:
                choice_no += 1
                item, price, category = CHOICE_MENU[(choice_no+index*2)%len(CHOICE_MENU)]
                action = ("wait", "alternative", "buy")[(choice_no+index)%3]
                paid = 0 if action == "wait" else round(price*.55) if action == "alternative" else price
                all_user_choices.append({
                    "id": f"{uid}-choice-{choice_no:03d}", "user_id": uid, "date": ds,
                    "at_kst": kst_iso(day, 19), "item": item, "category": category,
                    "original_price_krw": price, "paid_krw": paid, "choice": action,
                    "saved_vs_buy_krw": price-paid, "stage": stage(day)})

            if day.weekday() < 5 and (day-START).days in (10+index%3, 34+index%4, 49+index%3, 71+index%4):
                trade_no += 1
                code = CODES[index%2]
                side = "sell" if trade_no == 3 else "buy"
                qty = 1 if side == "sell" else 2
                price = market_price(day, code)
                all_user_trades.append({
                    "id": f"{uid}-trade-{trade_no:03d}", "user_id": uid, "date": ds,
                    "at_kst": kst_iso(day, 13), "code": code, "stock_name": STOCK_NAMES[code],
                    "side": side, "qty": qty, "price_krw": price,
                    "amount_krw": qty*price, "stage": stage(day),
                    "note": "가상 ETF 체결 예시 (가상 시세)"})

            user_day_tx = all_user_tx[start_idx:]
            variable = [x for x in user_day_tx if x["kind"] == "spend"]
            dayrow = {
                "user_id": uid, "date": ds, "stage": stage(day), "weekday": day.weekday(),
                "recorded_day": int(any(x["recorded"] for x in variable)),
                "actual_variable_spend_krw": sum(x["amount_krw"] for x in variable),
                "recorded_variable_spend_krw": sum(x["amount_krw"] for x in variable if x["recorded"]),
                "income_krw": sum(x["amount_krw"] for x in user_day_tx if x["kind"] == "income"),
                "fixed_paid_krw": sum(x["amount_krw"] for x in user_day_tx if x["kind"] == "fixed_bill"),
                "card_paid_krw": sum(x["amount_krw"] for x in user_day_tx if x["kind"] == "card_payment"),
                "txn_count": len(user_day_tx),
                "bank_delta_krw": sum(x["bank_delta_krw"] for x in user_day_tx),
                "bank_balance_end_krw": cash,
                "deficit_flag": int(cash < 0),
            }
            all_user_days.append(dayrow)

        # Feature table uses only recordings prior to the target_date; never actual targets or later rows.
        observed = {x["date"]: x for x in all_user_days}
        for day in DATE_LIST[14:]:
            as_of = day-timedelta(days=1)
            past = [observed[(day-timedelta(days=k)).isoformat()] for k in range(1,15)]
            recorded_past = [x for x in past if x["recorded_day"]]
            prev = past[0]
            obs = [x["recorded_variable_spend_krw"] for x in recorded_past]
            phase = "train" if day <= date(2026,10,20) else "validation" if day <= AS_OF else "test_synthetic_future"
            target = observed[day.isoformat()]
            all_user_features = {
                "user_id":uid, "as_of_date":as_of.isoformat(), "target_date":day.isoformat(),
                "split":phase, "as_of_weekday":as_of.weekday(),
                "days_to_salary":(next((d for d in DATE_LIST if d >= day and d.day == salary_day), END)-day).days,
                "days_to_rent":(next((d for d in DATE_LIST if d >= day and d.day == (1 if uid=="S01" else 25)), END)-day).days,
                "observed_days_14":len(obs),
                "mean_recorded_14_krw":round(sum(obs)/len(obs)) if obs else "",
                "last_recorded_spend_krw":obs[0] if obs else "",
                "prev_day_recorded":prev["recorded_day"],
                "target_actual_spend_krw":target["actual_variable_spend_krw"],
                "target_recorded":target["recorded_day"],
                "target_stage":target["stage"]
            }
            FEATURE_ROWS.append(all_user_features)

        transactions.extend(all_user_tx)
        daily.extend(all_user_days)
        choices.extend(all_user_choices)
        trades.extend(all_user_trades)
        if uid == "S01":
            demo_source = {
                "user_id": uid, "scenario": scenario, "start_cash_krw": start_cash,
                "start": START.isoformat(), "end": END.isoformat(), "as_of": AS_OF.isoformat(),
                "profile": {
                    "baseBalance": start_cash, "minBalance": 120000, "dailySpend": 11000,
                    "items": [{"id": f["id"], "kind": "income" if f["direction"]=="in" else "expense",
                               "name":f["name"], "amount":f["amount"], "recurrence":"monthly",
                               "day":f["day"]} for f in schedule],
                    "goal": {"name":"겨울 여행", "target":850000, "saved":150000,
                             "monthlySaving":85000, "annualRate":0},
                },
                "cards": [
                    {"id":f"{uid}-credit", "name":"가상 신용카드", "kind":"credit",
                     "linked":False, "cutoffDay":31,"payDay":14},
                    {"id":f"{uid}-check", "name":"가상 체크카드", "kind":"debit","linked":True},
                ],
                "schedule": schedule, "transactions": all_user_tx, "daily": all_user_days,
                "choices": all_user_choices, "investments": all_user_trades,
                "price_source": "synthetic_fixture_not_market_quotes",
            }

    manifest = {
        "dataset": "MOA-common-92days-v1", "version": "1.0.0", "synthetic": True,
        "seed": SEED, "timezone": "Asia/Seoul", "currency": "KRW",
        "date_start":START.isoformat(),"date_end":END.isoformat(),
        "days_inclusive":len(DATE_LIST),"as_of_reference":AS_OF.isoformat(),
        "profiles":len(CONFIGS),
        "counts": {"transactions":len(transactions), "daily":len(daily),
                   "choices":len(choices),"investments":len(trades),"ml_features":len(FEATURE_ROWS)},
        "warnings": [
            "All profiles/amounts/transactions/quotes are artificial.",
            "2026-11-05 through 2026-12-11 is hypothetical future, not observed actual spending.",
            "Never train on future/target rows when evaluating as of 2026-11-04.",
            "Unrecorded days are UNKNOWN, not zero-spend training labels.",
        ],
    }
    csv_write(OUT/"transactions.csv", TRAN_FIELDS, transactions)
    csv_write(OUT/"daily.csv", DAY_FIELDS, daily)
    csv_write(OUT/"choices.csv", CHOICE_FIELDS, choices)
    csv_write(OUT/"investments.csv", TRADE_FIELDS, trades)
    csv_write(OUT/"ml_features.csv", FEAT_FIELDS, FEATURE_ROWS)
    (OUT/"profiles.json").write_text(json.dumps(profiles,ensure_ascii=False,indent=2)+"\n", encoding="utf-8")
    (OUT/"schedules.json").write_text(json.dumps(schedules,ensure_ascii=False,indent=2)+"\n", encoding="utf-8")
    (OUT/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n", encoding="utf-8")
    front_json=json.dumps(demo_source,ensure_ascii=False,separators=(",",":"))+"\n"
    FRONT.write_text(front_json, encoding="utf-8")
    (OUT/"frontend-demo.json").write_text(front_json, encoding="utf-8")
    print(json.dumps(manifest,ensure_ascii=False,indent=2))


FEATURE_ROWS: list[dict] = []

if __name__ == "__main__":
    build()
