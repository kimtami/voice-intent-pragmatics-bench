// 첫 장면의 음성 파형. play() 동안 말하듯 움직이고, 끝나면 낮게 가라앉는다.

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export class Wave {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext("2d");
    this.level = 0.08;
    this.t = 0;
    this.on = false;
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }

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
    const n = Math.max(24, Math.floor(this.w / 9));
    const bw = this.w / n;
    c.fillStyle = css("--speech");
    for (let i = 0; i < n; i += 1) {
      // 가운데가 크고 양 끝이 작은 말소리 모양. 사인 몇 개를 섞어 규칙이 덜 보이게 한다
      const env = Math.sin((i / (n - 1)) * Math.PI);
      const v = 0.5 + 0.5 * Math.sin(i * 0.9 + this.t * 7) * Math.sin(i * 0.37 - this.t * 3.1);
      const hh = Math.max(3, this.h * 0.9 * env * (this.level * 0.25 + this.level * 0.75 * v));
      c.beginPath();
      c.roundRect(i * bw + bw * 0.25, (this.h - hh) / 2, bw * 0.5, hh, 2);
      c.fill();
    }
  }

  async speak(ms) {
    if (ms <= 0) { this.level = 0.6; this.t = 1; this.draw(); return; }
    this.on = true;
    const t0 = performance.now();
    await new Promise((resolve) => {
      const step = (now) => {
        const p = (now - t0) / Math.max(1, ms);
        this.t = now / 1000;
        this.level = p < 0.1 ? p / 0.1 : p > 0.85 ? Math.max(0.08, (1 - p) / 0.15) : 1;
        this.draw();
        if (p < 1 && this.on) requestAnimationFrame(step); else resolve();
      };
      requestAnimationFrame(step);
    });
    this.level = 0.08;
    this.draw();
  }

  stop() { this.on = false; this.level = 0.08; this.draw(); }
}
