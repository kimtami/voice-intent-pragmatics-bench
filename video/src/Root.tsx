import { loadFont } from "@remotion/fonts";
import { Composition } from "remotion";
import { Stage, stageDuration } from "./stage/Stage";
import { STAGES } from "./stage/stages-data";
import { H, W } from "./stage/scenes";

// 렌더·스튜디오용 글꼴 (페이지에서는 페이지가 이미 Pretendard 를 불러 둔다)
loadFont({ family: "Pretendard Variable", url: "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/web/variable/woff2/PretendardVariable.woff2", weight: "45 920" });

const FPS = 30;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {STAGES.map((s) => (
        <Composition key={s.id} id={s.id} component={Stage} durationInFrames={stageDuration(s.acts, FPS)} fps={FPS} width={W} height={H} defaultProps={{ scene: s.scene, acts: s.acts }} />
      ))}
    </>
  );
};
