// 대화 무대: Codex 로 만든 방 그림 위에 말풍선, 생각, 기록 카드, 도우미, 기다림 초시계를 시간표대로 올린다.
import React, { useMemo } from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Act, buildTimeline, Cards, easeOut, FADE_MS, inSpan, life, Pose, prog, Say, Thought, Timeline } from "./timeline";
import { H, Scene, SCENES, W } from "./scenes";

export type StageProps = { scene: Scene["id"]; acts: Act[]; assetBase?: string };

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
};

export const stageDuration = (acts: Act[], fps: number) => Math.ceil((buildTimeline(acts).end / 1000) * fps);

// 글 폭 어림: 한글·한자는 1em, 나머지 0.58em, 빈칸 0.3em (말풍선·카드 줄 수를 정할 때만 쓴다)
const textEm = (s: string) => [...s].reduce((n, ch) => n + (ch === " " ? 0.3 : /[ㄱ-힣一-鿿]/.test(ch) ? 1 : 0.58), 0);

export const Stage: React.FC<StageProps> = ({ scene, acts, assetBase }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ms = (frame / fps) * 1000;
  const tl = useMemo(() => buildTimeline(acts), [acts]);
  const sc = SCENES[scene];
  const src = (name: string) => (assetBase != null ? `${assetBase}${name}` : staticFile(name));
  return (
    <AbsoluteFill style={{ backgroundColor: "#16171a", fontFamily: FONT, color: C.ink, overflow: "hidden", wordBreak: "keep-all", overflowWrap: "anywhere" }}>
      <Poses tl={tl} ms={ms} sc={sc} src={src} />
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0, zIndex: 3 }}>
        <defs>
          <filter id="glow" x="-50%" y="-200%" width="200%" height="500%"><feGaussianBlur stdDeviation="7" /></filter>
        </defs>
        {sc.music ? <Waves tl={tl} ms={ms} sc={sc} /> : null}
        <Ring tl={tl} ms={ms} sc={sc} />
      </svg>
      {sc.clockFace ? <ClockFace sc={sc} /> : null}
      <Shade />
      {tl.helpers.map((h, i) => <HelperInset key={i} h={h} tl={tl} ms={ms} sc={sc} src={src} />)}
      {tl.cards.map((c, i) => <CardStack key={i} cs={c} ms={ms} sc={sc} />)}
      {tl.thoughts.map((t, i) => <ThoughtPanel key={i} th={t} ms={ms} sc={sc} />)}
      {tl.clocks.map((c, i) => <WaitClock key={i} c={c} ms={ms} sc={sc} />)}
      {tl.dials.map((d, i) => <TempDial key={i} d={d} ms={ms} sc={sc} />)}
      {tl.says.map((s, i) => <Bubble key={i} s={s} ms={ms} sc={sc} />)}
      <Captions tl={tl} ms={ms} sc={sc} />
    </AbsoluteFill>
  );
};

// 자세 그림 4장: 바뀔 때 450ms 동안 겹쳐 바꾼다. 그림 오른쪽 절반은 4장 모두 같은 픽셀이다
const POSES: Pose[] = ["neutral", "say", "wait", "relief"];
const Poses: React.FC<{ tl: Timeline; ms: number; sc: Scene; src: (n: string) => string }> = ({ tl, ms, sc, src }) => {
  let cur = 0;
  tl.poses.forEach((p, i) => { if (p.t <= ms) cur = i; });
  const now = tl.poses[cur], before = tl.poses[Math.max(0, cur - 1)];
  const a = now.pose === before.pose ? 1 : prog(ms, now.t, 450);
  return (
    <>
      {POSES.map((p) => {
        const op = p === now.pose ? a : p === before.pose ? 1 : 0;
        const z = p === now.pose ? 2 : 1;
        return <Img key={p} src={src(`stage/${sc.id}-${p}.webp`)} style={{ position: "absolute", inset: 0, width: W, height: H, opacity: op, zIndex: z }} />;
      })}
    </>
  );
};

