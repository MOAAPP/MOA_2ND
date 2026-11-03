"""
모아 변동 지출 예측 — LightGBM 1개 후보 vs 기준선 2개 (기획서 「ML 모델 설계」, 「2순위: 기준선 대비 AI 성능」)

    pip install lightgbm pandas numpy
    npx tsx scripts/eval/features.ts [--real data/eval/*.json]
    python ml/train_lgbm.py
    npx tsx scripts/eval/run.ts --ml ml/out/predictions.csv [--real ...]

- 목표: 하루 전체 변동 지출 합계 (0원 이상)
- 모델: LightGBM 회귀, Tweedie 목적함수(variance power 1.5 고정), 미리 정한 작은 조합 3개 안에서만 고른다
- 공통 모델 + 사용자 평균 지출 수준(user_mean, as_of 이전 정답일 누적 평균)으로 개인 수준 보정
- 데이터 출처: features.csv의 source 열(real/synthetic). 실데이터가 있으면 모델 선택·채택 판단·최종 보고는
  실데이터 행만 쓴다. 합성을 학습에 섞을지는 --train-source로 정하고(기본: real), report.json에 남긴다.
- 선택: 모델 선택 구간(14일)의 7일 누적 MAE. 4명(또는 전체)의 선택 구간을 합쳐 판단하고,
  ML이 두 기준선보다 모두 낮을 때만 채택. 사용자별로 우열이 엇갈리면 요일별 평균 유지.
- 보고: 선택에 쓰지 않은 최종 평가 구간 예측만 predictions.csv로 내보내고, run.ts가 같은 표에 넣는다.
"""
import argparse
import json
import os
import sys
from datetime import datetime, timezone

import numpy as np
import pandas as pd

try:
    import lightgbm as lgb
except ImportError:  # pragma: no cover
    sys.exit("lightgbm이 없어요: pip install lightgbm pandas numpy")

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data", "features.csv")
OUT = os.path.join(HERE, "out")
FEATURES = ["weekday", "holiday", "days_to_next_income", "days_since_income", "mean7", "prev_day", "observed_days", "user_mean"]
GRID = [
    {"num_leaves": 7, "learning_rate": 0.05, "n_estimators": 200, "min_child_samples": 10},
    {"num_leaves": 15, "learning_rate": 0.05, "n_estimators": 300, "min_child_samples": 15},
    {"num_leaves": 7, "learning_rate": 0.1, "n_estimators": 120, "min_child_samples": 20},
]


def cum_mae(df: pd.DataFrame, col: str, h: int = 7) -> tuple[float | None, dict]:
    """as_of마다 target 0~h-1일 누적 오차. 창 안 모든 날 정답이 있어야 쓴다."""
    errs, per_user = [], {}
    for (user, as_of), g in df[df["h"] < h].groupby(["user", "as_of"]):
        if len(g) < h or g["label"].isna().any() or g[col].isna().any():
            continue
        e = abs(g["label"].sum() - g[col].sum())
        errs.append(e)
        per_user.setdefault(user, []).append(e)
    return (float(np.mean(errs)) if errs else None), {u: float(np.mean(v)) for u, v in per_user.items()}


def add_baselines(df: pd.DataFrame, labeled: pd.DataFrame) -> pd.DataFrame:
    """기준선: 최근 7일 평균(mean7) / as_of 직전 8주 같은 요일 평균"""
    df = df.copy()
    df["rolling7"] = df["mean7"]
    lab = labeled[["user", "target", "label"]].rename(columns={"target": "d"})
    lab["d"] = pd.to_datetime(lab["d"])
    lab["wd"] = lab["d"].dt.dayofweek
    out = []
    for (user, as_of), g in df.groupby(["user", "as_of"]):
        a = pd.Timestamp(as_of)
        hist = lab[(lab["user"] == user) & (lab["d"] < a) & (lab["d"] >= a - pd.Timedelta(days=56))]
        for idx, row in g.iterrows():
            wd = pd.Timestamp(row["target"]).dayofweek
            same = hist[hist["wd"] == wd]["label"]
            pool = same if len(same) >= 2 else hist["label"]
            out.append((idx, float(pool.mean()) if len(hist) >= 3 else np.nan))
    s = pd.Series(dict(out))
    df["weekday_mean"] = s
    return df


