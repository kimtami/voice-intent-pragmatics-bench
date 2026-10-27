// 무대 대본(site/data/stages.json 의 단계 목록)을 시간표로 바꾼다. 순수 함수라 어느 프레임이든 같은 화면이 나온다.
// 단계와 시간 값은 예전 캔버스 무대(site/js/stage.js)와 같다: say, think, unthink, dimThought, cards, flyCards,
// dropCards, hideCards, helper, clock, dial, pause, clearSay.

export type Tone = "good" | "bad" | null | undefined;
export type Step = { do: string; [k: string]: unknown };
export type Act = { caption: string; steps: Step[]; src?: string };
export type Pose = "neutral" | "say" | "wait" | "relief";

export const TYPE_MS = 38; // 한 글자 타이핑 (site/js/motion.js 의 T.type)
export const FADE_MS = 300;
const ACT_IN_MS = 900; // 첫 막 등장
const ACT_SWITCH_MS = 700; // 다음 막으로 넘어갈 때
const ACT_END_MS = 2200; // 막이 끝나고 머무는 시간

export type Say = { who: "person" | "avatar"; text: string; tone: Tone; t0: number; t1: number; tEnd: number; dimAt: number };
export type Thought = { title: string; items: string[]; owner: "avatar" | "helper"; pick: number | null; bullets: boolean; t0: number; itemT: number[]; pickT: number; dimAt: number; tEnd: number };
export type Card = { text: string; hot: boolean; drop: boolean };
export type Cards = { items: Card[]; cols: number; t0: number; ms: number; flyT: number; dropT: number; tEnd: number };
export type Helper = { kind: string; label: string; t0: number; tEnd: number };
export type Clock = { label: string; t0: number; t1: number; tEnd: number };
export type Dial = { from: number; to: number; t0: number; tEnd: number };
export type Span = { t0: number; t1: number };

export type Timeline = {
  acts: { caption: string; src?: string; t0: number; t1: number }[];
  says: Say[];
  thoughts: Thought[];
  cards: Cards[];
  helpers: Helper[];
  clocks: Clock[];
  dials: Dial[];
  poses: { t: number; pose: Pose }[];
  speak: Span[]; // 비서가 말하는 동안
  think: Span[]; // 비서가 생각하거나 기다리는 동안
  helperThink: Span[]; // 도우미가 일하는 동안
  calm: number[]; // 맞는 답을 다 말한 시각 (음악이 잦아든다)
  end: number;
};

const INF = Number.POSITIVE_INFINITY;

