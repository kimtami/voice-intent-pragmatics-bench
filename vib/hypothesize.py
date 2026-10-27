"""C-auto+H 용 자동 가설을 문항마다 한 번 생성해 고정한다 (턴 사이에 미리 계산한다는 가정).
생성기는 사용자 발화와 정답을 보지 않는다. 결과는 모델·설정, 문항별 생성 시간·사용량과 함께 저장한다.

  python -m vib.hypothesize                                   # 3차: Gemini 3.8 Flash → data/hypotheses.json
  python -m vib.hypothesize --generator mercury --items QFR-01,IMP-01   # 5차: 응답 모델이 직접 → data/hypotheses_self/mercury.json
  python -m vib.hypothesize --generator mercury_instant --prompt persona --out ...   # 관점 2개를 병렬로 만들어 합친다
"""

import argparse
import json
from concurrent.futures import ThreadPoolExecutor
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
    # 생성 시간 비교용: 같은 Mercury 3 를 생각 없이(instant). 5차에서는 응답에 쓰지 않고 시간만 잰다
    "mercury_instant": {"provider": "inception", "model": "mercury-3", "params": MODELS["mercury"]["A0"]},
}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--generator", default="gemini38", choices=sorted(GENERATORS))
    ap.add_argument("--items", default=None, help="문항 id 목록 (쉼표 구분)")
    ap.add_argument("--timing-out", default=None, help="생성 시간·실패만 다시 재서 이 경로에 쓴다 (추정 내용 파일은 그대로)")
    ap.add_argument("--prompt", default="v1", choices=["v1", "v2", "persona"],
                    help="v2: 관련성 기준 + 0~5개 (5차 원인 분석), persona: v2 + 관점 2개를 병렬로, 각 0~3개")
    ap.add_argument("--out", default=None, help="추정 저장 경로 (기본 경로를 덮어쓰지 않을 때)")
    args = ap.parse_args()
    gen = GENERATORS[args.generator]
    out_path = ROOT / "data" / ("hypotheses.json" if args.generator == "gemini38" else f"hypotheses_self/{args.generator}.json")
    if args.timing_out or args.out:
        out_path = Path(args.timing_out or args.out)
    system = {"v1": prompts.HYPOTHESIS_SYSTEM, "v2": prompts.HYPOTHESIS_SYSTEM_V2}.get(args.prompt)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    load_dotenv(ROOT / ".env", override=True)
    items = json.loads((ROOT / "data" / "queries.json").read_text(encoding="utf-8"))
    if args.items:
        items = [it for it in items if it["id"] in args.items.split(",")]
    profile = json.loads((ROOT / "data" / "profile.json").read_text(encoding="utf-8"))
    logs = json.loads((ROOT / "data" / "auto_context.json").read_text(encoding="utf-8"))["logs"]
    out, usage, calls, by_view = {}, [], {}, {v: {} for v in prompts.PERSONA_VIEWS}
    for n, it in enumerate(items):
        user = prompts.hypothesis_user_message(profile, it["state"], logs[it["id"]], it["context"])
        assert it["utterance"] not in user and it["gold_intent"] not in user  # 발화·정답 비노출 확인
        if args.prompt != "persona":
            out[it["id"]], res, failures = _generate(it["id"], gen, system, user, allow_empty=args.prompt == "v2")
            usage.append(res.usage)
            calls[it["id"]] = {"total_ms": res.total_ms, "usage": res.usage, "failures": failures}
        else:  # 관점 2개를 동시에 부른다. 생성 시간은 둘 중 늦은 쪽, 비용은 둘의 합
            views = list(prompts.PERSONA_VIEWS)
            with ThreadPoolExecutor(len(views)) as ex:
                got = dict(zip(views, ex.map(lambda v: _generate(it["id"], gen, prompts.HYPOTHESIS_PERSONA[v], user, True, 3), views)))
            for v in views:
                by_view[v][it["id"]] = got[v][0]
            # 합칠 때 꼬리표는 달지 않고(v2 와 같은 형식) 확신도 순으로 섞는다. 같은 확신도면 문항마다 먼저 오는 관점을 번갈아 둔다
            order = views if n % 2 == 0 else views[::-1]
            out[it["id"]] = [h for _, _, _, h in sorted((-h["confidence"], i, order.index(v), h)
                                                        for v in views for i, h in enumerate(got[v][0]))]
            u = _sum_usage([got[v][1].usage for v in views])
            usage.append(u)
            calls[it["id"]] = {"total_ms": max(got[v][1].total_ms for v in views), "usage": u,
                               "failures": [f for v in views for f in got[v][2]],
                               "views": {v: {"total_ms": got[v][1].total_ms, "usage": got[v][1].usage, "failures": got[v][2]}
                                         for v in views}}
        print(it["id"], len(out[it["id"]]), f"{calls[it['id']]['total_ms']:.0f}ms", flush=True)
    meta = {"generator": gen, "prompt": args.prompt, "created_at": datetime.now(timezone.utc).isoformat(),
            "sees": "profile, device state, unselected log, prior dialogue (no utterance, no gold)"}
    if args.timing_out:
        meta["note"] = "생성 시간·실패만 다시 잰 값. 응답에 쓰는 추정 내용은 data/hypotheses_self/ 그대로"
    if args.prompt == "persona":
        meta["note"] = "hypotheses 는 두 관점을 합친 목록(응답에 넣는 것), by_view 는 관점별 목록. 생성 시간은 늦은 쪽, 사용량은 합"
    dump = {"meta": meta, "hypotheses": out, "usage": usage, "calls": calls} | ({"by_view": by_view} if args.prompt == "persona" else {})
    out_path.write_text(json.dumps(dump,
                                   ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("ok", len(out))


def _generate(item_id: str, gen: dict, system: str, user: str, allow_empty: bool, cap: int = 5) -> tuple[list[dict], object, list[dict]]:
    failures = []  # 오류·형식 어긋남(예: 객체 대신 목록)은 신뢰성 지표로 남기고 최대 두 번 다시 시도한다
    for _ in range(3):
        parsed, res = json_call(gen["provider"], gen["model"], system, user, gen["params"])
        # v2 는 빈 목록을 허용하므로, 목록이 비었는지가 아니라 형식이 맞는지만 본다
        ok = isinstance(parsed, dict) and isinstance(parsed.get("hypotheses"), list)
        if not res.error and ok and (parsed["hypotheses"] or allow_empty):
            break
        failures.append({"total_ms": res.total_ms, "error": res.error, "text": (res.text or "")[:300]})
    else:
        raise SystemExit(f"{item_id}: 생성 실패 {failures[-1]}")
    hyps = [{"text": h["text"], "confidence": _conf(h.get("confidence"))} for h in parsed["hypotheses"][:cap]
            if isinstance(h, dict) and h.get("text")]
    return hyps, res, failures


def _sum_usage(us: list[dict]) -> dict:
    """사용량 사전을 더한다 (숫자는 더하고, 안쪽 사전은 같은 방식으로 더한다)."""
    out: dict = {}
    for u in us:
        for k, v in (u or {}).items():
            if isinstance(v, dict):
                out[k] = _sum_usage([out.get(k) or {}, v])
            elif isinstance(v, (int, float)) and not isinstance(v, bool):
                out[k] = out.get(k, 0) + v
    return out


if __name__ == "__main__":
    main()
