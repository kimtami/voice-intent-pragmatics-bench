"""관련도 게이트: 사용자가 말한 뒤, Jev(TypeSafe)가 기억 항목마다 이번 발화와 관련 있을 확률을 내고 기준 이상만 응답 모델에 넘긴다.

기억마다 Noul 1문항을 만들어 한 요청에 묶는다(같은 상태를 보는 독립 질문은 함께 보낸다). 각 질문은 자기 기억의 글자를 지시 안에 직접 갖는다.
v1 은 상태에 기억 목록을 두고 `memories[i]` 번호로 가리켰는데, 기억이 38개인 여행 문항에서 점수가 글자가 아니라 목록 위치에 붙었다
(순서를 뒤집으면 같은 글자의 점수 상관 -0.42~0.09). v2 는 가리키는 방식만 바꿨고 질문 문구와 기준 설명은 그대로다.
확률은 모두 저장하고 기준(0.4·0.5)은
코드에서 적용하므로, 두 기준 조건은 같은 점수에서 기준만 다르다. 게이트는 발화 뒤 응답 앞에 도는 단계라 첫 발화 시간에 그대로 더해진다.
질문 문구는 점수를 보기 전에 고정했다. 정답은 보지 않는다.

  python -m vib.gate existing   # 기존 30문항 로그: 관련 기록(events) 재현율, 잡음 통과율, 지연 → results/gate/existing.json
  python -m vib.gate travel     # 여행 20문항 기억 → results/travel/gate.json (응답 실행이 이 점수를 쓴다)
  python -m vib.gate order      # 합격 검사: 같은 순서 재호출 대 순서를 뒤집은 호출에서 같은 글자의 점수 상관 → results/gate/order_check.json
"""

import argparse
import json
import statistics
import time
from pathlib import Path

from dotenv import load_dotenv
from typesafe_sdk import Noul, NoulCriteria, TypeSafeClient

ROOT = Path(__file__).resolve().parent.parent
MODEL = "jev-1.14.0"  # jev-latest 별칭은 새 버전으로 옮겨 가므로 고정한다
VERSION = "v2-inline-record"
PRICE_IN = 0.042  # 입력 100만 토큰당 달러, 출력은 무료 (docs.typesafe.ai/models)
THRESHOLDS = (0.4, 0.5)
TIMING_CALLS = 3  # 지연은 문항마다 따로 세 번 잰다

# 영어가 Jev 의 주 학습 언어라 지시는 영어로, 상태(발화·기억)는 한국어 그대로 둔다
CRITERIA = NoulCriteria(
    true="The record states a fact, plan, booking, preference, constraint, or saved item that the utterance refers to, "
         "depends on, or that changes how the utterance should be interpreted or acted on.",
    false="The record is unrelated to the utterance, or only shares a general topic without changing what the user "
          "means or what the assistant should do.",
)

_client: TypeSafeClient | None = None


QUESTION = ("Is this record relevant to the user's current utterance `utterance`? That is, does this record help the voice "
            "assistant understand what the user means or decide the right response, given `device_state` and `prior_dialogue`?")


def _question(record: str) -> Noul:
    return Noul(instructions={"question": QUESTION, "record": record}, criteria=CRITERIA)


def score(utterance: str, state: str, context: list[dict], memories: list[str]) -> dict:
    """기억마다 관련 확률. 한 요청의 걸린 시간(ms)과 입력 토큰을 함께 낸다."""
    global _client
    if _client is None:
        _client = TypeSafeClient(model=MODEL)
    st = {"utterance": utterance, "device_state": state,
          "prior_dialogue": [f"{'사용자' if t['role'] == 'user' else '비서'}: {t['content']}" for t in context] or ["(없음)"]}
    t0 = time.perf_counter()
    resp = _client.system_one(state=st, questions={f"m{i}": _question(m) for i, m in enumerate(memories)})
    ms = (time.perf_counter() - t0) * 1000
    return {"probs": [round(resp.nouls[f"m{i}"].noul, 4) for i in range(len(memories))], "ms": round(ms, 1),
            "model": resp.model, "input_tokens": resp.usage.input_tokens}


def keep(memories: list[str], probs: list[float], threshold: float) -> list[str]:
    return [m for m, p in zip(memories, probs) if p >= threshold]


