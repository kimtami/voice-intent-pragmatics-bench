"""결과 페이지(site/)가 쓰는 수치를 결과 파일에서 다시 계산해 site/data/metrics.json 으로 쓴다.
페이지에 손으로 적은 숫자를 두지 않으려는 것이다. 새 방법을 더하려면 METRICS 에 항목 하나를 더하고 다시 실행한다.

  python -m vib.site_data

항목 형식:
  {"id": 키, "summary": arm}                       30문항 본실험 (results/summary.csv 의 한 줄)
  {"id": 키, "screen": code}                       4차 선별 (results/screen/summary.csv 의 한 줄, 신뢰구간은 채점 파일에서)
  {"id": 키, "judged": 경로, "raw": 경로, ...}     그 밖의 실험. items="paired" 면 여행 짝 문항만,
                                                   gen=[추정 생성 파일들] 이면 턴당 생성 비용을 더하고,
                                                   latency={"base": 키, "control": 디렉터리, "arm": 조건} 이면
                                                   첫 발화를 '기준 키의 p50 + 같은 시각 대조에서 잰 문항별 증가분 중앙값' 으로 쓴다.
"""

import csv
import json
import statistics
from collections import defaultdict
from pathlib import Path

from .report import _boot_ci, _call_cost, _jsonl, _pct

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / "results"
OUT = ROOT / "site" / "data" / "metrics.json"

SI = RES / "selfhyp"
TR = RES / "travel"
DIAG_V2 = [SI / "diag" / f"instant_v2_{s}.json" for s in ("insample", "heldout")]
DIAG_V1 = [SI / "diag" / f"instant_v1_{s}.json" for s in ("insample", "heldout")]
GATE_J = {"base": "travel.TM", "control": TR / "latency_control", "arm": None}
GATE_K = {"base": "travel.TM", "control": TR / "latency_control_ctx", "arm": None}

