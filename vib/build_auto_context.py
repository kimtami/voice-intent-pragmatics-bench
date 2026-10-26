"""C-auto 용 '선별 없는 로그'를 만든다. 2차의 관련 기록(events)을 관련 없는 기록 사이에 섞어,
사람이 고른 2~3줄 대신 실제 시스템처럼 잡음이 섞인 로그를 준다. 고정 시드로 재현된다.

  python -m vib.build_auto_context   # data/auto_context.json 생성
"""

import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
N_NOISE = 10
SEED = 20261027


def main() -> None:
    items = json.loads((ROOT / "data" / "queries.json").read_text(encoding="utf-8"))
    noise = json.loads((ROOT / "data" / "log_noise.json").read_text(encoding="utf-8"))
    rng = random.Random(SEED)
    out = {}
    for it in items:  # 문항 순서대로 같은 난수열을 쓰므로 재현된다
        log = rng.sample(noise, N_NOISE)
        for ev in it["events"]:  # 관련 기록을 무작위 위치에 끼워 넣는다
            log.insert(rng.randint(0, len(log)), ev)
        out[it["id"]] = log
    meta = {"seed": SEED, "noise_per_item": N_NOISE, "source": "events + log_noise.json"}
    (ROOT / "data" / "auto_context.json").write_text(
        json.dumps({"meta": meta, "logs": out}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"ok {len(out)} items, {N_NOISE} noise each")


if __name__ == "__main__":
    main()
