# 대화 무대 (Remotion)

결과 페이지의 대화 무대(문제, 시도한 방법 18개, 가장 나은 방법)를 만드는 Remotion 프로젝트다.
`site/data/stages.json` 의 대본을 시간표로 바꿔 Codex 로 그린 방 그림 위에 말풍선, 생각, 기록 카드, 도우미, 기다림 초시계를 올린다.
페이지는 이 코드를 묶은 `site/js/stage-player.js` 로 같은 무대를 브라우저에서 재생한다.

## 구조

- `src/stage/timeline.ts`: 대본 단계(say, think, cards, helper, clock, dial …)를 시간표로 바꾸는 순수 함수
- `src/stage/Stage.tsx`: 시간표를 그리는 컴포지션
- `src/stage/scenes.ts`: 그림마다 잰 위치 (스피커 빛 고리, 시계 화면, 말풍선 자리)
- `src/stage/scripts.ts`: 대본에 장면(침실·거실)과 막(캡션·출처)을 붙여 무대 목록을 만든다
- `src/turn/Turn.tsx`: 언제 일하나 장면의 대화 턴 시간축 (줄 정의와 첫 소리 값)
- `src/web.tsx`: 페이지용 플레이어 (`mountStage`, `stageList`)
- `scripts/thumbs.sh`: 문제점 카드 썸네일 (방법마다 무대 끝 화면)
- `art/`: 그림 프롬프트(`prompts/`), 생성 스크립트(`gen.sh`), 자세 합성(`compose.py`). 원본 PNG(`art/src/`)는 저장소에 넣지 않는다

## 명령

```bash
npm i
npm run dev                                         # Remotion Studio 미리보기
npm run build:web                                   # 페이지용 플레이어를 site/js/stage-player.js 로 묶기
npm run still -- problem out/problem.png --frame=300  # 한 프레임 확인
npx remotion render problem out/problem.mp4        # 영상으로 내보내기 (공유용)
npm run thumbs                                      # 문제점 카드 썸네일 다시 만들기
```

## 그림 만들기

`art/gen.sh <이름> [참고 그림]` 은 Codex 내장 이미지 생성(ChatGPT 계정 로그인)으로 `art/prompts/<이름>.txt` 를 그려 `art/src/<이름>.png` 에 둔다.
자세 그림은 기준 그림을 참고 그림으로 넘겨 자세만 바꾸고, `python3 video/art/compose.py` 로 사람 영역만 합성해 `site/media/stage/` 에 WebP 로 쓴다.

## 방법 더하기

`site/data/stages.json` 에 대본을 더하면 무대 목록에 자동으로 생긴다. 여행 문항처럼 거실 그림이 필요하면 `scripts.ts` 의 `LIVING` 에 id 를 더한다.
코드(`src/`)를 바꿨을 때만 `npm run build:web` 을 다시 돌린다. 대본만 바꾸면 다시 묶을 필요가 없다. 방법을 더했으면 `npm run thumbs` 로 썸네일도 만든다.

## 라이선스

Remotion 은 개인, 직원 3명 이하 영리 조직, 비영리 조직은 무료이고, 그 밖의 회사는 회사 라이선스가 필요하다 (`node_modules/remotion/LICENSE.md`).
