// 대화 무대: Codex 로 만든 방 그림 위에 말풍선, 생각, 기록 카드, 도우미, 기다림(깜빡이는 점 3개)을 시간표대로 올리고,
// 아래 정보 띠에 응답·도우미 모델, 방법, 계산 시점, 정확도와 첫 소리를 적는다. 배치는 wide(넓은 화면)와 tall(휴대폰) 두 가지.
import React, { useMemo } from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Act, ActInfo, buildTimeline, Cards, easeOut, FADE_MS, inSpan, life, Pose, prog, Say, Thought, Timeline } from "./timeline";
import { Scene, SCENES, W as IW, H as IH } from "./scenes";
import { Geo, geom, Layout } from "./layout";

export type StageProps = { scene: Scene["id"]; acts: Act[]; assetBase?: string; layout?: Layout };

export const FONT = '"Pretendard Variable", Pretendard, system-ui, sans-serif';
const C = {
  ink: "#f0efec",
  muted: "rgba(240,239,236,0.66)",
  panel: "rgba(16,17,21,0.92)",
  line: "rgba(255,255,255,0.16)",
  good: "#0ca30c",
  bad: "#d03b3b",
  orange: "#d95926",
  green: "#199e70",
  paper: "#f2f1ee",
  paperInk: "#16171a",
  timing: { during: "#3987e5", before: "#d95926", ahead: "#199e70" },
};

export const stageDuration = (acts: Act[], fps: number) => Math.ceil((buildTimeline(acts).end / 1000) * fps);
export const stageSize = (layout: Layout) => { const g = geom("bedroom", layout); return { w: g.W, h: g.H }; };

// 글 폭 어림: 한글·한자는 1em, 나머지 0.58em, 빈칸 0.3em (생각 판의 높이와 카드 줄 수를 정할 때만 쓴다)
const textEm = (s: string) => [...s].reduce((n, ch) => n + (ch === " " ? 0.3 : /[ㄱ-힣一-鿿]/.test(ch) ? 1 : 0.58), 0);
type Src = (n: string) => string;

export const Stage: React.FC<StageProps> = ({ scene, acts, assetBase, layout = "wide" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ms = (frame / fps) * 1000;
  const tl = useMemo(() => buildTimeline(acts), [acts]);
  const g = geom(scene, layout);
  const sc = SCENES[scene];
  const src: Src = (name) => (assetBase != null ? `${assetBase}${name}` : staticFile(name));
  return (
    <AbsoluteFill style={{ backgroundColor: "#16171a", fontFamily: FONT, color: C.ink, overflow: "hidden", wordBreak: "keep-all", overflowWrap: "anywhere" }}>
      <Poses tl={tl} ms={ms} sc={sc} g={g} src={src} />
      <svg width={g.W} height={g.H} viewBox={`0 0 ${g.W} ${g.H}`} style={{ position: "absolute", inset: 0, zIndex: 3 }}>
        <defs>
          <filter id="glow" x="-50%" y="-200%" width="200%" height="500%"><feGaussianBlur stdDeviation={7 * g.img.s} /></filter>
        </defs>
        {sc.music ? <Waves tl={tl} ms={ms} sc={sc} g={g} /> : null}
        <Ring tl={tl} ms={ms} sc={sc} g={g} />
      </svg>
      {g.clockFace ? <ClockFace g={g} /> : null}
      <Shade g={g} />
      <SpeakerTag tl={tl} ms={ms} g={g} />
      {tl.helpers.map((h, i) => <HelperInset key={i} h={h} tl={tl} ms={ms} g={g} src={src} />)}
      {tl.cards.map((c, i) => <CardStack key={i} cs={c} ms={ms} g={g} />)}
      {tl.thoughts.map((t, i) => <ThoughtPanel key={i} th={t} ms={ms} g={g} src={src} kind={tl.helpers.filter((h) => h.t0 <= t.t0).pop()?.kind ?? "analyst"} />)}
      {tl.clocks.map((c, i) => <WaitDots key={i} c={c} ms={ms} g={g} src={src} />)}
      {tl.dials.map((d, i) => <TempDial key={i} d={d} ms={ms} g={g} sc={sc} />)}
      {tl.says.map((s, i) => <Bubble key={i} s={s} ms={ms} g={g} src={src} />)}
      <Captions tl={tl} ms={ms} sc={sc} g={g} />
    </AbsoluteFill>
  );
};

// 자세 그림 4장: 바뀔 때 450ms 동안 겹쳐 바꾼다. 사람 밖의 픽셀은 4장 모두 같다
const POSES: Pose[] = ["neutral", "say", "wait", "relief"];
const Poses: React.FC<{ tl: Timeline; ms: number; sc: Scene; g: Geo; src: Src }> = ({ tl, ms, sc, g, src }) => {
  let cur = 0;
  tl.poses.forEach((p, i) => { if (p.t <= ms) cur = i; });
  const now = tl.poses[cur], before = tl.poses[Math.max(0, cur - 1)];
  const a = now.pose === before.pose ? 1 : prog(ms, now.t, 450);
  return (
    <>
      {POSES.map((p) => {
        const op = p === now.pose ? a : p === before.pose ? 1 : 0;
        return <Img key={p} src={src(`stage/${sc.id}-${p}.webp`)} style={{ position: "absolute", left: g.img.x, top: g.img.y, width: IW * g.img.s, height: IH * g.img.s, opacity: op, zIndex: p === now.pose ? 2 : 1 }} />;
      })}
    </>
  );
};

// 그림 위·아래를 어둡게 눌러 캡션과 곡 정보가 읽히게 한다 (wide 만)
const Shade: React.FC<{ g: Geo }> = ({ g }) => (g.shade.top ? (
  <>
    <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: g.shade.top, background: "linear-gradient(rgba(10,11,13,0.72), rgba(10,11,13,0))", zIndex: 3 }} />
    <div style={{ position: "absolute", left: 0, right: 0, top: IH - g.shade.bottom, height: g.shade.bottom, background: "linear-gradient(rgba(10,11,13,0), rgba(10,11,13,0.55))", zIndex: 3 }} />
  </>
) : null);

