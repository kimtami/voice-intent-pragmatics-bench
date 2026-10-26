"""제공자별 호출. 스트리밍 응답은 첫 '보이는 텍스트' 시점을 TTFT 로 잰다.

- OpenAI Responses: response.output_text.delta
- Inception(mercury) Chat Completions: 비어 있지 않은 delta.content
- Anthropic Messages: text_delta (thinking_delta 는 제외)
- Gemini: 비어 있지 않은 chunk.text (thought 파트 제외)

추론 토큰은 보이는 텍스트가 아니므로 TTFT 에 포함된다. 음성 비서에서 TTS 가 말을 시작할 수 있는 시점이
첫 보이는 텍스트이기 때문이다.
"""

from __future__ import annotations

import json
import os
import re
import time
from dataclasses import asdict, dataclass, field

SENTENCE_END = re.compile(r"[.!?…](\s|$)")
INCEPTION_BASE_URL = "https://api.inceptionlabs.ai/v1"


@dataclass
class CallResult:
    text: str = ""
    ttft_ms: float | None = None
    first_sentence_ms: float | None = None
    total_ms: float | None = None
    usage: dict = field(default_factory=dict)
    error: str | None = None
    hidden: str | None = None  # M4: 사용자에게 들리지 않는 앞부분 (<해석> … </해석>)

    def to_dict(self) -> dict:
        return asdict(self)


class _Clock:
    def __init__(self, hide_until: str | None = None) -> None:
        self.t0 = time.perf_counter()
        self.result = CallResult()
        self._buf: list[str] = []
        # hide_until 이 있으면 그 표지까지는 들리지 않는 부분이고, 첫 발화는 표지 뒤 첫 글자부터 잰다
        self.hide_until = hide_until

    def ms(self) -> float:
        return round((time.perf_counter() - self.t0) * 1000, 1)

    def _visible(self) -> str:
        raw = "".join(self._buf)
        if not self.hide_until:
            return raw
        return raw.split(self.hide_until, 1)[1] if self.hide_until in raw else ""

    def on_text(self, piece: str | None) -> None:
        if not piece:
            return
        self._buf.append(piece)
        visible = self._visible()
        if self.result.ttft_ms is None and visible.strip():
            self.result.ttft_ms = self.ms()
        if self.result.first_sentence_ms is None and SENTENCE_END.search(visible):
            self.result.first_sentence_ms = self.ms()

    def finish(self, usage: dict | None = None) -> CallResult:
        r = self.result
        r.total_ms = self.ms()
        raw = "".join(self._buf)
        if self.hide_until:
            if self.hide_until in raw:
                r.hidden, r.text = raw.split(self.hide_until, 1)
                r.text = r.text.strip()
            else:  # 표지를 닫지 않으면 전부 들린다고 보고 기록한다
                r.hidden, r.text = None, raw
                if r.ttft_ms is None and raw.strip():
                    r.ttft_ms = r.total_ms
        else:
            r.text = raw
        if r.first_sentence_ms is None and r.text.strip():
            r.first_sentence_ms = r.total_ms
        r.usage = usage or {}
        return r


def _dump(obj) -> dict:
    if obj is None:
        return {}
    if hasattr(obj, "model_dump"):
        return obj.model_dump(exclude_none=True)
    if isinstance(obj, dict):
        return obj
    return {"repr": repr(obj)}


# ---------- 클라이언트 (지연 생성) ----------
_clients: dict = {}


def _openai():
    if "openai" not in _clients:
        from openai import OpenAI

        _clients["openai"] = OpenAI(api_key=os.environ["OPENAI_API_KEY"], max_retries=2, timeout=120)
    return _clients["openai"]


def _inception():
    if "inception" not in _clients:
        from openai import OpenAI

        _clients["inception"] = OpenAI(
            api_key=os.environ["INCEPTION_API_KEY"], base_url=INCEPTION_BASE_URL, max_retries=2, timeout=120
        )
    return _clients["inception"]


def _anthropic():
    if "anthropic" not in _clients:
        import anthropic

        _clients["anthropic"] = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"], max_retries=2, timeout=180)
    return _clients["anthropic"]


def _gemini():
    if "gemini" not in _clients:
        from google import genai

        _clients["gemini"] = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    return _clients["gemini"]


# ---------- 메시지 변환 ----------
def _anthropic_messages(messages: list[dict]) -> list[dict]:
    # Messages API 는 첫 메시지가 user 여야 하므로, 비서 발화로 시작하는 맥락 앞에 중립 표지를 둔다.
    if messages and messages[0]["role"] == "assistant":
        return [{"role": "user", "content": "(대화 시작)"}] + messages
    return messages


def _gemini_contents(messages: list[dict]):
    from google.genai import types

    msgs = _anthropic_messages(messages)
    return [
        types.Content(role="model" if m["role"] == "assistant" else "user", parts=[types.Part(text=m["content"])])
        for m in msgs
    ]


