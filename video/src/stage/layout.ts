// 무대 배치 두 가지.
// wide: 그림 1536×1024 위에 말풍선을 올리고, 아래에 정보 띠 (넓은 화면, 영상 내보내기)
// tall: 위에 캡션, 가운데 그림, 아래 칸에 생각 → 사람 말 → 비서 말 → 정보 띠를 차례로 쌓는다 (휴대폰)
import { Scene, SCENES, W as IW, H as IH } from "./scenes";

export type Layout = "wide" | "tall";
type Pt = [number, number];
type Slot = { mode: "tail" | "icon"; left?: number; right?: number; top?: number; bottom?: number; maxW: number; tail?: Pt; font: number };

export type Geo = {
  layout: Layout;
  W: number;
  H: number;
  img: { x: number; y: number; s: number };
  pt: (x: number, y: number) => Pt;
  ring: { x: number; y: number; rx: number; ry: number };
  waves: { x: number; y: number; s: number };
  clockFace?: { x: number; y: number; size: number; text: string };
  speakerTag: { x: number; y: number; size: number };
  nowPlaying: { left: number; top: number; size: number };
  caption: { left: number; top: number; size: number; right: number };
  helper: { x: number; y: number; r: number; label: number };
  person: Slot;
  avatar: Slot;
  thought: { left: number; top: number; w: number; font: number; title: number; trail: boolean };
  cards: { cx: number; bottom: number; w1: number; w2: number; f1: number; f2: number };
  info: { left: number; top: number; w: number; font: number; small: number; stack: boolean };
  shade: { top: number; bottom: number }; // 그림 위·아래를 어둡게 눌러 글자가 읽히게 하는 높이
};

// 그림에서 스피커 바로 아래 이름표를 붙일 자리 (그림 좌표)
const TAG_Y: Record<Scene["id"], number> = { bedroom: 792, living: 648 };

export function geom(id: Scene["id"], layout: Layout): Geo {
  const sc = SCENES[id];
  if (layout === "wide") {
    const pt = (x: number, y: number): Pt => [x, y];
    return {
      layout, W: IW, H: IH + 176, img: { x: 0, y: 0, s: 1 }, pt,
      ring: sc.ring, waves: { x: sc.ring.x, y: sc.ring.y + 70, s: 1 },
      clockFace: sc.clockFace ? { ...sc.clockFace, size: 38 } : undefined,
      speakerTag: { x: sc.ring.x, y: TAG_Y[id], size: 22 },
      nowPlaying: { left: 60, top: 104, size: 26 },
      caption: { left: 60, top: 40, size: 42, right: 60 },
      helper: { ...sc.helper, label: 26 },
      person: { mode: "tail", left: sc.person.left, bottom: sc.person.bottom, maxW: sc.person.maxW, tail: sc.person.tail, font: 38 },
      avatar: { mode: "tail", right: sc.avatar.right, bottom: sc.avatar.bottom, maxW: sc.avatar.maxW, tail: sc.avatar.tail, font: 36 },
      thought: { left: sc.thought.right - sc.thought.w, top: sc.thought.top, w: sc.thought.w, font: 30, title: 26, trail: true },
      cards: { cx: sc.cards.cx, bottom: sc.cards.bottom, w1: 800, w2: 500, f1: 28, f2: 25 },
      info: { left: 60, top: IH + 18, w: IW - 120, font: 28, small: 22, stack: false },
      shade: { top: 170, bottom: 120 },
    };
  }
  const s = 1080 / IW, oy = 175;
  const pt = (x: number, y: number): Pt => [x * s, oy + y * s];
  const [rx, ry] = pt(sc.ring.x, sc.ring.y);
  const [tx, ty] = pt(sc.ring.x, TAG_Y[id]);
  const cf = sc.clockFace ? pt(sc.clockFace.x, sc.clockFace.y) : null;
  return {
    layout, W: 1080, H: 2260, img: { x: 0, y: oy, s }, pt,
    ring: { x: rx, y: ry, rx: sc.ring.rx * s, ry: sc.ring.ry * s }, waves: { x: rx, y: ry + 70 * s, s },
    clockFace: cf && sc.clockFace ? { x: cf[0], y: cf[1], size: 27, text: sc.clockFace.text } : undefined,
    speakerTag: { x: tx, y: ty, size: 28 },
    nowPlaying: { left: 36, top: oy + 20, size: 30 },
    caption: { left: 40, top: 36, size: 42, right: 40 },
    helper: { x: 860, y: oy + 190, r: 96, label: 28 },
    person: { mode: "icon", left: 40, top: 1290, maxW: 1000, font: 44 },
    avatar: { mode: "icon", right: 1040, top: 1495, maxW: 1000, font: 40 },
    thought: { left: 40, top: 915, w: 1000, font: 34, title: 28, trail: false },
    cards: { cx: 540, bottom: oy + IH * s - 10, w1: 1000, w2: 494, f1: 32, f2: 28 },
    info: { left: 40, top: 1800, w: 1000, font: 40, small: 32, stack: true },
    shade: { top: 0, bottom: 0 },
  };
}