// 스피커 빛 고리: 음악 = 박자에 맞춰 주황, 생각·기다림 = 초록 점이 돎, 말함 = 하얗게 떨림
const Ring: React.FC<{ tl: Timeline; ms: number; sc: Scene; g: Geo }> = ({ tl, ms, sc, g }) => {
  const { x, y, rx, ry } = g.ring;
  const s = ms / 1000;
  let color = "", a = 0;
  if (inSpan(ms, tl.speak)) { color = "#ffffff"; a = 0.55 + 0.45 * Math.abs(Math.sin(s * 9)); }
  else if (inSpan(ms, tl.think)) { color = "#2bd197"; a = 0.95; }
  else if (sc.music && !calmed(tl, ms)) { const beat = (s % (60 / sc.music.bpm)) / (60 / sc.music.bpm); color = "#ff7a3d"; a = 0.35 + 0.65 * (1 - beat); }
  if (!color) return null;
  const ang = s * 4.5;
  return (
    <g>
      <ellipse cx={x} cy={y} rx={rx} ry={ry} fill="none" stroke={color} strokeWidth={10 * g.img.s} opacity={a * 0.8} filter="url(#glow)" />
      <ellipse cx={x} cy={y} rx={rx} ry={ry} fill="none" stroke={color} strokeWidth={3.5 * g.img.s} opacity={a} />
      {color === "#2bd197" ? <circle cx={x + Math.cos(ang) * rx} cy={y + Math.sin(ang) * ry} r={6 * g.img.s} fill="#ffffff" /> : null}
    </g>
  );
};

const actAt = (tl: Timeline, ms: number) => tl.acts.find((a) => ms >= a.t0 && ms < a.t1) ?? tl.acts[tl.acts.length - 1];
const calmT = (tl: Timeline, ms: number) => {
  const act = actAt(tl, ms);
  return tl.calm.find((t) => t >= act.t0 && t < act.t1) ?? Number.POSITIVE_INFINITY;
};
const calmed = (tl: Timeline, ms: number) => ms >= calmT(tl, ms);