METRICS = (
    # 30문항 × 3회 본실험 (1~3차)
    [{"id": f"main.{a}", "summary": a} for a in (
        "gemini38.A1", "gemini.A1", "haiku.A1", "luna.A1", "mercury.A0", "mercury.A1",
        "mercury.A2", "mercury.A3", "mercury.A4", "mercury.A1+C", "mercury.A1+CK", "mercury.A1+CA", "mercury.A1+CH",
        "mercury.A0+C", "mercury.A0+CK", "mercury.A0+CA", "mercury.A0+CH",
        "luna.A2", "luna.A3", "luna.A4", "luna.A1+C", "luna.A1+CK", "luna.A1+CA", "luna.A1+CH")]
    # 4차 선별 (24문항 × 1회, Mercury 3 기본 응답)
    + [{"id": f"screen.{c}", "screen": c} for c in ("M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8", "M5b", "M5c")]
    # 5차 싼 추정 (24문항): Mercury 3 instant 응답 3회, GPT-6 Luna none 응답 2회
    + [{"id": "cheap.instant.CA", "judged": SI / "instant/judged/mercury.A0+CA.jsonl", "raw": SI / "instant/raw/mercury.A0+CA.jsonl"},
       {"id": "cheap.instant.CIv1", "judged": SI / "instant/judged/mercury.A0+CIv1.jsonl", "raw": SI / "instant/raw/mercury.A0+CIv1.jsonl", "gen": DIAG_V1},
       {"id": "cheap.instant.CIv2", "judged": SI / "instant/judged/mercury.A0+CIv2.jsonl", "raw": SI / "instant/raw/mercury.A0+CIv2.jsonl", "gen": DIAG_V2},
       {"id": "cheap.instant.CP", "judged": SI / "persona/judged/mercury.A0+CP.jsonl", "raw": SI / "persona/raw/mercury.A0+CP.jsonl",
        "gen": [SI / "persona/instant_persona.json"]},
       {"id": "cheap.luna.CA", "judged": SI / "luna_none/judged/luna.A1+CA.jsonl", "raw": SI / "luna_none/raw/luna.A1+CA.jsonl"},
       {"id": "cheap.luna.CIv2", "judged": SI / "luna_none/judged/luna.A1+CIv2.jsonl", "raw": SI / "luna_none/raw/luna.A1+CIv2.jsonl", "gen": DIAG_V2},
       {"id": "cheap.luna.CP", "judged": SI / "persona/judged/luna.A1+CP.jsonl", "raw": SI / "persona/raw/luna.A1+CP.jsonl",
        "gen": [SI / "persona/instant_persona.json"]}]
    # 6차 여행 개인화 (짝 16문항 × 2회, Mercury 3 instant 응답)
    + [{"id": f"travel.{c}", "judged": TR / f"judged/mercury.A0+{c}.jsonl", "raw": TR / f"raw/mercury.A0+{c}.jsonl", "items": "paired",
        **({"gen": [TR / f"prep/{ {'TV': 'v2', 'TP': 'planner'}[c]}.json"]} if c in ("TV", "TP") else {}),
        **({"latency": {**(GATE_J if c.startswith("TJ") else GATE_K), "arm": c}} if c[:2] in ("TJ", "TK") else {})}
       for c in ("TN", "TM", "TV", "TP", "TG", "TJ4", "TJ5", "TK4", "TK5")]
    # 온도 (20문항 × 3회, 같은 실행 안의 비교)
    + [{"id": "temp.r2.t075", "judged": TR / "temp/judged/mercury.A0+TM.jsonl", "raw": TR / "temp/raw/mercury.A0+TM.jsonl"},
       {"id": "temp.r2.t05", "judged": TR / "temp/judged/mercury.A0+TM05.jsonl", "raw": TR / "temp/raw/mercury.A0+TM05.jsonl"},
       {"id": "temp.r1.t075", "judged": TR / "temp/run1_t0_reset_to_1/judged/mercury.A0+TM.jsonl", "raw": TR / "temp/run1_t0_reset_to_1/raw/mercury.A0+TM.jsonl"},
       {"id": "temp.r1.t1", "judged": TR / "temp/run1_t0_reset_to_1/judged/mercury.A0+TM0.jsonl", "raw": TR / "temp/run1_t0_reset_to_1/raw/mercury.A0+TM0.jsonl"}]
)


def _gen_cost(files: list[Path]) -> float:
    """추정 생성 파일들의 호출당 평균 비용(Mercury 3 단가). 턴마다 한 번 만든다고 본다."""
    calls = [c for f in files for c in json.loads(f.read_text(encoding="utf-8"))["calls"].values()]
    return statistics.mean(_call_cost("mercury-3", c["usage"]) for c in calls)


def _from_files(spec: dict, done: dict) -> dict:
    keep = None
    if spec.get("items") == "paired":
        keep = {x["id"] for x in json.loads((ROOT / "data/travel/items.json").read_text(encoding="utf-8")) if x["pair"]}
    per = defaultdict(list)
    for j in _jsonl(spec["judged"]):
        if not j.get("judge_error") and (keep is None or j["item_id"] in keep):
            per[j["item_id"]].append(j["score"] / 2)
    raw = [r for r in _jsonl(spec["raw"]) if not r.get("error") and (keep is None or r["item_id"] in keep)]
    lo, hi = _boot_ci(per)
    first = [r["e2e_first_ms"] for r in raw]
    out = {"accuracy": round(statistics.mean(statistics.mean(v) for v in per.values()) * 100, 1),
           "ci": [round(lo * 100, 1), round(hi * 100, 1)], "first_p50": round(_pct(first, 0.5)), "first_p90": round(_pct(first, 0.9)),
           "items": len(per), "reps": max(len(v) for v in per.values()),
           "cost_1k": round((statistics.mean(_call_cost(r["model"], r["usage"]) for r in raw)
                             + (_gen_cost(spec["gen"]) if spec.get("gen") else 0.0)) * 1000, 2)}
    lat = spec.get("latency")
    if lat:  # 게이트: 같은 시각에 다시 잰 '기억 전체' 대비 문항별 증가분 중앙값을, 본 실행 기억 전체의 p50 에 더한다
        ctl = {c: {r["item_id"]: r["e2e_first_ms"] for r in _jsonl(lat["control"] / f"mercury.A0+{c}.jsonl") if not r.get("error")}
               for c in ("TM", lat["arm"])}
        delta = statistics.median(ctl[lat["arm"]][k] - ctl["TM"][k] for k in ctl["TM"])
        out |= {"first_p50": round(done[lat["base"]]["first_p50"] + delta), "first_delta": round(delta), "first_p90": None,
                "first_note": "기억 전체 p50 + 같은 시각 대조의 게이트 증가분"}
        gate = json.loads((TR / ("gate.json" if lat["arm"].startswith("TJ") else "gate_ctx.json")).read_text(encoding="utf-8"))
        out["cost_1k"] = round(out["cost_1k"] + gate["summary"]["cost_per_1k_turns_usd"], 2)
    return out


