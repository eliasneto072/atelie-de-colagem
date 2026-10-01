/** The example shown on first visit: a sunset and a hot-air balloon, drawn in code. */
import { quadPts, type Pt } from '../core/geometry';
import { ctx2d, mkCanvas } from './dom';

export function makeLandscape(): HTMLCanvasElement {
  const w = 1400,
    h = 880,
    c = mkCanvas(w, h),
    x = ctx2d(c);
  const sky = x.createLinearGradient(0, 0, 0, 640);
  sky.addColorStop(0, '#1d3254');
  sky.addColorStop(0.5, '#6f6489');
  sky.addColorStop(0.82, '#e39a6e');
  sky.addColorStop(1, '#f6cf99');
  x.fillStyle = sky;
  x.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) {
    const sx = (i * 397) % w,
      sy = (i * 131) % 260;
    x.fillStyle = `rgba(255,255,255,${0.15 + (i % 5) * 0.1})`;
    x.fillRect(sx, sy, 1.6, 1.6);
  }
  const sx = 930,
    sy = 548,
    glow = x.createRadialGradient(sx, sy, 0, sx, sy, 380);
  glow.addColorStop(0, 'rgba(255,226,170,.9)');
  glow.addColorStop(0.22, 'rgba(255,196,130,.38)');
  glow.addColorStop(1, 'rgba(255,180,120,0)');
  x.fillStyle = glow;
  x.fillRect(0, 0, w, h);
  x.fillStyle = '#ffe8bb';
  x.beginPath();
  x.arc(sx, sy, 60, 0, Math.PI * 2);
  x.fill();
  const ridge = (base: number, waves: [number, number, number][], color: string) => {
    x.fillStyle = color;
    x.beginPath();
    x.moveTo(0, h);
    for (let px = 0; px <= w; px += 4) {
      let y = base;
      for (const [f, a, p] of waves) y -= Math.sin(px * f + p) * a;
      x.lineTo(px, y);
    }
    x.lineTo(w, h);
    x.closePath();
    x.fill();
  };
  ridge(
    565,
    [
      [0.004, 62, 1],
      [0.011, 26, 2],
      [0.027, 8, 0.5],
    ],
    '#8a6e8e',
  );
  ridge(
    605,
    [
      [0.003, 70, 4],
      [0.009, 28, 1],
      [0.031, 7, 2],
    ],
    '#5a4b6d',
  );
  ridge(
    645,
    [
      [0.005, 42, 2.2],
      [0.017, 16, 0.3],
      [0.05, 5, 1],
    ],
    '#30314a',
  );
  const lake = x.createLinearGradient(0, 662, 0, h);
  lake.addColorStop(0, '#c78a73');
  lake.addColorStop(0.22, '#5a5370');
  lake.addColorStop(1, '#1b2034');
  x.fillStyle = lake;
  x.fillRect(0, 662, w, h - 662);
  x.fillStyle = 'rgba(255,226,170,.5)';
  for (let i = 0; i < 15; i++) {
    const yy = 672 + i * 13,
      ww = 130 - i * 6 + Math.sin(i * 1.7) * 18;
    x.fillRect(sx - ww / 2 + Math.sin(i * 2.3) * 10, yy, ww, 2.5);
  }
  x.fillStyle = '#121624';
  x.beginPath();
  x.moveTo(0, h);
  x.lineTo(0, 770);
  x.bezierCurveTo(200, 735, 380, 805, 560, 835);
  x.lineTo(690, h);
  x.closePath();
  x.fill();
  return c;
}

