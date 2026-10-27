import { T, Run, dur, hide, reveal, setSpeed, getSpeed, sleep, tween, isReduced } from "./motion.js";
import { Plane } from "./plane.js";
import { mountStage, stageList } from "./stage-player.js";

// 기본은 한 화면 발표(장면이 제자리에서 바뀌고, 끝나면 다음 장면으로). ?scroll 이면 아래로 이어진 긴 페이지
const params = new URLSearchParams(location.search);
const DECK = !params.has("scroll");
if (DECK) document.body.classList.add("deck");
let auto = DECK && !isReduced(); // 자동 넘김. 사용자가 무엇이든 누르면 멈춘다

const $ = (s) => document.querySelector(s);
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const fmtMs = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}초` : `${ms}ms`);
const won = (v) => `$${v < 0.1 ? v.toFixed(3) : v.toFixed(2)}`;
const pct = (v) => `${v.toFixed(1)}%`;

const [M, D, C, S] = await Promise.all(["data/metrics.json", "data/methods.json", "data/chapters.json", "data/stages.json"].map((u) => fetch(u).then((r) => r.json())));
const metric = (k) => M.metrics[k];
const method = (id) => D.methods.find((m) => m.id === id);
const timingColor = (t) => css(`--series-${D.timings[t].slot}`);
// 대화 무대: Codex 로 그린 방 위에 대본을 재생하는 Remotion Player. 움직임 줄이기면 끝 화면만 보여 준다
const STAGES = stageList(S, D, M);
const stageOf = (id) => STAGES.find((s) => s.id === id);
const stageOpts = () => (isReduced() ? { end: true } : { play: true });
const players = [];
// 발표 화면에서는 무대가 칸에 맞춰 크기와 배치(넓은·세로)를 고른다
const player = (el) => { const p = mountStage(el, "media/", getSpeed(), DECK); players.push(p); return p; };
window.__players = players; // 점검용 (브라우저 콘솔에서 재생 상태 확인)

function tooltipHtml(label, m, meth) {
  const lines = [`<b>${label}</b>`];
  if (meth) lines.push(`${meth.name} · ${D.timings[meth.timing].label}`);
  lines.push(`말뜻 정확도 ${pct(m.accuracy)} (95% 신뢰구간 ${m.ci[0].toFixed(1)}–${m.ci[1].toFixed(1)})`);
  lines.push(`첫 소리 중앙값 ${fmtMs(m.first_p50)}${m.first_note ? ` (${m.first_note})` : ""}`);
  lines.push(`1,000턴당 ${won(m.cost_1k)} · ${m.items}문항 × ${m.reps}회`);
  return lines.join("<br>");
}

function chapterPoints(ch) {
  return ch.points.map((p) => {
    const m = metric(p.metric), meth = p.method ? method(p.method) : null;
    const label = p.label || (meth ? meth.name.replace(/ \(.*\)$/, "") : p.metric);
    return {
      id: p.metric, x: m.first_p50, y: m.accuracy, ci: m.ci, from: p.from, ref: !!p.ref, base: !!p.base,
      color: meth ? timingColor(meth.timing) : css("--text-muted"), label, method: p.method, timing: meth?.timing,
      tooltip: tooltipHtml(label, m, meth),
    };
  });
}

function legendHtml(timings, withBase = true, withRef = true) {
  const parts = timings.map((t) => `<span><i style="background:${timingColor(t)}"></i>${D.timings[t].label} (${D.timings[t].detail})</span>`);
  if (withBase) parts.push(`<span><i style="background:${css("--text-primary")}"></i>기준 설정</span>`);
  if (withRef) parts.push(`<span><i style="background:${css("--text-muted")}"></i>참고</span>`);
  return parts.join("");
}

const cancelled = (e) => e && e.message === "cancel";

// ---------- 1. 문제 ----------
const pStage = player($("#p-stage"));
function playProblem() { return pStage.show(stageOf("problem"), stageOpts()); }

// ---------- 2. 목표 ----------
const goalPlane = new Plane($("#g-plane"), $("#g-tip"));
const runG = new Run();
const GOAL = [["main.mercury.A0", "Mercury 3 instant"], ["main.gemini.A1", "Gemini 3.5 Flash-Lite"], ["main.mercury.A1", "Mercury 3"],
  ["main.haiku.A1", "Claude Haiku 5.5"], ["main.luna.A1", "GPT-6 Luna"], ["main.gemini38.A1", "Gemini 3.8 Flash"]];
async function playGoal() {
  const id = runG.start();
  const main = C.chapters.find((c) => c.id === "main");
  const tgt = metric("main.gemini38.A1");
  goalPlane.setChapter({ ...main, target: { y: tgt.accuracy } }, GOAL.map(([k, label]) => {
    const m = metric(k);
    return { id: k, x: m.first_p50, y: m.accuracy, ci: m.ci, base: k !== "main.gemini38.A1", ref: false, label, highlight: k === "main.gemini38.A1", showCi: true,
      color: css("--text-primary"), tooltip: tooltipHtml(label, m) };
  }));
  try {
    for (const p of goalPlane.points) {
      tween(dur(T.enter), (_, v) => { p.alpha = v; goalPlane.draw(); }, undefined, runG, id).catch(() => {});
      await sleep(dur(320), runG, id);
    }
    await sleep(dur(T.enter), runG, id);
    await tween(dur(900), (_, v) => { goalPlane.targetAlpha = v; goalPlane.zoneAlpha = v; goalPlane.draw(); }, undefined, runG, id);
    await tween(dur(T.whisker), (_, v) => { goalPlane.points.forEach((p) => { p.ciAlpha = v; }); goalPlane.draw(); }, undefined, runG, id);
  } catch (e) { if (!cancelled(e)) throw e; }
}

// ---------- 3. 언제 일하나 ----------
// 줄 정의와 첫 소리 값은 video/src/turn/Turn.tsx (페이지와 스튜디오가 같이 쓴다)
const wTurn = player($("#w-turn"));
function playWhen() { return wTurn.showTurn(M, D, stageOpts()); }

// ---------- 4. 시도한 방법 ----------
const runM = new Run();
let selected = "upper";
function renderFamilies() {
  $("#m-families").innerHTML = D.families.map((f) => `
    <div class="family" data-family="${f.id}">
      <h3>${f.title}</h3><p>${f.role}</p>
      ${D.methods.filter((m) => m.family === f.id).map((m) => `
        <button data-method="${m.id}" class="${m.id === selected ? "on" : ""}"><i style="background:${timingColor(m.timing)}"></i>${m.name}</button>`).join("")}
    </div>`).join("");
  $("#m-families").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    userAct();
    // 긴 페이지에서는 목록이 무대 위에 있으므로, 누르면 무대가 보이게 내려간다
    if (!DECK) $("#m-detail").scrollIntoView({ behavior: isReduced() ? "auto" : "smooth", block: "nearest" });
    runM.start();
    showMethod(b.dataset.method, true);
  }));
}
const mStage = player($("#m-stage"));
// 휴대폰 발표 화면에서 쓰는 한 줄 선택 상자 (묶음별로)
$("#m-select").innerHTML = D.families.map((f) => `<optgroup label="${f.title}">${D.methods.filter((m) => m.family === f.id).map((m) => `<option value="${m.id}">${m.name}</option>`).join("")}</optgroup>`).join("");
$("#m-select").addEventListener("change", (e) => { userAct(); runM.start(); showMethod(e.target.value, true); });
async function showMethod(mid, animate) {
  selected = mid;
  $("#m-families").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.method === mid));
  $("#m-select").value = mid;
  const m = method(mid);
  $("#m-foot").innerHTML = `<span class="chip">${m.problem.value}</span><span>${m.problem.text}</span>
    <details><summary>덧붙인 프롬프트 보기</summary><div>${m.prompt}</div></details>`;
  $("#m-foot details").addEventListener("toggle", (e) => { if (e.target.open) userAct(); });
  // 계산 시점, 응답·도우미 모델, 방법, 수치는 무대 아래 정보 띠에 있다
  return mStage.show(stageOf(`m-${mid}`), animate ? stageOpts() : { end: true });
}
async function playMethods() {
  const id = runM.start();
  renderFamilies();
  const cards = [...$("#m-families").children];
  cards.forEach(hide);
  if (!DECK) hide($("#m-detail")); // 발표 화면에서는 무대가 처음부터 자리를 지킨다
  try {
    cards.forEach((c, i) => reveal(c, i * T.stagger * 2));
    await sleep(dur(DECK ? T.enter : T.enter + cards.length * T.stagger * 2), runM, id);
    if (!DECK) reveal($("#m-detail"));
    // 자동 넘김이면 계산 시점마다 하나씩 보여 준다. 아니면 고른 방법 하나
    const list = auto ? METHODS_AUTO : [selected];
    for (const mid of list) {
      if (!runM.alive(id)) return;
      await showMethod(mid, true);
      if (auto && mid !== list[list.length - 1]) await sleep(dur(1500), runM, id);
    }
  } catch (e) { if (!cancelled(e)) throw e; }
}
const METHODS_AUTO = ["checklist", "subagent", "upper"]; // 답하면서 · 답하기 전에 · 미리

// ---------- 5. 결과 ----------
const resPlane = new Plane($("#r-plane"), $("#r-tip"));
const runR = new Run();
let chapterIdx = 0;
$("#r-tabs").innerHTML = C.chapters.map((c, i) => `<button role="tab" data-i="${i}">${c.tab}</button>`).join("");
const runRL = new Run(); // 자동 넘김일 때 장을 차례로 넘기는 흐름
$("#r-tabs").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { userAct(); runRL.start(); chapterIdx = +b.dataset.i; playChapter(); }));
$("#r-table-btn").addEventListener("click", () => {
  userAct();
  const t = $("#r-table");
  t.hidden = !t.hidden;
  $("#r-table-btn").textContent = t.hidden ? "표로 보기" : "표 닫기";
});
function renderTable(ch, pts) {
  $("#r-table").innerHTML = `<table class="data"><thead><tr><th>점</th><th>방법</th><th>정확도 (95% CI)</th><th>첫 소리</th><th>1,000턴당</th></tr></thead><tbody>${
    pts.map((p) => { const m = metric(p.id), meth = p.method ? method(p.method) : null;
      return `<tr><td>${p.label}</td><td>${meth ? meth.name : p.ref ? "참고" : "기준"}</td><td class="num">${pct(m.accuracy)} (${m.ci[0].toFixed(1)}–${m.ci[1].toFixed(1)})</td><td class="num">${fmtMs(m.first_p50)}</td><td class="num">${won(m.cost_1k)}</td></tr>`; }).join("")
  }</tbody></table><p class="note">${pts[0] ? `${metric(pts[0].id).items}문항 기준.` : ""} 장마다 문항과 반복이 달라 장끼리는 비교하지 않습니다.</p>`;
}
async function playResults() {
  if (!auto) return playChapter();
  const lid = runRL.start();
  try {
    for (let i = 0; i < C.chapters.length; i += 1) {
      if (!runRL.alive(lid)) return;
      chapterIdx = i;
      await playChapter();
      await sleep(dur(Math.min(6000, 2000 + 30 * (C.chapters[i].takeaway ?? "").length)), runRL, lid);
    }
  } catch (e) { if (!cancelled(e)) throw e; }
}
async function playChapter() {
  const id = runR.start();
  const ch = C.chapters[chapterIdx];
  $("#r-tabs").querySelectorAll("button").forEach((b, i) => { b.classList.toggle("on", i === chapterIdx); b.setAttribute("aria-selected", i === chapterIdx); });
  $("#r-title").textContent = ch.title;
  const pts = chapterPoints(ch);
  const tgt = ch.target ? metric(ch.target.metric) : null;
  if (tgt) pts.unshift({ id: ch.target.metric, x: tgt.first_p50, y: tgt.accuracy, ci: tgt.ci, ref: false, base: true, label: ch.target.label,
    color: css("--text-primary"), tooltip: tooltipHtml(ch.target.label, tgt) });
  resPlane.setChapter({ ...ch, target: tgt ? { y: tgt.accuracy } : null }, pts);
  const timings = [...new Set(pts.filter((p) => p.timing).map((p) => p.timing))];
  $("#r-legend").innerHTML = legendHtml(["during", "before", "ahead"].filter((t) => timings.includes(t)), true, pts.some((p) => p.ref));
  renderTable(ch, pts);
  const take = $("#r-take");
  take.textContent = "";
  try {
    const statics = resPlane.points.filter((p) => !p.from);
    for (const p of statics) {
      tween(dur(T.enter), (_, v) => { p.alpha = v; resPlane.draw(); }, undefined, runR, id).catch(() => {});
      await sleep(dur(180), runR, id);
    }
    if (tgt) await tween(dur(700), (_, v) => { resPlane.targetAlpha = v; resPlane.zoneAlpha = v; resPlane.draw(); }, undefined, runR, id);
    await sleep(dur(400), runR, id);
    const movers = resPlane.points.filter((p) => p.from);
    const done = movers.map(async (p, i) => {
      await sleep(dur(i * 650), runR, id);
      await tween(dur(250), (_, v) => { p.alpha = v; resPlane.draw(); }, undefined, runR, id);
      await tween(dur(T.travel), (_, v) => { p.prog = v; resPlane.draw(); }, undefined, runR, id);
    });
    await Promise.all(done);
    await tween(dur(T.whisker), (_, v) => { resPlane.points.forEach((p) => { p.ciAlpha = v; }); resPlane.draw(); }, undefined, runR, id);
    take.textContent = ch.takeaway;
    reveal(take);
  } catch (e) { if (!cancelled(e)) throw e; }
}

// ---------- 6. 문제점 ----------
const runX = new Run();
// 카드마다 그 방법 무대의 끝 화면 (video/scripts/thumbs.sh). 누르면 시도한 방법 장면에서 그 무대를 재생한다
$("#x-problems").innerHTML = D.methods.map((m) => `
  <button class="problem" data-method="${m.id}" style="border-top-color:${timingColor(m.timing)}">
    <img src="media/stage/thumbs/m-${m.id}.webp" alt="" loading="lazy" width="480" height="320">
    <div class="name"><i style="background:${timingColor(m.timing)}"></i>${m.name}</div>
    <div class="value">${m.problem.value}</div>
    <div class="text">${m.problem.text}</div>
  </button>`).join("");
$("#x-problems").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
  userAct();
  selected = b.dataset.method;
  if (DECK) { goTo("methods"); return; }
  $("#m-detail").scrollIntoView({ behavior: isReduced() ? "auto" : "smooth", block: "center" });
  showMethod(selected, true);
}));
async function playProblems() {
  const id = runX.start();
  const cards = [...$("#x-problems").children];
  cards.forEach(hide);
  try {
    cards.forEach((c, i) => reveal(c, i * T.stagger));
    await sleep(dur(T.enter + cards.length * T.stagger), runX, id);
  } catch (e) { if (!cancelled(e)) throw e; }
}

// ---------- 7. 가장 나은 방법 ----------
const winPlane = new Plane($("#v-plane"), $("#v-tip"));
const runV = new Run();
const W = D.winner, wm = method(W.method);
$("#v-badge").textContent = wm.name;
$("#v-head").textContent = W.headline;
$("#v-why").textContent = W.why;
{
  const a = metric(W.points[0]), b = metric(W.points[1]), t = metric(W.target), r = metric(W.runner_up.metric);
  const sgn = (v) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v)}ms`;
  $("#v-nums").innerHTML = `Mercury 3 instant + 미리 짐작: <b>${pct(a.accuracy)}</b>, 첫 소리 변화 ${sgn(a.first_delta)}. Mercury 3 + 미리 짐작: <b>${pct(b.accuracy)}</b>, 첫 소리 변화 ${sgn(b.first_delta)}. 목표인 Gemini 3.8 Flash 는 ${pct(t.accuracy)}, 첫 소리 ${fmtMs(t.first_p50)} 입니다. (첫 소리 변화는 같은 시각에 잰 기준 설정 대비)`;
  $(".caveat-box").addEventListener("toggle", (e) => { if (e.target.open) userAct(); });