MODEL_VERSION = "lightgbm_tweedie_v1"


def parse_args(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--train-source", choices=["real", "synthetic", "all"], default=None,
                   help="학습에 쓸 행. 기본: 실데이터가 있으면 real, 없으면 synthetic")
    return p.parse_args(argv)


def main(argv=None) -> None:
    args = parse_args(argv)
    df = pd.read_csv(DATA)
    df["label"] = pd.to_numeric(df["label"], errors="coerce").clip(lower=0)
    has_real = (df["source"] == "real").any()
    # 평가·선택은 실데이터가 있으면 실데이터만. 합성 성능이 실사용 성능처럼 보이지 않게 한다.
    eval_source = "real" if has_real else "synthetic"
    train_source = args.train_source or eval_source
    if train_source == "real" and not has_real:
        sys.exit("실데이터 행이 없어요. --real 로 특징량을 만들거나 --train-source synthetic 을 쓰세요.")

    labeled = df.drop_duplicates(["user", "target"]).dropna(subset=["label"])
    df = add_baselines(df, labeled)

    train_mask = (df["split"] == "train") & df["label"].notna()
    if train_source != "all":
        train_mask &= df["source"] == train_source
    train = df[train_mask]
    select = df[(df["split"] == "select") & (df["source"] == eval_source)].copy()
    final = df[(df["split"] == "eval") & (df["source"] == eval_source)].copy()

    best, best_mae, report = None, None, {"grid": []}
    for params in GRID:
        model = lgb.LGBMRegressor(objective="tweedie", tweedie_variance_power=1.5, verbose=-1, random_state=7, **params)
        model.fit(train[FEATURES], train["label"])
        select["ml"] = np.clip(model.predict(select[FEATURES]), 0, None)
        mae, _ = cum_mae(select, "ml")
        report["grid"].append({"params": params, "select_mae7": mae})
        if mae is not None and (best_mae is None or mae < best_mae):
            best, best_mae = (params, model), mae

    if best is None:
        sys.exit("선택 구간에서 완결된 7일 창이 없어요. 기록 기간을 늘려 주세요.")
    params, model = best
    select["ml"] = np.clip(model.predict(select[FEATURES]), 0, None)
    ml_sel, ml_users = cum_mae(select, "ml")
    r7_sel, r7_users = cum_mae(select, "rolling7")
    wd_sel, wd_users = cum_mae(select, "weekday_mean")
    users_ml_wins = [u for u in ml_users if u in wd_users and u in r7_users and ml_users[u] < min(wd_users[u], r7_users[u])]
    adopt = (
        ml_sel is not None and r7_sel is not None and wd_sel is not None
        and ml_sel < r7_sel and ml_sel < wd_sel
        and len(users_ml_wins) >= max(1, (len(ml_users) + 1) // 2)  # 사용자별로 엇갈리면 채택하지 않음
    )

    final["pred"] = np.clip(model.predict(final[FEATURES]), 0, None).round()
    os.makedirs(OUT, exist_ok=True)
    final[["user", "as_of", "target", "pred"]].to_csv(os.path.join(OUT, "predictions.csv"), index=False)
    report.update({
        "model_version": MODEL_VERSION,
        "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "train_source": train_source,
        "eval_source": eval_source,
        "train_rows": int(len(train)),
        "train_users": int(train["user"].nunique()),
        "input_data_until": str(df["target"].max()),
        "chosen": params,
        "select_mae7": {"ml": ml_sel, "rolling7": r7_sel, "weekday": wd_sel},
        "users_ml_wins": users_ml_wins,
        "adopt_ml": bool(adopt),
        "note": "선택 구간 결과는 탐색적 비교예요. 신청서에는 최종 평가 구간(run.ts 결과표)만 써요."
                + ("" if eval_source == "real" else " 합성 데이터로 학습·평가한 결과라 실제 사용자 성능 근거가 아니에요."),
    })
    with open(os.path.join(OUT, "report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
