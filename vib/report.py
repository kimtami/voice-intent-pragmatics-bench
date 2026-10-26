"""집계와 차트.

  python -m vib.report   # results/raw + results/judged → results/summary.{csv,md}, 차트 PNG 2장

정확도 = 채점 점수 평균 / 2 (0~100%). 엄격 정확도 = 2점 비율.
첫 발화 지연 = 사용자가 말을 마친 뒤 첫 보이는 텍스트가 나올 때까지 (A3·X 는 분석 시간 포함).
95% 신뢰구간은 질의 단위 부트스트랩(2000회).
"""

from __future__ import annotations

import csv
import json
import random
import re
import statistics
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / "results"

FAMILY_NAME = {
    "luna": "GPT-6 Luna",
    "mercury": "Mercury 3",
    "haiku": "Claude Haiku 5.5",
    "gemini": "Gemini 3.5 Flash-Lite",
    "gemini38": "Gemini 3.8 Flash",
}
COND_NAME = {
    "A0": "A0 effort 하향 (instant)",
    "A1": "A1 기본",
    "A2": "A2 effort 상향",
    "A3": "A3 화용 서브에이전트",
    "A4": "A4 화용 점검표",
    "X": "교차 A3",
}
COND_NAME |= {"C": "C 공유 맥락", "CK": "C+A4 맥락+점검표", "CA": "C-auto 선별 없는 로그", "CH": "C-auto+H 자동 가설"}
COND_MARKER = {"A0": "v", "A1": "o", "A2": "^", "A3": "s", "A4": "D", "X": "P", "C": "h", "CK": "p", "CA": "X", "CH": "d"}


def cond_label(r: dict) -> str:
    """표에 쓸 조건 이름. 교차 조건은 조합을, C·P 는 기준 설정을 덧붙인다."""
    c = r["condition"]
    if c == "X":
        return f"교차 A3 ({r['arm'].split('.', 1)[1].replace('>', '→')})"
    if c in ("C", "CK", "CA", "CH") and r.get("base_arm"):
        return f"{COND_NAME[c]} ({r['base_arm'].split('.', 1)[1]} 기준)"
    return COND_NAME.get(c, c)


def short_label(r: dict, always_base: bool = False) -> str:
    """차트 점 옆에 붙일 짧은 이름."""
    c = r["condition"]
    if c == "X":
        return "X:" + r["arm"].split(".", 1)[1].split(">")[0]
    if c in ("C", "CK", "CA", "CH") and r.get("base_arm"):
        b = r["base_arm"].split(".", 1)[1]
        name = {"C": "C", "CK": "C+A4", "CA": "C-auto", "CH": "C-auto+H"}[c]
        return name if b == "A1" and not always_base else f"{b}+{name}"
    return c
# A1 과 A4 는 지연이 비슷해 겹치기 쉬우므로 라벨을 반대 방향에 둔다
# 개요 차트에서 지연이 비슷한 Haiku 와 Luna 이름표가 겹치지 않게 한다
OVERVIEW_OFFSET = {"haiku": (-10, -17, "right")}
LABEL_OFFSET = {"C": (8, -15, "left"), "CK": (8, 6, "left"), "CA": (8, -15, "left"), "CH": (8, 6, "left"), "A0": (-8, 6, "right"), "A1": (-8, -15, "right"), "A2": (8, 6, "left"), "A3": (8, 6, "left"), "A4": (8, 6, "left"), "X": (8, -15, "left")}
CATEGORY_NAME = {
    "indirect_request": "간접 요청",
    "question_form_request": "질문형 요청",
    "implicature": "대화 함축",
    "ellipsis_deixis": "생략·직시",
    "self_repair": "자기 수정",
    "ambiguous_response_word": "다의적 응답어",
    "sarcasm_complaint": "반어·불만",
    "politeness_hedge": "완곡·공손",
    "presupposition": "전제",
    "honorific": "높임법",
    "multi_intent": "복합 의도",
    "asr_noise": "음성 인식 오류",
    "phatic_no_action": "감정·혼잣말",
}
# 1M 토큰당 (입력, 출력) 달러. 2026-10-26 공식 가격 페이지 기준 (docs/model-settings.md). 출력에는 추론 토큰 포함.
# mercury-3 는 출시 할인가(정가 $0.20 / $0.70), gemini-3.8-flash 는 2026-12-31 까지의 가격.
PRICES = {
    "gpt-6-luna": (0.10, 0.50),
    "mercury-3": (0.10, 0.35),
    "claude-haiku-5-5": (0.10, 0.50),
    "gemini-3.5-flash-lite": (0.30, 2.50),
    "gemini-3.8-flash": (0.75, 3.75),
}


def _call_cost(model: str, usage: dict) -> float | None:
    if model not in PRICES or not usage:
        return None
    pin, pout = PRICES[model]
    if "prompt_token_count" in usage:  # Gemini: 추론 토큰은 total - prompt - candidates 로만 드러난다
        tin = usage.get("prompt_token_count", 0)
        tout = usage.get("total_token_count", 0) - tin
    else:
        tin = (usage.get("input_tokens") or usage.get("prompt_tokens") or 0) + (usage.get("cache_read_input_tokens") or 0) \
            + (usage.get("cache_creation_input_tokens") or 0)
        tout = usage.get("output_tokens") or usage.get("completion_tokens") or 0
    return (tin * pin + tout * pout) / 1e6


MARKDOWN = re.compile(r"(\*\*|^#|^\s*[-*] |^\s*\d+\. )", re.M)


def _jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    return [json.loads(x) for x in path.read_text(encoding="utf-8").splitlines() if x.strip()]


