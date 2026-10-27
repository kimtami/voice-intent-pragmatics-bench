// 페이지용 무대 플레이어: esbuild 로 site/js/stage-player.js 하나로 묶는다 (npm run build:web).
// 페이지가 읽은 stages.json·methods.json 으로 무대 목록을 만들고, 고른 무대를 Remotion Player 로 재생한다.
import React from "react";
import { createRoot } from "react-dom/client";
import { Player, PlayerRef } from "@remotion/player";
import { Stage, stageDuration } from "./stage/Stage";
import { makeStages, MethodsJson, StageEntry, StagesJson } from "./stage/scripts";
import { H, W } from "./stage/scenes";

const FPS = 30;

export function stageList(S: StagesJson, D: MethodsJson): StageEntry[] {
  return makeStages(S, D);
}

export type StageHandle = {
  show: (entry: StageEntry, opts?: { play?: boolean; end?: boolean }) => void;
  play: () => void;
  setRate: (r: number) => void;
  onEnded: (fn: () => void) => void;
};

// el 안에 플레이어를 띄운다. assetBase 는 그림 폴더 (예: "media/")
export function mountStage(el: HTMLElement, assetBase: string, rate = 1): StageHandle {
  const root = createRoot(el);
  const ref = React.createRef<PlayerRef>();
  let entry: StageEntry | null = null;
  let r = rate;
  let ended: (() => void) | null = null;
  let pending: { play?: boolean; end?: boolean } = {};
  const hooked = new WeakSet<PlayerRef>(); // 같은 무대를 다시 보여도 끝 알림은 한 번만 단다
  const render = () => {
    if (!entry) return;
    root.render(
      <Player
        key={entry.id}
        ref={ref}
        component={Stage}
        inputProps={{ scene: entry.scene, acts: entry.acts, assetBase }}
        durationInFrames={stageDuration(entry.acts, FPS)}
        fps={FPS}
        compositionWidth={W}
        compositionHeight={H}
        playbackRate={r}
        controls={false}
        clickToPlay={false}
        doubleClickToFullscreen={false}
        spaceKeyToPlayOrPause={false}
        style={{ width: "100%", height: "auto", aspectRatio: `${W} / ${H}`, borderRadius: 6, overflow: "hidden" }}
      />,
    );
  };
  // Player 가 붙은 다음 프레임에 재생·끝 화면 이동을 적용한다
  const apply = () => {
    const p = ref.current;
    if (!p || !entry) { requestAnimationFrame(apply); return; }
    if (!hooked.has(p)) { hooked.add(p); p.addEventListener("ended", () => ended?.()); }
    if (pending.end) p.seekTo(stageDuration(entry.acts, FPS) - 1);
    else { p.seekTo(0); if (pending.play) p.play(); }
  };
  return {
    show(e, opts = {}) { entry = e; pending = opts; render(); requestAnimationFrame(apply); },
    play() { const p = ref.current; if (p) { p.seekTo(0); p.play(); } },
    setRate(v) { r = v; render(); },
    onEnded(fn) { ended = fn; },
  };
}
