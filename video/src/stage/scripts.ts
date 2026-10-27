// 무대 목록: site/data 의 대본에서 장면(그림)과 막(캡션·출처·정보 띠)을 붙인다. 방법을 더하면 여기에도 자동으로 생긴다.
// 페이지는 자기가 읽은 JSON 으로 makeStages 를 부르고, 스튜디오·렌더는 stages-data.ts 에서 같은 함수를 부른다.
import type { Act, ActInfo, Step } from "./timeline";
import type { Scene } from "./scenes";

export type StageEntry = { id: string; scene: Scene["id"]; acts: Act[] };

type Models = { reply: string; helper?: string };
type Timing = NonNullable<ActInfo["timing"]>;
type MethodRow = { id: string; name: string; family: string; timing: Timing; metric: string; base: string; models: Models };
type CaseInfo = { metric: string; base?: string; timing?: Timing; models: Models };
export type StagesJson = { problem: { literal: Step[]; pragmatic: Step[] }; methods: Record<string, Step[]>; winner: { label: string; before: Step[]; after: Step[]; info: { before: CaseInfo; after: CaseInfo } }[] };
export type MethodsJson = {
  example: { literal: { source: string } & CaseInfo; intended: { source: string } & CaseInfo };
  methods: MethodRow[];
  families: { id: string; role: string }[];
  timings: Record<Timing, { label: string }>;
};
export type MetricsJson = { metrics: Record<string, { accuracy: number; first_p50: number; items: number; reps: number }> };

// 여행 문항은 거실 그림을 쓴다. 나머지(SAR-02)는 침실
const LIVING = new Set(["goals", "planner", "gate", "gatectx", "temp"]);
const sceneOfMethod = (id: string): Scene["id"] => (LIVING.has(id) ? "living" : "bedroom");
const sceneOfExample = (label: string): Scene["id"] => (label.startsWith("SAR") ? "bedroom" : "living");
const BASELINE_HOW = "기록 로그만 보고 바로 답한다 (기준)";

export const makeStages = (S: StagesJson, D: MethodsJson, M: MetricsJson): StageEntry[] => {
  const roleOf = (family: string) => D.families.find((f) => f.id === family)?.role;
  const info = (c: CaseInfo, how?: string): ActInfo => {
    const m = M.metrics[c.metric], b = c.base ? M.metrics[c.base] : undefined;
    return {
      timing: c.timing, timingLabel: c.timing ? D.timings[c.timing].label : undefined,
      reply: c.models.reply, helper: c.models.helper, how,
      acc: m?.accuracy, accBase: b?.accuracy, first: m?.first_p50, firstBase: b?.first_p50,
      sample: m ? `${m.items}문항 × ${m.reps}회` : undefined,
    };
  };
  const guessHow = roleOf("guess");
  return [
    {
      id: "problem",
      scene: "bedroom",
      acts: [
        { caption: "빠른 비서: 글자 그대로 받아들인다", steps: S.problem.literal, src: `${D.example.literal.source} 실제 응답`, info: info(D.example.literal, BASELINE_HOW) },
        { caption: "말뜻을 읽으면", steps: S.problem.pragmatic, src: `${D.example.intended.source} 실제 응답 · 생각 말풍선은 설명용`, info: info(D.example.intended, guessHow) },
      ],
    },
    ...D.methods.filter((m) => S.methods[m.id]).map((m) => ({
      id: `m-${m.id}`,
      scene: sceneOfMethod(m.id),
      acts: [{ caption: m.name, steps: S.methods[m.id], src: "비서의 말과 짐작·분석 내용은 실제 결과", info: info({ metric: m.metric, base: m.base, timing: m.timing, models: m.models }, roleOf(m.family)) }],
    })),
    ...S.winner.map((ex, i) => ({
      id: `w-${i}`,
      scene: sceneOfExample(ex.label),
      acts: [
        { caption: `미리 짐작 없이 · ${ex.label}`, steps: ex.before, src: "비서의 말은 실제 응답", info: info(ex.info.before, BASELINE_HOW) },
        { caption: `미리 짐작해 두고 · ${ex.label}`, steps: ex.after, src: "비서의 말은 실제 응답, 짐작 카드는 실제로 미리 만든 추정", info: info(ex.info.after, guessHow) },
      ],
    })),
  ];
};
