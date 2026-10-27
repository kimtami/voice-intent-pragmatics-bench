// 페이지용 플레이어: esbuild 로 site/js/stage-player.js 하나로 묶는다 (npm run build:web).
// 페이지가 읽은 JSON 으로 무대 목록과 타임라인 값을 만들고, 고른 것을 Remotion Player 로 재생한다.
// 자리 폭이 좁으면(휴대폰) 세로 배치(tall)로 바꾼다. 폭이 기준을 넘나들면 지금 프레임에서 배치만 바꿔 이어 간다.
import React from "react";
import { createRoot } from "react-dom/client";
import { Player, PlayerRef } from "@remotion/player";
import { Stage, stageDuration, stageSize } from "./stage/Stage";
import { makeStages, MethodsJson, MetricsJson, StageEntry, StagesJson } from "./stage/scripts";
import type { Layout } from "./stage/layout";
import { Turn, turnDuration, turnProps, turnSize } from "./turn/Turn";

const FPS = 30;
const TALL_BELOW = 640; // 자리 폭(px)이 이보다 좁으면 세로 배치

export function stageList(S: StagesJson, D: MethodsJson, M: MetricsJson): StageEntry[] {
  return makeStages(S, D, M);
}

type Loose = React.ComponentType<Record<string, unknown>>;
type Shown = { key: string; component: Loose; props: Record<string, unknown>; frames: number; size: (l: Layout) => { w: number; h: number } };

export type PlayerHandle = {
  show: (entry: StageEntry, opts?: { play?: boolean; end?: boolean }) => void;
  showTurn: (M: Parameters<typeof turnProps>[0], D: Parameters<typeof turnProps>[1], opts?: { play?: boolean; end?: boolean }) => void;
  play: () => void;
  setRate: (r: number) => void;
  onEnded: (fn: () => void) => void;
  readonly player: PlayerRef | null; // 점검용: 지금 붙은 Remotion Player
};

// el 안에 플레이어를 띄운다. assetBase 는 그림 폴더 (예: "media/")
// 보여 줄 때마다 새 키로 플레이어를 새로 붙이고, 재생 여부와 시작 프레임은 속성(autoPlay, initialFrame)으로 넘긴다.
// 붙은 직후에 명령으로 play() 를 부르면 아직 바뀌기 전의 플레이어에 걸리는 경우가 있었다.
export function mountStage(el: HTMLElement, assetBase: string, rate = 1): PlayerHandle {
  const root = createRoot(el);
  let current: PlayerRef | null = null;
  let cur: (Shown & { autoPlay: boolean; initialFrame: number }) | null = null;
  let n = 0;
  let r = rate;
  let ended: (() => void) | null = null;
  const layoutNow = (): Layout => (el.clientWidth > 0 && el.clientWidth < TALL_BELOW ? "tall" : "wide");
  let layout = layoutNow();
  const hooked = new WeakSet<PlayerRef>();
  const setRef = (p: PlayerRef | null) => {
    current = p;
    if (p && !hooked.has(p)) { hooked.add(p); p.addEventListener("ended", () => ended?.()); }
  };
  const render = () => {
    if (!cur) return;
    const { w, h } = cur.size(layout);
    el.style.aspectRatio = `${w} / ${h}`;
    root.render(
      <Player
        key={`${cur.key}@${layout}`}
        ref={setRef}
        component={cur.component}
        inputProps={{ ...cur.props, assetBase, layout }}
        durationInFrames={cur.frames}
        fps={FPS}
        compositionWidth={w}
        compositionHeight={h}
        playbackRate={r}
        autoPlay={cur.autoPlay}
        initialFrame={cur.initialFrame}
        // 무대에는 소리가 없다. 음소거로 띄워야 클릭 없이 시작할 때 오디오 재개를 기다리다 멈추지 않는다
        initiallyMuted
        numberOfSharedAudioTags={0}
        // 개인 연구 프로젝트(MIT)라 Remotion 무료 라이선스 대상이다 (video/README.md)
        acknowledgeRemotionLicense
        controls={false}
        clickToPlay={false}
        doubleClickToFullscreen={false}
        spaceKeyToPlayOrPause={false}
        style={{ width: "100%", height: "auto", aspectRatio: `${w} / ${h}`, borderRadius: 6, overflow: "hidden" }}
      />,
    );
  };
  const open = (next: Shown, opts: { play?: boolean; end?: boolean }) => {
    n += 1;
    cur = { ...next, key: `${next.key}#${n}`, autoPlay: Boolean(opts.play) && !opts.end, initialFrame: opts.end ? next.frames - 1 : 0 };
    render();
  };
  // 폭이 기준을 넘나들면 지금 프레임에서 배치만 바꾼다
  new ResizeObserver(() => {
    const next = layoutNow();
    if (next === layout || !cur) return;
    const frame = current?.getCurrentFrame() ?? cur.initialFrame;
    const playing = current?.isPlaying() ?? false;
    layout = next;
    cur = { ...cur, autoPlay: playing, initialFrame: frame };
    render();
  }).observe(el);
  return {
    show(e, opts = {}) {
      open({ key: e.id, component: Stage as unknown as Loose, props: { scene: e.scene, acts: e.acts }, frames: stageDuration(e.acts, FPS), size: stageSize }, opts);
    },
    showTurn(M, D, opts = {}) {
      const props = turnProps(M, D);
      open({ key: "turn", component: Turn as unknown as Loose, props, frames: turnDuration(props.rows, FPS), size: turnSize }, opts);
    },
    play() { if (cur) open({ ...cur, key: cur.key.split("#")[0] }, { play: true }); },
    setRate(v) { r = v; render(); },
    onEnded(fn) { ended = fn; },
    get player() { return current; },
  };
}