def main() -> None:
    summ = {r["arm"]: r for r in csv.DictReader(open(RES / "summary.csv", encoding="utf-8"))}
    screen = {r["code"]: r for r in csv.DictReader(open(RES / "screen" / "summary.csv", encoding="utf-8"))}
    done: dict = {}
    for spec in METRICS:
        if "summary" in spec:
            r = summ[spec["summary"]]
            done[spec["id"]] = {"accuracy": float(r["accuracy"]), "ci": [float(r["acc_ci_lo"]), float(r["acc_ci_hi"])],
                                "first_p50": round(float(r["first_p50_ms"])), "first_p90": round(float(r["first_p90_ms"])),
                                "items": 30, "reps": 3, "cost_1k": float(r["cost_per_1k_turns_usd"])}
        elif "screen" in spec:
            r = screen[spec["screen"]]
            per = defaultdict(list)
            for j in _jsonl(RES / "screen" / "judged" / f"mercury.A1+{spec['screen']}.jsonl"):
                if not j.get("judge_error"):
                    per[j["item_id"]].append(j["score"] / 2)
            lo, hi = _boot_ci(per)
            done[spec["id"]] = {"accuracy": float(r["acc"]), "ci": [round(lo * 100, 1), round(hi * 100, 1)],
                                "first_p50": round(float(r["first_p50"])), "first_delta": round(float(r["d_first"])),
                                "items": len(per), "reps": 1, "cost_1k": float(r["cost_1k"]),
                                "gen_p50_ms": round(float(r["gen_p50"])) if r["gen_p50"] else None}
        else:
            done[spec["id"]] = _from_files(spec, done)
    # 4차 선별의 기준선: 같은 24문항의 Mercury 3 기본(3회 반복 본실험에서) — 선별 표의 기준값과 같은 정의
    base24 = [r for r in _jsonl(RES / "judged" / "mercury.A1.jsonl")
              if r["item_id"] in {j["item_id"] for j in _jsonl(RES / "screen" / "judged" / "mercury.A1+M1.jsonl")}]
    per = defaultdict(list)
    for j in base24:
        per[j["item_id"]].append(j["score"] / 2)
    lo, hi = _boot_ci(per)
    ctl = [r["e2e_first_ms"] for r in _jsonl(RES / "screen" / "latency_control" / "mercury.A1.jsonl") if not r.get("error")]
    done["screen.base"] = {"accuracy": round(statistics.mean(statistics.mean(v) for v in per.values()) * 100, 1),
                           "ci": [round(lo * 100, 1), round(hi * 100, 1)], "first_p50": round(_pct(ctl, 0.5)),
                           "items": len(per), "reps": 3, "cost_1k": done["main.mercury.A1"]["cost_1k"]}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"note": "python -m vib.site_data 로 결과 파일에서 생성. 손으로 고치지 않는다.", "metrics": done},
                              ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print("ok", len(done), "metrics →", OUT.relative_to(ROOT))


if __name__ == "__main__":
    main()
