// 언제 계산하나: 한 번의 대화 턴을 줄마다 그린다. [말하기 전 | 사용자가 말함 | 첫 소리까지 기다림 → 비서가 말함]
// '미리' 계산하는 방법은 도우미가 왼쪽 칸에서 일하고 기다림은 그대로, '답하기 전에' 계산하면 기다림 막대가 늘어난다.
import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { easeOut, prog } from "../stage/timeline";
import { FONT } from "../stage/Stage";

export type TurnRow = { label: string; timing: "during" | "before" | "ahead"; ms: number; chip?: "upper" | "checklist" | "effort" | "subagent" };
export type TurnProps = { rows: TurnRow[]; timingLabels: Record<TurnRow["timing"], string>; assetBase?: string };

export const TW = 1536, TH = 940;
const COLOR = { during: "#3987e5", before: "#d95926", ahead: "#199e70" };
const INK = "#f0efec", MUTED = "rgba(240,239,236,0.62)", LINE = "rgba(255,255,255,0.14)";
const X = { track: 380, speak: 540, wait: 790, end: 1340 };
const MAX_MS = 5000;
const ROW0 = 130, ROW_H = 158;

// 줄마다 등장, 칩, 막대가 자라는 시각 (예전 캔버스 장면과 같은 순서와 길이)
export function turnTimes(rows: TurnRow[]) {
  let t = 300;
  const out = rows.map((r) => {
    const t0 = t;
    t += 400;
    const chipT = t;
    if (r.chip) t += 500;
    const growT = t, growMs = Math.min(1600, 500 + r.ms / 4);
    t += growMs + 350;
    return { t0, chipT, growT, growMs };
  });
  return { rows: out, end: t + 2200 };
}
export const turnDuration = (rows: TurnRow[], fps: number) => Math.ceil((turnTimes(rows).end / 1000) * fps);