// 위아래 글자 자리를 어둡게 눌러 캡션이 읽히게 한다
const Shade: React.FC = () => (
  <>
    <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 170, background: "linear-gradient(rgba(10,11,13,0.72), rgba(10,11,13,0))", zIndex: 3 }} />
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 120, background: "linear-gradient(rgba(10,11,13,0), rgba(10,11,13,0.7))", zIndex: 3 }} />
  </>
);

// 스피커 빛 고리: 음악 = 박자에 맞춰 주황, 생각·기다림 = 초록 점이 돎, 말함 = 하얗게 떨림
const Ring: React.FC<{ tl: Timeline; ms: number; sc: Scene }> = ({ tl, ms, sc }) => {
  const { x, y, rx, ry } = sc.ring;
  const s = ms / 1000;
  let color = "", a = 0;
  if (inSpan(ms, tl.speak)) { color = "#ffffff"; a = 0.55 + 0.45 * Math.abs(Math.sin(s * 9)); }
  else if (inSpan(ms, tl.think)) { color = "#2bd197"; a = 0.95; }
  else if (sc.music && !calmed(tl, ms)) { const beat = (s % (60 / sc.music.bpm)) / (60 / sc.music.bpm); color = "#ff7a3d"; a = 0.35 + 0.65 * (1 - beat); }
  if (!color) return null;
  const ang = s * 4.5;
  return (
    <g>
      <ellipse cx={x} cy={y} rx={rx} ry={ry} fill="none" stroke={color} strokeWidth={10} opacity={a * 0.8} filter="url(#glow)" />
      <ellipse cx={x} cy={y} rx={rx} ry={ry} fill="none" stroke={color} strokeWidth={3.5} opacity={a} />
      {color === "#2bd197" ? <circle cx={x + Math.cos(ang) * rx} cy={y + Math.sin(ang) * ry} r={6} fill="#ffffff" /> : null}
    </g>
  );
};

const calmT = (tl: Timeline, ms: number) => {
  const act = tl.acts.find((a) => ms >= a.t0 && ms < a.t1) ?? tl.acts[tl.acts.length - 1];
  return tl.calm.find((t) => t >= act.t0 && t < act.t1) ?? Number.POSITIVE_INFINITY;
};
const calmed = (tl: Timeline, ms: number) => ms >= calmT(tl, ms);

// 헤비메탈 음파: 스피커에서 왼쪽 위 빈 벽으로 퍼지는 톱니 고리. 맞는 답이 끝나면 잦아든다
const Waves: React.FC<{ tl: Timeline; ms: number; sc: Scene }> = ({ tl, ms, sc }) => {
  const bpm = sc.music!.bpm;
  const ct = calmT(tl, ms);
  const fade = 1 - prog(ms, ct, 1400);
  if (fade <= 0) return null;
  const cx = sc.ring.x, cy = sc.ring.y + 70;
  const phase = ((ms / 1000) * (bpm / 60) / 2) % 1; // 두 박자마다 고리 하나
  const rings = [0, 1, 2, 3].map((k) => {
    const q = (k + phase) / 4;
    const r = 110 + q * 330;
    const pts: string[] = [];
    for (let i = 0; i <= 26; i += 1) {
      const ang = ((198 + i * (64 / 26)) * Math.PI) / 180;
      const rr = r + (i % 2 ? 9 : -9);
      pts.push(`${(cx + Math.cos(ang) * rr).toFixed(1)},${(cy + Math.sin(ang) * rr * 0.82).toFixed(1)}`);
    }
    return <polyline key={k} points={pts.join(" ")} fill="none" stroke={C.orange} strokeWidth={3} strokeLinejoin="round" opacity={0.55 * (1 - q) * fade} />;
  });
  return <g>{rings}</g>;
};

// 그림 속 탁상시계 화면에 시각을 띄운다
const ClockFace: React.FC<{ sc: Scene }> = ({ sc }) => {
  const f = sc.clockFace!;
  return (
    <div style={{ position: "absolute", left: f.x - 70, top: f.y - 26, width: 140, height: 52, zIndex: 3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 38, fontWeight: 600, letterSpacing: 2, color: "rgba(255,206,160,0.92)", textShadow: "0 0 14px rgba(255,150,80,0.55)", fontVariantNumeric: "tabular-nums" }}>
      {f.text}
    </div>
  );
};