# ---------- 스트리밍 응답 ----------
def stream_reply(provider: str, model: str, system: str, messages: list[dict], params: dict) -> CallResult:
    clock = _Clock(params.get("hide_until"))
    try:
        if provider == "openai":
            stream = _openai().responses.create(
                model=model,
                instructions=system,
                input=messages,
                reasoning={"effort": params["effort"]},
                max_output_tokens=params.get("max_output_tokens", 4096),
                store=False,
                stream=True,
            )
            usage = None
            for ev in stream:
                if ev.type == "response.output_text.delta":
                    clock.on_text(ev.delta)
                elif ev.type == "response.completed":
                    usage = _dump(ev.response.usage)
                elif ev.type in ("response.failed", "error"):
                    raise RuntimeError(f"{ev.type}: {_dump(ev)}")
            return clock.finish(usage)

        if provider == "inception":
            stream = _inception().chat.completions.create(
                model=model,
                messages=[{"role": "system", "content": system}] + messages,
                stream=True,
                stream_options={"include_usage": True},
                temperature=params["temperature"],
                reasoning_effort=params["reasoning_effort"],
                max_completion_tokens=params["max_completion_tokens"],
                extra_body={"realtime": params["realtime"], "diffusing": params["diffusing"]},
            )
            usage = None
            for chunk in stream:
                if chunk.choices:
                    clock.on_text(chunk.choices[0].delta.content)
                if getattr(chunk, "usage", None):
                    usage = _dump(chunk.usage)
            return clock.finish(usage)

        if provider == "anthropic":
            kwargs = dict(
                model=model,
                system=system,
                messages=_anthropic_messages(messages),
                max_tokens=params.get("max_tokens", 4096),
                output_config={"effort": params["effort"]},
                thinking={"type": params["thinking"]},
            )
            with _anthropic().messages.stream(**kwargs) as stream:
                for ev in stream:
                    if ev.type == "content_block_delta" and ev.delta.type == "text_delta":
                        clock.on_text(ev.delta.text)
                final = stream.get_final_message()
            return clock.finish(_dump(final.usage))

        if provider == "gemini":
            from google.genai import types

            cfg = types.GenerateContentConfig(
                system_instruction=system,
                thinking_config=types.ThinkingConfig(thinking_level=params["thinking_level"]),
                max_output_tokens=params.get("max_output_tokens", 4096),
            )
            usage = None
            for chunk in _gemini().models.generate_content_stream(
                model=model, contents=_gemini_contents(messages), config=cfg
            ):
                for cand in chunk.candidates or []:
                    for part in (cand.content.parts if cand.content else None) or []:
                        if part.text and not getattr(part, "thought", False):
                            clock.on_text(part.text)
                if chunk.usage_metadata:
                    usage = _dump(chunk.usage_metadata)
            return clock.finish(usage)

        if provider == "fake":
            return _fake_stream(clock, params)

        raise ValueError(f"unknown provider {provider}")
    except Exception as e:  # noqa: BLE001 - 실험 기록에 남기고 다음 호출로 진행
        r = clock.finish()
        r.error = f"{type(e).__name__}: {e}"[:800]
        return r


# ---------- 비스트리밍 JSON (A3 화용 분석 서브에이전트) ----------
def _parse_json(text: str) -> dict | None:
    try:
        return json.loads(text)
    except (json.JSONDecodeError, TypeError):
        m = re.search(r"\{.*\}", text or "", re.S)
        if m:
            try:
                return json.loads(m.group(0))
            except json.JSONDecodeError:
                return None
    return None


def json_call(provider: str, model: str, system: str, user: str, params: dict) -> tuple[dict | None, CallResult]:
    clock = _Clock()
    try:
        if provider == "openai":
            resp = _openai().responses.create(
                model=model,
                instructions=system,
                input=[{"role": "user", "content": user}],
                reasoning={"effort": params["effort"]},
                max_output_tokens=params.get("max_output_tokens", 4096),
                text={"format": {"type": "json_object"}},
                store=False,
            )
            clock.on_text(resp.output_text)
            r = clock.finish(_dump(resp.usage))
        elif provider == "inception":
            # 비스트리밍이므로 diffusing 은 의미가 없다 (스트림 표시 방식에만 영향). realtime 은 유지한다.
            resp = _inception().chat.completions.create(
                model=model,
                messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
                temperature=params["temperature"],
                reasoning_effort=params["reasoning_effort"],
                max_completion_tokens=params["max_completion_tokens"],
                response_format={"type": "json_object"},
                extra_body={"realtime": params["realtime"]},
            )
            clock.on_text(resp.choices[0].message.content)
            r = clock.finish(_dump(resp.usage))
        elif provider == "anthropic":
            resp = _anthropic().messages.create(
                model=model,
                system=system,
                messages=[{"role": "user", "content": user}],
                max_tokens=params.get("max_tokens", 4096),
                output_config={"effort": params["effort"]},
                thinking={"type": params["thinking"]},
            )
            clock.on_text("".join(b.text for b in resp.content if b.type == "text"))
            r = clock.finish(_dump(resp.usage))
        elif provider == "gemini":
            from google.genai import types

            resp = _gemini().models.generate_content(
                model=model,
                contents=user,
                config=types.GenerateContentConfig(
                    system_instruction=system,
                    thinking_config=types.ThinkingConfig(thinking_level=params["thinking_level"]),
                    max_output_tokens=params.get("max_output_tokens", 4096),
                    response_mime_type="application/json",
                ),
            )
            clock.on_text(resp.text)
            r = clock.finish(_dump(resp.usage_metadata))
        elif provider == "fake":
            r = _fake_stream(clock, params, analysis=True)
        else:
            raise ValueError(f"unknown provider {provider}")
        return _parse_json(r.text), r
    except Exception as e:  # noqa: BLE001
        r = clock.finish()
        r.error = f"{type(e).__name__}: {e}"[:800]
        return None, r


# ---------- dry-run 용 가짜 제공자 (실험 결과에 절대 섞지 않는다) ----------
def _fake_stream(clock: _Clock, params: dict, analysis: bool = False) -> CallResult:
    import random

    time.sleep(random.uniform(0.02, 0.05))
    if analysis:
        clock.on_text(json.dumps({"intended_meaning": "dry-run", "action": "dry-run", "confidence": 0.5}))
    else:
        for piece in ["드라이런 ", "응답입니다. ", "실제 모델 호출이 아닙니다."]:
            time.sleep(0.005)
            clock.on_text(piece)
    return clock.finish({"fake": True})