$("#v-caveats").innerHTML = [...W.caveats, `${W.runner_up.text} (instant: ${pct(r.accuracy)}, 1,000턴당 ${won(r.cost_1k)})`].map((c) => `<li>${c}</li>`).join("");
}
const vStage = player($("#v-stage"));
async function playWinner() {
  const id = runV.start();
  $("#v-fit").classList.remove("show-stage");
  const main = C.chapters.find((c) => c.id === "main");
  const tgt = metric(W.target);
  const pts = chapterPoints(main);
  pts.unshift({ id: W.target, x: tgt.first_p50, y: tgt.accuracy, ci: tgt.ci, base: true, label: "목표: Gemini 3.8 Flash", color: css("--text-primary"), tooltip: tooltipHtml("목표: Gemini 3.8 Flash", tgt) });
  winPlane.setChapter({ ...main, target: { y: tgt.accuracy } }, pts);
  winPlane.points.forEach((p) => { p.prog = 1; p.alpha = 1; p.ciAlpha = 0; p.dim = false; });
  winPlane.targetAlpha = 1;
  winPlane.zoneAlpha = 1;
  winPlane.draw();
  try {
    await sleep(dur(600), runV, id);
    await tween(dur(900), (_, v) => {
      winPlane.points.forEach((p) => { p.dim = !(W.points.includes(p.id) || p.id === W.target) && v > 0.5; p.highlight = W.points.includes(p.id) && v > 0.5; });
      winPlane.draw();
    }, undefined, runV, id);
    for (const p of winPlane.points) if (W.points.includes(p.id)) { p.ciAlpha = 1; p.showCi = true; }
    winPlane.draw();
    // 차트를 읽을 시간을 두고, 같은 칸에서 대화 무대로 바꿔 예시를 하나씩 이어 튼다 (침실 SAR-02 → 거실 POL-02)
    await sleep(dur(2200), runV, id);
    $("#v-fit").classList.add("show-stage");
    for (const w of STAGES.filter((s) => s.id.startsWith("w-"))) {
      if (!runV.alive(id)) return;
      await vStage.show(w, stageOpts());
      if (isReduced()) break;
    }
  } catch (e) { if (!cancelled(e)) throw e; }
}

