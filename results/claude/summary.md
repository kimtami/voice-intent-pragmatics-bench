# 7차: Claude Haiku 5.5·Sonnet 5.5 대 GPT-6 Luna (같은 시각, 30문항 × 3회)

| 모델 | 설정 | 의도 정확도 (95% CI) | 의도 이해율 | 엄격 정확도 | 첫 발화 p50 | 첫 발화 p90 | 전체 p50 | 1,000턴당 비용 | 평균 출력 토큰 | 오류 |
|---|---|---|---|---|---|---|---|---|---|---|
| GPT-6 Luna | 추론 없음 (effort none) | 87.2% (78.9–93.9) | 91.1% | 77.8% | 1,075ms | 1,841ms | 1,395ms | $0.04 | 26.1 | 0 |
| Claude Haiku 5.5 | 생각 끔, effort low | 82.8% (72.8–91.1) | 94.4% | 70.0% | 676ms | 827ms | 1,028ms | $0.06 | 49.8 | 0 |
| Claude Haiku 5.5 | 생각 켬(adaptive), effort medium | 88.3% (78.9–96.1) | 93.3% | 82.2% | 824ms | 1,976ms | 1,274ms | $0.10 | 130.6 | 0 |
| Claude Sonnet 5.5 | 생각 끔(between_tools), effort low | 89.4% (81.7–96.1) | 94.4% | 83.3% | 769ms | 991ms | 1,300ms | $1.17 | 46.1 | 0 |
| Claude Sonnet 5.5 | 생각 켬(adaptive), effort medium | 91.1% (81.7–97.8) | 94.4% | 87.8% | 1,927ms | 3,246ms | 2,270ms | $2.37 | 166.0 | 0 |

## GPT-6 Luna 기본 설정 대비 (같은 문항끼리 짝지음)

| 모델 | 설정 | 정확도 차이 (95% CI) | 차이가 0보다 클 비율 | 첫 발화 p50 차이 | 비용 배수 |
|---|---|---|---|---|---|
| Claude Haiku 5.5 | 생각 끔, effort low | -4.4%p (-14.4–+3.9) | 17% | -399ms | 1.7배 |
| Claude Haiku 5.5 | 생각 켬(adaptive), effort medium | +1.1%p (-9.4–+11.1) | 60% | -251ms | 2.8배 |
| Claude Sonnet 5.5 | 생각 끔(between_tools), effort low | +2.2%p (-3.3–+7.8) | 76% | -306ms | 32.5배 |
| Claude Sonnet 5.5 | 생각 켬(adaptive), effort medium | +3.9%p (-6.7–+12.2) | 78% | +852ms | 65.8배 |