const fmt = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}초` : `${Math.round(ms)}ms`);

export const Turn: React.FC<TurnProps> = ({ rows, timingLabels, assetBase }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ms = (frame / fps) * 1000;
  const src = (n: string) => (assetBase != null ? `${assetBase}${n}` : staticFile(n));
  const T = turnTimes(rows);
  const scale = (X.end - X.wait) / MAX_MS;
  return (
    <AbsoluteFill style={{ backgroundColor: "#16171a", fontFamily: FONT, color: INK, wordBreak: "keep-all" }}>
      {/* 칸 이름과 경계 */}
      {[["말하기 전", X.track], ["사용자가 말함", X.speak], ["첫 소리까지 기다림 →", X.wait]].map(([t, x]) => (
        <div key={String(t)} style={{ position: "absolute", left: Number(x) + 14, top: 48, fontSize: 26, color: MUTED }}>{t}</div>
      ))}
      <svg width={TW} height={TH} style={{ position: "absolute", inset: 0 }}>
        {[X.track, X.speak, X.wait].map((x) => <line key={x} x1={x} x2={x} y1={40} y2={TH - 30} stroke={LINE} strokeWidth={2} strokeDasharray="6 8" />)}
      </svg>
      {rows.map((r, i) => {
        const tt = T.rows[i];
        const y = ROW0 + i * ROW_H, mid = y + 70;
        const a = easeOut(prog(ms, tt.t0, 400));
        const chip = easeOut(prog(ms, tt.chipT, 500));
        const g = easeOut(prog(ms, tt.growT, tt.growMs));
        const done = prog(ms, tt.growT + tt.growMs, 300);
        const barEnd = X.wait + r.ms * scale * g;
        const col = COLOR[r.timing];
        const speaking = ms >= tt.t0 && ms < tt.growT; // 사용자가 말하는 동안 파형이 움직인다
        const s = ms / 1000;
        return (
          <div key={i} style={{ position: "absolute", inset: 0, opacity: a }}>
            {/* 왼쪽: 방법 이름과 계산 시점 */}
            <div style={{ position: "absolute", left: 48, top: mid - 40, width: X.track - 70 }}>
              <div style={{ fontSize: 32, fontWeight: 700 }}>{r.label}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6, fontSize: 24, color: MUTED }}>
                <span style={{ width: 14, height: 14, borderRadius: 7, background: col, display: "inline-block" }} />{timingLabels[r.timing]}
              </div>
            </div>
            <svg width={TW} height={TH} style={{ position: "absolute", inset: 0 }}>
              <line x1={X.track} x2={X.end + 140} y1={mid} y2={mid} stroke={LINE} strokeWidth={2} />
              {/* 사용자의 말: 파형 */}
              {Array.from({ length: 9 }).map((_, k) => {
                const h = speaking ? 10 + 26 * Math.abs(Math.sin(s * 9 + k * 0.9)) : 8 + 10 * Math.abs(Math.sin(k * 1.7));
                return <rect key={k} x={X.speak + 112 + k * 13} y={mid - h / 2} width={6} height={h} rx={3} fill="rgba(240,239,236,0.55)" />;
              })}
              {/* 기다림 막대 */}
              <rect x={X.wait} y={mid - 11} width={Math.max(0, barEnd - X.wait)} height={22} rx={11} fill={col} />
            </svg>
            <Face src={src("stage/icon-person.webp")} x={X.speak + 62} y={mid} r={46} />
            {/* 기다림 시간 */}
            <div style={{ position: "absolute", left: barEnd - 4, top: mid - 62, transform: "translateX(-100%)", fontSize: 30, fontWeight: 700, fontVariantNumeric: "tabular-nums", opacity: g > 0 ? 1 : 0, whiteSpace: "nowrap" }}>{fmt(r.ms * g)}</div>
            {/* 첫 소리: 막대 끝의 스피커 */}
            <div style={{ position: "absolute", left: barEnd + 18, top: mid - 46, opacity: done, display: "flex", alignItems: "center", gap: 10 }}>
              <Face src={src("stage/icon-speaker.webp")} x={46} y={46} r={46} glow={done} inline />
              <svg width={44} height={60} viewBox="0 0 44 60">
                {[0, 1, 2].map((k) => <path key={k} d={`M ${8 + k * 12} ${16 - k * 6} Q ${18 + k * 14} 30 ${8 + k * 12} ${44 + k * 6}`} fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" opacity={0.25 + 0.5 * Math.abs(Math.sin(s * 4 - k))} />)}
              </svg>
            </div>
            {/* 방법이 일하는 자리 */}
            {r.chip === "upper" ? (
              <div style={{ opacity: chip }}>
                <Face src={src("stage/helper-upper.webp")} x={(X.track + X.speak) / 2} y={mid} r={52} ring={col} />
                <div style={{ position: "absolute", left: (X.track + X.speak) / 2 - 40 + (X.wait - (X.track + X.speak) / 2 + 46) * chip, top: mid + 52, fontSize: 20, padding: "3px 10px", borderRadius: 8, background: "rgba(16,17,21,0.92)", border: `2px solid ${col}`, opacity: chip, whiteSpace: "nowrap" }}>짐작 카드를 미리 넘김</div>
              </div>
            ) : null}
            {r.chip === "subagent" ? (
              <div style={{ opacity: chip }}>
                <Face src={src("stage/helper-analyst.webp")} x={X.wait + 150} y={mid - 2} r={52} ring={col} pulse={g < 1 ? 0.5 + 0.5 * Math.abs(Math.sin(s * 3)) : 0} />
                <Face src={src("stage/icon-wait.webp")} x={X.wait + 330} y={mid - 2} r={40} />
                <div style={{ position: "absolute", left: X.wait + 6, top: mid + 52, fontSize: 22, color: MUTED, opacity: g > 0.3 ? 1 : 0 }}>분석이 끝날 때까지 사용자는 기다린다</div>
              </div>
            ) : null}
            {r.chip === "effort" ? (
              <div style={{ position: "absolute", left: X.wait + 6, top: mid + 52, fontSize: 22, color: MUTED, opacity: chip }}>말이 끝난 뒤 더 생각함</div>
            ) : null}
            {r.chip === "checklist" ? (
              <div style={{ position: "absolute", left: X.wait + 6, top: mid + 52, fontSize: 22, color: MUTED, opacity: chip }}>점검표를 따르며 답함</div>
            ) : null}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// 둥근 얼굴 그림 (그림에서 잘라 둔 사람·스피커·도우미)
const Face: React.FC<{ src: string; x: number; y: number; r: number; ring?: string; glow?: number; pulse?: number; inline?: boolean }> = ({ src, x, y, r, ring, glow = 0, pulse = 0, inline }) => (
  <div style={{ position: inline ? "relative" : "absolute", left: inline ? 0 : x - r, top: inline ? 0 : y - r, width: r * 2, height: r * 2, borderRadius: r, overflow: "hidden", flex: "none", border: `3px solid ${ring ?? "rgba(255,255,255,0.2)"}`, boxShadow: glow ? `0 0 ${22 * glow}px rgba(255,255,255,${0.35 * glow})` : pulse ? `0 0 ${24 * pulse}px rgba(43,209,151,${0.6 * pulse})` : "none" }}>
    <Img src={src} style={{ width: "100%", height: "100%" }} />
  </div>
);

// 보여 줄 줄: Mercury 3 의 첫 소리 중앙값 (site/data/metrics.json). 페이지와 스튜디오가 같은 정의를 쓴다
const ROWS: { key: string; label: string; timing: TurnRow["timing"]; chip?: TurnRow["chip"] }[] = [
  { key: "main.mercury.A1", label: "기본", timing: "during" },
  { key: "main.mercury.A1+CH", label: "미리 짐작", timing: "ahead", chip: "upper" },
  { key: "main.mercury.A4", label: "화용 점검표", timing: "during", chip: "checklist" },
  { key: "main.mercury.A2", label: "생각 더 하기", timing: "before", chip: "effort" },
  { key: "main.mercury.A3", label: "분석 서브에이전트", timing: "before", chip: "subagent" },
];
type MetricsJson = { metrics: Record<string, { first_p50: number }> };
type TimingsJson = { timings: Record<TurnRow["timing"], { label: string }> };
export function turnProps(M: MetricsJson, D: TimingsJson): Omit<TurnProps, "assetBase"> {
  return {
    rows: ROWS.map((r) => ({ label: r.label, timing: r.timing, chip: r.chip, ms: M.metrics[r.key].first_p50 })),
    timingLabels: { during: D.timings.during.label, before: D.timings.before.label, ahead: D.timings.ahead.label },
  };
}