// 헤비메탈 음파: 스피커에서 왼쪽 위 빈 벽으로 퍼지는 톱니 고리. 맞는 답이 끝나면 잦아든다
const Waves: React.FC<{ tl: Timeline; ms: number; sc: Scene; g: Geo }> = ({ tl, ms, sc, g }) => {
  const bpm = sc.music!.bpm;
  const fade = 1 - prog(ms, calmT(tl, ms), 1400);
  if (fade <= 0) return null;
  const { x: cx, y: cy, s } = g.waves;
  const phase = ((ms / 1000) * (bpm / 60) / 2) % 1; // 두 박자마다 고리 하나
  return (
    <g>
      {[0, 1, 2, 3].map((k) => {
        const q = (k + phase) / 4;
        const r = (110 + q * 330) * s;
        const pts: string[] = [];
        for (let i = 0; i <= 26; i += 1) {
          const ang = ((198 + i * (64 / 26)) * Math.PI) / 180;
          const rr = r + (i % 2 ? 9 : -9) * s;
          pts.push(`${(cx + Math.cos(ang) * rr).toFixed(1)},${(cy + Math.sin(ang) * rr * 0.82).toFixed(1)}`);
        }
        return <polyline key={k} points={pts.join(" ")} fill="none" stroke={C.orange} strokeWidth={3 * Math.max(s, 0.8)} strokeLinejoin="round" opacity={0.55 * (1 - q) * fade} />;
      })}
    </g>
  );
};

// 그림 속 탁상시계 화면에 시각을 띄운다
const ClockFace: React.FC<{ g: Geo }> = ({ g }) => {
  const f = g.clockFace!;
  return (
    <div style={{ position: "absolute", left: f.x - f.size * 2, top: f.y - f.size * 0.7, width: f.size * 4, height: f.size * 1.4, zIndex: 3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: f.size, fontWeight: 600, letterSpacing: 2, color: "rgba(255,206,160,0.92)", textShadow: "0 0 14px rgba(255,150,80,0.55)", fontVariantNumeric: "tabular-nums" }}>
      {f.text}
    </div>
  );
};

// 스피커 아래 이름표: 이 막에서 답하는 모델. 기다림이 있었으면 그만큼 늦게 말했다고 붙인다
const SpeakerTag: React.FC<{ tl: Timeline; ms: number; g: Geo }> = ({ tl, ms, g }) => {
  const act = actAt(tl, ms);
  if (!act.info) return null;
  const op = Math.min(prog(ms, act.t0, 400), 1 - prog(ms, act.t1 - 1, 300));
  const waited = tl.clocks.filter((c) => c.t0 >= act.t0 && c.t1 <= ms && c.t0 < act.t1).pop();
  const t = g.speakerTag;
  return (
    <div style={{ position: "absolute", left: t.x - 300, top: t.y, width: 600, textAlign: "center", opacity: op, zIndex: 5 }}>
      <span style={{ display: "inline-block", background: "rgba(10,11,13,0.82)", border: `1.5px solid ${C.line}`, borderRadius: 8, padding: "4px 12px", fontSize: t.size, lineHeight: 1.35 }}>
        <span style={{ color: C.muted }}>비서 · </span>{act.info.reply}
        {waited ? <span style={{ display: "block", color: "#ff7b7b", fontWeight: 600 }}>{waited.label} 늦게 말함</span> : null}
      </span>
    </div>
  );
};

// 막마다 위 캡션과 아래 정보 띠. 재생 중인 곡은 캡션 아래에 작게
const Captions: React.FC<{ tl: Timeline; ms: number; sc: Scene; g: Geo }> = ({ tl, ms, sc, g }) => {
  const s = ms / 1000;
  return (
    <>
      {tl.acts.map((a, i) => {
        const op = Math.min(prog(ms, a.t0, 400), 1 - prog(ms, a.t1 - 1, 300));
        if (op <= 0) return null;
        return (
          <React.Fragment key={i}>
            <div style={{ position: "absolute", left: g.caption.left, right: g.caption.right, top: g.caption.top, fontSize: g.caption.size, lineHeight: 1.3, fontWeight: 700, opacity: op, zIndex: 9, textShadow: "0 2px 12px rgba(0,0,0,0.6)" }}>{a.caption}</div>
            {a.info ? <InfoBand info={a.info} src={a.src} g={g} op={op} /> : null}
          </React.Fragment>
        );
      })}
      {sc.music ? (
        <div style={{ position: "absolute", left: g.nowPlaying.left, top: g.layout === "wide" ? g.nowPlaying.top : g.nowPlaying.top, display: "flex", alignItems: "center", gap: 12, fontSize: g.nowPlaying.size, color: C.muted, zIndex: 9, opacity: calmed(tl, ms) ? 0.4 : 1, textShadow: "0 2px 8px rgba(0,0,0,0.8)" }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 22 }}>
            {[0.9, 0.55, 0.75].map((h, i) => {
              const beat = calmed(tl, ms) ? 0 : Math.abs(Math.sin((s * sc.music!.bpm / 60 + i * 0.33) * Math.PI));
              return <div key={i} style={{ width: 5, height: 6 + 16 * h * beat, background: C.orange, borderRadius: 1 }} />;
            })}
          </div>
          <span>재생 중 · {sc.music.track} · {sc.music.genre} {sc.music.bpm} BPM</span>
        </div>
      ) : null}
    </>
  );
};

