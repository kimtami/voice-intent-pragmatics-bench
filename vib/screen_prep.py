"""4차 선별 실험(M1~M6)에 쓰는 발화 전 생성물을 만들어 data/screen/ 에 고정한다.

  python -m vib.screen_prep

- M1: 강한 모델(Gemini 3.8 Flash)이 서로 다른 축의 상황 10개를 유추
- M2: 같은 지시를 싼 모델(Mercury 3, effort low)에게
- M3: 싼 모델이 잡음 로그를 관련 사실 요약(최대 5줄)으로 다시 씀
- M6: 사용자가 말하는 중, 발화 앞 절반만 보고 싼 모델(Mercury 3, instant)이 가설 5개

M1·M2·M3 생성기는 발화와 정답을 보지 않는다. M6 은 발화 앞부분만 본다. 생성 시간과 사용량을 함께 기록한다.
"""

import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

from . import prompts
from .providers import json_call

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "screen"
# 모든 조건이 만점이던 간접 요청·전제·음성 인식 오류 6문항은 차이를 보이지 못하므로 뺀다
SATURATED = {"indirect_request", "presupposition", "asr_noise"}

STRONG = {"provider": "gemini", "model": "gemini-3.8-flash", "params": {"thinking_level": "MEDIUM", "max_output_tokens": 4096}}
CHEAP = {"provider": "inception", "model": "mercury-3",
         "params": {"reasoning_effort": "low", "temperature": 0.75, "realtime": True, "max_completion_tokens": 4096}}
CHEAP_FAST = {"provider": "inception", "model": "mercury-3",
              "params": {"reasoning_effort": "instant", "temperature": 0.75, "realtime": True, "max_completion_tokens": 4096}}

JOBS = {
    "m1_situations": (STRONG, prompts.SITUATIONS_SYSTEM, "hypotheses", False),
    "m2_situations": (CHEAP, prompts.SITUATIONS_SYSTEM, "hypotheses", False),
    "m3_facts": (CHEAP, prompts.REWRITE_SYSTEM, "facts", False),
    "m6_prefix": (CHEAP_FAST, prompts.PREFIX_SYSTEM, "hypotheses", True),
}


def screen_items() -> list[dict]:
    items = json.loads((ROOT / "data" / "queries.json").read_text(encoding="utf-8"))
    return [it for it in items if it["category"] not in SATURATED]


def _conf(v) -> float:
    """확신도가 숫자가 아니면(싼 모델이 가끔 깨진 값을 냄) 문자열에서 숫자를 찾고, 없으면 0.5 로 둔다."""
    try:
        return max(0.0, min(1.0, float(v)))
    except (TypeError, ValueError):
        m = re.search(r"0?\.\d+|[01](?:\.0)?", str(v))
        return float(m.group(0)) if m else 0.5


def prefix_of(utterance: str) -> str:
    words = utterance.split()
    return " ".join(words[: max(1, math.ceil(len(words) / 2))])


def main() -> None:
    load_dotenv(ROOT / ".env", override=True)
    OUT.mkdir(parents=True, exist_ok=True)
    profile = json.loads((ROOT / "data" / "profile.json").read_text(encoding="utf-8"))
    logs = json.loads((ROOT / "data" / "auto_context.json").read_text(encoding="utf-8"))["logs"]
    items = screen_items()
    for name, (gen, system, key, uses_prefix) in JOBS.items():
        if (OUT / f"{name}.json").exists():  # 이미 고정한 생성물은 다시 만들지 않는다
            print(name, "skip (exists)", flush=True)
            continue
        out, meta_rows = {}, {}
        for it in items:
            prefix = prefix_of(it["utterance"]) if uses_prefix else None
            user = prompts.prep_user_message(profile, it["state"], logs[it["id"]], it["context"], prefix)
            assert it["gold_intent"] not in user
            if not uses_prefix:
                assert it["utterance"] not in user  # 발화 전 생성물은 발화를 보지 않는다
            parsed, res = json_call(gen["provider"], gen["model"], system, user, gen["params"])
            if res.error or not parsed or not parsed.get(key):
                parsed, res = json_call(gen["provider"], gen["model"], system, user, gen["params"])  # 한 번 재시도
            if res.error or not parsed or not parsed.get(key):
                raise SystemExit(f"{name} {it['id']}: 생성 실패 {res.error or (res.text or '')[:200]}")
            val = parsed[key]
            if key == "hypotheses":
                val = [{"text": h["text"], "confidence": _conf(h.get("confidence"))} for h in val
                       if isinstance(h, dict) and h.get("text")]
            out[it["id"]] = val
            meta_rows[it["id"]] = {"total_ms": res.total_ms, "usage": res.usage, "prefix": prefix}
            print(name, it["id"], len(val), f"{res.total_ms:.0f}ms", flush=True)
        doc = {"meta": {"generator": gen, "system": name, "created_at": datetime.now(timezone.utc).isoformat()},
               "data": out, "calls": meta_rows}
        (OUT / f"{name}.json").write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("ok")


if __name__ == "__main__":
    main()
