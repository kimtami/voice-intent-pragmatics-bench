"""6차 여행 세트의 응답 전 준비물: 문항마다 v2 추정·여행 플래너 관점 추정(사용자가 말하기 전), 여행자마다 목표 목록(대화와 무관한 배치).
생성기는 모두 Mercury 3 instant 이고 발화와 정답을 보지 않는다. 생성물은 results/travel/prep/ 에 시간·사용량과 함께 저장한다.

  python -m vib.travel_prep
"""

import json
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

from . import prompts
from .hypothesize import GENERATORS, _generate
from .providers import json_call

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "results" / "travel" / "prep"


def _goals(gen: dict, profile: dict, memories: list[str]) -> tuple[dict, object, list[dict]]:
    failures = []  # 형식이 어긋나면 최대 두 번 다시 시도한다 (추정 생성과 같은 규칙)
    for _ in range(3):
        parsed, res = json_call(gen["provider"], gen["model"], prompts.GOALS_SYSTEM, prompts.goals_user_message(profile, memories), gen["params"])
        ok = isinstance(parsed, dict) and all(isinstance(parsed.get(k), list) for k in ("goals", "constraints"))
        if not res.error and ok:
            return {k: [str(x) for x in parsed[k][:8] if x] for k in ("goals", "constraints")}, res, failures
        failures.append({"total_ms": res.total_ms, "error": res.error, "text": (res.text or "")[:300]})
    raise SystemExit(f"목표 생성 실패 {failures[-1]}")


def main() -> None:
    load_dotenv(ROOT / ".env", override=True)
    gen = GENERATORS["mercury_instant"]
    items = json.loads((ROOT / "data" / "travel" / "items.json").read_text(encoding="utf-8"))
    trav = json.loads((ROOT / "data" / "travel" / "travelers.json").read_text(encoding="utf-8"))["travelers"]
    OUT.mkdir(parents=True, exist_ok=True)
    meta = {"generator": gen, "created_at": datetime.now(timezone.utc).isoformat()}
    for name, system in (("v2", prompts.HYPOTHESIS_SYSTEM_V2), ("planner", prompts.HYPOTHESIS_TRAVEL_PLANNER)):
        out, calls = {}, {}
        for it in items:
            t = trav[it["traveler"]]
            user = prompts.travel_hypothesis_user_message(t["profile"], t["memories"], it["state"], it["context"])
            assert it["utterance"] not in user and it["gold_intent"] not in user  # 발화·정답 비노출 확인
            out[it["id"]], res, failures = _generate(it["id"], gen, system, user, allow_empty=True)
            calls[it["id"]] = {"total_ms": res.total_ms, "usage": res.usage, "failures": failures}
            print(name, it["id"], len(out[it["id"]]), f"{res.total_ms:.0f}ms", flush=True)
        (OUT / f"{name}.json").write_text(json.dumps({"meta": meta | {"prompt": name, "sees": "profile, memories, state, prior dialogue"},
                                                      "hypotheses": out, "calls": calls}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    goals, calls = {}, {}
    for tid, t in trav.items():
        goals[tid], res, failures = _goals(gen, t["profile"], t["memories"])
        calls[tid] = {"total_ms": res.total_ms, "usage": res.usage, "failures": failures}
        print("goals", tid, len(goals[tid]["goals"]), len(goals[tid]["constraints"]), f"{res.total_ms:.0f}ms", flush=True)
    (OUT / "goals.json").write_text(json.dumps({"meta": meta | {"prompt": "goals", "sees": "profile, memories only (batch, no dialogue)"},
                                               "goals": goals, "calls": calls}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