// 막마다 위 캡션과 아래 출처. 재생 중인 곡은 캡션 아래에 작게
const Captions: React.FC<{ tl: Timeline; ms: number; sc: Scene }> = ({ tl, ms, sc }) => {
  const s = ms / 1000;
  return (
    <>
      {tl.acts.map((a, i) => {
        const op = Math.min(prog(ms, a.t0, 400), 1 - prog(ms, a.t1 - 1, 300));
        return (
          <React.Fragment key={i}>
            <div style={{ position: "absolute", left: 60, top: 44, fontSize: 42, fontWeight: 700, opacity: op, zIndex: 9, textShadow: "0 2px 12px rgba(0,0,0,0.6)" }}>{a.caption}</div>
            {a.src ? <div style={{ position: "absolute", left: 60, bottom: 30, fontSize: 24, color: C.muted, opacity: op * prog(ms, a.t1 - 2600, 400), zIndex: 9 }}>{a.src}</div> : null}
          </React.Fragment>
        );
      })}
      {sc.music ? (
        <div style={{ position: "absolute", left: 60, top: 104, display: "flex", alignItems: "center", gap: 12, fontSize: 26, color: C.muted, zIndex: 9, opacity: calmed(tl, ms) ? 0.4 : 1 }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 22 }}>
            {[0.9, 0.55, 0.75].map((h, i) => {
              const beat = calmed(tl, ms) ? 0 : Math.abs(Math.sin((s * sc.music!.bpm / 60 + i * 0.33) * Math.PI));
              return <div key={i} style={{ width: 5, height: 6 + 16 * h * beat, background: C.orange, borderRadius: 1 }} />;
            })}
          </div>
          <span>재생 중 · {sc.music.track} · {sc.music.genre} {sc.music.bpm} BPM</span>
        </div>
      ) : null}
      <div style={{ position: "absolute", right: 48, bottom: 30, fontSize: 20, color: "rgba(240,239,236,0.45)", zIndex: 9 }}>그림: Codex 이미지 생성</div>
    </>
  );
};

