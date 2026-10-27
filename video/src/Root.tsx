import { loadFont } from "@remotion/fonts";
import { Composition } from "remotion";
import { Stage, stageDuration, stageSize } from "./stage/Stage";
import { STAGES, TURN } from "./stage/stages-data";
import { Turn, turnDuration, turnSize } from "./turn/Turn";

// 렌더·스튜디오용 글꼴 (페이지에서는 페이지가 이미 Pretendard 를 불러 둔다)
loadFont({ family: "Pretendard Variable", url: "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/web/variable/woff2/PretendardVariable.woff2", weight: "45 920" });

const FPS = 30;

// 같은 무대를 넓은 배치(id)와 휴대폰 세로 배치(id-tall) 두 가지로 등록한다
const WIDE = stageSize("wide"), TALL = stageSize("tall");
const TURN_W = turnSize("wide"), TURN_T = turnSize("tall");

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {STAGES.map((s) => (
        <Composition key={s.id} id={s.id} component={Stage} durationInFrames={stageDuration(s.acts, FPS)} fps={FPS} width={WIDE.w} height={WIDE.h} defaultProps={{ scene: s.scene, acts: s.acts, layout: "wide" as const }} />
      ))}
      {STAGES.map((s) => (
        <Composition key={`${s.id}-tall`} id={`${s.id}-tall`} component={Stage} durationInFrames={stageDuration(s.acts, FPS)} fps={FPS} width={TALL.w} height={TALL.h} defaultProps={{ scene: s.scene, acts: s.acts, layout: "tall" as const }} />
      ))}
      <Composition id="turn" component={Turn} durationInFrames={turnDuration(TURN.rows, FPS)} fps={FPS} width={TURN_W.w} height={TURN_W.h} defaultProps={{ ...TURN, layout: "wide" as const }} />
      <Composition id="turn-tall" component={Turn} durationInFrames={turnDuration(TURN.rows, FPS)} fps={FPS} width={TURN_T.w} height={TURN_T.h} defaultProps={{ ...TURN, layout: "tall" as const }} />
    </>
  );
};
