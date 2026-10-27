// 한 번의 대화 턴을 시간축으로 그린다. 줄마다 [말하기 전 | 사용자가 말함 | 첫 소리까지 기다림 | 비서가 말함].
// 방법이 '미리' 계산하면 칩이 왼쪽 칸에 들어가고 기다림은 그대로, '답하기 전에' 계산하면 기다림 칸이 늘어난다.

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export class Turn {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext("2d");
    this.rows = [];
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }

  setRows(rows) { this.rows = rows.map((r) => ({ grow: 0, alpha: 0, chip: 0, ...r })); this.draw(); }

  resize() {
    const r = this.cv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.cv.width = Math.round(this.w * dpr);
    this.cv.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }

  draw() {
    const c = this.ctx;
    c.clearRect(0, 0, this.w, this.h);
    if (!this.rows.length) return;
    const narrow = this.w < 560;
    const font = narrow ? 11 : 13;
    c.font = `${font}px Pretendard Variable, Pretendard, system-ui, sans-serif`;
    c.textBaseline = "middle";
    const labelW = narrow ? 92 : 150;
    const x0 = labelW, x1 = this.w - 8;
    const aheadW = (x1 - x0) * 0.13, speakW = (x1 - x0) * 0.22;
    const maxMs = 5200; // 가장 긴 기다림(서브에이전트 4.7초)이 들어가도록
    const waitScale = (x1 - x0 - aheadW - speakW - (x1 - x0) * 0.12) / maxMs;
    const rowH = Math.min(64, (this.h - 34) / this.rows.length);
    const ink = css("--text-primary"), ink2 = css("--text-secondary"), ink3 = css("--text-muted"), grid = css("--grid");

    // 칸 머리말
    c.fillStyle = ink3;
    c.textAlign = "center";
    c.fillText("말하기 전", x0 + aheadW / 2, 12);
    c.fillText("사용자가 말함", x0 + aheadW + speakW / 2, 12);
    c.textAlign = "left";
    c.fillText("말이 끝난 뒤 → 첫 소리", x0 + aheadW + speakW + 6, 12);

    this.rows.forEach((row, i) => {
      const y = 30 + i * rowH + rowH / 2;
      c.globalAlpha = row.alpha;
      c.fillStyle = ink2;
      c.textAlign = "left";
      c.fillText(row.label, 0, y);
      // 말하기 전 칸
      c.strokeStyle = grid;
      c.setLineDash([3, 4]);
      c.strokeRect(x0 + 0.5, y - 12.5, aheadW - 6, 25);
      c.setLineDash([]);
      // 사용자 발화
      c.fillStyle = css("--speech");
      c.fillRect(x0 + aheadW, y - 9, speakW - 4, 18);
      // 기다림 (말이 끝난 뒤 첫 소리까지)
      const sx = x0 + aheadW + speakW;
      const ww = row.ms * waitScale * row.grow;
      c.fillStyle = row.timing === "before" ? row.color : grid;
      c.globalAlpha = row.alpha * (row.timing === "before" ? 0.55 : 1);
      c.fillRect(sx, y - 4, ww, 8);
      c.globalAlpha = row.alpha;
      // 비서 첫 소리 + 응답
      if (row.grow >= 1) {
        c.fillStyle = ink;
        c.fillRect(sx + ww, y - 9, Math.min(60, x1 - sx - ww), 18);
        c.fillStyle = ink;
        c.textAlign = "left";
        const txt = row.ms >= 1000 ? `${(row.ms / 1000).toFixed(1)}초` : `${row.ms}ms`;
        c.fillText(txt, sx + ww + Math.min(60, x1 - sx - ww) + 6 > x1 - 40 ? sx + 4 : sx + ww + 66, y + (sx + ww + 66 > x1 - 40 ? -16 : 0));
      }
      // 방법 칩
      if (row.chipText && row.chip > 0) {
        c.globalAlpha = row.alpha * row.chip;
        const tw = c.measureText(row.chipText).width + 14;
        let cx;
        if (row.timing === "ahead") cx = x0 + (aheadW - 6 - tw) / 2;
        else if (row.timing === "before") cx = sx + 4;
        else cx = sx + ww + 4; // 답하면서: 응답 막대 위
        const cy = y - 12 - (1 - row.chip) * 18 - (row.timing === "ahead" ? 0 : 14);
        c.fillStyle = row.color;
        c.beginPath();
        c.roundRect(Math.max(x0, cx), cy, tw, 22, 4);
        c.fill();
        c.fillStyle = css("--on-series");
        c.textAlign = "left";
        c.fillText(row.chipText, Math.max(x0, cx) + 7, cy + 11);
      }
      c.globalAlpha = 1;
    });
  }
}