// 말풍선. 사람 = 밝은 종이, 비서 = 어두운 판. 꼬리는 말하는 쪽(머리, 스피커)을 가리킨다
const Bubble: React.FC<{ s: Say; ms: number; sc: Scene }> = ({ s, ms, sc }) => {
  const isP = s.who === "person";
  // 비서가 답하면 사람 말은 조금만 물러난다 (밝은 말풍선은 많이 흐리면 회색 덩어리가 된다)
  // 같은 쪽이 이어 말하면 앞 말풍선은 빨리 빠진다 (같은 자리에서 겹쳐 보이지 않게)
  const a = Math.min(prog(ms, s.t0, FADE_MS), 1 - prog(ms, s.tEnd, 140)) * (1 - 0.22 * prog(ms, s.dimAt, FADE_MS));
  if (a <= 0) return null;
  const g = isP ? sc.person : sc.avatar;
  const p = prog(ms, s.t0, s.t1 - s.t0);
  const chars = [...s.text];
  const n = Math.ceil(chars.length * p);
  const verdict = s.tone ? prog(ms, s.t1, 350) : 0;
  const strike = s.tone === "bad" ? easeOut(prog(ms, s.t1 + 350, 600)) : 0;
  const rise = 1 - easeOut(prog(ms, s.t0, 320));
  const font = isP ? 38 : 36;
  // 꼬리 밑변: 말풍선 아래 가장자리, 고정된 모서리에서 조금 안쪽
  const bx = isP ? sc.person.left + 64 : sc.avatar.right - 170;
  const by = g.bottom - 2;
  const fill = isP ? C.paper : "rgba(16,17,21,0.94)";
  const border = s.tone && verdict > 0 ? (s.tone === "good" ? C.good : C.bad) : isP ? "transparent" : C.line;
  const pos: React.CSSProperties = isP ? { left: sc.person.left, bottom: H - sc.person.bottom } : { right: W - sc.avatar.right, bottom: H - sc.avatar.bottom };
  return (
    <div style={{ position: "absolute", inset: 0, opacity: a, zIndex: isP ? 7 : 8, transform: `translateY(${rise * 14}px)` }}>
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        <path d={`M ${bx} ${by} L ${g.tail[0]} ${g.tail[1]} L ${bx + 44} ${by} Z`} fill={fill} stroke={isP ? "none" : border} strokeWidth={2} strokeLinejoin="round" />
      </svg>
      <div data-box={isP ? "사람 말" : "비서 말"} style={{ position: "absolute", ...pos, maxWidth: g.maxW, background: fill, color: isP ? C.paperInk : C.ink, border: `2px solid ${border}`, borderRadius: 30, padding: "20px 28px", fontSize: font, lineHeight: 1.42, fontWeight: isP ? 500 : 400, display: "flex", gap: 14, alignItems: "flex-start", boxShadow: "0 10px 30px rgba(0,0,0,0.35)" }}>
        {s.tone ? <Mark kind={s.tone} a={verdict} size={font * 0.9} /> : null}
        <span>
          <span style={{ backgroundImage: `linear-gradient(${C.bad}, ${C.bad})`, backgroundRepeat: "no-repeat", backgroundPosition: "0 60%", backgroundSize: `${strike * 100}% 4px`, WebkitBoxDecorationBreak: "clone", boxDecorationBreak: "clone" }}>{chars.slice(0, n).join("")}</span>
          <span style={{ opacity: 0 }}>{chars.slice(n).join("")}</span>
        </span>
      </div>
    </div>
  );
};

const Mark: React.FC<{ kind: "good" | "bad"; a: number; size: number }> = ({ kind, a, size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ flex: "none", marginTop: 4, opacity: a }}>
    <circle cx="12" cy="12" r="11" fill={kind === "good" ? C.good : C.bad} />
    {kind === "good"
      ? <path d="M6.5 12.5 L10.5 16 L17.5 8.5" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      : <path d="M8 8 L16 16 M16 8 L8 16" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />}
  </svg>
);

