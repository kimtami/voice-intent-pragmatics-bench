// 페이지용 플레이어: esbuild 로 site/js/stage-player.js 하나로 묶는다 (npm run build:web).
// 페이지가 읽은 JSON 으로 무대 목록과 타임라인 값을 만들고, 고른 것을 Remotion Player 로 재생한다.
import React from "react";
import { createRoot } from "react-dom/client";
import { Player, PlayerRef } from "@remotion/player";
import { Stage, stageDuration } from "./stage/Stage";
import { makeStages, MethodsJson, StageEntry, StagesJson } from "./stage/scripts";
import { H, W } from "./stage/scenes";
import { Turn, TH, turnDuration, turnProps, TW } from "./turn/Turn";

const FPS = 30;

export function stageList(S: StagesJson, D: MethodsJson): StageEntry[] {
  return makeStages(S, D);
}

type Loose = React.ComponentType<Record<string, unknown>>;
type Shown = { key: string; component: Loose; props: Record<string, unknown>; frames: number; w: number; h: number };

export type PlayerHandle = {
  show: (entry: StageEntry, opts?: { play?: boolean; end?: boolean }) => void;
  showTurn: (M: Parameters<typeof turnProps>[0], D: Parameters<typeof turnProps>[1], opts?: { play?: boolean; end?: boolean }) => void;
  play: () => void;
  setRate: (r: number) => void;
  onEnded: (fn: () => void) => void;
};

// el 안에 플레이어를 띄운다. assetBase 는 그림 폴더 (예: "media/")
export function mountStage(el: HTMLElement, assetBase: string, rate = 1): PlayerHandle {
  const root = createRoot(el);
  const ref = React.createRef<PlayerRef>();
  const hooked = new WeakSet<PlayerRef>(); // 같은 것을 다시 보여도 끝 알림은 한 번만 단다
  let cur: Shown | null = null;
  let r = rate;
  let ended: (() => void) | null = null;
  let pending: { play?: boolean; end?: boolean } = {};
  const render = () => {
    if (!cur) return;
    root.render(
      <Player
        key={cur.key}
        ref={ref}
        component={cur.component}
        inputProps={{ ...cur.props, assetBase }}
        durationInFrames={cur.frames}
        fps={FPS}
        compositionWidth={cur.w}
        compositionHeight={cur.h}
        playbackRate={r}
        controls={false}
        clickToPlay={false}
        doubleClickToFullscreen={false}
        spaceKeyToPlayOrPause={false}
        style={{ width: "100%", height: "auto", aspectRatio: `${cur.w} / ${cur.h}`, borderRadius: 6, overflow: "hidden" }}
      />,
    );
  };
  // Player 가 붙은 다음 프레임에 재생·끝 화면 이동을 적용한다
  const apply = () => {
    const p = ref.current;
    if (!p || !cur) { requestAnimationFrame(apply); return; }
    if (!hooked.has(p)) { hooked.add(p); p.addEventListener("ended", () => ended?.()); }
    if (pending.end) p.seekTo(cur.frames - 1);
    else { p.seekTo(0); if (pending.play) p.play(); }
  };
  const open = (next: Shown, opts: { play?: boolean; end?: boolean }) => { cur = next; pending = opts; render(); requestAnimationFrame(apply); };
  return {
    show(e, opts = {}) {
      open({ key: e.id, component: Stage as unknown as Loose, props: { scene: e.scene, acts: e.acts }, frames: stageDuration(e.acts, FPS), w: W, h: H }, opts);
    },
    showTurn(M, D, opts = {}) {
      const props = turnProps(M, D);
      open({ key: "turn", component: Turn as unknown as Loose, props, frames: turnDuration(props.rows, FPS), w: TW, h: TH }, opts);
    },
    play() { const p = ref.current; if (p) { p.seekTo(0); p.play(); } },
    setRate(v) { r = v; render(); },
    onEnded(fn) { ended = fn; },
  };
}
