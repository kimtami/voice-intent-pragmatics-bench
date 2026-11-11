"""8차: 문항 130개로 Claude Haiku 5.5 와 GPT-6 Luna 를 토큰 제한 없이 다시 재서 비교한다.

  .venv/bin/python -m vib.run --arms luna.A1U,haiku.A1U --reps 2 \
      --items-file data/queries.json,data/queries_extra.json --out results/items130/raw
  .venv/bin/python -m vib.judge --raw results/items130/raw --out results/items130/judged_opus \
      --items data/queries.json,data/queries_extra.json
  .venv/bin/python -m vib.judge --raw results/items130/raw --out results/items130/judged_luna \
      --items data/queries.json,data/queries_extra.json --judge openai:gpt-6-luna
  .venv/bin/python -m vib.items130_compare

읽는 법은 results/items130/PLAN.md 에 실행 전에 적어 두었다.
"""

from __future__ import annotations

import json
import statistics
from collections import defaultdict

from .report import RES, ROOT, _boot_ci, _boot_diff, _jsonl, _pct

OUT = RES / "items130"
ARMS = {"luna.A1U": "GPT-6 Luna", "haiku.A1U": "Claude Haiku 5.5"}
JUDGES = {"judged_opus": "claude-opus-5-5 (주 채점)", "judged_luna": "gpt-6-luna (둘째 채점)"}


def judged(folder: str, arm: str) -> dict[tuple[str, int], dict]:
    return {(j["item_id"], j["rep"]): j for j in _jsonl(OUT / folder / f"{arm}.jsonl") if not j.get("judge_error")}


def understood(j: dict) -> bool:
    return j["score"] == 2 or (
        j["score"] == 1 and j["asked_clarification"]
        and not (j["literal_only"] or j["wrong_target_or_value"] or j["over_action"])
    )


def per_item(rows: dict, ids: set[str]) -> dict[str, list[float]]:
    out: dict[str, list[float]] = defaultdict(list)
    for (item, _), j in rows.items():
        if item in ids:
            out[item].append(j["score"] / 2)
    return out


def main() -> None:
    old = {q["id"] for q in json.loads((ROOT / "data" / "queries.json").read_text(encoding="utf-8"))}
    new = {q["id"] for q in json.loads((ROOT / "data" / "queries_extra.json").read_text(encoding="utf-8"))}
    subsets = {"전체 130문항": old | new, "기존 30문항": old, "새 100문항": new}
    raw = {arm: {(r["item_id"], r["rep"]): r for r in _jsonl(OUT / "raw" / f"{arm}.jsonl") if not r.get("error")} for arm in ARMS}
    errors = {arm: sum(bool(r.get("error")) for r in _jsonl(OUT / "raw" / f"{arm}.jsonl")) for arm in ARMS}
    lines = ["# 8차: Claude Haiku 5.5 대 GPT-6 Luna, 130문항 × 2회, 토큰 제한 없음", ""]
    summary: dict = {"judges": {}, "latency": {}}
    for folder, judge_name in JUDGES.items():
        scores = {arm: judged(folder, arm) for arm in ARMS}
        if not all(scores.values()):
            continue
        lines += [f"## 채점: {judge_name}", "",
                  "| 문항 | 모델 | 의도 정확도 (95% CI) | 의도 이해율 | 엄격 정확도 | Haiku − Luna (95% CI) | 차이가 0보다 클 비율 |",
                  "|---|---|---|---|---|---|---|"]
        summary["judges"][folder] = {}
        for label, ids in subsets.items():
            items = {arm: per_item(scores[arm], ids) for arm in ARMS}
            shared = sorted(set(items["luna.A1U"]) & set(items["haiku.A1U"]))
            diffs = {k: statistics.mean(items["haiku.A1U"][k]) - statistics.mean(items["luna.A1U"][k]) for k in shared}
            mean, lo, hi, above = _boot_diff(diffs)
            summary["judges"][folder][label] = {"items": len(shared), "diff": round(mean * 100, 1),
                                                "ci95": [round(lo * 100, 1), round(hi * 100, 1)]}
            for arm, name in ARMS.items():
                rows = [j for (item, _), j in scores[arm].items() if item in ids]
                acc = statistics.mean(statistics.mean(v) for v in items[arm].values())
                ci = _boot_ci(items[arm])
                tail = (f"{mean * 100:+.1f}%p ({lo * 100:+.1f}~{hi * 100:+.1f}) | {above * 100:.0f}% |"
                        if arm == "haiku.A1U" else " | |")
                lines.append(
                    f"| {label} | {name} | {acc * 100:.1f}% ({ci[0] * 100:.1f}–{ci[1] * 100:.1f}) | "
                    f"{statistics.mean(understood(j) for j in rows) * 100:.1f}% | "
                    f"{statistics.mean(j['score'] == 2 for j in rows) * 100:.1f}% | {tail}"
                )
                summary["judges"][folder][label][arm] = round(acc * 100, 1)
        lines.append("")
    both = {arm: (judged("judged_opus", arm), judged("judged_luna", arm)) for arm in ARMS}
    if all(a and b for a, b in both.values()):
        lines += ["## 두 채점자의 일치", "", "| 모델 | 같은 점수를 준 비율 | 주 채점 평균 | 둘째 채점 평균 |", "|---|---|---|---|"]
        for arm, (a, b) in both.items():
            keys = sorted(set(a) & set(b))
            lines.append(
                f"| {ARMS[arm]} | {statistics.mean(a[k]['score'] == b[k]['score'] for k in keys) * 100:.1f}% | "
                f"{statistics.mean(a[k]['score'] for k in keys) / 2 * 100:.1f}% | "
                f"{statistics.mean(b[k]['score'] for k in keys) / 2 * 100:.1f}% |"
            )
        lines.append("")
    lines += ["## 속도와 출력", "", "| 모델 | 응답 수 | 오류 | 첫 발화 p50 | 첫 발화 p90 | 평균 출력 토큰 | 최대 출력 토큰 |", "|---|---|---|---|---|---|---|"]
    for arm, name in ARMS.items():
        rows = list(raw[arm].values())
        tokens = [(r.get("usage") or {}).get("output_tokens") or 0 for r in rows]
        first = [r["e2e_first_ms"] for r in rows]
        summary["latency"][arm] = {"p50": round(_pct(first, 0.5)), "p90": round(_pct(first, 0.9)), "max_output_tokens": max(tokens)}
        lines.append(
            f"| {name} | {len(rows)} | {errors[arm]} | {_pct(first, 0.5):,.0f}ms | {_pct(first, 0.9):,.0f}ms | "
            f"{statistics.mean(tokens):.1f} | {max(tokens)} |"
        )
    (OUT / "summary.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    (OUT / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=1), encoding="utf-8")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