// 재생 전에도 비어 보이지 않게, 목록과 예시 글은 처음부터 채워 둔다 (재생하면 지우고 다시 쓴다)
renderFamilies();
showMethod(selected, false);

// ---------- 8. 다음 ----------
$("#n-list").innerHTML = D.next.map((n) => `<li>${n}</li>`).join("");

// ---------- 재생 연결 ----------
const PLAY = { problem: playProblem, goal: playGoal, when: playWhen, methods: playMethods, results: playResults, problems: playProblems, winner: playWinner };
// 장면을 떠날 때: 진행 중인 움직임을 끊고 무대를 멈춘다
const LEAVE = {
  problem: () => pStage.pause(), goal: () => runG.start(), when: () => wTurn.pause(),
  methods: () => { runM.start(); mStage.pause(); }, results: () => { runR.start(); runRL.start(); },
  problems: () => runX.start(), winner: () => { runV.start(); vStage.pause(); },
};
const scenes = [...document.querySelectorAll(".scene")];
$("#nav").innerHTML = scenes.map((s) => `<a href="#${s.id}" data-id="${s.id}">${s.dataset.title}</a>`).join("");

// 한 화면 발표: 한 번에 한 장면. 들어가면 재생하고, 다 끝나면 읽을 시간만큼 머문 뒤 다음 장면으로
const deck = { cur: -1, token: 0, done: -1, timer: 0, seen: new Set() };
function userAct() { if (DECK) setAuto(false); }
function setAuto(on) {
  auto = on;
  $("#d-auto").setAttribute("aria-pressed", String(on));
  $("#d-auto-state").textContent = on ? "켬" : "끔";
  clearTimeout(deck.timer);
  if (on && deck.done === deck.token) schedule(deck.token);
}
// 머무는 시간: 장면 글 길이에 비례, 2.5~7초 (카드가 많은 장면은 data-hold 까지). 속도 설정을 따른다
const holdOf = (s) => dur(Math.min(+(s.dataset.hold ?? 7000), 2500 + 15 * s.innerText.replace(/\s+/g, "").length));
function schedule(my) {
  clearTimeout(deck.timer);
  if (!auto || deck.cur >= scenes.length - 1) return;
  deck.timer = setTimeout(() => { if (my === deck.token && auto) go(deck.cur + 1); }, holdOf(scenes[deck.cur]));
}
function go(i, user = false) {
  i = Math.max(0, Math.min(scenes.length - 1, i));
  if (user) setAuto(false);
  clearTimeout(deck.timer);
  if (deck.cur >= 0) {
    LEAVE[scenes[deck.cur].id]?.();
    if (i !== deck.cur) { scenes[deck.cur].classList.remove("on"); scenes[deck.cur].inert = true; }
  }
  deck.cur = i;
  deck.seen.add(i);
  const s = scenes[i];
  s.classList.add("on");
  s.inert = false;
  $("#nav").querySelectorAll("a").forEach((a) => a.classList.toggle("on", a.dataset.id === s.id));
  $("#d-dots").querySelectorAll("button").forEach((b, k) => { b.classList.toggle("on", k === i); b.classList.toggle("seen", deck.seen.has(k) && k !== i); });
  $("#d-title").textContent = s.dataset.title;
  history.replaceState(null, "", `${location.search}#${s.id}`);
  const my = ++deck.token;
  Promise.resolve(PLAY[s.id]?.()).then(() => { if (my !== deck.token) return; deck.done = my; schedule(my); }, () => {});
}
function goTo(id) { const k = scenes.findIndex((s) => s.id === id); if (k >= 0) go(k, true); }