def _pct(xs: list[float], q: float) -> float | None:
    xs = sorted(x for x in xs if x is not None)
    if not xs:
        return None
    k = (len(xs) - 1) * q
    lo, hi = int(k), min(int(k) + 1, len(xs) - 1)
    return xs[lo] + (xs[hi] - xs[lo]) * (k - lo)


def _boot_ci(per_item: dict[str, list[float]], n: int = 2000, seed: int = 7) -> tuple[float, float]:
    rng = random.Random(seed)
    keys = sorted(per_item)
    means = []
    for _ in range(n):
        sample = [statistics.mean(per_item[rng.choice(keys)]) for _ in keys]
        means.append(statistics.mean(sample))
    return _pct(means, 0.025), _pct(means, 0.975)


def load() -> tuple[dict, dict]:
    arms: dict[str, dict] = {}
    for raw in sorted((RES / "raw").glob("*.jsonl")):
        arm = raw.stem
        rows = {}
        errors = 0
        for r in _jsonl(raw):
            if r.get("error"):
                errors += 1
                continue
            rows[(r["item_id"], r["rep"])] = r
        judged = {(j["item_id"], j["rep"]): j for j in _jsonl(RES / "judged" / f"{arm}.jsonl") if not j.get("judge_error")}
        ana = {(j["item_id"], j["rep"]): j for j in _jsonl(RES / "judged" / f"{arm}.analysis.jsonl") if not j.get("judge_error")}
        arms[arm] = {"rows": rows, "judged": judged, "analysis": ana, "errors": errors}
    items = {q["id"]: q for q in json.loads((ROOT / "data" / "queries.json").read_text(encoding="utf-8"))}
    return arms, items


def summarize(arms: dict, items: dict) -> tuple[list[dict], dict, dict]:
    table, by_cat, per_item_by_arm = [], {}, {}
    for arm, d in arms.items():
        rows, judged = d["rows"], d["judged"]
        if not rows:
            continue
        any_row = next(iter(rows.values()))
        per_item: dict[str, list[float]] = defaultdict(list)
        strict, lenient = [], []
        cat_scores: dict[str, list[float]] = defaultdict(list)
        for key, j in judged.items():
            if key not in rows:
                continue
            per_item[key[0]].append(j["score"] / 2)
            strict.append(1.0 if j["score"] == 2 else 0.0)
            # 의도 이해율: 의도는 맞히고 실행 전에 확인만 한 1점도 정답으로 본다 (채점 플래그 기준)
            understood = j["score"] == 2 or (
                j["score"] == 1 and j["asked_clarification"]
                and not (j["literal_only"] or j["wrong_target_or_value"] or j["over_action"])
            )
            lenient.append(1.0 if understood else 0.0)
            cat_scores[rows[key]["category"]].append(j["score"] / 2)
        lat = [r["e2e_first_ms"] for r in rows.values()]
        sent = [r["e2e_sentence_ms"] for r in rows.values()]
        texts = [r["text"] for r in rows.values()]
        out_tok = []
        for r in rows.values():
            u = r.get("usage") or {}
            v = u.get("output_tokens") or u.get("completion_tokens") or u.get("candidates_token_count")
            if v is not None:
                out_tok.append(v)
        costs = []
        for r in rows.values():
            c = _call_cost(r["model"], r.get("usage") or {})
            if c is not None and r.get("analyzer"):
                ca = _call_cost(r["analyzer"]["model"], (r.get("analysis_call") or {}).get("usage") or {})
                c = None if ca is None else c + ca
            if c is not None:
                costs.append(c)
        ana_scores = [j["score"] / 2 for j in d["analysis"].values()]
        acc = statistics.mean(statistics.mean(v) for v in per_item.values()) if per_item else None
        ci = _boot_ci(per_item) if per_item else (None, None)
        rec = {
            "arm": arm,
            "family": any_row["family"],
            "condition": any_row["condition"],
            "base_arm": any_row.get("base_arm"),
            "model": any_row["model"],
            "params": json.dumps(any_row["params"], ensure_ascii=False),
            "n_rows": len(rows),
            "n_judged": sum(len(v) for v in per_item.values()),
            "errors": d["errors"],
            "accuracy": None if acc is None else round(acc * 100, 1),
            "acc_ci_lo": None if ci[0] is None else round(ci[0] * 100, 1),
            "acc_ci_hi": None if ci[1] is None else round(ci[1] * 100, 1),
            "strict_accuracy": round(statistics.mean(strict) * 100, 1) if strict else None,
            "understood_rate": round(statistics.mean(lenient) * 100, 1) if lenient else None,
            "first_p50_ms": _round(_pct(lat, 0.5)),
            "first_p25_ms": _round(_pct(lat, 0.25)),
            "first_p75_ms": _round(_pct(lat, 0.75)),
            "first_p90_ms": _round(_pct(lat, 0.9)),
            "sentence_p50_ms": _round(_pct(sent, 0.5)),
            "analysis_p50_ms": _round(_pct([r.get("analysis_ms") for r in rows.values()], 0.5)),
            "total_p50_ms": _round(_pct([r["total_ms"] for r in rows.values()], 0.5)),
            "avg_chars": round(statistics.mean(len(t) for t in texts), 1),
            "markdown_rate": round(statistics.mean(1.0 if MARKDOWN.search(t) else 0.0 for t in texts) * 100, 1),
            "avg_output_tokens": round(statistics.mean(out_tok), 1) if out_tok else None,
            "analysis_accuracy": round(statistics.mean(ana_scores) * 100, 1) if ana_scores else None,
            "cost_per_1k_turns_usd": round(statistics.mean(costs) * 1000, 3) if costs else None,
        }
        table.append(rec)
        by_cat[arm] = {c: round(statistics.mean(v) * 100, 1) for c, v in cat_scores.items()}
        per_item_by_arm[arm] = {k: statistics.mean(v) for k, v in per_item.items()}
    order = {f: i for i, f in enumerate(FAMILY_NAME)} | {"fake": 99}
    corder = {c: i for i, c in enumerate(COND_NAME)}
    table.sort(key=lambda r: (order.get(r["family"], 50), corder.get(r["condition"], 9), r["arm"]))
    return table, by_cat, per_item_by_arm


