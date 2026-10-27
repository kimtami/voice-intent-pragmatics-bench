import { T, Run, dur, hide, readMs, reveal, setSpeed, getSpeed, sleep, tween, typeText, isReduced } from "./motion.js";
import { Plane } from "./plane.js";
import { Turn } from "./turn.js";
import { Wave } from "./wave.js";

const $ = (s) => document.querySelector(s);
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const fmtMs = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}초` : `${ms}ms`);
const won = (v) => `$${v < 0.1 ? v.toFixed(3) : v.toFixed(2)}`;
const pct = (v) => `${v.toFixed(1)}%`;

const [M, D, C] = await Promise.all(["data/metrics.json", "data/methods.json", "data/chapters.json"].map((u) => fetch(u).then((r) => r.json())));
const metric = (k) => M.metrics[k];
const method = (id) => D.methods.find((m) => m.id === id);
const timingColor = (t) => css(`--series-${D.timings[t].slot}`);

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
const wave = new Wave($("#p-wave"));
const runP = new Run();
async function playProblem() {
  const id = runP.start();
  const ex = D.example;
  const sit = $("#p-situation"), utt = $("#p-utter"), bad = $("#p-bad"), good = $("#p-good");
  sit.textContent = ex.situation;
  utt.textContent = "";
  for (const el of [bad, good]) { el.querySelector("p").textContent = ""; el.querySelector(".src").textContent = ""; hide(el); }
  hide(sit);
  try {
    reveal(sit);
    await sleep(dur(T.enter), runP, id);
    await Promise.all([wave.speak(dur(1800)), typeText(utt, `"${ex.utterance}"`, runP, id)]);
    await sleep(dur(600), runP, id);
    reveal(bad);
    await typeText(bad.querySelector("p"), ex.literal.text, runP, id);
    bad.querySelector(".src").textContent = ex.literal.source;
    await sleep(readMs(ex.literal.text), runP, id);
    reveal(good);
    await typeText(good.querySelector("p"), ex.intended.text, runP, id);
    good.querySelector(".src").textContent = ex.intended.source;
  } catch (e) { if (!cancelled(e)) throw e; }
}

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
const turn = new Turn($("#w-turn"));
const runW = new Run();
const TURN_ROWS = [
  { key: "main.mercury.A1", label: "기본", timing: "during" },
  { key: "main.mercury.A1+CH", label: "미리 짐작", timing: "ahead", chip: "upper" },
  { key: "main.mercury.A4", label: "화용 점검표", timing: "during", chip: "checklist" },
  { key: "main.mercury.A2", label: "생각 더 하기", timing: "before", chip: "effort" },
  { key: "main.mercury.A3", label: "분석 서브에이전트", timing: "before", chip: "subagent" },
];
$("#w-legend").innerHTML = legendHtml(["ahead", "during", "before"], false, false);
async function playWhen() {
  const id = runW.start();
  turn.setRows(TURN_ROWS.map((r) => ({ ...r, ms: metric(r.key).first_p50, color: timingColor(r.timing),
    chipText: r.chip ? ({ upper: "미리 짐작", checklist: "점검표", effort: "생각 더", subagent: "분석" })[r.chip] : null })));
  try {
    for (const row of turn.rows) {
      await tween(dur(400), (_, v) => { row.alpha = v; turn.draw(); }, undefined, runW, id);
      if (row.chipText) await tween(dur(500), (_, v) => { row.chip = v; turn.draw(); }, undefined, runW, id);
      await tween(dur(Math.min(1600, 500 + row.ms / 4)), (_, v) => { row.grow = v; turn.draw(); }, undefined, runW, id);
      await sleep(dur(350), runW, id);
    }
  } catch (e) { if (!cancelled(e)) throw e; }
}

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
  $("#m-families").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => showMethod(b.dataset.method, true)));
}
async function showMethod(mid, typed) {
  selected = mid;
  $("#m-families").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.method === mid));
  const m = method(mid), fam = D.families.find((f) => f.id === m.family);
  const det = $("#m-detail");
  det.innerHTML = `
    <h3>${m.name}</h3>
    <div class="timing-chip"><i style="background:${timingColor(m.timing)}"></i>${D.timings[m.timing].label}: ${D.timings[m.timing].detail}</div>
    <div class="row"><span>하는 일</span><div>${fam.role}</div></div>
    <div class="row"><span>덧붙인 것</span><div class="prompt"></div></div>
    <div class="row"><span>나온 결과</span><div class="out"></div></div>
    <div class="row"><span>문제점</span><div class="prob"></div></div>`;
  det.querySelector(".prompt").textContent = m.prompt;
  det.querySelector(".prob").textContent = `${m.problem.value}. ${m.problem.text}`;
  const id = runM.start();
  try {
    if (typed) await typeText(det.querySelector(".out"), m.output, runM, id);
    else det.querySelector(".out").textContent = m.output;
  } catch (e) { if (!cancelled(e)) throw e; }
}
async function playMethods() {
  const id = runM.start();
  renderFamilies();
  const cards = [...$("#m-families").children];
  cards.forEach(hide);
  hide($("#m-detail"));
  try {
    cards.forEach((c, i) => reveal(c, i * T.stagger * 2));
    await sleep(dur(T.enter + cards.length * T.stagger * 2), runM, id);
    reveal($("#m-detail"));
    await showMethod(selected, true);
  } catch (e) { if (!cancelled(e)) throw e; }
}

// ---------- 5. 결과 ----------
const resPlane = new Plane($("#r-plane"), $("#r-tip"));
const runR = new Run();
let chapterIdx = 0;
$("#r-tabs").innerHTML = C.chapters.map((c, i) => `<button role="tab" data-i="${i}">${c.tab}</button>`).join("");
$("#r-tabs").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { chapterIdx = +b.dataset.i; playResults(); }));
$("#r-table-btn").addEventListener("click", () => {
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
$("#x-problems").innerHTML = D.methods.map((m) => `
  <div class="problem" style="border-top-color:${timingColor(m.timing)}">
    <div class="name"><i style="background:${timingColor(m.timing)}"></i>${m.name}</div>
    <div class="value">${m.problem.value}</div>
    <div class="text">${m.problem.text}</div>
  </div>`).join("");
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
  $("#v-caveats").innerHTML = [...W.caveats, `${W.runner_up.text} (instant: ${pct(r.accuracy)}, 1,000턴당 ${won(r.cost_1k)})`].map((c) => `<li>${c}</li>`).join("");
}
$("#v-examples").innerHTML = W.examples.map((e) => `
  <div class="example">
    <div class="ctx">${e.situation}</div>
    <div class="utt">"${e.utterance}"</div>
    <div class="pair">
      <div class="bad"><div class="lab"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="#d03b3b" stroke-width="2" fill="none" stroke-linecap="round"/></svg>미리 짐작 없이</div><p data-text="${e.before}"></p></div>
      <div class="good"><div class="lab"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5" stroke="#0ca30c" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>미리 짐작해 두고</div><p data-text="${e.after}"></p></div>
    </div>
    <div class="src">${e.source}</div>
  </div>`).join("");
async function playWinner() {
  const id = runV.start();
  const main = C.chapters.find((c) => c.id === "main");
  const tgt = metric(W.target);
  const pts = chapterPoints(main);
  pts.unshift({ id: W.target, x: tgt.first_p50, y: tgt.accuracy, ci: tgt.ci, base: true, label: "목표: Gemini 3.8 Flash", color: css("--text-primary"), tooltip: tooltipHtml("목표: Gemini 3.8 Flash", tgt) });
  winPlane.setChapter({ ...main, target: { y: tgt.accuracy } }, pts);
  winPlane.points.forEach((p) => { p.prog = 1; p.alpha = 1; p.ciAlpha = 0; p.dim = false; });
  winPlane.targetAlpha = 1;
  winPlane.zoneAlpha = 1;
  const exs = [...$("#v-examples").children];
  exs.forEach((e) => { hide(e); e.querySelectorAll("p").forEach((p) => { p.textContent = ""; }); });
  winPlane.draw();
  try {
    await sleep(dur(600), runV, id);
    await tween(dur(900), (_, v) => {
      winPlane.points.forEach((p) => { p.dim = !(W.points.includes(p.id) || p.id === W.target) && v > 0.5; p.highlight = W.points.includes(p.id) && v > 0.5; });
      winPlane.draw();
    }, undefined, runV, id);
    for (const p of winPlane.points) if (W.points.includes(p.id)) { p.ciAlpha = 1; p.showCi = true; }
    winPlane.draw();
    for (const ex of exs) {
      reveal(ex);
      const [b, g] = ex.querySelectorAll("p");
      await typeText(b, b.dataset.text, runV, id);
      await sleep(dur(500), runV, id);
      await typeText(g, g.dataset.text, runV, id);
      await sleep(readMs(g.dataset.text) / 2, runV, id);
    }
  } catch (e) { if (!cancelled(e)) throw e; }
}

// 재생 전에도 비어 보이지 않게, 목록과 예시 글은 처음부터 채워 둔다 (재생하면 지우고 다시 쓴다)
renderFamilies();
showMethod(selected, false);
document.querySelectorAll("#v-examples p[data-text]").forEach((p) => { p.textContent = p.dataset.text; });

// ---------- 8. 다음 ----------
$("#n-list").innerHTML = D.next.map((n) => `<li>${n}</li>`).join("");

// ---------- 재생 연결 ----------
const PLAY = { problem: playProblem, goal: playGoal, when: playWhen, methods: playMethods, results: playResults, problems: playProblems, winner: playWinner };
const played = new Set();
const scenes = [...document.querySelectorAll(".scene")];
$("#nav").innerHTML = scenes.map((s) => `<a href="#${s.id}" data-id="${s.id}">${s.dataset.title}</a>`).join("");
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
scenes.forEach((s) => { io.observe(s); navIo.observe(s); });
document.querySelectorAll("[data-replay]").forEach((b) => b.addEventListener("click", () => PLAY[b.dataset.replay]?.()));

// 속도
const speedBtns = document.querySelectorAll(".speed button");
const markSpeed = () => speedBtns.forEach((b) => b.classList.toggle("on", +b.dataset.speed === getSpeed()));
speedBtns.forEach((b) => b.addEventListener("click", () => { setSpeed(+b.dataset.speed); markSpeed(); }));
markSpeed();

// 발표용: PageDown/PageUp 으로 장면 단위 이동
document.addEventListener("keydown", (e) => {
  if (!["PageDown", "PageUp"].includes(e.key)) return;
  e.preventDefault();
  const y = window.scrollY + 60;
  const idx = scenes.findIndex((s) => s.offsetTop + s.offsetHeight > y);
  const next = scenes[Math.max(0, Math.min(scenes.length - 1, idx + (e.key === "PageDown" ? 1 : -1)))];
  next.scrollIntoView({ behavior: isReduced() ? "auto" : "smooth" });
});
