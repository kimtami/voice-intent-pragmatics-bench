"""실험 조건(arm) 정의. 모든 파라미터를 명시적으로 적는다. 기본값에 기대지 않는다.

조건
- A0 effort 하향 (mercury 만): reasoning_effort instant, 스트리밍
- A1 기본: 각 모델의 음성용 기본 설정, 스트리밍
- A2 effort 상향: A1 에서 추론 강도만 한 단계 올림, 스트리밍
- A3 화용 서브에이전트: 같은 모델이 A2 강도로 화용 분석(JSON, 비스트리밍) → A1 설정 응답 모델이 분석을 받아 스트리밍 응답
- A4 화용 점검표(요청 외 추가): 별도 호출 없이 A1 응답 모델의 시스템 프롬프트에 점검표만 추가
- X  교차 A3: 분석 모델과 응답 모델을 다른 제공자로 조합
- C  공유 맥락: 빠른 설정 + 시스템 프롬프트에 사용자 프로필과 최근 기록 (추가 호출 없음)
- CK 맥락+점검표: C 에 A4 의 화용 점검표를 함께 넣음 (추가 호출 없음)
- CA C-auto: 선별 없는 로그 (관련 기록 + 관련 없는 기록 10개)
- CH C-auto+H: CA + 미리 계산된 자동 가설 (발화를 보지 않고 생성, 응답 지연에 포함 안 됨)
"""

from __future__ import annotations

from dataclasses import dataclass, field

# 모델별 A1/A2 설정. 출처는 docs/model-settings.md
MODELS = {
    "luna": {
        "provider": "openai",
        "model": "gpt-6-luna",
        "key": "OPENAI_API_KEY",
        "A1": {"effort": "none", "max_output_tokens": 4096},
        "A2": {"effort": "low", "max_output_tokens": 4096},
    },
    "mercury": {
        "provider": "inception",
        "model": "mercury-3",
        "key": "INCEPTION_API_KEY",
        # A0: 추론 강도 문서가 음성·실시간 턴용으로 권하는 instant. A1 에서 effort 만 낮춤
        "A0": {
            "reasoning_effort": "instant",
            "temperature": 0.75,
            "realtime": True,
            "diffusing": False,
            "max_completion_tokens": 8192,
        },
        # Inception 공식 음성 가이드: temperature 0.75, reasoning_effort medium, realtime true, max_completion_tokens 8192
        "A1": {
            "reasoning_effort": "medium",
            "temperature": 0.75,
            "realtime": True,
            "diffusing": False,
            "max_completion_tokens": 8192,
        },
        "A2": {
            "reasoning_effort": "high",
            "temperature": 0.75,
            "realtime": True,
            "diffusing": False,
            "max_completion_tokens": 8192,
        },
    },
    "haiku": {
        "provider": "anthropic",
        "model": "claude-haiku-5-5",
        "key": "ANTHROPIC_API_KEY",
        # Anthropic 은 2026-10-21 부터 temperature/top_p/top_k 를 보내면 400. 샘플링 값은 보내지 않는다.
        "A1": {"effort": "low", "thinking": "disabled", "max_tokens": 4096},
        "A2": {"effort": "medium", "thinking": "adaptive", "max_tokens": 4096},
    },
    "gemini": {
        "provider": "gemini",
        "model": "gemini-3.5-flash-lite",
        "key": "GEMINI_API_KEY",
        # 3.5 Flash-Lite 기본 thinking_level 은 MINIMAL. temperature 는 무시된다.
        "A1": {"thinking_level": "MINIMAL", "max_output_tokens": 4096},
        "A2": {"thinking_level": "LOW", "max_output_tokens": 4096},
    },
    "gemini38": {
        "provider": "gemini",
        "model": "gemini-3.8-flash",
        "key": "GEMINI_API_KEY",
        # 3.8 Flash 는 minimal 미지원(오류). 기본값은 medium. 음성용 A1 은 가장 빠른 low, A2 는 API 기본값 medium.
        "A1": {"thinking_level": "LOW", "max_output_tokens": 4096},
        "A2": {"thinking_level": "MEDIUM", "max_output_tokens": 4096},
    },
}


@dataclass
class Arm:
    arm_id: str
    family: str
    condition: str
    provider: str
    model: str
    params: dict
    keys: list[str]
    analyzer: dict | None = None  # {"provider","model","params"}
    checklist: bool = False
    note: str = ""
    extra: dict = field(default_factory=dict)


def _arm(family: str, condition: str) -> Arm:
    m = MODELS[family]
    if condition in ("A0", "A1", "A2"):
        return Arm(f"{family}.{condition}", family, condition, m["provider"], m["model"], m[condition], [m["key"]])
    if condition == "A3":
        return Arm(
            f"{family}.A3",
            family,
            "A3",
            m["provider"],
            m["model"],
            m["A1"],
            [m["key"]],
            analyzer={"provider": m["provider"], "model": m["model"], "params": m["A2"], "family": family},
        )
    if condition == "A4":
        return Arm(f"{family}.A4", family, "A4", m["provider"], m["model"], m["A1"], [m["key"]], checklist=True)
    raise ValueError(condition)