def _boot_diff(diffs: dict[str, float], n: int = 2000, seed: int = 11) -> tuple[float, float, float, float]:
    """문항 단위 쌍체 차이의 평균, 95% CI, 그리고 부트스트랩에서 차이가 0 보다 큰 비율."""
    rng = random.Random(seed)
    keys = sorted(diffs)  # 집합에서 온 키는 해시 시드마다 순서가 달라 재현성이 깨지므로 정렬한다
    boots = [statistics.mean(diffs[rng.choice(keys)] for _ in keys) for _ in range(n)]
    return statistics.mean(diffs.values()), _pct(boots, 0.025), _pct(boots, 0.975), sum(b > 0 for b in boots) / n


# 모델 합산에서 뺄 조건. gemini.A2(LOW)는 270회 호출 모두 추론 토큰 0 으로 effort 가 실제로 오르지 않았다.
# 모델별 행에는 남겨 "같은 설정 반복 시 잡음" 추정치로 쓰고, effort 상향 효과의 합산에는 넣지 않는다.
POOL_EXCLUDE = {"gemini.A2"}


def paired_vs_a1(table: list[dict], per_item_by_arm: dict) -> list[dict]:
    """같은 문항끼리 짝지어 각 조건을 같은 응답 모델의 A1 과 비교한다. 모델을 합친 비교는 문항 단위로 묶어 재표집한다."""
    by_arm = {r["arm"]: r for r in table}
    base = {r["family"]: r["arm"] for r in table if r["condition"] == "A1" and r["arm"] in per_item_by_arm}
    controls = {b: latency_control(b) for b in set(CONTROL_BATCH.values())}
    out, pooled = [], defaultdict(lambda: defaultdict(list))
    for r in table:
        # C·P 는 자기 기준 설정(base_arm)과, 나머지는 같은 응답 모델의 A1 과 비교한다
        b_arm = r.get("base_arm") or base.get(r["family"])
        if r["condition"] == "A1" or not b_arm or b_arm not in per_item_by_arm or not per_item_by_arm.get(r["arm"]):
            continue
        a, b = per_item_by_arm[r["arm"]], per_item_by_arm[b_arm]
        diffs = {k: a[k] - b[k] for k in a.keys() & b.keys()}
        if not diffs:
            continue
        m, lo, hi, p = _boot_diff(diffs)
        # 같은 실행에서 다시 잰 기준 설정 지연이 있으면 그것과 비교한다 (시간대 차이 제거)
        control = controls.get(CONTROL_BATCH.get(r["condition"]), {})
        b_lat = control.get(b_arm) if r.get("base_arm") and b_arm in control else by_arm[b_arm]["first_p50_ms"]
        out.append({
            "scope": r["family"], "arm": r["arm"], "condition": r["condition"], "base_arm": b_arm,
            "delta_acc": round(m * 100, 1), "ci_lo": round(lo * 100, 1), "ci_hi": round(hi * 100, 1), "p_gt0": round(p, 3),
            "delta_first_p50_ms": r["first_p50_ms"] - b_lat,
            "n_settings": 1,
        })
        cond = r["condition"] if r["condition"] != "X" else "X"
        if r["arm"] in POOL_EXCLUDE:
            continue
        for k, v in diffs.items():
            pooled[cond][k].append(v)
    per_model = list(out)
    for cond, per in pooled.items():
        same = [r for r in per_model if r["condition"] == cond and r["arm"] not in POOL_EXCLUDE]
        if len(same) < 2:  # 모델이 하나뿐이면 합산 행은 모델별 행과 같으므로 생략
            continue
        diffs = {k: statistics.mean(v) for k, v in per.items()}
        m, lo, hi, p = _boot_diff(diffs)
        out.append({
            "scope": "pooled:" + "+".join(sorted({r["scope"] for r in same})), "arm": f"*.{cond}", "condition": cond,
            "delta_acc": round(m * 100, 1), "ci_lo": round(lo * 100, 1), "ci_hi": round(hi * 100, 1), "p_gt0": round(p, 3),
            "delta_first_p50_ms": round(statistics.median(r["delta_first_p50_ms"] for r in same)),
            "n_settings": len(same),
        })
    return out


def _round(x):
    return None if x is None else round(x)


# 조건별로 같은 실행에서 다시 잰 지연 대조군 폴더 (results/latency_control/<batch>)
CONTROL_BATCH = {"C": "context", "CK": "context", "CA": "auto", "CH": "auto"}


def latency_control(batch: str = "context") -> dict[str, float]:
    """같은 실행에서 다시 잰 기준 설정의 첫 발화 p50 (채점하지 않은 지연 대조군)."""
    out = {}
    for p in sorted((RES / "latency_control" / batch).glob("*.jsonl")):
        lat = [r["e2e_first_ms"] for r in _jsonl(p) if not r.get("error")]
        if lat:
            out[p.stem] = round(_pct(lat, 0.5))
    return out


