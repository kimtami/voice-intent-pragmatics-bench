// 움직임 공통: 시간 값, 감속 곡선, 재생 속도, '움직임 줄이기' 설정.
// 시간 값은 STORYBOARD.md 의 기준에서 나온다: 한 글자 0.12초 + 정착 1.5초, 등장 700ms, 시차 120ms, 점 이동 1,200ms.

export const T = {
  enter: 700,
  stagger: 120,
  travel: 1200,
  whisker: 500,
  perChar: 120,
  settle: 1500,
  type: 38, // 타이핑 효과: 한 글자 38ms (초당 약 26자, 읽기보다 빠르게 써서 읽는 동안 기다리지 않게)
};

const reduced = matchMedia("(prefers-reduced-motion: reduce)");
// 주소에 ?still 을 붙이면 움직임 없이 마지막 화면을 보여 준다 (검토, 인쇄, PDF 공유용)
const still = new URLSearchParams(location.search).has("still");
let speed = 1;
try {
  speed = parseFloat(localStorage.getItem("vib-speed")) || 1;
} catch { /* 저장소를 못 쓰면 기본 속도 */ }

export function getSpeed() { return speed; }
export function setSpeed(v) {
  speed = v;
  try { localStorage.setItem("vib-speed", String(v)); } catch { /* 무시 */ }
}
export const isReduced = () => still || reduced.matches;

// 재생 속도를 반영한 실제 시간. 움직임 줄이기면 0.
export const dur = (ms) => (isReduced() ? 0 : ms / speed);

export const ease = {
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t) => { const c = 1.4; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
  linear: (t) => t,
};

// 읽는 시간: 글자 수에 비례하고 정착 시간을 더한다
export const readMs = (text) => dur(T.perChar * [...text.replace(/\s+/g, "")].length + T.settle);

// 장면마다 하나씩 만드는 재생 제어. 다시 보기를 누르면 이전 재생을 끊는다.
export class Run {
  constructor() { this.id = 0; }
  start() { this.id += 1; return this.id; }
  alive(id) { return id === this.id; }
}

export function sleep(ms, run, id) {
  if (ms <= 0) return run && !run.alive(id) ? Promise.reject(new Error("cancel")) : Promise.resolve();
  return new Promise((resolve, reject) => {
    setTimeout(() => (run && !run.alive(id) ? reject(new Error("cancel")) : resolve()), ms);
  });
}

// 값 하나를 시간에 따라 바꾼다. onUpdate(진행 0~1, 곡선 적용 값)
export function tween(ms, onUpdate, curve = ease.outCubic, run, id) {
  return new Promise((resolve, reject) => {
    if (ms <= 0) { onUpdate(1, 1); resolve(); return; }
    const t0 = performance.now();
    const step = (now) => {
      if (run && !run.alive(id)) { reject(new Error("cancel")); return; }
      const p = Math.min(1, (now - t0) / ms);
      onUpdate(p, curve(p));
      if (p < 1) requestAnimationFrame(step); else resolve();
    };
    requestAnimationFrame(step);
  });
}

// DOM 요소를 아래에서 위로 띄우며 나타나게 한다
export function reveal(el, delay = 0) {
  el.style.transition = "none";
  el.style.opacity = "0";
  el.style.transform = "translateY(14px)";
  void el.offsetWidth;
  const ms = dur(T.enter);
  el.style.transition = `opacity ${ms}ms cubic-bezier(.22,.61,.36,1) ${dur(delay)}ms, transform ${ms}ms cubic-bezier(.22,.61,.36,1) ${dur(delay)}ms`;
  el.style.opacity = "1";
  el.style.transform = "none";
}

export function hide(el) {
  el.style.transition = "none";
  el.style.opacity = "0";
  el.style.transform = "translateY(14px)";
}

// 한 글자씩 쓰기
export async function typeText(el, text, run, id) {
  el.textContent = "";
  if (isReduced()) { el.textContent = text; return; }
  const chars = [...text];
  for (let i = 0; i < chars.length; i += 1) {
    if (run && !run.alive(id)) throw new Error("cancel");
    el.textContent += chars[i];
    await new Promise((r) => setTimeout(r, dur(T.type)));
  }
}
