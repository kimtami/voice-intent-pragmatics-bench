# 모델별 설정과 출처

모든 파라미터는 코드(`vib/arms.py`)에 명시적으로 적었습니다. 기본값에 기대지 않는 이유는 같은 모델이라도 문서마다 기본값이 다르게 적혀 있기 때문입니다(아래 Mercury 3 참고). 확인 날짜: 2026-10-26.

## 공통

- 응답은 **항상 스트리밍**으로 받습니다. A3 의 화용 분석 호출만 비스트리밍입니다.
- 모든 모델이 같은 시스템 프롬프트를 씁니다. Inception 공식 음성 가이드의 시스템 프롬프트 3줄을 그대로 쓰고, 한국어 음성 비서 역할과 현재 기기 상태를 덧붙였습니다 (`vib/prompts.py`).

## Mercury 3 (`mercury-3`, Inception)

| 조건 | stream | diffusing | realtime | temperature | reasoning_effort | max_completion_tokens |
|---|---|---|---|---|---|---|
| A0 effort 하향 | true | false | true | 0.75 | instant | 8192 |
| A1 기본 | true | false | true | 0.75 | medium | 8192 |
| A2 effort 상향 | true | false | true | 0.75 | high | 8192 |
| A3 분석 서브에이전트 | false | (적용 안 됨) | true | 0.75 | high | 8192 |

- A1 은 Inception 공식 음성 에이전트 가이드의 "Standard voice agent" 설정입니다: temperature 0.75, reasoning_effort medium, realtime true, 예시 코드의 max_completion_tokens 8192.
- **"stability 0.7"이라는 파라미터는 API 레퍼런스와 음성 가이드 어디에도 없습니다.** 가이드에 있는 값은 temperature 0.75 입니다. 이 리포는 temperature 0.75 를 씁니다.
- `diffusing` 은 API 레퍼런스상 "스트리밍 응답에 확산 효과를 보여 줄지"를 정하는 값이고 기본값은 false 입니다. 확산 과정을 보여 주면 이미 보낸 텍스트가 다시 바뀌므로 음성 합성에 바로 넘길 수 없습니다. 그래서 스트리밍 응답에서는 명시적으로 false 로 둡니다. 비스트리밍 분석 호출에는 영향이 없어 보내지 않습니다.
- `realtime` 은 "TTFT(첫 토큰까지 시간)를 낮춰야 하는 실시간 작업용 플래그"입니다.
- 문서 간 불일치: API 레퍼런스는 reasoning_effort 기본값을 medium 으로, 추론 강도 문서는 mercury-3 기본값을 low 로 적고 있습니다. 그래서 값을 항상 명시합니다.
- 추론 강도 값은 instant, low, medium, high 네 가지입니다. 추론 강도 문서는 instant 를 "음성, 실시간 턴"용으로 권합니다. 이 리포의 A1 은 공식 음성 가이드의 medium 을 기준으로 삼고, instant 는 A0 조건으로 따로 잽니다. A0 는 Mercury 3 에만 있습니다.

출처
- 음성 에이전트 가이드: https://docs.inceptionlabs.ai/usecases/voice
- 음성 퀵스타트: https://docs.inceptionlabs.ai/usecases/voice/quickstart
- Chat Completions API 레퍼런스: https://docs.inceptionlabs.ai/api-reference/chat/create-a-chat-completion.md
- 추론 강도: https://docs.inceptionlabs.ai/capabilities/reasoning-efforts.md
- 모델과 가격: https://docs.inceptionlabs.ai/get-started/models.md

## GPT-6 Luna (`gpt-6-luna`, OpenAI)

| 조건 | API | stream | reasoning.effort | max_output_tokens |
|---|---|---|---|---|
| A1 기본 | Responses | true | none | 4096 |
| A2 effort 상향 | Responses | true | low | 4096 |
| A3 분석 서브에이전트 | Responses | false | low | 4096 |

- reasoning.effort 값은 none, low, medium(기본), high, xhigh, max 입니다. 사용자 지정에 따라 A1 은 none 입니다.
- 스트리밍을 지원하고, Responses·Chat Completions 엔드포인트를 모두 지원합니다. 이 리포는 OpenAI 가 권하는 Responses API 를 씁니다.
- 가격(1M 토큰당): 입력 $0.10, 출력 $0.50.

출처: https://developers.openai.com/api/docs/models/gpt-6-luna

## 추천 비교 모델

지연이 짧은 설정을 가진 최신 모델 세 개를 추가했습니다. Claude Haiku 5.5 는 두 기본 모델과 같은 가격대이고, Gemini 두 모델은 더 비쌉니다. 키가 없으면 해당 행은 "미실행"으로 남습니다.

### Claude Haiku 5.5 (`claude-haiku-5-5`, Anthropic)

