"""모든 조건이 공유하는 프롬프트.

VOICE_RULES 는 Inception 공식 음성 에이전트 가이드(docs.inceptionlabs.ai/usecases/voice)의
시스템 프롬프트를 그대로 옮긴 것이다. 모델 간 비교가 공정하도록 모든 모델에 같은 문구를 쓴다.
"""

import json

VOICE_RULES = (
    "You are speaking in a voice interface. Follow these rules strictly:\n"
    "1. NEVER use markdown, asterisks, bold, bullet points, numbered lists, or headers.\n"
    "2. Keep every response as short as possible.\n"
    "3. If a tool requires missing information, ask for ONE thing at a time."
)

PERSONA = (
    "너는 사용자의 집과 차에서 동작하는 한국어 음성 비서 '하루'다. 항상 한국어 존댓말로 답한다.\n"
    "할 수 있는 일: 조명·난방·에어컨·가습기·창문·환기 조작, 음악 재생·볼륨, 알람·리마인더·일정, "
    "문자·전화, 길안내, 음식 주문·예약, 날씨·교통 조회.\n"
    "행동을 하면 무엇을 했는지 한 문장으로 짧게 말한다."
)

# A4(요청 외 추가 조건): 별도 호출 없이 응답 모델 시스템 프롬프트에 화용 점검표만 넣는다.
PRAGMATIC_CHECKLIST = (
    "답하기 전에 속으로만 점검한다 (점검 내용은 말하지 않는다):\n"
    "- 문장 형태(질문·평서)와 실제 의도가 다른가? 가능 여부를 묻는 질문이나 상태 묘사는 흔히 요청이다.\n"
    "- 상황과 반대되는 칭찬·감탄은 반어적 불만일 수 있다.\n"
    "- 말하다가 정정하면 정정된 값이 최종 값이다.\n"
    "- 지시어와 생략된 대상은 직전 대화와 현재 상태에서 찾는다.\n"
    "- 짧은 응답어는 맥락에 따라 수락도 거절도 될 수 있다.\n"
    "- 제안에 대해 사정을 설명하는 답은 대개 거절이나 변경 요청이다.\n"
    "- 윗사람에게 전하는 말은 높임말로 바꾼다.\n"
    "- 음성 인식 오류는 가장 그럴듯한 단어로 고친다.\n"
    "- 감정 표현이나 혼잣말에는 묻지 않고 기기를 조작하지 않는다."
)


def common_ground(profile: dict, events: list[str]) -> str:
    """C(공유 맥락): 실제 시스템이 알 법한 사실만 담는다. 말투나 의도에 대한 힌트는 넣지 않는다."""
    lines = ["[공유 맥락: 사용자 프로필]", f"- {profile['사용자']}"]
    lines.append("- 연락처: " + ", ".join(f"{k}({v})" for k, v in profile["연락처"].items()))
    lines.append("- 생활 패턴: " + ", ".join(profile["생활 패턴"]))
    lines.append("[최근 기록]")
    lines += [f"- {e}" for e in events]
    return "\n".join(lines)


def auto_context(profile: dict, log: list[str]) -> str:
    """C-auto: 선별 없는 로그. 프로필은 C 와 같고, 기록은 관련 없는 항목이 섞인 그대로 준다."""
    head = common_ground(profile, []).split("[최근 기록]")[0]
    return head + "[최근 기록 (시스템 로그, 선별하지 않음)]\n" + "\n".join(f"- {e}" for e in log)


def hypotheses_block(hyps: list[dict]) -> str:
    """C-auto+H: 미리 계산된 추정. 사실과 섞이지 않게 따로 표시한다."""
    lines = ["[미리 계산된 추정 (사실이 아님)]"]
    lines += [f"- {h['text']} (확신도 {h['confidence']:.1f})" for h in hyps]
    lines.append("이 추정은 사용자의 이번 발화와 맞을 때만 참고하고, 맞지 않으면 무시한다.")
    return "\n".join(lines)


