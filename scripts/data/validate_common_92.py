#!/usr/bin/env python3
"""Strict, dependency-free tests for MOA synthetic common 92-day dataset."""
from __future__ import annotations

import csv
import json
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "data" / "moa-2026-fall"
START, END, AS_OF = date(2026,9,11), date(2026,12,11), date(2026,11,4)
DAYS = [(START + timedelta(days=i)).isoformat() for i in range((END-START).days+1)]
USERS = {f"S{i:02d}" for i in range(1,11)}


def read_csv(name: str) -> list[dict[str,str]]:
    with (D/name).open(encoding="utf-8-sig",newline="") as f:
        return list(csv.DictReader(f))


def number(r: dict, key: str) -> int:
    return int(r[key])


def verify():
    manifest = json.loads((D/"manifest.json").read_text(encoding="utf-8"))
    assert manifest["synthetic"] is True and manifest["days_inclusive"] == 92
    assert manifest["date_start"] == DAYS[0] and manifest["date_end"] == DAYS[-1]
    assert manifest["as_of_reference"] == AS_OF.isoformat()
    transactions, daily, choices, trades, features = (
        read_csv("transactions.csv"), read_csv("daily.csv"), read_csv("choices.csv"),
        read_csv("investments.csv"), read_csv("ml_features.csv")
    )
    for key, rows in (("transactions",transactions),("daily",daily),("choices",choices),
                      ("investments",trades),("ml_features",features)):
        assert len(rows) == manifest["counts"][key], (key,len(rows))
        assert {r["user_id"] for r in rows} == USERS, key
    assert len(daily) == len(USERS)*len(DAYS) == 920
    assert len(features) == len(USERS)*(len(DAYS)-14) == 780
    for rows in (transactions,daily,choices,trades):
        for r in rows:
            assert r["date"] in DAYS, r
            expected = "future_scenario" if r["date"] > AS_OF.isoformat() else "historical_synthetic"
            assert r["stage"] == expected, (r["id"] if "id" in r else r["date"],r["stage"])

    for key, rows in (("transactions",transactions),("choices",choices),("investments",trades)):
        ids=[r["id"] for r in rows]
        assert len(ids)==len(set(ids)), f"{key}: duplicate ids"

    groups=defaultdict(list)
    for t in transactions:
        assert number(t,"amount_krw") >= 0
        assert number(t,"recorded") in (0,1)
        assert number(t,"essential") in (0,1)
        assert t["kind"] in ("spend","income","fixed_bill","card_payment")
        assert t["method"] in ("debit","credit","transfer","cash")
        assert t["account"] in ("pay","other","cash")
        assert t["at_kst"].startswith(t["date"]+"T") and t["at_kst"].endswith("+09:00")
        if t["account"] != "pay":
            assert number(t,"bank_delta_krw")==0
        if t["kind"]=="income":
            assert number(t,"bank_delta_krw")==number(t,"amount_krw")
        elif t["account"]=="pay":
            assert number(t,"bank_delta_krw")==-number(t,"amount_krw")
        groups[(t["user_id"],t["date"])].append(t)
    configs={x["user_id"]:x for x in json.loads((D/"profiles.json").read_text(encoding="utf-8"))}
    assert set(configs)==USERS
    daily_map={}
    for uid in sorted(USERS):
        user_days=[x for x in daily if x["user_id"]==uid]
        assert [x["date"] for x in user_days] == DAYS
        cash=configs[uid]["start_cash_krw"]
        for d in user_days:
            ts=groups[(uid,d["date"])]
            cash+=sum(number(t,"bank_delta_krw") for t in ts)
            assert number(d,"bank_balance_end_krw")==cash, ("bank balance",uid,d["date"])
            assert number(d,"bank_delta_krw")==sum(number(t,"bank_delta_krw") for t in ts)
            assert number(d,"txn_count")==len(ts)
            spent=[t for t in ts if t["kind"]=="spend"]
            assert number(d,"actual_variable_spend_krw")==sum(number(t,"amount_krw") for t in spent)
            assert number(d,"recorded_variable_spend_krw")==sum(number(t,"amount_krw") for t in spent if number(t,"recorded"))
            assert number(d,"recorded_day")==int(any(number(t,"recorded") for t in spent))
            assert number(d,"deficit_flag")==int(cash<0)
            for kind,col in (("income","income_krw"),("fixed_bill","fixed_paid_krw"),("card_payment","card_paid_krw")):
                assert number(d,col)==sum(number(t,"amount_krw") for t in ts if t["kind"]==kind)
            daily_map[(uid,d["date"])]=d

    assert sum(number(r,"recorded")==0 for r in transactions if r["kind"]=="spend")>0
    assert sum(number(r,"deficit_flag") for r in daily)>0, "Need at least one shortage scenario"

    for c in choices:
        assert c["choice"] in ("buy","wait","alternative")
        assert 0<=number(c,"paid_krw")<=number(c,"original_price_krw")
        assert number(c,"saved_vs_buy_krw")==number(c,"original_price_krw")-number(c,"paid_krw")

    position=defaultdict(int)
    for t in sorted(trades,key=lambda r:r["at_kst"]):
        assert t["side"] in ("buy","sell")
        assert number(t,"qty")>0 and number(t,"price_krw")>0
        assert number(t,"amount_krw")==number(t,"qty")*number(t,"price_krw")
        key=(t["user_id"],t["code"])
        position[key]+=number(t,"qty")*(1 if t["side"]=="buy" else -1)
        assert position[key]>=0, ("sell without shares",t["id"])
    for uid in USERS:
        assert len([x for x in trades if x["user_id"]==uid])==4, "Need Nov/Dec trading examples"

    seen_feat=set()
    for r in features:
        target=date.fromisoformat(r["target_date"])
        as_of=date.fromisoformat(r["as_of_date"])
        assert as_of+timedelta(days=1)==target
        assert START+timedelta(days=14)<=target<=END
        key=(r["user_id"],r["target_date"])
        assert key not in seen_feat
        seen_feat.add(key)
        expected_split="train" if target<=date(2026,10,20) else "validation" if target<=AS_OF else "test_synthetic_future"
        assert r["split"]==expected_split
        assert number(r,"target_actual_spend_krw")==number(daily_map[key],"actual_variable_spend_krw")
        assert number(r,"target_recorded")==number(daily_map[key],"recorded_day")
        history=[daily_map[(r["user_id"],(target-timedelta(days=i)).isoformat())] for i in range(1,15)]
        logged=[v for v in history if number(v,"recorded_day")]
        assert number(r,"observed_days_14")==len(logged)
        assert number(r,"prev_day_recorded")==number(history[0],"recorded_day")
        if logged:
            mean=round(sum(number(x,"recorded_variable_spend_krw") for x in logged)/len(logged))
            assert number(r,"mean_recorded_14_krw")==mean
            assert number(r,"last_recorded_spend_krw")==number(logged[0],"recorded_variable_spend_krw")
        else:
            assert r["mean_recorded_14_krw"]=="" and r["last_recorded_spend_krw"]==""

    front=(ROOT/"src/data/moa92.json").read_bytes()
    assert front==(D/"frontend-demo.json").read_bytes()
    demo=json.loads(front.decode("utf-8"))
    assert demo["user_id"]=="S01" and len(demo["daily"])==92
    assert demo["start"]==DAYS[0] and demo["end"]==DAYS[-1]
    assert demo["transactions"]==[t for t in transactions if t["user_id"]=="S01"]
    assert demo["investments"]==[t for t in trades if t["user_id"]=="S01"]
    assert demo["choices"]==[t for t in choices if t["user_id"]=="S01"]

    print("PASS: 10 × 92 days; unique IDs; positive amounts; daily bank reconciliation;")
    print("      recorded != actual; risk flags; valid investment positions; temporal ML features;")
    print("      exact frontend-copy parity; no DB or external data required.")
    print("ROWS:",manifest["counts"])


if __name__=="__main__":
    verify()