def _cross(analyzer_family: str, responder_family: str) -> Arm:
    a, r = MODELS[analyzer_family], MODELS[responder_family]
    return Arm(
        f"x.{analyzer_family}>{responder_family}",
        responder_family,
        "X",
        r["provider"],
        r["model"],
        r["A1"],
        sorted({a["key"], r["key"]}),
        analyzer={"provider": a["provider"], "model": a["model"], "params": a["A2"], "family": analyzer_family},
        note=f"analyzer={analyzer_family}(A2), responder={responder_family}(A1)",
    )


# C(공유 맥락)·CK(맥락+점검표)를 붙일 빠른 설정. 질문: 지연은 그대로 두고 상위 모델 정확도에 얼마나 다가가는가
FAST_BASES = [("mercury", "A0"), ("mercury", "A1"), ("luna", "A1"), ("gemini", "A1")]
# 3차(자동 맥락): 2차에서 맥락 효과가 있던 빠른 설정 3개
AUTO_BASES = [("mercury", "A0"), ("mercury", "A1"), ("luna", "A1")]
# 5차(같은 모델 추정): 응답 모델이 자기 추정을 미리 만든다. Mercury 3 기본(medium), GPT-6 Luna low
SELF_BASES = [("mercury", "A1"), ("luna", "A2")]


def _pragmatic(family: str, base: str, mode: str) -> Arm:
    m = MODELS[family]
    cond = {"context": "C", "context_checklist": "CK", "auto": "CA", "auto_hyp": "CH", "auto_selfhyp": "CS"}[mode]
    return Arm(
        f"{family}.{base}+{cond}", family, cond, m["provider"], m["model"], m[base], [m["key"]],
        extra={"mode": mode, "base_arm": f"{family}.{base}"},
    )


def all_arms() -> dict[str, Arm]:
    arms: dict[str, Arm] = {}
    for fam in MODELS:
        for cond in ("A0", "A1", "A2", "A3", "A4"):
            if cond == "A0" and "A0" not in MODELS[fam]:  # A0 는 mercury 에만 정의
                continue
            a = _arm(fam, cond)
            arms[a.arm_id] = a
    for a_fam, r_fam in (("mercury", "luna"), ("luna", "mercury")):
        a = _cross(a_fam, r_fam)
        arms[a.arm_id] = a
    for fam, base in FAST_BASES:
        for mode in ("context", "context_checklist"):
            a = _pragmatic(fam, base, mode)
            arms[a.arm_id] = a
    for fam, base in AUTO_BASES:
        for mode in ("auto", "auto_hyp"):
            a = _pragmatic(fam, base, mode)
            arms[a.arm_id] = a
    return arms


def selfhyp_arms() -> dict[str, Arm]:
    """5차: Luna none·low 지연 비교 + 같은 모델 추정(CS)을 로그만(CA)·상위 모델 추정(CH)과 같은 시각에 비교한다."""
    base = all_arms()
    arms = {k: base[k] for k in ("luna.A1", "luna.A2")}
    for fam, b in SELF_BASES:
        for mode in ("auto", "auto_hyp", "auto_selfhyp"):
            a = _pragmatic(fam, b, mode)
            arms[a.arm_id] = a
    # CI: 응답은 Mercury 3 기본(medium), 추정은 같은 Mercury 3 를 생각 없이(instant) 만든 것
    m = MODELS["mercury"]
    arms["mercury.A1+CI"] = Arm("mercury.A1+CI", "mercury", "CI", m["provider"], m["model"], m["A1"], [m["key"]],
                                extra={"mode": "auto_selfhyp", "hyp_source": "mercury_instant", "base_arm": "mercury.A1"})
    # 원인 분석 후속: 못 본 14문항에서 Mercury instant 추정을 원래 프롬프트(v1)와 고친 프롬프트(v2)로 만들어 비교한다.
    # 추정 적중은 원인 분석에서 이미 채점했으므로 응답 행에서는 다시 채점하지 않는다(judge_hyps=False).
    for v in ("v1", "v2"):
        arms[f"mercury.A1+CI{v}"] = Arm(f"mercury.A1+CI{v}", "mercury", f"CI{v}", m["provider"], m["model"], m["A1"], [m["key"]],
                                        extra={"mode": "auto_selfhyp", "hyp_source": f"results/selfhyp/diag/instant_{v}_heldout.json",
                                               "judge_hyps": False, "base_arm": "mercury.A1"})
    # 약한 응답 설정: 응답도 Mercury 3 instant. 같은 v1·v2 추정을 본 10문항 + 못 본 14문항(24문항) 모두에 넣는다
    arms["mercury.A0+CA"] = base["mercury.A0+CA"]
    for v in ("v1", "v2"):
        arms[f"mercury.A0+CI{v}"] = Arm(f"mercury.A0+CI{v}", "mercury", f"CI{v}", m["provider"], m["model"], m["A0"], [m["key"]],
                                        extra={"mode": "auto_selfhyp", "judge_hyps": False, "base_arm": "mercury.A0",
                                               "hyp_source": [f"results/selfhyp/diag/instant_{v}_{s}.json" for s in ("insample", "heldout")]})
    # 다른 약한 응답 모델: GPT-6 Luna none 에 같은 v2 추정(Mercury instant 가 만든 것)을 넣는다
    lu = MODELS["luna"]
    arms["luna.A1+CA"] = base["luna.A1+CA"]
    arms["luna.A1+CIv2"] = Arm("luna.A1+CIv2", "luna", "CIv2", lu["provider"], lu["model"], lu["A1"], [lu["key"]],
                               extra={"mode": "auto_selfhyp", "judge_hyps": False, "base_arm": "luna.A1",
                                      "hyp_source": [f"results/selfhyp/diag/instant_v2_{s}.json" for s in ("insample", "heldout")]})
    # 관점 2개 병렬 추정(CP): Mercury instant 에 v2 + 서로 다른 관점을 주고 동시에 불러 합친 목록을 두 약한 응답 설정에 넣는다
    for fam, cond in (("mercury", "A0"), ("luna", "A1")):
        f = MODELS[fam]
        arms[f"{fam}.{cond}+CP"] = Arm(f"{fam}.{cond}+CP", fam, "CP", f["provider"], f["model"], f[cond], [f["key"]],
                                       extra={"mode": "auto_selfhyp", "judge_hyps": False, "base_arm": f"{fam}.{cond}",
                                              "hyp_source": "results/selfhyp/persona/instant_persona.json"})
    return arms


