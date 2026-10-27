"""C-auto+H 용 자동 가설을 문항마다 한 번 생성해 고정한다 (턴 사이에 미리 계산한다는 가정).
생성기는 사용자 발화와 정답을 보지 않는다. 결과는 모델·설정, 문항별 생성 시간·사용량과 함께 저장한다.

  python -m vib.hypothesize                                   # 3차: Gemini 3.8 Flash → data/hypotheses.json
  python -m vib.hypothesize --generator mercury --items QFR-01,IMP-01   # 5차: 응답 모델이 직접 → data/hypotheses_self/mercury.json
"""

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

from . import prompts
from .arms import MODELS
from .providers import json_call
from .screen_prep import _conf

ROOT = Path(__file__).resolve().parent.parent
# 3차는 상위 모델이 만든다. 5차(같은 모델)는 응답과 같은 모델·설정으로 만든다: Mercury 3 기본(medium), GPT-6 Luna low
GENERATORS = {
    "gemini38": {"provider": "gemini", "model": "gemini-3.8-flash", "params": {"thinking_level": "MEDIUM", "max_output_tokens": 4096}},
    "mercury": {"provider": "inception", "model": "mercury-3", "params": MODELS["mercury"]["A1"]},
    "luna": {"provider": "openai", "model": "gpt-6-luna", "params": MODELS["luna"]["A2"]},
}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--generator", default="gemini38", choices=sorted(GENERATORS))
    ap.add_argument("--items", default=None, help="문항 id 목록 (쉼표 구분)")
    args = ap.parse_args()
    gen = GENERATORS[args.generator]
    out_path = ROOT / "data" / ("hypotheses.json" if args.generator == "gemini38" else f"hypotheses_self/{args.generator}.json")
    out_path.parent.mkdir(parents=True, exist_ok=True)

    load_dotenv(ROOT / ".env", override=True)
    items = json.loads((ROOT / "data" / "queries.json").read_text(encoding="utf-8"))
    if args.items:
        items = [it for it in items if it["id"] in args.items.split(",")]
    profile = json.loads((ROOT / "data" / "profile.json").read_text(encoding="utf-8"))
    logs = json.loads((ROOT / "data" / "auto_context.json").read_text(encoding="utf-8"))["logs"]
    out, usage, calls = {}, [], {}
    for it in items:
        user = prompts.hypothesis_user_message(profile, it["state"], logs[it["id"]], it["context"])
        assert it["utterance"] not in user and it["gold_intent"] not in user  # 발화·정답 비노출 확인
        failures = []  # 오류·형식 어긋남(예: 객체 대신 목록)은 신뢰성 지표로 남기고 최대 두 번 다시 시도한다
        for _ in range(3):
            parsed, res = json_call(gen["provider"], gen["model"], prompts.HYPOTHESIS_SYSTEM, user, gen["params"])
            if not res.error and isinstance(parsed, dict) and parsed.get("hypotheses"):
                break
            failures.append({"total_ms": res.total_ms, "error": res.error, "text": (res.text or "")[:300]})
        else:
            raise SystemExit(f"{it['id']}: 생성 실패 {failures[-1]}")
        out[it["id"]] = [{"text": h["text"], "confidence": _conf(h.get("confidence"))} for h in parsed["hypotheses"][:5]
                         if isinstance(h, dict) and h.get("text")]
        usage.append(res.usage)
        calls[it["id"]] = {"total_ms": res.total_ms, "usage": res.usage, "failures": failures}
        print(it["id"], len(out[it["id"]]), f"{res.total_ms:.0f}ms", flush=True)
    meta = {"generator": gen, "created_at": datetime.now(timezone.utc).isoformat(),
            "sees": "profile, device state, unselected log, prior dialogue (no utterance, no gold)"}
    out_path.write_text(json.dumps({"meta": meta, "hypotheses": out, "usage": usage, "calls": calls},
                                   ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("ok", len(out))


if __name__ == "__main__":
    main()