if (DECK) {
  scenes.forEach((s) => { s.inert = true; });
  $("#d-dots").innerHTML = scenes.map((s, k) => `<button data-i="${k}" aria-label="${s.dataset.title}"></button>`).join("");
  $("#d-dots").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => go(+b.dataset.i, true)));
  $("#nav").querySelectorAll("a").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); goTo(a.dataset.id); }));
  $("#d-prev").addEventListener("click", () => go(deck.cur - 1, true));
  $("#d-next").addEventListener("click", () => go(deck.cur + 1, true));
  $("#d-replay").addEventListener("click", () => go(deck.cur, true));
  $("#d-auto").addEventListener("click", () => setAuto(!auto));
  setAuto(auto);
  // 키보드: → PageDown Space 다음, ← PageUp 이전, Home End
  document.addEventListener("keydown", (e) => {
    const onControl = e.target.closest && e.target.closest("button, a, summary, input, select, textarea");
    if (["ArrowRight", "PageDown"].includes(e.key) || (e.key === " " && !onControl)) { e.preventDefault(); go(deck.cur + 1, true); }
    else if (["ArrowLeft", "PageUp"].includes(e.key)) { e.preventDefault(); go(deck.cur - 1, true); }
    else if (e.key === "Home") go(0, true);
    else if (e.key === "End") go(scenes.length - 1, true);
  });
  // 터치: 옆으로 쓸면 넘긴다
  let sx = 0, sy = 0;
  $("#deck").addEventListener("pointerdown", (e) => { sx = e.clientX; sy = e.clientY; });
  $("#deck").addEventListener("pointerup", (e) => {
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (e.pointerType !== "mouse" && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(deck.cur + (dx < 0 ? 1 : -1), true);
  });
  // 처음 장면: 주소의 #장면 이나 ?scene=장면
  const start = scenes.findIndex((s) => s.id === (location.hash.slice(1) || params.get("scene")));
  go(Math.max(0, start));
} else {
  // 긴 페이지: ?scene=<장면 id> 면 그 장면만 남긴다
  const only = params.get("scene");
  if (only && document.getElementById(only)) scenes.forEach((s) => { if (s.id !== only) s.remove(); });
  const played = new Set();
  // 장면의 윗부분이 화면 위쪽 60% 안에 들어오면 재생한다. 비율 기준이면 화면보다 훨씬 긴 장면(휴대폰)은 끝내 시작되지 않는다
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting && !played.has(e.target.id) && PLAY[e.target.id]) { played.add(e.target.id); PLAY[e.target.id](); }
    }
  }, { rootMargin: "0px 0px -40% 0px", threshold: 0 });
  // 메뉴 표시는 화면 가운데 가는 띠에 걸친 장면 하나만
  const navIo = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) $("#nav").querySelectorAll("a").forEach((a) => a.classList.toggle("on", a.dataset.id === e.target.id));
  }, { rootMargin: "-45% 0px -54% 0px", threshold: 0 });
  document.querySelectorAll(".scene").forEach((s) => { io.observe(s); navIo.observe(s); });
  document.querySelectorAll("[data-replay]").forEach((b) => b.addEventListener("click", () => PLAY[b.dataset.replay]?.()));
  // 발표용: PageDown/PageUp 으로 장면 단위 이동
  document.addEventListener("keydown", (e) => {
    if (!["PageDown", "PageUp"].includes(e.key)) return;
    e.preventDefault();
    const list = [...document.querySelectorAll(".scene")];
    const y = window.scrollY + 60;
    const idx = list.findIndex((s) => s.offsetTop + s.offsetHeight > y);
    const next = list[Math.max(0, Math.min(list.length - 1, idx + (e.key === "PageDown" ? 1 : -1)))];
    next.scrollIntoView({ behavior: isReduced() ? "auto" : "smooth" });
  });
}

// 속도
const speedBtns = document.querySelectorAll(".speed button");
const markSpeed = () => speedBtns.forEach((b) => b.classList.toggle("on", +b.dataset.speed === getSpeed()));
speedBtns.forEach((b) => b.addEventListener("click", () => { setSpeed(+b.dataset.speed); markSpeed(); players.forEach((p) => p.setRate(getSpeed())); }));
markSpeed();
