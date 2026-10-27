"""블라인드 채점. 채점 모델은 조건·모델 이름을 보지 않는다.

  python -m vib.judge                       # results/raw → results/judged
  python -m vib.judge --judge anthropic:claude-opus-5-5 --workers 8

채점 모델이 refusal 을 내면 다른 모델로 대체하지 않고 오류로 기록한다 (채점자가 섞이지 않게).
"""

from __future__ import annotations

import argparse
import json
import os
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from dotenv import load_dotenv

from . import prompts

ROOT = Path(__file__).resolve().parent.parent
_lock = threading.Lock()


def _call_judge(judge: str, system: str, user: str, schema: dict) -> dict:
    provider, model = judge.split(":", 1)
    if provider == "anthropic":
        import anthropic

        client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"], max_retries=4, timeout=300)
        resp = client.messages.create(
            model=model,
            system=system,
            messages=[{"role": "user", "content": user}],
            max_tokens=4000,
            output_config={"effort": "low", "format": {"type": "json_schema", "schema": schema}},
        )
        if resp.stop_reason == "refusal":
            raise RuntimeError(f"judge refusal: {resp.stop_details}")
        text = "".join(b.text for b in resp.content if b.type == "text")
        u = resp.usage
        return json.loads(text) | {"usage": {"input_tokens": u.input_tokens, "output_tokens": u.output_tokens}}
    if provider == "openai":
        from openai import OpenAI

        client = OpenAI(api_key=os.environ["OPENAI_API_KEY"], max_retries=4, timeout=300)
        resp = client.responses.create(
            model=model,
            instructions=system,
            input=[{"role": "user", "content": user}],
            reasoning={"effort": "low"},
            text={"format": {"type": "json_schema", "name": "verdict", "schema": schema, "strict": True}},
            store=False,
        )
        u = resp.usage
        return json.loads(resp.output_text) | {"usage": {"input_tokens": u.input_tokens, "output_tokens": u.output_tokens}}
    raise ValueError(judge)


def _compact(path: Path) -> set[tuple[str, int]]:
    """실패한 채점 행을 지우고 (item, rep)당 성공 행 하나만 남긴다. 성공한 키 집합을 돌려준다."""
    if not path.exists():
        return set()
    keep: dict[tuple[str, int], str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            r = json.loads(line)
            if not r.get("judge_error"):
                keep[(r["item_id"], r["rep"])] = line
    path.write_text("".join(v + "\n" for v in keep.values()), encoding="utf-8")
    return set(keep)


_stop = threading.Event()
# 계정 지출 한도 등 재시도해도 소용없는 오류. 만나면 남은 작업을 건너뛴다.
FATAL_MARKERS = ("usage limits", "credit balance", "insufficient_quota")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", default=str(ROOT / "results" / "raw"))
    ap.add_argument("--out", default=str(ROOT / "results" / "judged"))
    ap.add_argument("--judge", default="anthropic:claude-opus-5-5")
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--analysis-only", action="store_true", help="analysis(화용 분석·추정 목록)만 채점 (응답 채점 건너뜀)")
    ap.add_argument("--items", default=str(ROOT / "data" / "queries.json"), help="문항 파일 (6차 여행: data/travel/items.json)")
    args = ap.parse_args()
    load_dotenv(ROOT / ".env", override=True)

    items = {q["id"]: q for q in json.loads(Path(args.items).read_text(encoding="utf-8"))}
    raw_dir, out_dir = Path(args.raw), Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    jobs = []
    for raw in sorted(raw_dir.glob("*.jsonl")):
        arm = raw.stem
        resp_done = _compact(out_dir / f"{arm}.jsonl")
        ana_done = _compact(out_dir / f"{arm}.analysis.jsonl")
        # 같은 (item, rep) 이 재시도로 두 번 기록된 경우 마지막 성공 행을 쓴다
        rows = {}
        for line in raw.read_text(encoding="utf-8").splitlines():
            if line.strip():
                r = json.loads(line)
                if not r.get("error"):
                    rows[(r["item_id"], r["rep"])] = r
        for key, r in rows.items():
            item = items[r["item_id"]]
            if key not in resp_done and not args.analysis_only:
                jobs.append(("response", arm, r, item))
            if r.get("analysis") is not None and key not in ana_done:
                jobs.append(("analysis", arm, r, item))

    print(f"judge={args.judge} jobs={len(jobs)}", flush=True)

    def do(job):
        kind, arm, r, item = job
        if _stop.is_set():
            return None
        rec = {"arm": arm, "item_id": r["item_id"], "rep": r["rep"], "judge": args.judge}
        try:
            if kind == "response":
                v = _call_judge(args.judge, prompts.JUDGE_SYSTEM, prompts.judge_user_message(item, r["text"]), prompts.JUDGE_SCHEMA)
            else:
                v = _call_judge(
                    args.judge,
                    prompts.ANALYSIS_JUDGE_SYSTEM,
                    prompts.analysis_judge_user_message(item, r["analysis"]),
                    prompts.ANALYSIS_JUDGE_SCHEMA,
                )
            rec.update(v)
        except Exception as e:  # noqa: BLE001
            rec["judge_error"] = f"{type(e).__name__}: {e}"[:500]
            if any(m in str(e) for m in FATAL_MARKERS):
                _stop.set()
        suffix = ".jsonl" if kind == "response" else ".analysis.jsonl"
        with _lock:
            with open(out_dir / f"{arm}{suffix}", "a", encoding="utf-8") as f:
                f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        return rec

    n = 0
    with ThreadPoolExecutor(args.workers) as ex:
        for fut in as_completed([ex.submit(do, j) for j in jobs]):
            n += 1
            rec = fut.result()
            if rec is None:
                continue
            if rec.get("judge_error"):
                print(f"ERROR {rec['arm']} {rec['item_id']} r{rec['rep']}: {rec['judge_error'][:160]}", flush=True)
            if n % 50 == 0:
                print(f"{n}/{len(jobs)}", flush=True)
    if _stop.is_set():
        print("STOPPED: 계정 사용 한도 오류로 남은 채점을 건너뜀. 한도 해제 후 같은 명령으로 이어서 실행", flush=True)
    print(f"done {n}/{len(jobs)}", flush=True)


if __name__ == "__main__":
    main()