// 정보 띠: 계산 시점, 응답 모델, 도우미 모델, 방법이 하는 일, 이 조건의 정확도·첫 소리, 출처
const InfoBand: React.FC<{ info: ActInfo; src?: string; g: Geo; op: number }> = ({ info, src, g, op }) => {
  const f = g.info.font, sm = g.info.small;
  const label = (t: string) => <span style={{ color: C.muted, fontSize: sm, marginRight: 8 }}>{t}</span>;
  const nums: string[] = [];
  if (info.acc != null) nums.push(info.accBase != null ? `정확도 ${info.accBase.toFixed(1)}% → ${info.acc.toFixed(1)}%` : `정확도 ${info.acc.toFixed(1)}%`);
  if (info.first != null) nums.push(info.firstBase != null ? `첫 소리 ${Math.round(info.firstBase)} → ${Math.round(info.first)}ms` : `첫 소리 ${Math.round(info.first)}ms`);
  const timing = info.timing ? (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, marginRight: 22 }}>
      <i style={{ width: 14, height: 14, borderRadius: 7, background: C.timing[info.timing], display: "inline-block" }} />{label("계산 시점")}{info.timingLabel}
    </span>
  ) : null;
  const row: React.CSSProperties = { fontSize: f, lineHeight: 1.45, whiteSpace: g.info.stack ? "normal" : "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
  return (
    <div data-box="정보 띠" style={{ position: "absolute", left: g.info.left, top: g.info.top, width: g.info.w, opacity: op, zIndex: 9, display: "flex", flexDirection: "column", gap: g.info.stack ? 6 : 4 }}>
      {g.info.stack ? (
        <>
          <div style={row}>{timing}{label("응답")}{info.reply}</div>
          {info.helper ? <div style={row}>{label("도우미")}{info.helper}</div> : null}
        </>
      ) : (
        <div style={row}>{timing}<span style={{ marginRight: 22 }}>{label("응답")}{info.reply}</span>{info.helper ? <span>{label("도우미")}{info.helper}</span> : null}</div>
      )}
      {info.how ? <div style={{ ...row, color: "rgba(240,239,236,0.86)" }}>{label("방법")}{info.how}</div> : null}
      <div style={{ ...row, display: "flex", justifyContent: "space-between", gap: 20, flexWrap: g.info.stack ? "wrap" : "nowrap" }}>
        <span style={{ fontWeight: 600 }}>{nums.map((t, i) => <span key={i} style={{ whiteSpace: "nowrap" }}>{i ? " · " : ""}{t}</span>)}{info.sample ? <span style={{ color: C.muted, fontWeight: 400, fontSize: sm, whiteSpace: "nowrap" }}> · {info.sample}</span> : null}</span>
        <span style={{ color: C.muted, fontSize: sm, alignSelf: "flex-end" }}>{src ? `${src} · ` : ""}그림: Codex 이미지 생성</span>
      </div>
    </div>
  );
};