# 가설 생성기: 사용자가 말하기 전에 실행된다고 가정한다 (발화·정답을 보지 않는다).
HYPOTHESIS_SYSTEM = (
    "너는 음성 비서의 맥락 준비 모듈이다. 사용자는 아직 아무 말도 하지 않았다. 아래 프로필, 기기 상태, 시스템 로그, "
    "직전 대화만 보고, 사용자가 다음에 말할 때 도움이 될 추정을 만든다.\n"
    "추정할 것: 사용자가 지금 원하거나 신경 쓸 만한 것, 다음 발화에서 가리킬 만한 대상, 사용자가 이미 알고 있다고 "
    "전제할 사실, 진행 중인 계획이나 문제. 로그 중 지금 상황과 관련 있는 항목을 골라 근거로 쓴다.\n"
    "사실이 아닌 추정이므로 각 항목에 확신도(0~1)를 붙인다. 최대 5개, 각 한 문장.\n"
    'JSON 하나만 출력한다: {"hypotheses": [{"text": str, "confidence": number}]}'
)


def hypothesis_user_message(profile: dict, state: str, log: list[str], context: list[dict]) -> str:
    lines = [auto_context(profile, log), f"[기기 상태] {state}", "[직전 대화]"]
    if context:
        lines += [f"{'사용자' if t['role'] == 'user' else '비서'}: {t['content']}" for t in context]
    else:
        lines.append("(없음)")
    lines.append("위 형식의 JSON 하나만 출력한다.")
    return "\n".join(lines)


# ---------- 4차 선별 실험 (M1~M6) ----------
# M1·M2: 발화 전 서로 다른 축의 상황 10개. 2505.11679 의 반례(해석들이 서로 같아짐)를 피하려고 축을 지정한다.
SITUATIONS_SYSTEM = (
    "너는 음성 비서의 맥락 준비 모듈이다. 사용자는 아직 아무 말도 하지 않았다. 아래 정보만 보고, 사용자가 다음에 말할 때 "
    "비서가 미리 알고 있으면 좋을 상황을 10개 유추한다.\n"
    "서로 겹치지 않게 다음 축에서 고르게 뽑는다: 원할 만한 행동, 불편하거나 문제인 점, 진행 중인 계획·예약, 가리킬 만한 대상, "
    "사용자가 당연히 안다고 전제할 사실, 기분·상태, 관계와 말투(높임 대상 등), 직전 대화에 대한 반응 가능성.\n"
    "각 항목은 한 문장이고, 근거가 된 로그나 상태를 짧게 덧붙이며, 확신도(0~1)를 붙인다. 사실이 아닌 추정이다.\n"
    'JSON 하나만 출력한다: {"hypotheses": [{"text": str, "confidence": number}]}'
)

# M3: 잡음 로그를 관련 사실만 남긴 요약으로 다시 쓴다 (sleep-time compute 의 c → c′).
REWRITE_SYSTEM = (
    "너는 음성 비서의 맥락 정리 모듈이다. 사용자는 아직 아무 말도 하지 않았다. 아래 시스템 로그에는 지금 상황과 관련 없는 "
    "기록이 많이 섞여 있다. 기기 상태와 직전 대화를 기준으로, 사용자가 다음에 말할 때 해석에 필요할 만한 사실만 골라 "
    "최대 5줄로 다시 쓴다. 추정을 덧붙이지 말고 로그와 상태에 있는 사실만 쓴다.\n"
    'JSON 하나만 출력한다: {"facts": [str]}'
)

# M6: 사용자가 말하는 중, 앞부분만 보고 만드는 가설
PREFIX_SYSTEM = (
    "너는 음성 비서의 맥락 준비 모듈이다. 사용자가 지금 말하는 중이고, 앞부분만 음성 인식되었다. 아래 정보와 발화 앞부분을 보고 "
    "사용자가 무엇을 말하려 하는지, 비서가 미리 알고 있으면 좋을 상황을 5개 유추한다. 각 항목은 한 문장, 확신도(0~1)를 붙인다.\n"
    'JSON 하나만 출력한다: {"hypotheses": [{"text": str, "confidence": number}]}'
)

# M4: 발화를 보고 해석 여러 개를 쓰고 하나를 고른 뒤 답한다. <해석> 부분은 말하지 않는 부분이다.
INTERPRET_INLINE = (
    "답하기 전에 사용자의 이번 말이 뜻할 수 있는 해석을 3~5개 서로 다른 축으로 짧게 쓴다 (무엇을 해 달라는지, 감정 표현인지, "
    "무엇을 가리키는지, 직전 대화에 대한 수락·거절·변경인지). 해석과 선택은 모두 <해석> 안에 쓰고, </해석> 뒤에는 사용자에게 "
    "할 말만 쓴다. <해석> 부분은 사용자에게 들리지 않는다. 형식:\n"
    "<해석>\n1) …\n2) …\n3) …\n선택: …\n</해석>\n(사용자에게 할 말)"
)
HIDE_TAG = "</해석>"