| 조건 | stream | effort | thinking |
|---|---|---|---|
| A1 기본 | true | low | disabled |
| A2 effort 상향 | true | medium | adaptive |
| A3 분석 서브에이전트 | false | medium | adaptive |

- 가격(1M 토큰당, 10만 토큰 이하 프롬프트): 입력 $0.10, 출력 $0.50. GPT-6 Luna 와 같습니다.
- effort 기본값은 medium 이고, thinking 을 끄는 것은 effort high 이하에서만 허용됩니다.
- Anthropic API 는 2026-10-21 부터 temperature·top_p·top_k 를 보내면 400 오류를 냅니다. 샘플링 값은 보내지 않습니다.
- Messages API 는 첫 메시지가 user 여야 해서, 비서 발화로 시작하는 맥락 앞에 "(대화 시작)"이라는 user 메시지를 둡니다. Gemini 도 같은 방식으로 맞춥니다.

### Gemini 3.5 Flash-Lite (`gemini-3.5-flash-lite`, Google)

| 조건 | stream | thinking_level |
|---|---|---|
| A1 기본 | true | MINIMAL |
| A2 effort 상향 | true | LOW |
| A3 분석 서브에이전트 | false | LOW |

- 2026-07-21 GA. Flash-Lite 계열의 최신 모델입니다 (2026-10-26 확인). 기본 thinking_level 은 MINIMAL 이고 분류·라우팅·JSON 추출 같은 지연 민감 작업용입니다.
- 가격(1M 토큰당): 입력 $0.30, 출력 $2.50 (출력에 추론 토큰 포함).
- **실측: 이 질의셋에서는 LOW 에서도 추론 토큰이 0개였습니다** (A1·A2·A3 의 270회 호출 전부, `total - prompt - candidates` = 0). 같은 문항(IMP-02)을 MEDIUM 으로 호출해도 0개, HIGH 로 호출하면 435개였습니다. 파라미터는 전달되지만 짧은 음성 프롬프트에서는 모델이 LOW·MEDIUM 의 생각을 건너뜁니다. 따라서 Gemini 의 A2 는 A1 과 사실상 같은 조건이고, "effort 상향" 효과를 보려면 HIGH 가 필요합니다.
- temperature·top_k·top_p 사용자 값은 무시됩니다.

출처: https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-5-flash-lite

### Gemini 3.8 Flash (`gemini-3.8-flash`, Google)

| 조건 | stream | thinking_level |
|---|---|---|
| A1 기본 | true | LOW |
| A2 effort 상향 | true | MEDIUM |
| A3 분석 서브에이전트 | false | MEDIUM |

- 2026-09 출시된 Flash 계열 최신 모델이자 "가장 지능적인 Flash 모델"로 소개됩니다. Flash-Lite 보다 한 등급 위입니다.
- thinking_level 은 low, medium(기본), high 만 지원하고 minimal 은 오류입니다. 음성용 A1 은 가장 빠른 low, A2 는 API 기본값 medium 으로 잡았습니다.
- 가격(1M 토큰당): 입력 $0.75, 출력 $3.75 (2026-12-31 까지, 2027-01-01 부터 $1.50 / $7.50).

출처
- 모델 목록: https://ai.google.dev/gemini-api/docs/models
- 모델 페이지: https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash
- 추론 강도 기본값: https://ai.google.dev/gemini-api/docs/thinking
- 가격: https://ai.google.dev/gemini-api/docs/pricing

### 더 볼 만한 후보 (이번 실험에는 넣지 않음)

- **Gemini 4 Argon** (`gemini-4-argon`, 2026-10-13 GA): Google 의 최신 최상위 추론 모델. 가격 입력 $2, 출력 $10 (2026-12-01 부터 $4 / $20), 기본 thinking medium. 음성 응답 모델보다는 A3 의 분석 모델 후보로 볼 수 있습니다.
- **Gemini 3.8 Live** (`gemini-3.8-live`): 음성 입력·출력을 한 모델이 처리하는 실시간 음성 에이전트 모델. 텍스트 파이프라인(ASR → LLM → TTS)인 이 리포와는 구조가 달라 같은 지표로 비교하지 않았습니다.

- **Mercury Decide** (`mercury-decide`, Inception): 분류·채점·추출 전용 엔드포인트(`v1/decisions`). 스트리밍과 채팅은 없지만 A3 의 분석 단계를 대체하는 초저지연 의도 분류기로 쓸 수 있는지 볼 가치가 있습니다.
- **전용 가속기에서 서빙되는 오픈 모델** (예: Cerebras 의 gpt-oss-120b, gemma 계열): 2026년 공개 음성 에이전트 벤치마크에서 첫 토큰 200ms 안팎으로 가장 빠른 축에 있었습니다. 한국어 화용 처리 품질은 확인하지 않았습니다.
