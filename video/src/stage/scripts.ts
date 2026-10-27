// 무대 목록: site/data 의 대본에서 장면(그림)과 막(캡션·출처)을 붙인다. 방법을 더하면 여기에도 자동으로 생긴다.
// 페이지는 자기가 읽은 JSON 으로 makeStages 를 부르고, 스튜디오·렌더는 stages-data.ts 에서 같은 함수를 부른다.
import type { Act, Step } from "./timeline";
import type { Scene } from "./scenes";

export type StageEntry = { id: string; scene: Scene["id"]; acts: Act[] };

type MethodRow = { id: string; name: string };
export type StagesJson = { problem: { literal: Step[]; pragmatic: Step[] }; methods: Record<string, Step[]>; winner: { label: string; before: Step[]; after: Step[] }[] };
export type MethodsJson = { example: { literal: { source: string }; intended: { source: string } }; methods: MethodRow[] };

// 여행 문항은 거실 그림을 쓴다. 나머지(SAR-02)는 침실
const LIVING = new Set(["goals", "planner", "gate", "gatectx", "temp"]);
const sceneOfMethod = (id: string): Scene["id"] => (LIVING.has(id) ? "living" : "bedroom");
const sceneOfExample = (label: string): Scene["id"] => (label.startsWith("SAR") ? "bedroom" : "living");

export const makeStages = (S: StagesJson, D: MethodsJson): StageEntry[] => [
  {
    id: "problem",
    scene: "bedroom",
    acts: [
      { caption: "빠른 비서: 글자 그대로 받아들인다", steps: S.problem.literal, src: `${D.example.literal.source} 실제 응답` },
      { caption: "말뜻을 읽으면", steps: S.problem.pragmatic, src: `${D.example.intended.source} 실제 응답 · 생각 말풍선은 설명용` },
    ],
  },
  ...D.methods.filter((m) => S.methods[m.id]).map((m) => ({
    id: `m-${m.id}`,
    scene: sceneOfMethod(m.id),
    acts: [{ caption: m.name, steps: S.methods[m.id], src: "비서의 말과 짐작·분석 내용은 실제 결과" }],
  })),
  ...S.winner.map((ex, i) => ({
    id: `w-${i}`,
    scene: sceneOfExample(ex.label),
    acts: [
      { caption: `미리 짐작 없이 · ${ex.label}`, steps: ex.before, src: "비서의 말은 실제 응답" },
      { caption: `미리 짐작해 두고 · ${ex.label}`, steps: ex.after, src: "비서의 말은 실제 응답, 짐작 카드는 실제로 미리 만든 추정" },
    ],
  })),
];