# M7: M4 와 같은 지시에서 해석 개수만 10개로 늘린다 (개수 효과만 보려고 축·형식은 그대로 둔다).
INTERPRET_INLINE_10 = (
    "답하기 전에 사용자의 이번 말이 뜻할 수 있는 해석을 10개 서로 다른 축으로 짧게 쓴다 (무엇을 해 달라는지, 감정 표현인지, "
    "무엇을 가리키는지, 직전 대화에 대한 수락·거절·변경인지). 해석과 선택은 모두 <해석> 안에 쓰고, </해석> 뒤에는 사용자에게 "
    "할 말만 쓴다. <해석> 부분은 사용자에게 들리지 않는다. 형식:\n"
    "<해석>\n1) …\n2) …\n…\n10) …\n선택: …\n</해석>\n(사용자에게 할 말)"
)

# M8: 해석 10개를 글로 쓰지 않고 속으로만 떠올리게 한다 (응답 모델의 추론 토큰 안에서 처리).
INTERPRET_SILENT_10 = (
    "답하기 전에 속으로만, 사용자의 이번 말이 뜻할 수 있는 해석을 10개 서로 다른 축으로 떠올린다 (무엇을 해 달라는지, 감정 "
    "표현인지, 무엇을 가리키는지, 직전 대화에 대한 수락·거절·변경인지). 그중 가장 그럴듯한 하나에 맞춰 답한다. 떠올린 해석과 "
    "선택 과정은 말하지 않고 사용자에게 할 말만 한다."
)

# M5: 미리 만든 후보 의도 중에서, 실제 발화를 보고 고른다 (RSA 의 '이 의도라면 이렇게 말했을까').
def candidates_block(hyps: list[dict]) -> str:
    lines = ["[미리 만든 후보 상황 (사실이 아님)]"]
    lines += [f"{i}. {h['text']}" for i, h in enumerate(hyps, 1)]
    lines.append(
        "사용자의 실제 말을 듣고, 각 후보 상황에 있는 사람이 이 말을 이렇게 했을 가능성을 따져 가장 그럴듯한 하나에 맞춰 답한다. "
        "어느 후보도 맞지 않으면 후보를 무시하고 말 자체로 판단한다. 판단 과정은 말하지 않는다."
    )
    return "\n".join(lines)


def prep_user_message(profile: dict, state: str, log: list[str], context: list[dict], prefix: str | None = None) -> str:
    """M1·M2·M3·M6 생성기 입력. 발화 전체와 정답은 넣지 않는다 (M6 만 발화 앞부분)."""
    msg = hypothesis_user_message(profile, state, log, context)
    if prefix is not None:
        msg = msg.replace("위 형식의 JSON 하나만 출력한다.", f"[지금 말하는 중, 앞부분 ASR] {prefix} …\n위 형식의 JSON 하나만 출력한다.")
    return msg


def facts_block(profile: dict, facts: list[str]) -> str:
    """M3: 다시 쓴 사실 요약으로 로그를 대신한다."""
    head = common_ground(profile, []).split("[최근 기록]")[0]
    return head + "[최근 기록 요약 (관련 사실만 다시 씀)]\n" + "\n".join(f"- {f}" for f in facts)


def system_prompt(state: str, extra: str | None = None) -> str:
    parts = [VOICE_RULES, PERSONA]
    if extra:
        parts.append(extra)
    parts.append(f"현재 상태: {state}")
    return "\n\n".join(parts)


ANALYZER_SYSTEM = (
    "너는 음성 비서의 화용론 분석 서브에이전트다. 음성 인식(ASR) 결과 문장과 대화 맥락, 기기 상태를 보고 "
    "사용자가 실제로 원하는 것을 분석한다. 문장의 글자 그대로의 뜻(문자적 의미)과 화자가 전하려는 뜻(화자 의미)을 구분한다.\n"
    "점검 항목: 간접 화행, 대화 함축(그라이스 격률), 반어, 자기 수정(정정 표지 뒤가 최종), 생략·직시 해소, "
    "전제, 다의적 짧은 응답어, 높임법(전달 대상에 맞는 높임), 음성 인식 오류, 감정 표현·혼잣말(행동 불필요).\n"
    "반드시 아래 키를 가진 JSON 하나만 출력한다. 각 값은 짧게 쓴다.\n"
    '{"literal_meaning": str, "speech_act": "요청|질문|수락|거절|불만|정정|감정표현|혼잣말|정보제공", '
    '"intended_meaning": str, "cues": [str], "resolved_references": {str: str}, '
    '"action": str, "act_without_asking": bool, "clarify_question": str|null, "honorific_note": str|null, "confidence": number}'
)