def write_tables(table: list[dict], by_cat: dict) -> None:
    if not table:
        return
    with open(RES / "summary.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(table[0]))
        w.writeheader()
        w.writerows(table)
    cats = list(CATEGORY_NAME)
    with open(RES / "by_category.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["arm"] + cats)
        for r in table:
            w.writerow([r["arm"]] + [by_cat.get(r["arm"], {}).get(c, "") for c in cats])

    def fmt(v, unit=""):
        return "–" if v is None else f"{v:,}{unit}" if isinstance(v, int) else f"{v}{unit}"

    lines = [
        "| 모델 | 조건 | 의도 정확도 (95% CI) | 의도 이해율 | 엄격 정확도 | 첫 발화 p50 | 첫 발화 p90 | 분석 시간 p50 | 1,000턴당 비용 | 오류 |",
        "|---|---|---|---|---|---|---|---|---|---|",
    ]
    for r in table:
        name = FAMILY_NAME.get(r["family"], r["family"])
        cond = cond_label(r)
        acc = "–" if r["accuracy"] is None else f"{r['accuracy']}% ({r['acc_ci_lo']}–{r['acc_ci_hi']})"
        lines.append(
            f"| {name} | {cond} | {acc} | {fmt(r['understood_rate'], '%')} | {fmt(r['strict_accuracy'], '%')} | "
            f"{fmt(r['first_p50_ms'], 'ms')} | {fmt(r['first_p90_ms'], 'ms')} | {fmt(r['analysis_p50_ms'], 'ms')} | "
            f"{'–' if r['cost_per_1k_turns_usd'] is None else '$' + format(r['cost_per_1k_turns_usd'], '.2f')} | "
            f"{r['errors']} |"
        )
    (RES / "summary.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


# ---------- 차트 ----------
INK, INK2, MUTED, GRID, SURFACE = "#0b0b0b", "#52514e", "#8a8984", "#e6e5e1", "#fcfcfb"
ACCENT = "#2a78d6"  # 각 패널에서 강조하는 모델 (패널 제목이 정체를 말하므로 한 색으로 충분)
CONTEXT = "#c9c8c3"  # 다른 모델은 회색 배경 맥락


def _setup_mpl():
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    plt.rcParams.update(
        {
            "font.family": "Apple SD Gothic Neo",
            "axes.unicode_minus": False,
            "figure.facecolor": SURFACE,
            "axes.facecolor": SURFACE,
            "axes.edgecolor": GRID,
            "axes.labelcolor": INK2,
            "xtick.color": INK2,
            "ytick.color": INK2,
            "text.color": INK,
            "axes.grid": True,
            "grid.color": GRID,
            "grid.linewidth": 1,
            "axes.spines.top": False,
            "axes.spines.right": False,
        }
    )
    return plt


def chart_scatter(table: list[dict], path: Path) -> None:
    rows = [r for r in table if r["accuracy"] is not None and r["first_p50_ms"]]
    fams = [f for f in FAMILY_NAME if any(r["family"] == f for r in rows)]
    if not fams:
        return
    plt = _setup_mpl()
    from matplotlib.lines import Line2D
    from matplotlib.ticker import FuncFormatter, LogLocator

    ncol = 2 if len(fams) > 1 else 1
    nrow = (len(fams) + ncol - 1) // ncol
    fig, axes = plt.subplots(nrow, ncol, figsize=(6.2 * ncol, 4.6 * nrow + 0.9), sharex=True, sharey=True, squeeze=False)
    xs = [r["first_p25_ms"] for r in rows] + [r["first_p75_ms"] for r in rows]
    xmin, xmax = max(50, min(xs) * 0.7), max(xs) * 1.4
    # 산점도는 0 기준선이 필요 없는 형태라 신뢰구간 하단에 맞춰 축을 잘라 차이를 보이게 한다
    ymin = max(0, (min(r["acc_ci_lo"] for r in rows) // 10) * 10 - 5)

    for ax, fam in zip(axes.flat, fams):
        mine = [r for r in rows if r["family"] == fam]
        others = [r for r in rows if r["family"] != fam]
        ax.scatter([r["first_p50_ms"] for r in others], [r["accuracy"] for r in others], s=36, color=CONTEXT,
                   marker="o", linewidths=0, zorder=2)
        by_arm = {r["arm"]: r for r in mine}
        a1 = next((r for r in mine if r["condition"] == "A1"), None)
        for r in mine:
            x, y = r["first_p50_ms"], r["accuracy"]
            base = by_arm.get(r.get("base_arm")) or a1  # C·P 는 자기 기준 설정에서 화살표를 긋는다
            if base is not None and r is not base:
                ax.annotate("", xy=(x, y), xytext=(base["first_p50_ms"], base["accuracy"]),
                            arrowprops=dict(arrowstyle="-|>", color=MUTED, lw=1, shrinkA=7, shrinkB=7), zorder=3)
            ax.errorbar(x, y,
                        xerr=[[x - r["first_p25_ms"]], [r["first_p75_ms"] - x]],
                        yerr=[[y - r["acc_ci_lo"]], [r["acc_ci_hi"] - y]],
                        fmt="none", ecolor=ACCENT, elinewidth=1, alpha=0.45, zorder=4)
            ax.scatter([x], [y], s=90, color=ACCENT, marker=COND_MARKER.get(r["condition"], "o"),
                       edgecolors=SURFACE, linewidths=2, zorder=5)
            label = short_label(r)
            dx, dy, ha = LABEL_OFFSET.get(r["condition"], (7, 6, "left"))
            ax.annotate(label, (x, y), xytext=(dx, dy), textcoords="offset points", fontsize=9, color=INK2,
                        ha=ha, zorder=6)
        ax.set_title(FAMILY_NAME[fam], fontsize=12, color=INK, loc="left", pad=8, fontweight="semibold")
        ax.set_xscale("log")
        ax.set_xlim(xmin, xmax)
        ax.set_ylim(ymin, 102)
        ax.xaxis.set_major_locator(LogLocator(base=10, subs=(1, 2, 5)))
        ax.xaxis.set_minor_locator(LogLocator(base=10, subs=()))
        ax.xaxis.set_major_formatter(FuncFormatter(lambda v, _: f"{v / 1000:g}s" if v >= 1000 else f"{v:g}ms"))
        ax.yaxis.set_major_formatter(FuncFormatter(lambda v, _: f"{v:g}%"))
        ax.tick_params(length=0, labelsize=9)
    for ax in axes.flat[len(fams):]:
        ax.set_visible(False)
    # 열마다 마지막으로 보이는 칸에 가로축 눈금과 이름을 단다 (빈 칸이 있는 열 포함)
    for c in range(ncol):
        visible = [axes[r][c] for r in range(nrow) if axes[r][c].get_visible()]
        if visible:
            visible[-1].xaxis.set_tick_params(labelbottom=True)
            visible[-1].set_xlabel("첫 발화까지 지연 (중앙값, 로그 축)  ← 빠름", fontsize=10)
    for ax in axes[:, 0]:
        ax.set_ylabel("의도 파악 정확도  ↑ 정확", fontsize=10)

    handles = [Line2D([], [], marker=COND_MARKER[c], color=ACCENT, linestyle="", markersize=8, markeredgecolor=SURFACE,
                      label=COND_NAME[c]) for c in COND_MARKER if any(r["condition"] == c for r in rows)]
    handles.append(Line2D([], [], marker="o", color=CONTEXT, linestyle="", markersize=7, label="다른 모델"))
    fig.legend(handles=handles, loc="upper center", ncol=min(len(handles), 5), frameon=False, fontsize=9.5,
               bbox_to_anchor=(0.5, 0.985))
    fig.suptitle("")
    fig.text(0.01, 0.005, "가로 오차 막대: 지연 사분위(25–75%) · 세로 오차 막대: 정확도 95% 부트스트랩 신뢰구간 · 화살표: 기준 설정 대비 이동 (C·C+A4 는 자기 기준, 지연은 2차 실행 시각)",
             fontsize=8.5, color=MUTED)
    fig.tight_layout(rect=(0, 0.03, 1, 0.94))
    fig.savefig(path, dpi=160)
    plt.close(fig)


def chart_overview(table: list[dict], path: Path) -> None:
    """모델별 기본 설정(A0·A1)의 위치를 한 평면에. 색 대신 직접 이름표로 모델을 구분한다."""
    rows = [r for r in table if r["condition"] in ("A0", "A1") and r["accuracy"] is not None]
    if not rows:
        return
    plt = _setup_mpl()
    from matplotlib.ticker import FuncFormatter, LogLocator

    fig, ax = plt.subplots(figsize=(8.4, 5.6))
    for r in rows:
        x, y = r["first_p50_ms"], r["accuracy"]
        ax.errorbar(x, y, xerr=[[x - r["first_p25_ms"]], [r["first_p75_ms"] - x]],
                    yerr=[[y - r["acc_ci_lo"]], [r["acc_ci_hi"] - y]],
                    fmt="none", ecolor=ACCENT, elinewidth=1, alpha=0.35, zorder=2)
        ax.scatter([x], [y], s=110, color=ACCENT, marker=COND_MARKER[r["condition"]], edgecolors=SURFACE,
                   linewidths=2, zorder=4)
        name = FAMILY_NAME.get(r["family"], r["family"]) + (" (instant)" if r["condition"] == "A0" else "")
        dx, dy, ha = OVERVIEW_OFFSET.get(r["family"], (9, 7, "left"))
        ax.annotate(name, (x, y), xytext=(dx, dy), textcoords="offset points", fontsize=10, color=INK, ha=ha,
                    zorder=5)
    ax.set_xscale("log")
    xs = [r["first_p25_ms"] for r in rows] + [r["first_p75_ms"] for r in rows]
    ax.set_xlim(min(xs) * 0.75, max(xs) * 1.6)
    lo = min(r["acc_ci_lo"] for r in rows)
    ax.set_ylim(max(0, (lo // 10) * 10 - 5), 102)
    ax.xaxis.set_major_locator(LogLocator(base=10, subs=(1, 2, 3, 5)))
    ax.xaxis.set_minor_locator(LogLocator(base=10, subs=()))
    ax.xaxis.set_major_formatter(FuncFormatter(lambda v, _: f"{v / 1000:g}s" if v >= 1000 else f"{v:g}ms"))
    ax.yaxis.set_major_formatter(FuncFormatter(lambda v, _: f"{v:g}%"))
    ax.tick_params(length=0, labelsize=9)
    ax.set_xlabel("첫 발화까지 지연 (중앙값, 로그 축)  ← 빠름", fontsize=10)
    ax.set_ylabel("의도 파악 정확도  ↑ 정확", fontsize=10)
    ax.set_title("모델별 기본 설정의 위치 (A1, Mercury 3 는 instant 포함)", fontsize=12, loc="left", pad=10,
                 fontweight="semibold")
    fig.text(0.01, 0.01, "오차 막대: 지연 사분위(25–75%), 정확도 95% 부트스트랩 신뢰구간 · 30문항 × 3회", fontsize=8.5,
             color=MUTED)
    fig.tight_layout(rect=(0, 0.03, 1, 1))
    fig.savefig(path, dpi=160)
    plt.close(fig)


def chart_heatmap(table: list[dict], by_cat: dict, path: Path) -> None:
    rows = [r for r in table if r["arm"] in by_cat and by_cat[r["arm"]]]
    if not rows:
        return
    plt = _setup_mpl()
    from matplotlib.colors import LinearSegmentedColormap

    ramp = ["#f4f8fd", "#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"]
    cmap = LinearSegmentedColormap.from_list("seq_blue", ramp)
    cats = list(CATEGORY_NAME)
    data = [[by_cat[r["arm"]].get(c) for c in cats] for r in rows]
    fig, ax = plt.subplots(figsize=(1.0 + 0.78 * len(cats), 0.9 + 0.42 * len(rows)))
    import numpy as np

    arr = np.array([[np.nan if v is None else v for v in row] for row in data], dtype=float)
    ax.imshow(arr, cmap=cmap, vmin=0, vmax=100, aspect="auto")
    ax.grid(False)
    n_items = defaultdict(int)
    for q in json.loads((ROOT / "data" / "queries.json").read_text(encoding="utf-8")):
        n_items[q["category"]] += 1
    ax.set_xticks(range(len(cats)), [f"{CATEGORY_NAME[c]} ({n_items[c]})" for c in cats], rotation=40, ha="right",
                  fontsize=9)
    labels = []
    for r in rows:
        cond = short_label(r, always_base=True).replace("X:", "X ").replace(">", "→")
        labels.append(f"{FAMILY_NAME.get(r['family'], r['family'])} · {cond}")
    ax.set_yticks(range(len(rows)), labels, fontsize=9)
    ax.tick_params(length=0)
    for s in ax.spines.values():
        s.set_visible(False)
    ax.set_xticks(np.arange(-0.5, len(cats), 1), minor=True)
    ax.set_yticks(np.arange(-0.5, len(rows), 1), minor=True)
    ax.grid(which="minor", color=SURFACE, linewidth=2)
    ax.tick_params(which="minor", length=0)
    for i, row in enumerate(arr):
        for j, v in enumerate(row):
            if not np.isnan(v):
                ax.text(j, i, f"{v:.0f}", ha="center", va="center", fontsize=8,
                        color="#ffffff" if v >= 55 else INK)
    ax.set_title("화용 현상별 의도 파악 정확도 (%)", fontsize=12, loc="left", pad=10, fontweight="semibold")
    fig.tight_layout()
    fig.savefig(path, dpi=160)
    plt.close(fig)


def main() -> None:
    import argparse

    global RES
    ap = argparse.ArgumentParser()
    ap.add_argument("--results", default=str(RES))
    RES = Path(ap.parse_args().results)
    arms, items = load()
    table, by_cat, per_item_by_arm = summarize(arms, items)
    write_tables(table, by_cat)
    write_paired(paired_vs_a1(table, per_item_by_arm))
    write_models(paired_vs_base(table, per_item_by_arm))
    gap = gap_closure(table, per_item_by_arm)
    write_gap(gap, table)
    for fname, methods, colors in GAP_CHARTS:
        chart_gap(gap, table, RES / fname, methods, colors)
    chart_overview(table, RES / "overview_default_settings.png")
    chart_scatter(table, RES / "latency_vs_accuracy.png")
    chart_heatmap(table, by_cat, RES / "accuracy_by_category.png")
    for name in ("summary.md", "paired.md", "models_vs_base.md", "gap.md"):
        p = RES / name
        print(p.read_text(encoding="utf-8") if p.exists() else f"no {name}")


REF_ARMS = ["gemini38.A1", "gemini38.A2"]  # 상위 모델 목표선: 기본 설정, 전체 최고 설정
GAP_METHODS = ["A4", "C", "CK", "CA", "CH"]  # 추가 호출 없이 지연을 거의 유지하는 화용 방법
# 방법별 색: 기본 팔레트 처음 세 슬롯 (모든 쌍 CVD·정상 시각 기준 통과, references/palette.md)
# 차트마다 세 가지 방법만 그리고(모든 쌍 기준을 통과하는 처음 세 슬롯), C 는 두 차트에서 같은 색을 쓴다
GAP_CHARTS = [
    ("gap_to_strong_model.png", ["A4", "C", "CK"], {"A4": "#2a78d6", "C": "#eb6834", "CK": "#1baf7a"}),
    ("gap_auto_context.png", ["C", "CA", "CH"], {"C": "#eb6834", "CA": "#2a78d6", "CH": "#1baf7a"}),
]


def gap_closure(table: list[dict], per_item_by_arm: dict) -> list[dict]:
    """빠른 설정 + 화용 방법이 상위 모델과의 정확도 격차를 얼마나 메우는지. 정확도 변화는 같은 문항끼리 짝지어 구한다."""
    by_arm = {r["arm"]: r for r in table}
    ref = by_arm.get(REF_ARMS[0])
    if not ref:
        return []
    controls = {b: latency_control(b) for b in set(CONTROL_BATCH.values())}
    bases = sorted({r["base_arm"] for r in table if r.get("base_arm")}, key=lambda a: by_arm[a]["first_p50_ms"])
    out = []
    for b in bases:
        br = by_arm[b]
        fam, bcond = b.split(".")
        candidates = {"C": f"{b}+C", "CK": f"{b}+CK", "CA": f"{b}+CA", "CH": f"{b}+CH"}
        if bcond == "A1":
            candidates["A4"] = f"{fam}.A4"
        for meth in GAP_METHODS:
            arm = candidates.get(meth)
            if not arm or arm not in per_item_by_arm:
                continue
            a, bb = per_item_by_arm[arm], per_item_by_arm[b]
            diffs = {k: a[k] - bb[k] for k in a.keys() & bb.keys()}
            m, lo, hi, _ = _boot_diff(diffs)
            gap = ref["accuracy"] - br["accuracy"]
            # 목표선과의 남은 차이도 같은 문항끼리 짝지어 신뢰구간을 낸다
            rf = per_item_by_arm[REF_ARMS[0]]
            rm, rlo, rhi, _ = _boot_diff({k: a[k] - rf[k] for k in a.keys() & rf.keys()})
            # A4 는 다른 시각에 잰 값이라 원래 기준 지연과, C·CK 는 같은 실행의 대조군 지연과 비교한다
            control = controls.get(CONTROL_BATCH.get(meth), {})
            lat_ref = control.get(b, br["first_p50_ms"])
            out.append({
                "base_arm": b, "method": meth, "arm": arm,
                "base_acc": br["accuracy"], "acc": by_arm[arm]["accuracy"],
                "delta_acc": round(m * 100, 1), "ci_lo": round(lo * 100, 1), "ci_hi": round(hi * 100, 1),
                "gap_to_ref": round(gap, 1),
                "closure_pct": None if gap <= 0 else round(m * 100 / gap * 100),
                "vs_ref": round(rm * 100, 1), "vs_ref_lo": round(rlo * 100, 1), "vs_ref_hi": round(rhi * 100, 1),
                "base_first_p50_ms": lat_ref, "first_p50_ms": by_arm[arm]["first_p50_ms"],
                "delta_first_p50_ms": by_arm[arm]["first_p50_ms"] - lat_ref,
            })
    return out


def base_name(arm: str, table_by_arm: dict) -> str:
    fam, cond = arm.split(".")
    extra = {"A0": " instant", "A1": ""}.get(cond, f" {cond}")
    return f"{FAMILY_NAME.get(fam, fam)}{extra}"


def write_gap(rows: list[dict], table: list[dict]) -> None:
    if not rows:
        return
    by_arm = {r["arm"]: r for r in table}
    with open(RES / "gap.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    ref = by_arm[REF_ARMS[0]]
    lines = [
        f"목표선: {FAMILY_NAME['gemini38']} 기본 설정 {ref['accuracy']}% (첫 발화 {ref['first_p50_ms']:,}ms). "
        "격차 해소율 = 정확도 변화 ÷ (목표 − 기준). 음수는 격차가 벌어졌다는 뜻.",
        "",
        "| 빠른 설정 (기준 정확도 · 첫 발화) | 방법 | 정확도 | 기준 대비 변화 (95% CI) | 격차 해소율 | 목표선과의 차이 (95% CI) | 첫 발화 변화 |",
        "|---|---|---|---|---|---|---|",
    ]
    for r in rows:
        b = by_arm[r["base_arm"]]
        who = f"{base_name(r['base_arm'], by_arm)} ({b['accuracy']}% · {r['base_first_p50_ms']:,}ms)"
        sign = "+" if r["delta_acc"] > 0 else ""
        cl = "–" if r["closure_pct"] is None else f"{r['closure_pct']}%"
        lat = r["delta_first_p50_ms"]
        rs = "+" if r["vs_ref"] > 0 else ""
        lines.append(f"| {who} | {COND_NAME[r['method']]} | {r['acc']}% | {sign}{r['delta_acc']}%p ({r['ci_lo']}–{r['ci_hi']}) | "
                     f"{cl} | {rs}{r['vs_ref']}%p ({r['vs_ref_lo']}–{r['vs_ref_hi']}) | {'+' if lat > 0 else ''}{lat:,}ms |")
    (RES / "gap.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def chart_gap(rows: list[dict], table: list[dict], path: Path, methods: list[str], colors: dict[str, str]) -> None:
    """빠른 설정마다 한 줄: 기준 정확도에서 각 화용 방법으로 얼마나 이동하는지, 상위 모델 목표선과 함께."""
    rows = [r for r in rows if r["method"] in methods]
    bases = list(dict.fromkeys(r["base_arm"] for r in rows if r["method"] == methods[-1]))
    rows = [r for r in rows if r["base_arm"] in bases]
    if not rows:
        return
    plt = _setup_mpl()
    from matplotlib.lines import Line2D

    by_arm = {r["arm"]: r for r in table}
    fig, ax = plt.subplots(figsize=(9.6, 1.4 + 1.0 * len(bases)))
    for i, b in enumerate(bases):
        y = len(bases) - 1 - i
        br = by_arm[b]
        mine = [r for r in rows if r["base_arm"] == b]
        xs = [br["accuracy"]] + [r["acc"] for r in mine]
        ax.plot([min(xs), max(xs)], [y, y], color=GRID, lw=2, zorder=1, solid_capstyle="round")
        ax.scatter([br["accuracy"]], [y], s=90, color=SURFACE, edgecolors=INK2, linewidths=1.6, zorder=3)
        for r in mine:
            # 같은 정확도의 점이 서로 가리지 않도록 방법마다 세로 위치를 조금씩 다르게 둔다
            dy = {0: 0.16, 1: 0.0, 2: -0.16}[methods.index(r["method"])]
            ax.scatter([r["acc"]], [y + dy], s=110, color=colors[r["method"]], marker=COND_MARKER[r["method"]],
                       edgecolors=SURFACE, linewidths=1.6, zorder=4)
        ax.text(-0.01, y, f"{base_name(b, by_arm)}\n{br['first_p50_ms']:,}ms", transform=ax.get_yaxis_transform(),
                ha="right", va="center", fontsize=9.5, color=INK)
    for ref_arm, lw, ha, dx in zip(REF_ARMS, (1.4, 1.0), ("right", "left"), (-0.25, 0.25)):
        ref = by_arm.get(ref_arm)
        if ref:
            ax.axvline(ref["accuracy"], color=MUTED, lw=lw, zorder=0)
            ax.text(ref["accuracy"] + dx, len(bases) - 0.45, f"{FAMILY_NAME['gemini38']} {ref_arm.split('.')[1]}\n"
                    f"{ref['accuracy']}% · {ref['first_p50_ms'] / 1000:.1f}s",
                    ha=ha, va="bottom", fontsize=8.5, color=INK2)
    ax.set_yticks([])
    ax.set_ylim(-0.6, len(bases) - 0.2)
    lo = min(min(r["acc"] for r in rows), min(by_arm[b]["accuracy"] for b in bases))
    ax.set_xlim(max(0, lo - 4), 100.5)
    ax.xaxis.set_major_formatter(plt.FuncFormatter(lambda v, _: f"{v:g}%"))
    ax.tick_params(length=0, labelsize=9)
    ax.grid(axis="y", visible=False)
    ax.spines["left"].set_visible(False)
    ax.set_xlabel("의도 파악 정확도 (30문항 × 3회)", fontsize=10)
    handles = [Line2D([], [], marker="o", color=SURFACE, markeredgecolor=INK2, linestyle="", markersize=8, label="기준 (빠른 설정)")]
    handles += [Line2D([], [], marker=COND_MARKER[m], color=colors[m], linestyle="", markersize=9, label=COND_NAME[m])
                for m in methods if any(r["method"] == m for r in rows)]
    fig.legend(handles=handles, loc="upper left", ncol=len(handles), frameon=False, fontsize=9.5, bbox_to_anchor=(0.01, 1.0))
    fig.text(0.01, 0.01, "왼쪽 숫자: 기준 설정의 첫 발화 지연 중앙값. A4 는 A1 기준 설정에만 있음.", fontsize=8.5, color=MUTED)
    fig.tight_layout(rect=(0.16, 0.04, 1, 0.9))
    fig.savefig(path, dpi=160)
    plt.close(fig)


BASE_ARM = "mercury.A1"  # 모델 간 비교의 기준: Inception 공식 음성 가이드 설정


def paired_vs_base(table: list[dict], per_item_by_arm: dict) -> list[dict]:
    """각 모델의 기본 설정(A0·A1)을 같은 문항끼리 기준 설정과 비교한다."""
    if BASE_ARM not in per_item_by_arm:
        return []
    by_arm = {r["arm"]: r for r in table}
    base = per_item_by_arm[BASE_ARM]
    out = []
    for r in table:
        if r["condition"] not in ("A0", "A1") or r["arm"] == BASE_ARM or not per_item_by_arm.get(r["arm"]):
            continue
        a = per_item_by_arm[r["arm"]]
        diffs = {k: a[k] - base[k] for k in a.keys() & base.keys()}
        m, lo, hi, p = _boot_diff(diffs)
        out.append({
            "scope": r["family"], "arm": r["arm"], "condition": r["condition"],
            "delta_acc": round(m * 100, 1), "ci_lo": round(lo * 100, 1), "ci_hi": round(hi * 100, 1), "p_gt0": round(p, 3),
            "delta_first_p50_ms": r["first_p50_ms"] - by_arm[BASE_ARM]["first_p50_ms"],
        })
    return out


def write_models(rows: list[dict]) -> None:
    if not rows:
        return
    lines = [
        f"| 모델 · 설정 | {FAMILY_NAME['mercury']} A1 대비 정확도 변화 (95% CI) | 부트스트랩에서 Δ>0 비율 | 첫 발화 p50 변화 |",
        "|---|---|---|---|",
    ]
    for r in rows:
        name = f"{FAMILY_NAME.get(r['scope'], r['scope'])} · {COND_NAME.get(r['condition'], r['condition'])}"
        sign = "+" if r["delta_acc"] > 0 else ""
        lat = r["delta_first_p50_ms"]
        lines.append(f"| {name} | {sign}{r['delta_acc']}%p ({r['ci_lo']}–{r['ci_hi']}) | {r['p_gt0'] * 100:.0f}% | "
                     f"{'+' if lat > 0 else ''}{lat:,}ms |")
    (RES / "models_vs_base.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_paired(rows: list[dict]) -> None:
    if not rows:
        return
    with open(RES / "paired.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    lines = [
        "| 비교 대상 | 조건 | 기준 대비 정확도 변화 (95% CI) | 부트스트랩에서 Δ>0 비율 | 기준 대비 첫 발화 p50 변화 |",
        "|---|---|---|---|---|",
    ]
    for r in rows:
        if r["scope"].startswith("pooled:"):
            fams = r["scope"].split(":", 1)[1].split("+")
            names = ", ".join(FAMILY_NAME.get(f, f) for f in fams)
            who = f"빠른 설정 {r['n_settings']}개 합산 ({names})" if r["condition"] in ("C", "CK", "CA", "CH") else f"모델 합산 ({names})"
            cond = COND_NAME.get(r["condition"], r["condition"])
        else:
            who = FAMILY_NAME.get(r["scope"], r["scope"])
            cond = cond_label(r) if r["condition"] in ("X", "C", "CK", "CA", "CH") else COND_NAME.get(r["condition"], r["condition"])
        sign = "+" if r["delta_acc"] > 0 else ""
        lat = r["delta_first_p50_ms"]
        lines.append(
            f"| {who} | {cond} | {sign}{r['delta_acc']}%p ({r['ci_lo']}–{r['ci_hi']}) | {r['p_gt0'] * 100:.0f}% | "
            f"{'+' if lat > 0 else ''}{lat:,}ms |"
        )
    (RES / "paired.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