// 말풍선. wide: 그림 위에 꼬리를 단 말풍선 (사람 = 밝은 종이, 비서 = 어두운 판)
//         tall: 그림 아래 대화창처럼 얼굴(사람)·스피커(비서) 그림을 옆에 붙인 말풍선
const Bubble: React.FC<{ s: Say; ms: number; g: Geo; src: Src }> = ({ s, ms, g, src }) => {
  const isP = s.who === "person";
  const a = Math.min(prog(ms, s.t0, FADE_MS), 1 - prog(ms, s.tEnd, 140)) * (1 - 0.22 * prog(ms, s.dimAt, FADE_MS));
  if (a <= 0) return null;
  const slot = isP ? g.person : g.avatar;
  const p = prog(ms, s.t0, s.t1 - s.t0);
  const chars = [...s.text];
  const n = Math.ceil(chars.length * p);
  const verdict = s.tone ? prog(ms, s.t1, 350) : 0;
  const strike = s.tone === "bad" ? easeOut(prog(ms, s.t1 + 350, 600)) : 0;
  const rise = 1 - easeOut(prog(ms, s.t0, 320));
  const fill = isP ? C.paper : "rgba(16,17,21,0.94)";
  const border = s.tone && verdict > 0 ? (s.tone === "good" ? C.good : C.bad) : isP ? "transparent" : C.line;
  const body = (
    <div data-box={isP ? "사람 말" : "비서 말"} style={{ background: fill, color: isP ? C.paperInk : C.ink, border: `2px solid ${border}`, borderRadius: 30, padding: "20px 28px", fontSize: slot.font, lineHeight: 1.42, fontWeight: isP ? 500 : 400, display: "flex", gap: 14, alignItems: "flex-start", boxShadow: "0 10px 30px rgba(0,0,0,0.35)", minWidth: 0 }}>
      {s.tone ? <Mark kind={s.tone} a={verdict} size={slot.font * 0.9} /> : null}
      <span>
        <span style={{ backgroundImage: `linear-gradient(${C.bad}, ${C.bad})`, backgroundRepeat: "no-repeat", backgroundPosition: "0 60%", backgroundSize: `${strike * 100}% 4px`, WebkitBoxDecorationBreak: "clone", boxDecorationBreak: "clone" }}>{chars.slice(0, n).join("")}</span>
        <span style={{ opacity: 0 }}>{chars.slice(n).join("")}</span>
      </span>
    </div>
  );
  return <Slotted slot={slot} isP={isP} a={a} rise={rise} fill={fill} border={isP ? "none" : border} g={g} src={src}>{body}</Slotted>;
};

// 말풍선 자리: wide 는 꼬리가 말하는 쪽(머리, 스피커)을 가리키고, tall 은 옆에 얼굴·스피커 그림을 붙인다
const Slotted: React.FC<{ slot: Geo["person"]; isP: boolean; a: number; rise: number; fill: string; border: string; g: Geo; src: Src; children: React.ReactNode }> = ({ slot, isP, a, rise, fill, border, g, src, children }) => {
  const pos: React.CSSProperties = {
    position: "absolute", maxWidth: slot.maxW,
    ...(slot.left != null ? { left: slot.left } : { right: g.W - (slot.right ?? 0) }),
    ...(slot.bottom != null ? { bottom: g.H - slot.bottom } : { top: slot.top }),
  };
  if (slot.mode === "tail") {
    const bx = slot.left != null ? slot.left + 64 : (slot.right ?? 0) - 170;
    const by = (slot.bottom ?? 0) - 2;
    return (
      <div style={{ position: "absolute", inset: 0, opacity: a, zIndex: isP ? 7 : 8, transform: `translateY(${rise * 14}px)` }}>
        <svg width={g.W} height={g.H} style={{ position: "absolute", inset: 0 }}>
          <path d={`M ${bx} ${by} L ${slot.tail![0]} ${slot.tail![1]} L ${bx + 44} ${by} Z`} fill={fill} stroke={border} strokeWidth={2} strokeLinejoin="round" />
        </svg>
        <div style={pos}>{children}</div>
      </div>
    );
  }
  const face = <Face src={src(isP ? "stage/icon-person.webp" : "stage/icon-speaker.webp")} size={92} />;
  return (
    <div style={{ position: "absolute", inset: 0, opacity: a, zIndex: isP ? 7 : 8, transform: `translateY(${rise * 14}px)` }}>
      <div style={{ ...pos, display: "flex", gap: 16, alignItems: "flex-start", flexDirection: isP ? "row" : "row-reverse" }}>{face}{children}</div>
    </div>
  );
};

const Face: React.FC<{ src: string; size: number; ring?: string }> = ({ src, size, ring }) => (
  <div style={{ width: size, height: size, borderRadius: size / 2, overflow: "hidden", flex: "none", border: `3px solid ${ring ?? "rgba(255,255,255,0.22)"}` }}>
    <Img src={src} style={{ width: "100%", height: "100%" }} />
  </div>
);

