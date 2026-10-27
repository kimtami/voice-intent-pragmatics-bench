// 지연(가로) 대 정확도(세로) 지도. 점은 기준점(from)에서 결과 위치로 이동하고, 신뢰구간 막대가 뒤따른다.
// 색은 '언제 계산하나' 범주색, 기준점은 회색. 라벨은 겹치면 자리를 바꾸고, 그래도 겹치면 숨긴다(마우스를 올리면 보임).

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export class Plane {
  constructor(canvas, tooltip) {
    this.cv = canvas;
    this.ctx = canvas.getContext("2d");
    this.tip = tooltip;
    this.points = [];
    this.opts = null;
    this.hoverId = null;
    this.zoneAlpha = 0;
    this.targetAlpha = 0;
    new ResizeObserver(() => this.resize()).observe(canvas);
    canvas.addEventListener("pointermove", (e) => this.onMove(e));
    canvas.addEventListener("pointerleave", () => { this.hoverId = null; this.tip.hidden = true; this.draw(); });
    this.resize();
  }

  setChapter(opts, points) {
    this.opts = opts;
    this.points = points.map((p) => ({ prog: p.from ? 0 : 1, alpha: 0, ciAlpha: 0, dim: false, highlight: false, ...p }));
    this.zoneAlpha = 0;
    this.targetAlpha = 0;
    this.draw();
  }

  get(id) { return this.points.find((p) => p.id === id); }

  resize() {
    const r = this.cv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.cv.width = Math.round(this.w * dpr);
    this.cv.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const narrow = this.w < 520;
    this.pad = { l: narrow ? 40 : 52, r: narrow ? 12 : 24, t: 34, b: narrow ? 44 : 52 };
    this.font = narrow ? 11 : 13;
    this.draw();
  }

  sx(ms) {
    const { min, max, log } = this.opts.x;
    const t = log ? (Math.log(ms) - Math.log(min)) / (Math.log(max) - Math.log(min)) : (ms - min) / (max - min);
    return this.pad.l + t * (this.w - this.pad.l - this.pad.r);
  }

  sy(acc) {
    const { min, max } = this.opts.y;
    return this.pad.t + (1 - (acc - min) / (max - min)) * (this.h - this.pad.t - this.pad.b);
  }

  pos(p) {
    if (!p.from) return [this.sx(p.x), this.sy(p.y)];
    const f = this.get(p.from) || p;
    const t = p.prog;
    return [this.sx(f.x + (p.x - f.x) * t), this.sy(f.y + (p.y - f.y) * t)];
  }

  ticksX() {
    const { min, max, log } = this.opts.x;
    const cand = log ? [300, 400, 500, 700, 1000, 1500, 2000, 3000, 5000, 7000] : [];
    if (!log) for (let v = Math.ceil(min / 50) * 50; v <= max; v += 50) cand.push(v);
    const inRange = cand.filter((v) => v >= min && v <= max);
    const minGap = this.w < 520 ? 44 : 60;
    const out = [];
    for (const v of inRange) if (!out.length || this.sx(v) - this.sx(out[out.length - 1]) >= minGap) out.push(v);
    return out;
  }

  draw() {
    const c = this.ctx;
    if (!this.opts) return;
    c.clearRect(0, 0, this.w, this.h);
    const ink2 = css("--text-secondary"), ink3 = css("--text-muted"), grid = css("--grid"), surface = css("--surface-1");
    c.font = `${this.font}px Pretendard Variable, Pretendard, system-ui, sans-serif`;
    c.textBaseline = "middle";

    // 빠르고 정확한 칸 (목표 정확도 이상, 1초 이하)
    const tgt = this.opts.target;
    if (tgt && this.zoneAlpha > 0) {
      const x0 = this.sx(this.opts.x.min), x1 = this.sx(Math.min(1000, this.opts.x.max));
      const y0 = this.sy(this.opts.y.max), y1 = this.sy(tgt.y - 2);
      c.fillStyle = css("--zone");
      c.globalAlpha = this.zoneAlpha;
      c.fillRect(x0, y0, x1 - x0, y1 - y0);
      c.globalAlpha = this.zoneAlpha;
      c.fillStyle = ink2;
      c.textAlign = "left";
      c.fillText("빠르고 정확한 칸", x0 + 8, y0 + 14);
      c.globalAlpha = 1;
    }

    // 격자와 눈금
    c.strokeStyle = grid;
    c.lineWidth = 1;
    c.fillStyle = ink3;
    c.textAlign = "center";
    for (const v of this.ticksX()) {
      const x = this.sx(v);
      c.beginPath(); c.moveTo(x, this.pad.t); c.lineTo(x, this.h - this.pad.b); c.stroke();
      c.fillText(v >= 1000 ? `${v / 1000}초` : `${v}ms`, x, this.h - this.pad.b + 16);
    }
    c.textAlign = "right";
    const { min: ymin, max: ymax } = this.opts.y;
    const step = ymax - ymin > 40 ? 20 : ymax - ymin > 20 ? 10 : 5;
    for (let v = Math.ceil(ymin / step) * step; v <= ymax; v += step) {
      const y = this.sy(v);
      c.beginPath(); c.moveTo(this.pad.l, y); c.lineTo(this.w - this.pad.r, y); c.stroke();
      c.fillText(`${v}%`, this.pad.l - 8, y);
    }
    c.fillStyle = ink2;
    c.textAlign = "center";
    c.fillText("첫 소리까지 걸린 시간 (중앙값) →", (this.pad.l + this.w - this.pad.r) / 2, this.h - 12);
    c.textAlign = "left";
    c.fillText("↑ 말뜻을 맞힌 정도", 4, 12);

    // 목표선
    if (tgt && this.targetAlpha > 0) {
      const y = this.sy(tgt.y);
      c.globalAlpha = this.targetAlpha;
      c.setLineDash([5, 5]);
      c.strokeStyle = ink2;
      c.beginPath(); c.moveTo(this.pad.l, y); c.lineTo(this.w - this.pad.r, y); c.stroke();
      c.setLineDash([]);
      c.globalAlpha = 1;
    }

    // 이동 궤적
    for (const p of this.points) {
      if (!p.from || p.alpha <= 0) continue;
      const f = this.get(p.from);
      if (!f) continue;
      const [x0, y0] = [this.sx(f.x), this.sy(f.y)];
      const [x1, y1] = this.pos(p);
      c.globalAlpha = p.alpha * (p.dim ? 0.15 : 0.55);
      c.strokeStyle = p.color;
      c.lineWidth = 2;
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    }
    c.globalAlpha = 1;

    // 신뢰구간 막대: showCi 인 점만 (기본은 이동한 방법 점). 겹쳐 어지럽지 않게 옅고 가늘게
    for (const p of this.points) {
      const show = p.showCi ?? !!p.from;
      if (!show || !p.ci || p.ciAlpha <= 0 || p.prog < 1) continue;
      const x = this.sx(p.x);
      c.globalAlpha = p.ciAlpha * (p.dim ? 0.1 : 0.45);
      c.strokeStyle = p.ref || p.base ? ink3 : p.color;
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(x, this.sy(Math.max(this.opts.y.min, p.ci[0])));
      c.lineTo(x, this.sy(Math.min(this.opts.y.max, p.ci[1])));
      c.stroke();
    }
    c.globalAlpha = 1;

    // 점: 2px 바탕색 테두리로 겹친 점을 가른다
    const boxes = [];
    for (const p of this.points) {
      if (p.alpha <= 0) continue;
      const [x, y] = this.pos(p);
      const r = p.highlight ? 9 : p.ref ? 5 : 6.5;
      c.globalAlpha = p.alpha * (p.dim ? 0.2 : 1);
      c.fillStyle = surface;
      c.beginPath(); c.arc(x, y, r + 2, 0, Math.PI * 2); c.fill();
      c.fillStyle = p.ref || p.base ? (p.ref ? ink3 : css("--text-primary")) : p.color;
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
      if (p.highlight) {
        c.strokeStyle = css("--text-primary");
        c.lineWidth = 2;
        c.beginPath(); c.arc(x, y, r + 5, 0, Math.PI * 2); c.stroke();
      }
      boxes.push({ p, x, y, r });
    }
    c.globalAlpha = 1;

    // 라벨: 오른쪽, 왼쪽, 위, 아래 순으로 빈자리를 찾는다
    const placed = boxes.map((b) => ({ x0: b.x - b.r - 2, y0: b.y - b.r - 2, x1: b.x + b.r + 2, y1: b.y + b.r + 2 }));
    const hit = (a) => placed.some((b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0);
    const order = [...boxes].sort((a, b) => (b.p.highlight - a.p.highlight) || (!!b.p.base - !!a.p.base) || (!!a.p.ref - !!b.p.ref));
    for (const b of order) {
      const { p } = b;
      if (p.alpha < 0.6 || (p.from && p.prog < 0.98) || !p.label) continue;
      const tw = c.measureText(p.label).width, th = this.font + 4;
      const g = b.r + 6;
      const cands = [[g, -th / 2], [-g - tw, -th / 2], [-tw / 2, -g - th], [-tw / 2, g], [-4, -g - th], [-4, g], [-tw + 4, -g - th], [-tw + 4, g]];
      for (const [dx, dy] of cands) {
        const box = { x0: b.x + dx - 2, y0: b.y + dy, x1: b.x + dx + tw + 2, y1: b.y + dy + th };
        const inside = box.x0 > 2 && box.x1 < this.w - 2 && box.y0 > 18 && box.y1 < this.h - this.pad.b;
        if (inside && !hit(box)) {
          placed.push(box);
          c.globalAlpha = p.dim ? 0.3 : 1;
          c.textAlign = "left";
          // 바탕색 테두리를 먼저 그려 선·막대 위에서도 읽히게 한다
          c.strokeStyle = surface;
          c.lineWidth = 4;
          c.lineJoin = "round";
          c.strokeText(p.label, b.x + dx, b.y + dy + th / 2);
          c.fillStyle = p.ref ? ink3 : p.highlight || p.base ? css("--text-primary") : ink2;
          c.fillText(p.label, b.x + dx, b.y + dy + th / 2);
          break;
        }
      }
    }
    c.globalAlpha = 1;
    this.boxes = boxes;
  }

  onMove(e) {
    if (!this.boxes) return;
    const r = this.cv.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    let best = null, bd = 18; // 마우스 판정 범위는 점보다 크게
    for (const b of this.boxes) {
      const d = Math.hypot(b.x - mx, b.y - my);
      if (d < bd) { bd = d; best = b; }
    }
    if (!best) { this.tip.hidden = true; return; }
    const p = best.p;
    this.tip.innerHTML = p.tooltip;
    this.tip.hidden = false;
    const tw = this.tip.offsetWidth, th = this.tip.offsetHeight;
    let left = best.x + 14, top = best.y - th - 10;
    if (left + tw > this.w) left = best.x - tw - 14;
    if (top < 0) top = best.y + 14;
    this.tip.style.left = `${left}px`;
    this.tip.style.top = `${top}px`;
  }
}
