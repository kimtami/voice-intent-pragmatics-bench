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


def _pragmatic(family: str, base: str, mode: str) -> Arm:
    m = MODELS[family]
    cond = {"context": "C", "context_checklist": "CK"}[mode]
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