const Mark: React.FC<{ kind: "good" | "bad"; a: number; size: number }> = ({ kind, a, size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ flex: "none", marginTop: 4, opacity: a }}>
    <circle cx="12" cy="12" r="11" fill={kind === "good" ? C.good : C.bad} />
    {kind === "good"
      ? <path d="M6.5 12.5 L10.5 16 L17.5 8.5" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      : <path d="M8 8 L16 16 M16 8 L8 16" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />}
  </svg>
);

// 기다림: 비서 자리에 점 3개가 차례로 깜빡인다. 옆에 지금까지 기다린 시간을 센다
const WaitDots: React.FC<{ c: Timeline["clocks"][number]; ms: number; g: Geo; src: Src }> = ({ c, ms, g, src }) => {
  const a = Math.min(prog(ms, c.t0, 200), 1 - prog(ms, c.t1, 160));
  if (a <= 0) return null;
  const m = c.label.match(/([+-]?)([\d.,]+)\s*(.*)/);
  const val = m ? parseFloat(m[2].replace(/,/g, "")) : 0;
  const dec = m && m[2].includes(".") ? m[2].split(".")[1].length : 0;
  const p = prog(ms, c.t0, c.t1 - c.t0);
  const shown = m ? `${m[1]}${(val * p).toFixed(dec)}${m[3]}` : c.label;
  const font = g.avatar.font;
  const t = ms / 1000;
  const body = (
    <div data-box="기다림" style={{ background: "rgba(16,17,21,0.94)", border: `2px solid ${C.line}`, borderRadius: 30, padding: "18px 26px", display: "flex", alignItems: "center", gap: 22, boxShadow: "0 10px 30px rgba(0,0,0,0.35)" }}>
      <div style={{ display: "flex", gap: font * 0.32 }} aria-label="기다리는 중">
        {[0, 1, 2].map((k) => {
          const phase = (t * 2.2 - k * 0.22) % 1; // 왼쪽부터 차례로 밝아졌다 어두워진다
          const lit = Math.max(0, Math.sin(Math.PI * Math.max(0, Math.min(1, phase * 1.6))));
          return <div key={k} style={{ width: font * 0.52, height: font * 0.52, borderRadius: font, background: C.ink, opacity: 0.25 + 0.75 * lit, transform: `translateY(${-lit * font * 0.14}px)` }} />;
        })}
      </div>
      <div style={{ fontSize: font * 0.62, color: C.muted, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{shown} 기다림</div>
    </div>
  );
  return <Slotted slot={g.avatar} isP={false} a={a} rise={0} fill="rgba(16,17,21,0.94)" border={C.line} g={g} src={src}>{body}</Slotted>;
};

// 생각: 판에 줄이 하나씩. wide 는 꼬리 원이 생각하는 쪽(스피커 고리나 도우미)으로 내려가고, tall 은 제목 옆에 그 그림을 붙인다
const ThoughtPanel: React.FC<{ th: Thought; ms: number; g: Geo; src: Src; kind: string }> = ({ th, ms, g, src, kind }) => {
  const a = life(ms, th.t0, th.tEnd) * (1 - 0.55 * prog(ms, th.dimAt, FADE_MS));
  if (a <= 0) return null;
  const t = g.thought;
  const font = t.font, lh = 1.4, inner = t.w - 56 - (th.bullets ? 26 : 0);
  const lines = th.items.reduce((n, it) => n + Math.max(1, Math.ceil((textEm(it) * font) / inner)), 0);
  const h = 44 + t.title * 1.6 + lines * font * lh + th.items.length * 8;
  const target: [number, number] = th.owner === "helper" ? [g.helper.x + g.helper.r * 0.7, g.helper.y - g.helper.r * 0.7] : [g.ring.x, g.ring.y - 14];
  const from: [number, number] = [t.left + t.w * 0.45, t.top + h + 6];
  const trail = [[0.3, 14], [0.58, 10], [0.82, 6]] as const;
  const picked = prog(ms, th.pickT, 300);
  return (
    <div style={{ position: "absolute", inset: 0, opacity: a, zIndex: 6 }}>
      {t.trail ? (
        <svg width={g.W} height={g.H} style={{ position: "absolute", inset: 0 }}>
          {trail.map(([q, r], i) => <circle key={i} cx={from[0] + (target[0] - from[0]) * q} cy={from[1] + (target[1] - from[1]) * q} r={r} fill={C.panel} stroke={C.line} strokeWidth={2} />)}
        </svg>
      ) : null}
      <div data-box="생각" style={{ position: "absolute", left: t.left, top: t.top, width: t.w, boxSizing: "border-box", background: C.panel, border: `2px solid ${C.line}`, borderRadius: 30, padding: "22px 28px", boxShadow: "0 10px 30px rgba(0,0,0,0.35)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: t.title, color: C.muted, marginBottom: 10 }}>
          {!t.trail ? <Face src={src(th.owner === "helper" ? `stage/helper-${kind}.webp` : "stage/icon-speaker.webp")} size={t.title * 1.6} /> : null}
          <span>{th.title}</span>
        </div>
        {th.items.map((it, i) => {
          const k = prog(ms, th.itemT[i], 280);
          const isPick = th.pick === i;
          const op = k * (th.pick == null ? 1 : isPick ? 1 : 1 - 0.5 * picked);
          return (
            <div key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start", fontSize: font, lineHeight: lh, opacity: op, transform: `translateY(${(1 - k) * 8}px)`, marginTop: i ? 8 : 0, fontWeight: isPick && picked > 0 ? 600 : 400 }}>
              {th.bullets ? <div style={{ flex: "none", width: 12, height: 12, borderRadius: 6, marginTop: font * 0.5, background: isPick && picked > 0 ? C.green : "rgba(240,239,236,0.45)" }} /> : null}
              <div>{it}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// 도우미: 둥근 그림과 이름표(모델). 일하는 동안 초록 테두리가 숨쉰다
const HelperInset: React.FC<{ h: Timeline["helpers"][number]; tl: Timeline; ms: number; g: Geo; src: Src }> = ({ h, tl, ms, g, src }) => {
  const a = life(ms, h.t0, h.tEnd, 450);
  if (a <= 0) return null;
  const { x, y, r, label } = g.helper;
  const busy = inSpan(ms, tl.helperThink) || inSpan(ms, tl.think.filter((s) => s.t0 >= h.t0));
  const pulse = busy ? 0.55 + 0.45 * Math.abs(Math.sin((ms / 1000) * 3)) : 0;
  const sc0 = 0.86 + 0.14 * easeOut(prog(ms, h.t0, 450));
  return (
    <div style={{ position: "absolute", left: x - r, top: y - r, width: r * 2, opacity: a, transform: `scale(${sc0})`, zIndex: 5, textAlign: "center" }}>
      <div data-box="도우미" style={{ width: r * 2, height: r * 2, borderRadius: r, overflow: "hidden", border: `4px solid ${busy ? C.green : "rgba(255,255,255,0.22)"}`, boxShadow: busy ? `0 0 ${24 * pulse}px rgba(43,209,151,${0.6 * pulse})` : "0 10px 30px rgba(0,0,0,0.45)" }}>
        <Img src={src(`stage/helper-${h.kind}.webp`)} style={{ width: "112%", height: "112%", margin: "-6%" }} />
      </div>
      <div style={{ marginTop: 10, fontSize: label, lineHeight: 1.3, fontWeight: 600, color: C.ink, textShadow: "0 2px 10px rgba(0,0,0,0.8)", marginLeft: -40, marginRight: -40 }}>{h.label}</div>
    </div>
  );
};

// 기록 카드: 그림 아래쪽에 쌓인다. 날아가면 스피커로 빨려 들고, 떨어지면 아래로 사라진다
const CardStack: React.FC<{ cs: Cards; ms: number; g: Geo }> = ({ cs, ms, g }) => {
  const a = life(ms, cs.t0, cs.tEnd);
  if (a <= 0) return null;
  const n = cs.items.length, cols = cs.cols;
  const cw = cols === 1 ? g.cards.w1 : g.cards.w2, gap = 10, font = cols === 1 ? g.cards.f1 : g.cards.f2;
  const twoLine = cs.items.map((c) => cols === 1 && textEm(c.text) * font > cw - 40);
  const rows: number[] = [];
  cs.items.forEach((_, i) => { const r = Math.floor(i / cols); rows[r] = Math.max(rows[r] ?? 0, Math.round(font * (twoLine[i] ? 3.3 : 2))); });
  const total = rows.reduce((s, h) => s + h, 0) + gap * (rows.length - 1);
  const top0 = g.cards.bottom - total;
  const left0 = g.cards.cx - (cols * cw + (cols - 1) * gap) / 2;
  return (
    <div style={{ position: "absolute", inset: 0, opacity: a, zIndex: 4 }}>
      {cs.items.map((c, i) => {
        const r = Math.floor(i / cols), col = i % cols;
        const x = left0 + col * (cw + gap), y = top0 + rows.slice(0, r).reduce((s, h) => s + h + gap, 0);
        const k = easeOut(prog(ms, cs.t0 + (cs.ms * i) / Math.max(1, n), 300));
        const fly = easeOut(prog(ms, cs.flyT + i * 40, 700));
        const drop = c.drop ? easeOut(prog(ms, cs.dropT, 650)) : 0;
        const kept = !c.drop && cs.dropT < Number.POSITIVE_INFINITY ? prog(ms, cs.dropT, 400) : 0;
        const dx = (g.ring.x - (x + cw / 2)) * fly, dy = (g.ring.y - (y + 26)) * fly;
        return (
          <div key={i} data-box={`카드${i}`} style={{ position: "absolute", left: x, top: y, width: cw, height: rows[r], boxSizing: "border-box", padding: "8px 18px", display: "flex", alignItems: "center", background: "rgba(16,17,21,0.93)", border: `2px solid ${kept ? C.green : c.hot ? "rgba(240,239,236,0.75)" : C.line}`, borderRadius: 12, fontSize: font, lineHeight: 1.35, color: c.hot ? C.ink : C.muted, fontWeight: c.hot ? 600 : 400, opacity: k * (1 - fly) * (1 - drop), transform: `translate(${dx}px, ${dy + (1 - k) * 16 + drop * 150}px) scale(${1 - 0.7 * fly}) rotate(${drop * (i % 2 ? 6 : -5)}deg)`, overflow: "hidden" }}>
            {c.text}
          </div>
        );
      })}
    </div>
  );
};

// 온도 다이얼: 0.5~1 반원 눈금, 바늘이 from 에서 to 로. 스피커 왼쪽에 놓는다
const TempDial: React.FC<{ d: Timeline["dials"][number]; ms: number; g: Geo; sc: Scene }> = ({ d, ms, g, sc }) => {
  const a = life(ms, d.t0, d.tEnd);
  if (a <= 0) return null;
  const v = d.from + (d.to - d.from) * easeOut(prog(ms, d.t0 + 200, 1200));
  const ang = Math.PI * (1 - (v - 0.5) / 0.5); // 0.5 = 왼쪽, 1 = 오른쪽
  const R = 64;
  const [px, py] = g.pt(sc.clock.right, sc.clock.top - 40);
  return (
    <div data-box="온도" style={{ position: "absolute", right: g.W - px, top: py, opacity: a, zIndex: 7, transformOrigin: "top right", transform: `scale(${Math.max(g.img.s, 0.85)})`, background: C.panel, border: `2px solid ${C.line}`, borderRadius: 18, padding: "12px 20px", textAlign: "center" }}>
      <svg width={2 * R + 24} height={R + 22} viewBox={`${-R - 12} ${-R - 10} ${2 * R + 24} ${R + 22}`}>
        <path d={`M ${-R} 0 A ${R} ${R} 0 0 1 ${R} 0`} fill="none" stroke="rgba(240,239,236,0.35)" strokeWidth="8" strokeLinecap="round" />
        <line x1="0" y1="0" x2={Math.cos(ang) * (R - 8)} y2={-Math.sin(ang) * (R - 8)} stroke={C.ink} strokeWidth="4" strokeLinecap="round" />
        <circle cx="0" cy="0" r="6" fill={C.ink} />
      </svg>
      <div style={{ fontSize: 30, fontWeight: 700 }}>온도 {v.toFixed(2)}</div>
      <div style={{ fontSize: 24, color: C.muted }}>{d.from} → {d.to}</div>
    </div>
  );
};