/** The balloon on a light sky, plus the outline of the balloon (for the preset selection). */
export function makeBalloon(): { canvas: HTMLCanvasElement; outline: Pt[] } {
  const w = 600,
    h = 760,
    c = mkCanvas(w, h),
    x = ctx2d(c);
  const bg = x.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#b4c3cf');
  bg.addColorStop(1, '#e3e8eb');
  x.fillStyle = bg;
  x.fillRect(0, 0, w, h);
  for (const [cx, cy, r] of [
    [110, 610, 120],
    [210, 650, 100],
    [500, 140, 110],
    [560, 200, 90],
    [60, 120, 70],
  ]) {
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(255,255,255,.75)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(cx - r, cy - r, 2 * r, 2 * r);
  }
  const env = new Path2D();
  env.arc(300, 290, 220, Math.PI, Math.PI * 2);
  env.quadraticCurveTo(505, 470, 372, 568);
  env.lineTo(228, 568);
  env.quadraticCurveTo(95, 470, 80, 290);
  env.closePath();
  x.save();
  x.clip(env);
  const cols = ['#e8a13a', '#cf4f3a', '#f1e2c0', '#2c7a86'];
  for (let k = -5; k < 5; k++) {
    const g = new Path2D();
    g.moveTo(300, 60);
    g.quadraticCurveTo(300 + k * 66, 300, 300 + k * 18, 580);
    g.lineTo(300 + (k + 1) * 18, 580);
    g.quadraticCurveTo(300 + (k + 1) * 66, 300, 300, 60);
    g.closePath();
    x.fillStyle = cols[(k + 8) % 4];
    x.fill(g);
    x.strokeStyle = 'rgba(70,30,30,.35)';
    x.lineWidth = 1.5;
    x.stroke(g);
  }
  const hl = x.createRadialGradient(210, 165, 0, 210, 165, 270);
  hl.addColorStop(0, 'rgba(255,255,255,.42)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = hl;
  x.fillRect(0, 0, w, h);
  const sh = x.createLinearGradient(270, 0, 540, 0);
  sh.addColorStop(0, 'rgba(25,12,30,0)');
  sh.addColorStop(1, 'rgba(25,12,30,.38)');
  x.fillStyle = sh;
  x.fillRect(0, 0, w, h);
  const sb = x.createLinearGradient(0, 380, 0, 575);
  sb.addColorStop(0, 'rgba(25,12,30,0)');
  sb.addColorStop(1, 'rgba(25,12,30,.3)');
  x.fillStyle = sb;
  x.fillRect(0, 0, w, h);
  x.restore();
  x.fillStyle = '#7b2f25';
  x.beginPath();
  x.moveTo(228, 566);
  x.lineTo(372, 566);
  x.lineTo(338, 606);
  x.lineTo(262, 606);
  x.closePath();
  x.fill();
  x.strokeStyle = '#3b2a20';
  x.lineWidth = 2.2;
  x.beginPath();
  for (const [a, b] of [
    [266, 258],
    [288, 286],
    [312, 314],
    [334, 342],
  ]) {
    x.moveTo(a, 606);
    x.lineTo(b, 634);
  }
  x.stroke();
  x.fillStyle = '#6e441d';
  x.beginPath();
  x.roundRect(250, 630, 100, 12, 4);
  x.fill();
  x.fillStyle = '#8b5a2b';
  x.beginPath();
  x.roundRect(254, 638, 92, 58, [2, 2, 8, 8]);
  x.fill();
  x.strokeStyle = 'rgba(0,0,0,.25)';
  x.lineWidth = 1.2;
  x.beginPath();
  for (let yy = 648; yy < 694; yy += 9) {
    x.moveTo(256, yy);
    x.lineTo(344, yy);
  }
  for (let xx = 266; xx < 344; xx += 14) {
    x.moveTo(xx, 642);
    x.lineTo(xx, 694);
  }
  x.stroke();
  const outline: Pt[] = [];
  for (let i = 0; i <= 40; i++) {
    const a = Math.PI + (i / 40) * Math.PI;
    outline.push([300 + Math.cos(a) * 220, 290 + Math.sin(a) * 220]);
  }
  outline.push(...quadPts([520, 290], [505, 470], [372, 568], 16));
  outline.push(
    [338, 607],
    [344, 630],
    [351, 630],
    [351, 697],
    [249, 697],
    [249, 630],
    [256, 630],
    [262, 607],
  );
  outline.push([228, 568], ...quadPts([228, 568], [95, 470], [80, 290], 16));
  return { canvas: c, outline };
}
