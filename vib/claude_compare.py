"""7차: Claude Haiku 5.5·Sonnet 5.5 와 GPT-6 Luna 를 같은 시각에 다시 재서 비교한다.

  .venv/bin/python -m vib.run --arms luna.A1,haiku.A1,haiku.A2,sonnet.A1,sonnet.A2 --reps 3 --out results/claude/raw
  .venv/bin/python -m vib.judge --raw results/claude/raw --out results/claude/judged
  .venv/bin/python -m vib.claude_compare

본 결과(results/raw)와 섞지 않는다. 지연은 시각에 따라 움직이므로 다섯 조건을 같은 시각에 돌린 값만 서로 견준다.
2026-11-11 실행에서는 이 리포의 OpenAI 키에 한도가 없어 luna.A1 만 다른 계정의 키로 같은 창 안에서 따로 돌렸다.
"""

from __future__ import annotations

import json

from .report import FAMILY_NAME, RES, ROOT, _boot_diff, _jsonl, summarize

OUT = RES / "claude"
BASE = "luna.A1"
SETTING = {
    "luna.A1": "추론 없음 (effort none)",
    "haiku.A1": "생각 끔, effort low",
    "haiku.A2": "생각 켬(adaptive), effort medium",
    "sonnet.A1": "생각 끔(between_tools), effort low",
    "sonnet.A2": "생각 켬(adaptive), effort medium",
}


def load() -> tuple[dict, dict]:
    arms: dict[str, dict] = {}
    for raw in sorted((OUT / "raw").glob("*.jsonl")):
        rows, errors = {}, 0
        for r in _jsonl(raw):
            if r.get("error"):
                errors += 1
                continue
            rows[(r["item_id"], r["rep"])] = r
        judged = {
            (j["item_id"], j["rep"]): j
            for j in _jsonl(OUT / "judged" / f"{raw.stem}.jsonl")
            if not j.get("judge_error")
        }
        arms[raw.stem] = {"rows": rows, "judged": judged, "analysis": {}, "errors": errors}
    items = {q["id"]: q for q in json.loads((ROOT / "data" / "queries.json").read_text(encoding="utf-8"))}
    return arms, items


def main() -> None:
    arms, items = load()
    table, _, per_item = summarize(arms, items)
    by_arm = {r["arm"]: r for r in table}
    lines = [
        "# 7차: Claude Haiku 5.5·Sonnet 5.5 대 GPT-6 Luna (같은 시각, 30문항 × 3회)",
        "",
        "| 모델 | 설정 | 의도 정확도 (95% CI) | 의도 이해율 | 엄격 정확도 | 첫 발화 p50 | 첫 발화 p90 | 전체 p50 | 1,000턴당 비용 | 평균 출력 토큰 | 오류 |",
        "|---|---|---|---|---|---|---|---|---|---|---|",
    ]
    for r in table:
        lines.append(
            f"| {FAMILY_NAME[r['family']]} | {SETTING.get(r['arm'], r['condition'])} | "
            f"{r['accuracy']}% ({r['acc_ci_lo']}–{r['acc_ci_hi']}) | {r['understood_rate']}% | {r['strict_accuracy']}% | "
            f"{r['first_p50_ms']:,}ms | {r['first_p90_ms']:,}ms | {r['total_p50_ms']:,}ms | "
            f"${r['cost_per_1k_turns_usd']:.2f} | {r['avg_output_tokens']} | {r['errors']} |"
        )
    lines += [
        "",
        f"## {FAMILY_NAME['luna']} 기본 설정 대비 (같은 문항끼리 짝지음)",
        "",
        "| 모델 | 설정 | 정확도 차이 (95% CI) | 차이가 0보다 클 비율 | 첫 발화 p50 차이 | 비용 배수 |",
        "|---|---|---|---|---|---|",
    ]
    base = by_arm[BASE]
    for r in table:
        if r["arm"] == BASE:
            continue
        shared = sorted(set(per_item[r["arm"]]) & set(per_item[BASE]))
        diffs = {k: per_item[r["arm"]][k] - per_item[BASE][k] for k in shared}
        mean, lo, hi, above = _boot_diff(diffs)
        lines.append(
            f"| {FAMILY_NAME[r['family']]} | {SETTING.get(r['arm'], r['condition'])} | "
            f"{mean * 100:+.1f}%p ({lo * 100:+.1f}–{hi * 100:+.1f}) | {above * 100:.0f}% | "
            f"{r['first_p50_ms'] - base['first_p50_ms']:+,}ms | "
            f"{r['cost_per_1k_turns_usd'] / base['cost_per_1k_turns_usd']:.1f}배 |"
        )
    (OUT / "summary.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    (OUT / "summary.json").write_text(json.dumps(table, ensure_ascii=False, indent=1), encoding="utf-8")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