def _run(items: list[dict], memories_of, relevant_of, out: Path) -> None:
    rows = {}
    for it in items:
        mem = memories_of(it)
        first = score(it["utterance"], it["state"], it["context"], mem)
        times = [first["ms"]] + [score(it["utterance"], it["state"], it["context"], mem)["ms"] for _ in range(TIMING_CALLS - 1)]
        rel = relevant_of(it)
        rows[it["id"]] = {"memories": mem, "probs": first["probs"], "relevant": [mem.index(r) for r in rel],
                          "timing_ms": times, "input_tokens": first["input_tokens"], "model": first["model"]}
        kept = {t: sum(p >= t for p in first["probs"]) for t in THRESHOLDS}
        print(it["id"], f"{statistics.median(times):.0f}ms", "kept", kept, "rel",
              [first["probs"][mem.index(r)] for r in rel], flush=True)
    summary = {}
    for t in THRESHOLDS:
        rel = [r["probs"][i] >= t for r in rows.values() for i in r["relevant"]]
        noise = [p >= t for r in rows.values() for i, p in enumerate(r["probs"]) if i not in r["relevant"]]
        summary[str(t)] = {"relevant_recall": sum(rel) / len(rel) if rel else None, "other_pass_rate": sum(noise) / len(noise),
                           "items_all_relevant_kept": sum(all(r["probs"][i] >= t for i in r["relevant"]) for r in rows.values() if r["relevant"]),
                           "items_with_relevant": sum(1 for r in rows.values() if r["relevant"]),
                           "items_zero_kept": sum(1 for r in rows.values() if not any(p >= t for p in r["probs"]))}
    summary["items_where_0.4_and_0.5_differ"] = sum(1 for r in rows.values() if any(0.4 <= p < 0.5 for p in r["probs"]))
    ms = [m for r in rows.values() for m in r["timing_ms"]]
    toks = [r["input_tokens"] for r in rows.values() if r["input_tokens"]]
    summary["latency_ms"] = {"p50": statistics.median(ms), "p90": statistics.quantiles(ms, n=10)[-1], "max": max(ms), "n": len(ms)}
    summary["cost_per_1k_turns_usd"] = statistics.mean(toks) * PRICE_IN / 1e6 * 1000 if toks else None
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"meta": {"model": MODEL, "version": VERSION, "timing_calls": TIMING_CALLS, "thresholds": THRESHOLDS},
                               "summary": summary, "items": rows}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=1))


def _corr(a: list[float], b: list[float]) -> float:
    ma, mb = statistics.mean(a), statistics.mean(b)
    den = (sum((x - ma) ** 2 for x in a) * sum((y - mb) ** 2 for y in b)) ** 0.5
    return sum((x - ma) * (y - mb) for x, y in zip(a, b)) / den if den else float("nan")


def order_check(cases: list[tuple[str, dict, list[str]]]) -> None:
    """정답을 쓰지 않는 합격 검사: 점수가 기억의 글자를 따라가면 순서를 뒤집어도 같은 글자의 점수가 같아야 한다."""
    rows = {}
    for iid, it, mem in cases:
        a = score(it["utterance"], it["state"], it["context"], mem)["probs"]
        b = score(it["utterance"], it["state"], it["context"], mem)["probs"]
        rev = dict(zip(mem[::-1], score(it["utterance"], it["state"], it["context"], mem[::-1])["probs"]))
        rows[iid] = {"n": len(mem), "same_order": round(_corr(a, b), 3), "reversed": round(_corr(a, [rev[m] for m in mem]), 3)}
        print(iid, rows[iid], flush=True)
    rs = [r["reversed"] for r in rows.values()]
    summary = {"version": VERSION, "items": len(rs), "reversed_min": min(rs), "reversed_median": statistics.median(rs),
               "items_reversed_ge_0.9": sum(r >= 0.9 for r in rs)}
    out = ROOT / "results" / "gate" / "order_check.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"summary": summary, "items": rows}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("which", choices=["existing", "travel", "order"])
    args = ap.parse_args()
    load_dotenv(ROOT / ".env", override=True)
    if args.which == "order":
        q = json.loads((ROOT / "data" / "queries.json").read_text(encoding="utf-8"))
        logs = json.loads((ROOT / "data" / "auto_context.json").read_text(encoding="utf-8"))["logs"]
        t = json.loads((ROOT / "data" / "travel" / "items.json").read_text(encoding="utf-8"))
        trav = json.loads((ROOT / "data" / "travel" / "travelers.json").read_text(encoding="utf-8"))["travelers"]
        order_check([(it["id"], it, logs[it["id"]]) for it in q] + [(it["id"], it, trav[it["traveler"]]["memories"]) for it in t])
        return
    if args.which == "existing":  # 관련 기록 = 2차의 사람이 고른 events, 나머지 = 잡음 10개
        items = json.loads((ROOT / "data" / "queries.json").read_text(encoding="utf-8"))
        logs = json.loads((ROOT / "data" / "auto_context.json").read_text(encoding="utf-8"))["logs"]
        _run(items, lambda it: logs[it["id"]], lambda it: it["events"], ROOT / "results" / "gate" / "existing.json")
    else:
        items = json.loads((ROOT / "data" / "travel" / "items.json").read_text(encoding="utf-8"))
        trav = json.loads((ROOT / "data" / "travel" / "travelers.json").read_text(encoding="utf-8"))["travelers"]
        _run(items, lambda it: trav[it["traveler"]]["memories"], lambda it: it["relevant"], ROOT / "results" / "travel" / "gate.json")


if __name__ == "__main__":
    main()
