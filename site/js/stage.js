// 대화 무대: 왼쪽 사람, 오른쪽 비서 아바타. 말풍선, 생각 말풍선, 기록 카드, 도우미(상위 모델·분석 에이전트·관련도 게이트),
// 기다림 시계, 온도 다이얼을 캔버스 하나에 그린다. 장면 대본(script)은 아래 play() 가 data 로 받아 순서대로 연출한다.

import { T, dur, sleep, tween } from "./motion.js";

const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const FONT = "Pretendard Variable, Pretendard, system-ui, sans-serif";

// 한국어 줄바꿈: 띄어쓰기 단위로 넣고, 한 낱말이 폭보다 길면 글자 단위로 자른다
function wrap(c, text, maxW) {
  const lines = [];
  let line = "";
  for (const word of text.split(" ")) {
    const test = line ? `${line} ${word}` : word;
    if (c.measureText(test).width <= maxW) { line = test; continue; }
    if (line) lines.push(line);
    if (c.measureText(word).width <= maxW) { line = word; continue; }
    line = "";
    for (const ch of word) {
      if (c.measureText(line + ch).width > maxW) { lines.push(line); line = ch; } else line += ch;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function rrect(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); }

function icon(c, kind, x, y, s) {
  c.save();
  c.lineWidth = 2.2; c.lineCap = "round"; c.lineJoin = "round";
  c.strokeStyle = kind === "good" ? css("--good") : css("--critical");
  c.beginPath();
  if (kind === "good") { c.moveTo(x - s * 0.45, y); c.lineTo(x - s * 0.1, y + s * 0.35); c.lineTo(x + s * 0.5, y - s * 0.35); }
  else { c.moveTo(x - s * 0.35, y - s * 0.35); c.lineTo(x + s * 0.35, y + s * 0.35); c.moveTo(x + s * 0.35, y - s * 0.35); c.lineTo(x - s * 0.35, y + s * 0.35); }
  c.stroke();
  c.restore();
}

export class Stage {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext("2d");
    this.reset();
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }

  reset() {
    this.s = {
      person: { a: 1, talk: 0 }, avatar: { a: 1, talk: 0, think: 0, tint: null },
      pSay: null, aSay: null, thought: null, cards: null, helper: null, clock: null, dial: null, caption: null,
    };
    this.draw();
  }

  resize() {
    const r = this.cv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.w = Math.max(1, r.width); this.h = Math.max(1, r.height);
    this.cv.width = Math.round(this.w * dpr); this.cv.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.narrow = this.w < 560;
    this.fs = this.narrow ? 12 : 14;
    this.draw();
  }

  // 배치: 사람은 왼쪽 아래, 아바타는 오른쪽 아래. 머리 위가 말풍선 자리, 가운데 위가 도우미 자리
  geo() {
    const { w, h } = this;
    const unit = Math.min(h * 0.19, w * (this.narrow ? 0.15 : 0.1));
    const base = h - 26; // 아래 22px 는 이름표 자리
    return {
      unit,
      px: w * (this.narrow ? 0.13 : 0.1), ax: w * (this.narrow ? 0.87 : 0.9), base,
      headY: base - unit * 1.55,
    };
  }

  drawPerson(g) {
    const c = this.ctx, p = this.s.person, u = g.unit;
    c.globalAlpha = p.a;
    c.fillStyle = "#7d818c";
    c.beginPath(); c.ellipse(g.px, g.base, u * 0.62, u * 0.7, 0, Math.PI, 0); c.fill(); // 어깨
    c.beginPath(); c.arc(g.px, g.headY, u * 0.38, 0, Math.PI * 2); c.fill(); // 머리
    // 입: 말하는 동안 열렸다 닫힌다
    c.fillStyle = css("--surface-1");
    const open = p.talk > 0 ? 2 + Math.abs(Math.sin(performance.now() / 90)) * 4 : 1.5;
    rrect(c, g.px + u * 0.08, g.headY + u * 0.08, u * 0.18, open, 1); c.fill();
    c.fillStyle = css("--text-muted");
    c.font = `${this.fs - 1}px ${FONT}`; c.textAlign = "center";
    c.fillText("사용자", g.px, this.h - 6);
    c.globalAlpha = 1;
  }

  drawAvatar(g) {
    const c = this.ctx, a = this.s.avatar, u = g.unit;
    c.globalAlpha = a.a;
    const tint = a.tint || css("--text-primary");
    c.fillStyle = "#3a3d44";
    rrect(c, g.ax - u * 0.55, g.base - u * 0.62, u * 1.1, u * 0.7, u * 0.25); c.fill(); // 몸
    c.fillStyle = tint;
    rrect(c, g.ax - u * 0.42, g.headY - u * 0.38, u * 0.84, u * 0.74, u * 0.22); c.fill(); // 머리
    c.strokeStyle = tint; c.lineWidth = 2;
    c.beginPath(); c.moveTo(g.ax, g.headY - u * 0.38); c.lineTo(g.ax, g.headY - u * 0.55); c.stroke();
    c.beginPath(); c.arc(g.ax, g.headY - u * 0.6, 3.5, 0, Math.PI * 2); c.fill(); // 안테나
    // 눈: 생각 중이면 위를 본다
    c.fillStyle = css("--surface-1");
    const ey = g.headY - u * 0.05 - a.think * u * 0.1;
    for (const dx of [-0.17, 0.17]) { c.beginPath(); c.arc(g.ax + dx * u, ey, u * 0.07, 0, Math.PI * 2); c.fill(); }
    const open = a.talk > 0 ? 2 + Math.abs(Math.sin(performance.now() / 80)) * 3 : 1.5;
    rrect(c, g.ax - u * 0.12, g.headY + u * 0.15, u * 0.24, open, 1); c.fill();
    c.fillStyle = css("--text-muted");
    c.font = `${this.fs - 1}px ${FONT}`; c.textAlign = "center";
    c.fillText("비서", g.ax, this.h - 6);
    c.globalAlpha = 1;
  }

  // 말풍선: owner 쪽 머리에서 꼬리가 나온다. tone 이 good/bad 면 왼쪽에 판정 표시
  drawSay(sayObj, owner, g) {
    if (!sayObj || sayObj.a <= 0) return;
    const c = this.ctx, fs = this.fs + 1;
    c.font = `${fs}px ${FONT}`;
    const maxW = Math.min(this.w * (this.narrow ? 0.66 : 0.4), 400);
    const k = Math.ceil([...sayObj.text].length * sayObj.p);
    const lines = wrap(c, sayObj.text, maxW - 28);
    const lh = fs * 1.45, padX = 14, iconW = sayObj.tone ? 22 : 0;
    const bw = Math.min(maxW, Math.max(...lines.map((l) => c.measureText(l).width)) + padX * 2 + iconW);
    const bh = lines.length * lh + 16;
    const hx = owner === "person" ? g.px : g.ax;
    const top = owner === "person" ? g.headY - g.unit * 0.75 - bh - 8 : g.headY - g.unit * 0.35 - bh;
    const x = owner === "person" ? Math.min(hx + g.unit * 0.1, this.w - bw - 4) : Math.max(4, hx - g.unit * 0.1 - bw);
    c.globalAlpha = sayObj.a;
    c.fillStyle = owner === "person" ? "#2f3238" : css("--surface-3");
    rrect(c, x, top, bw, bh, 12); c.fill();
    if (sayObj.tone) {
      c.strokeStyle = sayObj.tone === "good" ? css("--good") : css("--critical"); c.lineWidth = 2;
      rrect(c, x, top, bw, bh, 12); c.stroke();
      icon(c, sayObj.tone, x + padX + 6, top + 8 + lh / 2, 12);
    }
    // 꼬리
    c.fillStyle = owner === "person" ? "#2f3238" : css("--surface-3");
    const tx = owner === "person" ? x + 18 : x + bw - 18;
    c.beginPath(); c.moveTo(tx - 7, top + bh - 1); c.lineTo(tx + 7, top + bh - 1); c.lineTo(tx + (owner === "person" ? -6 : 6), top + bh + 11); c.fill();
    c.fillStyle = css("--text-primary"); c.textAlign = "left"; c.textBaseline = "middle";
    let left = k; // 한 글자씩 드러낸다 (줄 사이 띄어쓰기 한 칸을 함께 센다)
    lines.forEach((ln, i) => {
      const chars = [...ln];
      c.fillText(chars.slice(0, Math.max(0, Math.min(chars.length, left))).join(""), x + padX + iconW, top + 8 + lh * i + lh / 2);
      left -= chars.length + 1;
    });
    c.globalAlpha = 1;
    sayObj.box = { x, top, bw, bh };
  }

  // 생각 말풍선: 구름 모양 + 머리까지 작은 원 세 개. items 는 줄 목록, pick 은 강조할 줄, cross 는 지운 줄
  drawThought(g) {
    const t = this.s.thought;
    if (!t || t.a <= 0) return;
    const c = this.ctx, fs = this.fs;
    c.font = `${fs}px ${FONT}`;
    const maxW = Math.min(this.w * (this.narrow ? 0.7 : 0.5), 460);
    const lh = fs * 1.5;
    const rows = t.items.map((it) => wrap(c, it, maxW - 36));
    const n = rows.reduce((s, r) => s + r.length, 0) + (t.title ? 1 : 0);
    const bw = Math.min(maxW, Math.max(c.measureText(t.title || "").width, ...rows.flat().map((l) => c.measureText(l).width)) + 44);
    const bh = n * lh + 22;
    const owner = t.owner || "avatar";
    const hx = owner === "avatar" ? g.ax : owner === "helper" ? this.helperPos(g).x : g.px;
    const hy = owner === "helper" ? this.helperPos(g).y : g.headY;
    const x = owner === "avatar" ? Math.max(12, Math.min(this.w - bw - 22, hx - g.unit * 0.2 - bw * 0.85)) : Math.min(this.w - bw - 12, hx + g.unit * 0.6);
    // 카드가 떠 있으면 그 아래에 둔다 (좁은 화면에서 겹치지 않게)
    const top = owner === "helper" ? hy + g.unit * 0.8 : this.s.cards && this.s.cards.a > 0 && this.narrow ? this.cardsBottom + 10 : 18;
    c.globalAlpha = t.a;
    // 구름: 둥근 사각형 가장자리에 원을 둘러 볼록하게
    c.fillStyle = "#24262b"; c.strokeStyle = "#4a4e57"; c.lineWidth = 1.5;
    const bumps = Math.max(4, Math.round(bw / 46));
    c.beginPath();
    for (let i = 0; i <= bumps; i += 1) { const bx = x + (bw * i) / bumps; c.moveTo(bx + 14, top); c.arc(bx, top + 2, 14, 0, Math.PI * 2); }
    for (let i = 0; i <= bumps; i += 1) { const bx = x + (bw * i) / bumps; c.moveTo(bx + 14, top + bh); c.arc(bx, top + bh - 2, 14, 0, Math.PI * 2); }
    c.fill();
    rrect(c, x - 8, top, bw + 16, bh, 18); c.fill(); c.stroke();
    // 머리 쪽 작은 원
    const tailX = owner === "avatar" ? x + bw - 10 : x + 14;
    for (let i = 0; i < 3; i += 1) {
      const k = (i + 1) / 4;
      c.beginPath();
      c.arc(tailX + (hx - tailX) * k * 0.9, (owner === "helper" ? top : top + bh) + (hy - (owner === "helper" ? top : top + bh)) * k, 6 - i * 1.5, 0, Math.PI * 2);
      c.fill(); c.stroke();
    }
    c.textAlign = "left"; c.textBaseline = "middle";
    let y = top + 11 + lh / 2;
    if (t.title) { c.fillStyle = css("--text-muted"); c.fillText(t.title, x + 6, y); y += lh; }
    rows.forEach((ls, i) => {
      const shownRows = t.shown ?? rows.length;
      if (i >= shownRows) return;
      const picked = t.pick === i, crossed = t.cross?.includes(i);
      ls.forEach((ln, j) => {
        c.fillStyle = picked ? css("--text-primary") : crossed ? css("--text-muted") : css("--text-secondary");
        if (j === 0 && t.bullets !== false) { c.fillText(picked ? "▸" : "·", x + 6, y); }
        c.fillText(ln, x + 22, y);
        if (crossed) { c.strokeStyle = css("--text-muted"); c.lineWidth = 1.2; c.beginPath(); c.moveTo(x + 22, y); c.lineTo(x + 22 + c.measureText(ln).width, y); c.stroke(); }
        y += lh;
      });
    });
    c.globalAlpha = 1;
  }

  helperPos(g) { return { x: this.w * (this.narrow ? 0.2 : 0.18), y: this.h * 0.2 }; }

  // 도우미: 상위 모델(큰 아바타), 분석 에이전트(작은 아바타), 게이트(거름망)
  drawHelper(g) {
    const hp = this.s.helper;
    if (!hp || hp.a <= 0) return;
    const c = this.ctx, { x, y } = this.helperPos(g), u = g.unit * (hp.kind === "upper" ? 0.9 : 0.7);
    c.globalAlpha = hp.a;
    if (hp.kind === "gate") {
      c.strokeStyle = css("--series-2"); c.lineWidth = 3;
      c.beginPath(); c.moveTo(x - u, y - u * 0.4); c.lineTo(x + u, y - u * 0.4); c.lineTo(x + u * 0.25, y + u * 0.5); c.lineTo(x - u * 0.25, y + u * 0.5); c.closePath(); c.stroke();
      c.setLineDash([3, 4]); c.beginPath(); c.moveTo(x - u * 0.8, y - u * 0.05); c.lineTo(x + u * 0.8, y - u * 0.05); c.stroke(); c.setLineDash([]);
    } else {
      c.fillStyle = hp.kind === "upper" ? "#9aa3b5" : "#b6b1a6";
      rrect(c, x - u * 0.42, y - u * 0.38, u * 0.84, u * 0.74, u * 0.22); c.fill();
      c.fillStyle = css("--surface-1");
      for (const dx of [-0.17, 0.17]) { c.beginPath(); c.arc(x + dx * u, y - u * 0.05, u * 0.07, 0, Math.PI * 2); c.fill(); }
    }
    c.fillStyle = css("--text-secondary"); c.font = `${this.fs}px ${FONT}`; c.textAlign = "center"; c.textBaseline = "alphabetic";
    c.fillText(hp.label, x, y - u * 0.62);
    c.globalAlpha = 1;
  }

  // 기록 카드: 화면 가운데 위쪽에 쌓인다. hot 은 관련 기록(밝게), drop 은 게이트가 버린 것(아래로 떨어지며 사라짐)
  drawCards(g) {
    const cs = this.s.cards;
    this.cardsBottom = 0;
    if (!cs || cs.a <= 0) return;
    const c = this.ctx, fs = this.fs - 1;
    c.font = `${fs}px ${FONT}`;
    const cols0 = cs.cols || 1;
    const cw = Math.min(cols0 > 1 ? 250 : 380, (this.w * (this.narrow ? 0.9 : 0.62)) / cols0 - 8), ch = fs + 12;
    const cols = cs.cols || 1;
    const x0 = this.w * (this.narrow ? 0.5 : 0.48) - (cw * cols + 8 * (cols - 1)) / 2;
    const y0 = cs.y ?? 14;
    this.cardsBottom = y0 + Math.ceil(cs.items.length / cols) * (ch + 6);
    cs.items.forEach((it, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const appear = Math.max(0, Math.min(1, cs.p * cs.items.length - i));
      if (appear <= 0) return;
      let x = x0 + col * (cw + 8), y = y0 + row * (ch + 6);
      let alpha = cs.a * appear;
      if (it.drop) { y += (cs.dropP || 0) * 60; alpha *= 1 - (cs.dropP || 0) * 0.85; }
      if (it.fly) { // 아바타 쪽으로 날아간다
        const k = cs.flyP || 0;
        x += (g.ax - g.unit * 1.6 - x) * k; y += (g.headY - y) * k;
      }
      c.globalAlpha = alpha;
      c.fillStyle = it.hot ? "#2e3a35" : "#25272c";
      rrect(c, x, y, cw, ch, 5); c.fill();
      if (it.hot) { c.strokeStyle = css("--series-3"); c.lineWidth = 1.5; rrect(c, x, y, cw, ch, 5); c.stroke(); }
      c.fillStyle = it.hot ? css("--text-primary") : css("--text-muted");
      c.textAlign = "left"; c.textBaseline = "middle";
      let txt = it.text;
      while (c.measureText(txt).width > cw - 14 && txt.length > 2) txt = txt.slice(0, -2) + "…";
      c.fillText(txt, x + 7, y + ch / 2);
    });
    c.globalAlpha = 1;
  }

  // 기다림 시계: 아바타 옆 원호가 차오르고 늘어난 시간을 적는다
  drawClock(g) {
    const k = this.s.clock;
    if (!k || k.a <= 0) return;
    const c = this.ctx, r = g.unit * 0.32;
    const x = g.ax - g.unit * 1.15, y = g.base - g.unit * 0.25;
    c.globalAlpha = k.a;
    c.strokeStyle = "#3a3d44"; c.lineWidth = 4;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = k.color || css("--series-2");
    c.beginPath(); c.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k.p); c.stroke();
    c.fillStyle = css("--text-primary"); c.font = `600 ${this.fs}px ${FONT}`; c.textAlign = "right"; c.textBaseline = "middle";
    c.fillText(k.label, x - r - 8, y);
    c.globalAlpha = 1;
  }

  // 온도 다이얼: 바늘이 from 에서 to 로 돈다 (0.5~1 범위)
  drawDial(g) {
    const d = this.s.dial;
    if (!d || d.a <= 0) return;
    const c = this.ctx, r = g.unit * 0.55, x = this.w * 0.5, y = this.h * 0.32;
    const val = d.from + (d.to - d.from) * d.p;
    const ang = Math.PI * (1 + (val - 0.5) / 0.5);
    c.globalAlpha = d.a;
    c.strokeStyle = "#3a3d44"; c.lineWidth = 6;
    c.beginPath(); c.arc(x, y, r, Math.PI, 0); c.stroke();
    c.strokeStyle = css("--series-1"); c.lineWidth = 3;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(ang) * r * 0.9, y + Math.sin(ang) * r * 0.9); c.stroke();
    c.fillStyle = css("--text-primary"); c.font = `600 ${this.fs + 4}px ${FONT}`; c.textAlign = "center"; c.textBaseline = "alphabetic";
    c.fillText(`온도 ${val.toFixed(2)}`, x, y + 24);
    c.fillStyle = css("--text-muted"); c.font = `${this.fs - 1}px ${FONT}`;
    c.fillText("0.5", x - r, y + 16); c.fillText("1", x + r, y + 16);
    c.globalAlpha = 1;
  }

  draw() {
    if (!this.w) return;
    const c = this.ctx, g = this.geo();
    c.clearRect(0, 0, this.w, this.h);
    this.drawCards(g);
    this.drawHelper(g);
    this.drawDial(g);
    this.drawPerson(g);
    this.drawAvatar(g);
    this.drawClock(g);
    this.drawThought(g);
    this.drawSay(this.s.pSay, "person", g);
    this.drawSay(this.s.aSay, "avatar", g);
  }

  // 말하는 동안 입이 움직이도록 계속 다시 그린다
  async animate(ms, run, id, fn) {
    await tween(ms, (p, v) => { if (fn) fn(p, v); this.draw(); }, undefined, run, id);
  }

  // ---------- 대본 ----------
  // 단계: say(person|avatar), think, cards, flyCards, dropCards, helper, clock, dial, pause, clear
  async play(steps, run, id) {
    this.reset();
    for (const st of steps) {
      const s = this.s;
      switch (st.do) {
        case "say": {
          const key = st.who === "person" ? "pSay" : "aSay";
          const who = st.who === "person" ? s.person : s.avatar;
          if (st.who === "avatar" && s.pSay) s.pSay.a = this.narrow ? 0 : 0.45; // 좁은 화면에서는 두 말풍선이 겹치므로 감춘다
          s[key] = { text: st.text, tone: st.tone, a: 1, p: 0 };
          who.talk = 1;
          await this.animate(dur(Math.max(500, [...st.text].length * T.type)), run, id, (p) => { s[key].p = p; });
          who.talk = 0;
          this.draw();
          await sleep(dur(st.hold ?? 900), run, id);
          break;
        }
        case "think": {
          s.avatar.think = 1;
          s.thought = { items: st.items, title: st.title, pick: null, cross: st.cross, owner: st.owner, a: 0, shown: 0, bullets: st.bullets };
          await this.animate(dur(350), run, id, (_, v) => { s.thought.a = v; });
          for (let i = 1; i <= st.items.length; i += 1) {
            s.thought.shown = i;
            this.draw();
            await sleep(dur(st.each ?? 650), run, id);
          }
          if (st.pick != null) { s.thought.pick = st.pick; this.draw(); await sleep(dur(700), run, id); }
          await sleep(dur(st.hold ?? 900), run, id);
          s.avatar.think = 0;
          break;
        }
        case "unthink": await this.animate(dur(300), run, id, (_, v) => { if (s.thought) s.thought.a = 1 - v; }); s.thought = null; break;
        case "dimThought": await this.animate(dur(300), run, id, (_, v) => { if (s.thought) s.thought.a = 1 - v * 0.45; }); break;
        case "cards": {
          s.cards = { items: st.items, cols: st.cols, a: 1, p: 0, y: st.y };
          await this.animate(dur(st.ms ?? 900), run, id, (p) => { s.cards.p = p; });
          await sleep(dur(st.hold ?? 500), run, id);
          break;
        }
        case "dropCards": await this.animate(dur(700), run, id, (_, v) => { s.cards.dropP = v; }); break;
        case "flyCards": await this.animate(dur(900), run, id, (_, v) => { s.cards.flyP = v; }); break;
        case "hideCards": await this.animate(dur(300), run, id, (_, v) => { if (s.cards) s.cards.a = 1 - v; }); s.cards = null; break;
        case "helper": s.helper = { kind: st.kind, label: st.label, a: 0 }; await this.animate(dur(500), run, id, (_, v) => { s.helper.a = v; }); break;
        case "clock": {
          s.clock = { label: st.label, color: st.color, a: 1, p: 0 };
          s.avatar.think = 1;
          await this.animate(dur(st.ms ?? 1200), run, id, (p) => { s.clock.p = p; });
          s.avatar.think = 0;
          break;
        }
        case "dial": s.dial = { from: st.from, to: st.to, a: 1, p: 0 }; await this.animate(dur(1200), run, id, (_, v) => { s.dial.p = v; }); await sleep(dur(400), run, id); break;
        case "pause": await sleep(dur(st.ms ?? 600), run, id); break;
        case "clearSay": s.aSay = null; this.draw(); break;
        default: break;
      }
    }
    this.draw();
  }
}