def analyzer_user_message(state: str, context: list[dict], utterance: str) -> str:
    lines = [f"[기기 상태] {state}", "[직전 대화]"]
    if context:
        for turn in context:
            who = "사용자" if turn["role"] == "user" else "비서"
            lines.append(f"{who}: {turn['content']}")
    else:
        lines.append("(없음)")
    lines.append(f"[이번 발화 ASR] {utterance}")
    lines.append("위 형식의 JSON 하나만 출력한다.")
    return "\n".join(lines)


def responder_extra(analysis: dict | str) -> str:
    body = analysis if isinstance(analysis, str) else json.dumps(analysis, ensure_ascii=False)
    return (
        "[화용 분석 서브에이전트 결과]\n"
        f"{body}\n"
        "이 분석을 참고해 답한다. 분석이 대화 맥락과 맞지 않으면 맥락을 우선한다. 분석 내용 자체는 말하지 않는다."
    )


JUDGE_SYSTEM = (
    "너는 한국어 음성 비서 평가자다. 음성 비서의 응답이 사용자의 실제 의도(화자 의미)를 제대로 파악했는지만 채점한다. "
    "말투의 매끄러움, 실제 데이터의 정확성(예: 실제 도착 시간이 맞는지)은 채점하지 않는다. 비서가 실제 기능을 실행했다고 말하는 것은 "
    "실행한 것으로 간주한다.\n"
    "점수 기준:\n"
    "2 = 정답 의도를 정확히 반영. must 를 모두 충족하고 must_not 을 하나도 어기지 않음. "
    "clarify_ok 가 true 이면 올바른 행동을 콕 집어 확인하는 질문도 2점.\n"
    "1 = 방향은 맞지만 불완전. must 일부 누락, 또는 의도가 충분히 분명한데도 불필요하게 되묻는 경우.\n"
    "0 = 의도를 잘못 파악. must_not 위반, 문자적 의미로만 답함, 틀린 대상·값, 하지 말아야 할 행동 실행.\n"
    "JSON 으로만 답한다."
)

JUDGE_SCHEMA = {
    "type": "object",
    "properties": {
        "score": {"type": "integer", "enum": [0, 1, 2]},
        "literal_only": {"type": "boolean"},
        "over_action": {"type": "boolean"},
        "wrong_target_or_value": {"type": "boolean"},
        "asked_clarification": {"type": "boolean"},
        "reason": {"type": "string"},
    },
    "required": ["score", "literal_only", "over_action", "wrong_target_or_value", "asked_clarification", "reason"],
    "additionalProperties": False,
}

ANALYSIS_JUDGE_SYSTEM = (
    "너는 화용 분석 결과 평가자다. 서브에이전트가 추론한 화자 의도(intended_meaning, action)가 정답 의도와 일치하는지 채점한다.\n"
    "2 = 정답 의도와 핵심 행동이 일치. 1 = 부분 일치(대상·값·행동 중 일부 누락). 0 = 불일치. JSON 으로만 답한다."
)

ANALYSIS_JUDGE_SCHEMA = {
    "type": "object",
    "properties": {
        "score": {"type": "integer", "enum": [0, 1, 2]},
        "reason": {"type": "string"},
    },
    "required": ["score", "reason"],
    "additionalProperties": False,
}


def judge_user_message(item: dict, response_text: str) -> str:
    return json.dumps(
        {
            "기기_상태": item["state"],
            "직전_대화": item["context"],
            "사용자_발화_ASR": item["utterance"],
            "정답_의도": item["gold_intent"],
            "must": item["must"],
            "must_not": item["must_not"],
            "clarify_ok": item["clarify_ok"],
            "비서_응답": response_text,
        },
        ensure_ascii=False,
        indent=1,
    )


def analysis_judge_user_message(item: dict, analysis: dict | str) -> str:
    return json.dumps(
        {
            "기기_상태": item["state"],
            "직전_대화": item["context"],
            "사용자_발화_ASR": item["utterance"],
            "정답_의도": item["gold_intent"],
            "분석_결과": analysis,
        },
        ensure_ascii=False,
        indent=1,
    )
