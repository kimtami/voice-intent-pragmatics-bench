"""C-auto+H 용 자동 가설을 문항마다 한 번 생성해 고정한다 (턴 사이에 미리 계산한다는 가정).
생성기는 사용자 발화와 정답을 보지 않는다. 결과는 data/hypotheses.json 에 모델·설정과 함께 저장한다.

  python -m vib.hypothesize
"""

import json
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

from . import prompts
from .providers import json_call

ROOT = Path(__file__).resolve().parent.parent
GENERATOR = {"provider": "gemini", "model": "gemini-3.8-flash", "params": {"thinking_level": "MEDIUM", "max_output_tokens": 4096}}


def main() -> None:
    load_dotenv(ROOT / ".env", override=True)
    items = json.loads((ROOT / "data" / "queries.json").read_text(encoding="utf-8"))
    profile = json.loads((ROOT / "data" / "profile.json").read_text(encoding="utf-8"))
    logs = json.loads((ROOT / "data" / "auto_context.json").read_text(encoding="utf-8"))["logs"]
    out, usage = {}, []
    for it in items:
        user = prompts.hypothesis_user_message(profile, it["state"], logs[it["id"]], it["context"])
        assert it["utterance"] not in user and it["gold_intent"] not in user  # 발화·정답 비노출 확인
        parsed, res = json_call(GENERATOR["provider"], GENERATOR["model"], prompts.HYPOTHESIS_SYSTEM, user, GENERATOR["params"])
        if res.error or not parsed or not parsed.get("hypotheses"):
            raise SystemExit(f"{it['id']}: 생성 실패 {res.error or res.text[:200]}")
        out[it["id"]] = [{"text": h["text"], "confidence": float(h["confidence"])} for h in parsed["hypotheses"][:5]]
        usage.append(res.usage)
        print(it["id"], len(out[it["id"]]), f"{res.total_ms:.0f}ms", flush=True)
    meta = {"generator": GENERATOR, "created_at": datetime.now(timezone.utc).isoformat(),
            "sees": "profile, device state, unselected log, prior dialogue (no utterance, no gold)"}
    (ROOT / "data" / "hypotheses.json").write_text(
        json.dumps({"meta": meta, "hypotheses": out, "usage": usage}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("ok", len(out))


if __name__ == "__main__":
    main()