export function buildTimeline(acts: Act[]): Timeline {
  const tl: Timeline = { acts: [], says: [], thoughts: [], cards: [], helpers: [], clocks: [], dials: [], poses: [], speak: [], think: [], helperThink: [], calm: [], end: 0 };
  let t = 0;
  // 이전 막에서 남은 것을 모두 닫는다
  const closeAll = (at: number) => {
    for (const s of tl.says) s.tEnd = Math.min(s.tEnd, at);
    for (const x of [...tl.thoughts, ...tl.cards, ...tl.helpers, ...tl.clocks, ...tl.dials]) x.tEnd = Math.min(x.tEnd, at);
  };
  acts.forEach((act, ai) => {
    if (ai > 0) { closeAll(t); tl.acts[ai - 1].t1 = t; }
    tl.acts.push({ caption: act.caption, src: act.src, t0: t, t1: INF });
    tl.poses.push({ t, pose: "neutral" });
    t += ai === 0 ? ACT_IN_MS : ACT_SWITCH_MS;
    let pSay: Say | null = null, aSay: Say | null = null, thought: Thought | null = null, cards: Cards | null = null;
    const lastPerson = act.steps.map((s) => s.do === "say" && s.who === "person").lastIndexOf(true);
    act.steps.forEach((st, i) => {
      switch (st.do) {
        case "say": {
          const text = String(st.text), who = st.who === "person" ? "person" : "avatar";
          const typ = Math.max(500, [...text].length * TYPE_MS);
          const s: Say = { who, text, tone: st.tone as Tone, t0: t, t1: t + typ, tEnd: INF, dimAt: INF };
          if (who === "person") {
            if (pSay) pSay.tEnd = t;
            pSay = s;
            // 시험 대상인 마지막 말에서 자세가 바뀐다 (침실: 이마를 짚음, 거실: 손짓하며 물음)
            if (i === lastPerson) tl.poses.push({ t, pose: "say" });
          } else {
            if (aSay) aSay.tEnd = t;
            aSay = s;
            if (pSay) pSay.dimAt = t;
            tl.speak.push({ t0: t, t1: t + typ });
            if (s.tone === "good") { tl.poses.push({ t: t + typ, pose: "relief" }); tl.calm.push(t + typ); }
            if (s.tone === "bad") tl.poses.push({ t: t + typ, pose: "say" });
          }
          tl.says.push(s);
          t += typ + Number(st.hold ?? 900);
          break;
        }
        case "think": {
          const items = (st.items as string[]) ?? [];
          const owner = st.owner === "helper" ? "helper" : "avatar";
          const th: Thought = { title: String(st.title ?? ""), items, owner, pick: (st.pick as number) ?? null, bullets: st.bullets !== false, t0: t, itemT: [], pickT: INF, dimAt: INF, tEnd: INF };
          const t0 = t;
          t += 350;
          for (let k = 0; k < items.length; k += 1) { th.itemT.push(t); t += Number(st.each ?? 650); }
          if (th.pick != null) { th.pickT = t; t += 700; }
          t += Number(st.hold ?? 900);
          (owner === "helper" ? tl.helperThink : tl.think).push({ t0, t1: t });
          if (thought) thought.tEnd = t0;
          thought = th;
          tl.thoughts.push(th);
          break;
        }
        case "unthink": if (thought) thought.tEnd = t; thought = null; t += FADE_MS; break;
        case "dimThought": if (thought) thought.dimAt = t; t += FADE_MS; break;
        case "cards": {
          const items = ((st.items as Record<string, unknown>[]) ?? []).map((c) => ({ text: String(c.text), hot: Boolean(c.hot), drop: Boolean(c.drop) }));
          if (cards) cards.tEnd = t;
          cards = { items, cols: Number(st.cols ?? (items.length > 3 ? 2 : 1)), t0: t, ms: Number(st.ms ?? 900), flyT: INF, dropT: INF, tEnd: INF };
          tl.cards.push(cards);
          t += cards.ms + Number(st.hold ?? 500);
          break;
        }
        case "dropCards": if (cards) cards.dropT = t; t += 700; break;
        case "flyCards": if (cards) cards.flyT = t; t += 900; break;
        case "hideCards": if (cards) cards.tEnd = t; cards = null; t += FADE_MS; break;
        case "helper": tl.helpers.push({ kind: String(st.kind), label: String(st.label ?? ""), t0: t, tEnd: INF }); t += 500; break;
        case "clock": {
          const ms = Number(st.ms ?? 1200);
          tl.clocks.push({ label: String(st.label ?? ""), t0: t, t1: t + ms, tEnd: INF });
          tl.think.push({ t0: t, t1: t + ms });
          tl.poses.push({ t, pose: "wait" });
          t += ms;
          break;
        }
        case "dial": tl.dials.push({ from: Number(st.from), to: Number(st.to), t0: t, tEnd: INF }); t += 1600; break;
        case "pause": t += Number(st.ms ?? 600); break;
        case "clearSay": if (aSay) aSay.tEnd = t; aSay = null; break;
        default: break;
      }
    });
    t += ACT_END_MS;
  });
  tl.acts[tl.acts.length - 1].t1 = t;
  tl.end = t;
  return tl;
}

// 0~1 사이로 자른 진행도
export const prog = (ms: number, t0: number, len: number) => (len <= 0 ? (ms >= t0 ? 1 : 0) : Math.max(0, Math.min(1, (ms - t0) / len)));
// 나타났다 사라지는 투명도: t0 에서 FADE_MS 동안 나타나고 tEnd 에서 FADE_MS 동안 사라진다
export const life = (ms: number, t0: number, tEnd: number, fade = FADE_MS) => Math.min(prog(ms, t0, fade), 1 - prog(ms, tEnd, fade));
export const inSpan = (ms: number, spans: Span[]) => spans.some((s) => ms >= s.t0 && ms < s.t1);
export const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);