// 생각: 오른쪽 위 판에 줄이 하나씩. 꼬리 원 세 개가 생각하는 쪽(스피커 고리나 도우미)으로 내려간다
const ThoughtPanel: React.FC<{ th: Thought; ms: number; sc: Scene }> = ({ th, ms, sc }) => {
  const a = life(ms, th.t0, th.tEnd) * (1 - 0.55 * prog(ms, th.dimAt, FADE_MS));
  if (a <= 0) return null;
  const g = sc.thought;
  const font = 30, lh = 1.4, inner = g.w - 56 - (th.bullets ? 26 : 0);
  const lines = 1 + th.items.reduce((n, it) => n + Math.max(1, Math.ceil((textEm(it) * font) / inner)), 0);
  const h = 44 + 40 + lines * font * lh - font * lh + th.items.length * 8;
  const left = g.right - g.w, bottom = g.top + h;
  const target: [number, number] = th.owner === "helper" ? [sc.helper.x + sc.helper.r * 0.7, sc.helper.y - sc.helper.r * 0.7] : [sc.ring.x, sc.ring.y - 14];
  const from: [number, number] = [left + g.w * 0.45, bottom + 6];
  const trail = [[0.3, 14], [0.58, 10], [0.82, 6]] as const;
  const picked = prog(ms, th.pickT, 300);
  return (
    <div style={{ position: "absolute", inset: 0, opacity: a, zIndex: 6 }}>
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        {trail.map(([q, r], i) => (
          <circle key={i} cx={from[0] + (target[0] - from[0]) * q} cy={from[1] + (target[1] - from[1]) * q} r={r} fill={C.panel} stroke={C.line} strokeWidth={2} />
        ))}
      </svg>
      <div data-box="생각" style={{ position: "absolute", left, top: g.top, width: g.w, background: C.panel, border: `2px solid ${C.line}`, borderRadius: 30, padding: "22px 28px", boxShadow: "0 10px 30px rgba(0,0,0,0.35)" }}>
        <div style={{ fontSize: 26, color: C.muted, marginBottom: 10 }}>{th.title}</div>
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

// 도우미: 둥근 그림. 일하는 동안 초록 테두리가 숨쉰다
const HelperInset: React.FC<{ h: Timeline["helpers"][number]; tl: Timeline; ms: number; sc: Scene; src: (n: string) => string }> = ({ h, tl, ms, sc, src }) => {
  const a = life(ms, h.t0, h.tEnd, 450);
  if (a <= 0) return null;
  const { x, y, r } = sc.helper;
  const busy = inSpan(ms, tl.helperThink) || inSpan(ms, tl.think.filter((s) => s.t0 >= h.t0));
  const pulse = busy ? 0.55 + 0.45 * Math.abs(Math.sin((ms / 1000) * 3)) : 0;
  const sc0 = 0.86 + 0.14 * easeOut(prog(ms, h.t0, 450));
  return (
    <div style={{ position: "absolute", left: x - r, top: y - r, width: r * 2, opacity: a, transform: `scale(${sc0})`, zIndex: 5, textAlign: "center" }}>
      <div data-box="도우미" style={{ width: r * 2, height: r * 2, borderRadius: r, overflow: "hidden", border: `4px solid ${busy ? C.green : "rgba(255,255,255,0.22)"}`, boxShadow: busy ? `0 0 ${24 * pulse}px rgba(43,209,151,${0.6 * pulse})` : "0 10px 30px rgba(0,0,0,0.45)" }}>
        <Img src={src(`stage/helper-${h.kind}.webp`)} style={{ width: "112%", height: "112%", margin: "-6%" }} />
      </div>
      <div style={{ marginTop: 10, fontSize: 26, lineHeight: 1.3, fontWeight: 600, color: C.ink, textShadow: "0 2px 10px rgba(0,0,0,0.8)", marginLeft: -30, marginRight: -30 }}>{h.label}</div>
    </div>
  );
};

// 기록 카드: 아래 가운데에 쌓인다. 날아가면 스피커로 빨려 들고, 떨어지면 아래로 사라진다
const CardStack: React.FC<{ cs: Cards; ms: number; sc: Scene }> = ({ cs, ms, sc }) => {
  const a = life(ms, cs.t0, cs.tEnd);
  if (a <= 0) return null;
  const n = cs.items.length, cols = cs.cols;
  const cw = cols === 1 ? 800 : 500, gap = 10, font = cols === 1 ? 28 : 25;
  const twoLine = cs.items.map((c) => cols === 1 && textEm(c.text) * font > cw - 40);
  const rows: number[] = [];
  cs.items.forEach((_, i) => { const r = Math.floor(i / cols); rows[r] = Math.max(rows[r] ?? 0, twoLine[i] ? 92 : 56); });
  const total = rows.reduce((s, h) => s + h, 0) + gap * (rows.length - 1);
  const top0 = sc.cards.bottom - total;
  const left0 = sc.cards.cx - (cols * cw + (cols - 1) * gap) / 2;
  return (
    <div style={{ position: "absolute", inset: 0, opacity: a, zIndex: 4 }}>
      {cs.items.map((c, i) => {
        const r = Math.floor(i / cols), col = i % cols;
        const x = left0 + col * (cw + gap), y = top0 + rows.slice(0, r).reduce((s, h) => s + h + gap, 0);
        const k = easeOut(prog(ms, cs.t0 + (cs.ms * i) / Math.max(1, n), 300));
        const fly = easeOut(prog(ms, cs.flyT + i * 40, 700));
        const drop = c.drop ? easeOut(prog(ms, cs.dropT, 650)) : 0;
        const kept = !c.drop && cs.dropT < Number.POSITIVE_INFINITY ? prog(ms, cs.dropT, 400) : 0;
        const dx = (sc.ring.x - (x + cw / 2)) * fly, dy = (sc.ring.y - (y + 26)) * fly;
        return (
          <div key={i} data-box={`카드${i}`} style={{ position: "absolute", left: x, top: y, width: cw, height: rows[r], boxSizing: "border-box", padding: "10px 18px", display: "flex", alignItems: "center", background: "rgba(16,17,21,0.93)", border: `2px solid ${kept ? C.green : c.hot ? "rgba(240,239,236,0.75)" : C.line}`, borderRadius: 12, fontSize: font, lineHeight: 1.35, color: c.hot ? C.ink : C.muted, fontWeight: c.hot ? 600 : 400, opacity: k * (1 - fly) * (1 - drop), transform: `translate(${dx}px, ${dy + (1 - k) * 16 + drop * 150}px) scale(${1 - 0.7 * fly}) rotate(${drop * (i % 2 ? 6 : -5)}deg)`, overflow: "hidden" }}>
            {c.text}
          </div>
        );
      })}
    </div>
  );
};

// 기다림 초시계: 라벨의 숫자까지 센다. 다 세면 빨갛게 (첫 소리가 늦어진 만큼)
const WaitClock: React.FC<{ c: Timeline["clocks"][number]; ms: number; sc: Scene }> = ({ c, ms, sc }) => {
  const a = life(ms, c.t0, c.tEnd);
  if (a <= 0) return null;
  const m = c.label.match(/([+-]?)([\d.,]+)\s*(.*)/);
  const val = m ? parseFloat(m[2].replace(/,/g, "")) : 0;
  const dec = m && m[2].includes(".") ? m[2].split(".")[1].length : 0;
  const p = prog(ms, c.t0, c.t1 - c.t0);
  const done = p >= 1;
  const shown = m ? `${m[1]}${(val * p).toFixed(dec)}${m[3]}` : c.label;
  const ang = p * Math.PI * 2;
  return (
    <div data-box="초시계" style={{ position: "absolute", right: W - sc.clock.right, top: sc.clock.top, opacity: a, zIndex: 7, display: "flex", alignItems: "center", gap: 14, background: C.panel, border: `2px solid ${done ? C.bad : C.line}`, borderRadius: 18, padding: "10px 18px" }}>
      <svg width={44} height={44} viewBox="0 0 44 44">
        <circle cx="22" cy="24" r="17" fill="none" stroke="rgba(240,239,236,0.5)" strokeWidth="3" />
        <path d={`M22 24 L ${22 + Math.sin(ang) * 13} ${24 - Math.cos(ang) * 13}`} stroke={done ? C.bad : C.ink} strokeWidth="3" strokeLinecap="round" />
        <rect x="18" y="2" width="8" height="5" rx="1.5" fill="rgba(240,239,236,0.5)" />
      </svg>
      <div>
        <div style={{ fontSize: 46, fontWeight: 700, color: done ? "#ff6b6b" : C.ink, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>{shown}</div>
        <div style={{ fontSize: 24, color: C.muted }}>첫 소리까지 더 기다림</div>
      </div>
    </div>
  );
};

// 온도 다이얼: 0.5~1 반원 눈금, 바늘이 from 에서 to 로
const TempDial: React.FC<{ d: Timeline["dials"][number]; ms: number; sc: Scene }> = ({ d, ms, sc }) => {
  const a = life(ms, d.t0, d.tEnd);
  if (a <= 0) return null;
  const v = d.from + (d.to - d.from) * easeOut(prog(ms, d.t0 + 200, 1200));
  const ang = Math.PI * (1 - (v - 0.5) / 0.5); // 0.5 = 왼쪽, 1 = 오른쪽
  const R = 64;
  return (
    <div data-box="온도" style={{ position: "absolute", right: W - sc.clock.right, top: sc.clock.top - 40, opacity: a, zIndex: 7, background: C.panel, border: `2px solid ${C.line}`, borderRadius: 18, padding: "12px 20px", textAlign: "center" }}>
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
