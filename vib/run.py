"""실험 실행.

예)
  python -m vib.run --check                      # 키 존재 여부만 확인 (값은 출력하지 않음)
  python -m vib.run --arms all --reps 3          # 키가 있는 모든 조건 실행
  python -m vib.run --arms luna,mercury --reps 3 # 모델 계열로 고르기
  python -m vib.run --dry-run --out /tmp/vib-dry # 가짜 제공자로 파이프라인만 검증

같은 제공자 호출은 순차로, 서로 다른 제공자는 병렬 스레드로 돈다. 이미 기록된 (arm, item, rep)은 건너뛰므로
중단 후 같은 명령을 다시 실행하면 이어서 진행한다.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import threading
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

from . import prompts
from .arms import Arm, all_arms, fake_arms, screen_arms, selfhyp_arms
from .providers import json_call, stream_reply

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "queries.json"
_lock = threading.Lock()


def load_items(limit: int | None = None) -> list[dict]:
    items = json.loads(DATA.read_text(encoding="utf-8"))
    return items[:limit] if limit else items


def _screen(name: str) -> dict:
    return json.loads((SCREEN / f"{name}.json").read_text(encoding="utf-8"))["data"]


def select_arms(spec: str, dry_run: bool, screen: bool = False, selfhyp: bool = False) -> list[Arm]:
    if selfhyp:  # 5차: 같은 모델 추정 + 같은 시각 비교군
        pool = selfhyp_arms()
        return list(pool.values()) if spec == "all" else [a for a in pool.values() if a.arm_id in spec.split(",")]
    if screen:  # 선별 실험: M1~M6 + 같은 시각 지연 대조용 기준 설정
        pool = screen_arms() | {"mercury.A1": all_arms()["mercury.A1"]}
        return list(pool.values()) if spec == "all" else [a for a in pool.values() if a.arm_id in spec.split(",")]
    pool = fake_arms() if dry_run else all_arms()
    if spec == "all":
        return list(pool.values())
    wanted = [s.strip() for s in spec.split(",") if s.strip()]
    out = []
    for arm in pool.values():
        if any(arm.arm_id == w or arm.family == w or arm.arm_id.startswith(w + ".") for w in wanted):
            out.append(arm)
    return out


def done_keys(path: Path) -> set[tuple[str, int]]:
    keys = set()
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.strip():
                row = json.loads(line)
                if not row.get("error"):
                    keys.add((row["item_id"], row["rep"]))
    return keys


PROFILE = ROOT / "data" / "profile.json"
AUTO = ROOT / "data" / "auto_context.json"
HYPS = ROOT / "data" / "hypotheses.json"
SELF_HYPS = ROOT / "data" / "hypotheses_self"  # <family>.json: 응답 모델이 직접 만든 추정
SCREEN = ROOT / "data" / "screen"


def run_one(arm: Arm, item: dict, rep: int) -> dict:
    mode = arm.extra.get("mode")
    messages = item["context"] + [{"role": "user", "content": item["utterance"]}]
    row: dict = {
        "arm": arm.arm_id,
        "family": arm.family,
        "condition": arm.condition,
        "provider": arm.provider,
        "model": arm.model,
        "params": arm.params,
        "item_id": item["id"],
        "category": item["category"],
        "rep": rep,
        "started_at": datetime.now(timezone.utc).isoformat(),
    }
    if arm.extra.get("base_arm"):
        row["base_arm"] = arm.extra["base_arm"]
    extra = None
    analysis_ms = 0.0
    if arm.analyzer:
        a = arm.analyzer
        user = prompts.analyzer_user_message(item["state"], item["context"], item["utterance"])
        analysis, ares = json_call(a["provider"], a["model"], prompts.ANALYZER_SYSTEM, user, a["params"])
        row["analyzer"] = {"provider": a["provider"], "model": a["model"], "params": a["params"]}
        row["analysis"] = analysis if analysis is not None else ares.text
        row["analysis_call"] = ares.to_dict() | {"text": None}
        if ares.error:
            row["error"] = f"analyzer: {ares.error}"
            return row
        analysis_ms = ares.total_ms or 0.0
        extra = prompts.responder_extra(row["analysis"])
    elif arm.checklist:
        extra = prompts.PRAGMATIC_CHECKLIST
    elif mode == "context":
        extra = prompts.common_ground(json.loads(PROFILE.read_text(encoding="utf-8")), item["events"])
    elif mode in ("auto", "auto_hyp", "auto_selfhyp"):
        log = json.loads(AUTO.read_text(encoding="utf-8"))["logs"][item["id"]]
        extra = prompts.auto_context(json.loads(PROFILE.read_text(encoding="utf-8")), log)
        if mode == "auto_hyp":
            hyps = json.loads(HYPS.read_text(encoding="utf-8"))["hypotheses"][item["id"]]
            extra += "\n\n" + prompts.hypotheses_block(hyps)
        elif mode == "auto_selfhyp":
            hyps = json.loads((SELF_HYPS / f"{arm.family}.json").read_text(encoding="utf-8"))["hypotheses"][item["id"]]
            extra += "\n\n" + prompts.hypotheses_block(hyps)
            row["analysis"] = hyps  # 채점기가 추정 목록도 정답 의도와 대조하도록 analysis 로 남긴다
    elif mode in ("m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m5b", "m5c"):
        profile = json.loads(PROFILE.read_text(encoding="utf-8"))
        log = json.loads(AUTO.read_text(encoding="utf-8"))["logs"][item["id"]]
        base = prompts.auto_context(profile, log)
        if mode in ("m1", "m2"):
            extra = base + "\n\n" + prompts.hypotheses_block(_screen(f"{mode}_situations")[item["id"]])
        elif mode == "m3":  # 다시 쓴 사실 요약이 로그를 대신한다
            extra = prompts.facts_block(profile, _screen("m3_facts")[item["id"]])
        elif mode == "m4":
            extra = base + "\n\n" + prompts.INTERPRET_INLINE
        elif mode == "m7":
            extra = base + "\n\n" + prompts.INTERPRET_INLINE_10
        elif mode == "m8":
            extra = base + "\n\n" + prompts.INTERPRET_SILENT_10
        elif mode in ("m5", "m5b", "m5c"):  # 미리 만든 후보를 두고 발화를 보고 고른다 (후보 출처만 다름)
            source = {"m5": "m1_situations", "m5b": "m2_situations", "m5c": "m6_prefix"}[mode]
            extra = base + "\n\n" + prompts.candidates_block(_screen(source)[item["id"]])
        else:  # m6: 발화 앞부분으로 만든 가설
            extra = base + "\n\n" + prompts.hypotheses_block(_screen("m6_prefix")[item["id"]])
    elif mode == "context_checklist":
        cg = prompts.common_ground(json.loads(PROFILE.read_text(encoding="utf-8")), item["events"])
        extra = prompts.PRAGMATIC_CHECKLIST + "\n\n" + cg

    system = prompts.system_prompt(item["state"], extra)
    res = stream_reply(arm.provider, arm.model, system, messages, arm.params)
    row.update(
        {
            "text": res.text,
            "ttft_ms": res.ttft_ms,
            "first_sentence_ms": res.first_sentence_ms,
            "total_ms": res.total_ms,
            "analysis_ms": analysis_ms if arm.analyzer else None,
            # 사용자가 실제로 기다리는 시간: 분석이 끝나야 응답 생성을 시작하므로 분석 시간을 더한다.
            "e2e_first_ms": None if res.ttft_ms is None else round(analysis_ms + res.ttft_ms, 1),
            "e2e_sentence_ms": None if res.first_sentence_ms is None else round(analysis_ms + res.first_sentence_ms, 1),
            "usage": res.usage,
            "error": res.error,
        }
    )
    if res.hidden is not None:
        row["hidden"] = res.hidden
    if not res.error and not res.text.strip():
        row["error"] = "empty_response"
    return row


def warmup(arm: Arm) -> None:
    """연결·TLS 수립 비용을 측정에서 빼기 위한 1회 호출. 기록하지 않는다."""
    r = stream_reply(arm.provider, arm.model, prompts.system_prompt("워밍업"), [{"role": "user", "content": "안녕"}], arm.params)
    status = "ok" if not r.error else r.error[:120]
    print(f"[warmup] {arm.provider}/{arm.model}: {status}", flush=True)


def worker(group: str, arms: list[Arm], items: list[dict], reps: int, out_dir: Path, do_warmup: bool) -> None:
    if do_warmup:
        warmup(arms[0])
    done = {a.arm_id: done_keys(out_dir / f"{a.arm_id}.jsonl") for a in arms}
    total = len(arms) * len(items) * reps
    n = 0
    t_start = time.time()
    for rep in range(1, reps + 1):
        for i, item in enumerate(items):
            order = arms[i % len(arms):] + arms[: i % len(arms)]  # 조건 순서를 돌려 시간대 편향을 줄인다
            for arm in order:
                n += 1
                if (item["id"], rep) in done[arm.arm_id]:
                    continue
                row = run_one(arm, item, rep)
                if row.get("error"):  # 일시 오류는 한 번 재시도
                    time.sleep(2)
                    row = run_one(arm, item, rep)
                with _lock:
                    with open(out_dir / f"{arm.arm_id}.jsonl", "a", encoding="utf-8") as f:
                        f.write(json.dumps(row, ensure_ascii=False) + "\n")
                if row.get("error"):
                    print(f"[{group}] ERROR {arm.arm_id} {item['id']} r{rep}: {row['error'][:160]}", flush=True)
                if n % 20 == 0:
                    el = time.time() - t_start
                    print(f"[{group}] {n}/{total} ({el:.0f}s)", flush=True)
    print(f"[{group}] done {n}/{total}", flush=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--arms", default="all")
    ap.add_argument("--reps", type=int, default=3)
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--out", default=str(ROOT / "results" / "raw"))
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--no-warmup", action="store_true")
    ap.add_argument("--screen", action="store_true", help="4차 선별 실험 (M1~M8, 24문항)")
    ap.add_argument("--selfhyp", action="store_true", help="5차 같은 모델 추정 실험")
    ap.add_argument("--items", default=None, help="문항 id 목록 (쉼표 구분)")
    args = ap.parse_args()

    load_dotenv(ROOT / ".env", override=True)
    keys = ["OPENAI_API_KEY", "INCEPTION_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY"]
    present = {k: bool(os.environ.get(k, "").strip()) for k in keys}
    if args.check:
        for k, v in present.items():
            print(f"{k}: {'있음' if v else '없음'}")
        return

    out_dir = Path(args.out)
    if args.dry_run and out_dir.resolve().is_relative_to((ROOT / "results").resolve()):
        sys.exit("dry-run 결과는 results/ 밖에 저장해야 합니다 (--out 지정)")
    out_dir.mkdir(parents=True, exist_ok=True)

    arms = select_arms(args.arms, args.dry_run, args.screen, args.selfhyp)
    runnable, skipped = [], []
    for a in arms:
        (runnable if all(present.get(k) for k in a.keys) else skipped).append(a)
    for a in skipped:
        print(f"[skip] {a.arm_id}: 키 없음 ({', '.join(k for k in a.keys if not present.get(k))}) → 미실행", flush=True)
    if not runnable:
        sys.exit("실행할 조건이 없습니다")

    items = load_items(args.limit)
    if args.screen:
        from .screen_prep import SATURATED
        items = [it for it in items if it["category"] not in SATURATED]
    if args.items:
        wanted = args.items.split(",")
        items = [it for it in items if it["id"] in wanted]
    groups: dict[str, list[Arm]] = defaultdict(list)
    for a in runnable:
        groups[a.provider].append(a)
    print(f"items={len(items)} reps={args.reps} arms={len(runnable)} groups={ {g: len(v) for g, v in groups.items()} }", flush=True)

    threads = [
        threading.Thread(target=worker, args=(g, v, items, args.reps, out_dir, not args.no_warmup), daemon=True)
        for g, v in groups.items()
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()


if __name__ == "__main__":
    main()
