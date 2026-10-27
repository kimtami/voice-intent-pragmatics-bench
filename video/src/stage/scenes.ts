// 그림마다 잰 위치 (1536×1024 그림 좌표). 스피커 빛 고리와 시계 화면은 그림의 픽셀을 재서 정했다.

export const W = 1536;
export const H = 1024;

export type Scene = {
  id: "bedroom" | "living";
  ring: { x: number; y: number; rx: number; ry: number }; // 스피커 윗면 빛 고리
  person: { tail: [number, number]; left: number; bottom: number; maxW: number }; // 사람 말풍선: 왼쪽 아래 모서리 고정
  avatar: { tail: [number, number]; right: number; bottom: number; maxW: number }; // 비서 말풍선: 오른쪽 아래 모서리 고정
  thought: { right: number; top: number; w: number };
  helper: { x: number; y: number; r: number };
  clock: { right: number; top: number }; // 기다림 초시계 자리
  cards: { cx: number; bottom: number };
  music?: { track: string; genre: string; bpm: number }; // 재생 중인 곡이 있으면 음파를 그린다
  clockFace?: { x: number; y: number; text: string }; // 그림 속 탁상시계 화면
};

export const SCENES: Record<Scene["id"], Scene> = {
  bedroom: {
    id: "bedroom",
    ring: { x: 1222, y: 621, rx: 60, ry: 8 },
    person: { tail: [440, 346], left: 230, bottom: 318, maxW: 500 },
    avatar: { tail: [1222, 604], right: 1480, bottom: 580, maxW: 560 },
    thought: { right: 1480, top: 64, w: 600 },
    helper: { x: 780, y: 455, r: 115 },
    clock: { right: 1140, top: 628 },
    cards: { cx: 770, bottom: 958 },
    music: { track: "Thunder Riot", genre: "헤비메탈", bpm: 168 },
    clockFace: { x: 1362, y: 729, text: "01:00" },
  },
  living: {
    id: "living",
    ring: { x: 1222, y: 521, rx: 43, ry: 5 },
    person: { tail: [430, 292], left: 220, bottom: 268, maxW: 480 },
    avatar: { tail: [1222, 508], right: 1440, bottom: 488, maxW: 560 },
    thought: { right: 1440, top: 56, w: 600 },
    helper: { x: 830, y: 380, r: 115 },
    clock: { right: 1150, top: 528 },
    cards: { cx: 700, bottom: 958 },
  },
};
