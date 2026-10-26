# 관련 연구와 방법 후보

조사일: 2026-10-27. 웹 검색으로 찾은 논문·저장소를 초록과 요약 수준에서 정리했습니다. 수치는 각 논문의 초록이나 2차 요약에서 옮긴 것이고, 본문을 직접 검증하지 않은 것은 따로 표시합니다.

## 한 줄 요약

화용 이해를 **평가**하는 벤치마크는 많고(한국어 포함), **모호한 요청에 해석을 여러 개 만드는 방법**과 **쉬는 시간에 미리 계산해 두는 방법**도 각각 활발합니다. 하지만 "음성 비서의 지연 제약 안에서 화용 의도를 미리 계산해 빠른 모델에 주는" 조합은 이번 검색 범위에서 찾지 못했습니다. 이 리포의 3차 실험(C-auto+H)이 그 조합에 해당합니다.

## 1. 화용 이해 평가 벤치마크

| 연구 | 내용 | 이 리포와의 관계 |
|---|---|---|
| [Park 등 2024, 한국어 화용 능력 평가](https://arxiv.org/abs/2403.12675) ([GitHub](https://github.com/DojunPark/pragmatic_eval_korean)) | 그라이스 격률별 120문항, 객관식·서술형. **사고 과정(CoT) 프롬프트가 모델을 문자적 해석 쪽으로 밀었다**고 보고 | 1차의 점검표·서브에이전트가 함축에서 손해를 본 현상과 같은 방향 |
| [Koo 등 2025, 한국어 간접 화행](https://arxiv.org/abs/2502.10995) | Searle 분류의 간접 화행 3종. 대부분 모델이 직접 화행보다 간접 화행에서 크게 낮음 | 우리 간접 요청은 100% 로 천장. 관습적 간접 표현만 넣었기 때문으로 보임 |
| [MultiPragEval](https://arxiv.org/abs/2406.07736) | 영·독·한·중 1,200문항, 그라이스 격률 기준 | 다국어 비교 기준 |
| 한국어 주체 높임 (SCIL 2026, [ACL Anthology](https://aclanthology.org/2026.scil-main.35/)) | 모델이 대상의 사회적 지위와 상관없이 높임 표지를 선호. 사회 화용 제약을 다 배우지 못함 | 우리 높임법 문항(HON-01)의 약점과 같은 방향 |
| INDIR-IT (Orsini & Brunato 2025, 2차 요약) | 이탈리아어 간접 화행. 관습적 간접 화행은 잘하고 비관습적은 약함 | "관습적 간접성은 이미 풀렸다"는 1차 결론과 일치 |
| [PUB](https://www.researchgate.net/publication/384213719_PUB_A_Pragmatics_Understanding_Benchmark_for_Assessing_LLMs'_Pragmatics_Capabilities), [CEI](https://arxiv.org/abs/2603.09993), [DiPlomat](https://arxiv.org/abs/2306.09030) | 함축·전제·직시 등 여러 현상, 상황 속 대화 추론 | 영어권 종합 벤치마크 |
| [SwordsmanImp](https://aclanthology.org/2024.ccl-1.98) ([GitHub](https://github.com/sjtu-compling/llm-pragmatics)) | 중국어 시트콤 기반 대화 함축 200문항 | 오픈소스 데이터 형식 참고 |
| READI (ACL 2026 Findings, 2차 요약, 주소 미확인) | 한·영 다중모달 간접 화행. 간접성이 높을수록 성능 하락 | 이미지·상황 맥락이 필요한 간접성 |

## 2. 모호한 요청에 해석을 여러 개 만들기

| 연구 | 방법 | 시사점 |
|---|---|---|
| [Reasoning about Intent for Ambiguous Requests](https://arxiv.org/abs/2511.10453) (Saparina & Lapata) | 한 응답 안에 "해석–답" 쌍 여러 개를 구조화해 출력. 강화학습으로 학습(모호하면 해석을 덮고, 모호하지 않으면 불필요한 해석에 벌점) | 프롬프트만으로 되는지는 초록에 없음. 학습이 필요한 방법 |
| [Disambiguate First, Parse Later](https://arxiv.org/abs/2502.18448) | LLM이 해석 후보를 만들고, 빠진 해석을 다른 모델로 채움 | 후보 생성 → 보완 → 선택의 2단 구조 |
| [Ambiguity in LLMs is a concept missing problem](https://arxiv.org/abs/2505.11679) | **반례**: 해석을 여러 개 만들게 해도 서로 같은 뜻인 경우가 많아 모호성 탐지에 도움이 안 됨 | "N개 유추"는 N을 늘리는 것보다 서로 다른 축으로 만들게 하는 설계가 중요 |
| [AmbigChat](https://dl.acm.org/doi/10.1145/3746059.3747686) | 모호한 측면별로 해석 트리를 만들고 단계적으로 되물음 | 음성에서 한 번에 하나씩 묻는 확인 정책과 연결 |
| [CLAMBER](https://arxiv.org/abs/2405.12063) (ACL 2024) | 모호성 분류 체계와 약 12K 문항. CoT·few-shot이 **과신을 키우고** 탐지 개선은 미미 | 1차에서 분석기가 함축을 과하게 단정한 현상과 같은 방향 |
| [Modeling Future Conversation Turns](https://arxiv.org/abs/2410.13788) (ICLR 2025) | 다음 턴 결과를 시뮬레이션해 선호 라벨을 매김. 언제 물을지 판단 정확도 약 3% 개선 | 되묻기 정책을 "다음 턴에서 해결됐는가"로 평가하는 방법 |

## 3. 쉬는 시간에 미리 계산하기

| 연구 | 방법 | 시사점 |
|---|---|---|
| [Sleep-time Compute](https://arxiv.org/abs/2504.13171) (Letta·UC Berkeley) | 질문이 오기 전 맥락을 미리 다시 표현(c → c′)해 두고, 질문 시점 계산을 줄임. **질문이 맥락에서 예측 가능할수록 효과가 큼** | 3차 C-auto+H 와 같은 구조. 우리 시나리오가 예측 가능했던 점이 효과를 키웠을 수 있음 |
| [Anticipate and Learn (ProAct)](https://arxiv.org/abs/2605.25971) ([GitHub](https://github.com/AgentACE-AI/ProAct)) | 대화 이력과 장기 기억으로 다음 요구를 예측하고 쉬는 시간에 근거를 준비. 필요한 턴 14.8%·환각 28.1% 감소(초록) | 오픈소스 구현 참고 가능 |
| [PROBE](https://arxiv.org/abs/2510.19771), [ProactiveMobile](https://arxiv.org/abs/2602.21858), [ProEvent](https://arxiv.org/abs/2607.17701) | 말하지 않은 요구를 찾아 먼저 처리하는 능력 평가. 최고 모델도 26.7~40% (초록) | 선제 행동은 아직 어려운 과제. 우리는 "응답 정확도 보조"로만 썼음 |

## 4. 음성 지연을 숨기는 방법 (말하는 동안·끝나기 전)

| 연구 | 방법 | 시사점 |
|---|---|---|
| [Endpoint Anticipation](https://arxiv.org/abs/2606.13450) | 발화 끝을 최대 2.56초 먼저 예측해 LLM·TTS를 미리 시작. 평균 505ms 단축(초록) | 가설 생성을 "사용자가 말하는 동안"으로 당길 수 있음 |
| [Speculative tool execution](https://arxiv.org/abs/2610.07641) | 부분 음성 인식 결과로 도구 호출을 미리 실행하고 캐시. 자기 수정 시 규칙으로 버림. 첫 소리 5.79 → 4.60초 | 자기 수정 문항(REP)과 직접 관련 |
| [PredGen](https://arxiv.org/abs/2506.15556) | 사용자가 말하는 동안 답을 추측 생성 | 입력 시점 추측 |
| Chronological Thinking (SIGDIAL 2026, 주소 미확인), [FLAIR](https://arxiv.org/abs/2603.17837) (ICML 2026) | 듣는 동안 점진적으로 생각(명시적 / 잠재 공간). 말이 끝나면 바로 응답 | 음성 직접 처리 모델 쪽 방향. 텍스트 파이프라인과는 구조가 다름 |

## 5. 상황 맥락으로 모호한 명령 풀기 (스마트홈)

| 연구 | 방법 | 시사점 |
|---|---|---|
| [Sasha](https://arxiv.org/abs/2305.09802) (IMWUT 2024) | "아늑하게 해 줘" 같은 목표형 요청을 기기 계획으로 바꿈. 사용자 연구로 평가 | 간접 요청을 행동 계획으로 바꾸는 쪽 |
| [MiCU](https://arxiv.org/abs/2606.01099) | 모호한 명령에서 대상 기기·행동을 예측하는 작은 모델(Qwen3-4B 기반, 2차 요약) | 특화 소형 모델이 큰 범용 모델보다 낫다는 보고 |

## 6. 확률적 화용·마음 이론

- **RSA**: 화자·청자의 재귀적 추론을 베이즈로 정식화. LLM 출력과 RSA 점수가 약하게 상관한다는 보고([Are LLMs good pragmatic speakers?](https://arxiv.org/abs/2411.01562)).
- **SimToM**: 먼저 "그 사람이 아는 것만" 남기고 나서 답하게 하는 2단계 프롬프트([arXiv 2311.10227](https://arxiv.org/abs/2311.10227)).
- **한계 보고**: LLM의 의도 해독 성공이 진짜 믿음 추론인지 얕은 단서인지 의문([Lombardi & Lenci, TACL 2026](https://aclanthology.org/2026.tacl-1.111.pdf)), 정보 비대칭에서 화용적으로 취약([Flout at Your Own Risk](https://arxiv.org/abs/2607.11053)).

## 이 리포에 시험해 볼 방법 후보

위 연구와 1~3차 결과를 합쳐, 지연 위치(언제 계산하는가)별로 정리했습니다. **가설이며 아직 시험하지 않았습니다.**

| 후보 | 근거 연구 | 계산 시점 | 응답 지연 | 다루는 문제 |
|---|---|---|---|---|
| M1 발화 전 N개 상황 유추 (N=10, 서로 다른 축으로) | Sleep-time compute, ProAct, 2505.11679 의 반례 | 발화 전 | 없음 | 3차 가설(5개)이 빗나간 문항 (HON-01) |
| M2 싼 생성 모델로 M1 | 3차 비용 문제 | 발화 전 | 없음 | 가설 생성 비용 12배, 생성 시간 7.6초 |
| M3 맥락 다시 쓰기 (잡음 로그 → 관련 사실만 요약) | Sleep-time compute 의 c → c′ | 발화 전 | 없음 | 선별 없는 로그의 잡음 (C-auto 효과 감소) |
| M4 발화 후 해석 3~5개 열거 → 하나 선택 → 응답 (한 번의 호출) | 2511.10453, AmbigChat | 발화 시점 | 해석 토큰만큼 증가 | 사용자 제안의 "발화를 보고 유추" |
| M5 RSA식 선택: 발화 전 후보 의도 목록 + 발화 시점에 "이 의도면 이렇게 말했을까"로 고름 | RSA | 전 + 발화 시점 | 소폭 | 후보는 미리, 선택은 빠르게 |
| M6 말하는 동안 앞부분으로 가설 생성 | Endpoint anticipation, PredGen | 발화 중 | 없음 (생성이 말하는 시간 안에 끝나야 함) | 직전 비서 발화 뒤 가설이 늦는 문제 |