def fake_arms() -> dict[str, Arm]:
    """dry-run 전용. 결과는 results/ 밖에 저장한다."""
    p = {"x": 1}
    return {
        "fake.A1": Arm("fake.A1", "fake", "A1", "fake", "fake", p, []),
        "fake.A3": Arm(
            "fake.A3", "fake", "A3", "fake", "fake", p, [], analyzer={"provider": "fake", "model": "fake", "params": p, "family": "fake"}
        ),
        "fake.A4": Arm("fake.A4", "fake", "A4", "fake", "fake", p, [], checklist=True),
    }


# 4차 선별 실험: Mercury 3 기본(A1) 응답 모델에 M1~M8 을 붙인다 (24문항 × 1회)
# M5b·M5c 는 M5 의 '후보 중 고르기' 지시에 싼 후보(M2 목록)·빠른 후보(M6 목록)를 넣은 것
SCREEN_METHODS = ["M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8", "M5b", "M5c"]


def screen_arms() -> dict[str, Arm]:
    m = MODELS["mercury"]
    arms = {}
    for code in SCREEN_METHODS:
        params = dict(m["A1"])
        if code in ("M4", "M7"):
            params["hide_until"] = "</해석>"  # 해석 부분은 들리지 않고, 첫 발화는 그 뒤부터 잰다
        arms[f"mercury.A1+{code}"] = Arm(f"mercury.A1+{code}", "mercury", code, m["provider"], m["model"], params, [m["key"]],
                                         extra={"mode": code.lower(), "base_arm": "mercury.A1"})
    return arms



# 6차 여행 개인화: 응답은 Mercury 3 instant. 기억을 어떻게 넘기느냐만 다르다.
TRAVEL_CONDS = {
    "TN": "기억 없음 (프로필만)",
    "TM": "기억 전체",
    "TV": "기억 전체 + v2 추정",
    "TP": "기억 전체 + 여행 플래너 관점 추정",
    "TG": "기억 전체 + 목표·조건 목록",
    "TJ4": "게이트 0.4 (Jev 관련도 0.4 이상 기억만)",
    "TJ5": "게이트 0.5 (Jev 관련도 0.5 이상 기억만)",
    # 맥락 게이트: Jev 공통 상태에 프로필과 기억 전체를 더해 매긴 점수로 거른다 (질문은 그대로 기억 1개씩)
    "TK4": "맥락 게이트 0.4 (프로필·기억 전체를 보고 매긴 관련도 0.4 이상만)",
    "TK5": "맥락 게이트 0.5 (프로필·기억 전체를 보고 매긴 관련도 0.5 이상만)",
}


def travel_arms() -> dict[str, Arm]:
    m = MODELS["mercury"]
    arms = {}
    for cond in TRAVEL_CONDS:
        keys = [m["key"]] + (["TYPESAFE_API_KEY"] if cond[:2] in ("TJ", "TK") else [])
        arms[f"mercury.A0+{cond}"] = Arm(f"mercury.A0+{cond}", "mercury", cond, m["provider"], m["model"], m["A0"], keys,
                                         extra={"mode": "travel", "base_arm": "mercury.A0"})
    return arms
