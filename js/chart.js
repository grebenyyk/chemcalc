// Plain stick-spectrum renderer for the isotopic distribution. Black on white,
// no dependencies. Reads the canvas's CSS size and scales for crispness.

import { ELECTRON_MASS } from "./formulaParser.js";

/**
 * @param {HTMLCanvasElement} canvas
 * @param {Array<{mass:number,intensity:number}>} peaks  base peak intensity == 1
 * @param {{charge?:number}=} opts
 */
export function drawSpectrum(canvas, peaks, opts = {}) {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 600;
  const cssH = canvas.clientHeight || 180;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.clearRect(0, 0, cssW, cssH);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, cssW, cssH);

  const charge = opts.charge || 0;
  const toXVal = (m) => (charge !== 0 ? (m - charge * ELECTRON_MASS) / Math.abs(charge) : m);
  const xLabel = charge !== 0 ? "m/z" : "mass (Da)";

  const padL = 46;
  const padR = 12;
  const padT = 10;
  const padB = 26;
  const plotW = cssW - padL - padR;
  const plotH = cssH - padT - padB;

  ctx.strokeStyle = "#000";
  ctx.fillStyle = "#000";
  ctx.lineWidth = 1;
  ctx.font = "11px monospace";
  ctx.textBaseline = "middle";

  if (!peaks || peaks.length === 0) {
    ctx.fillText("(no distribution)", padL, cssH / 2);
    return;
  }

  const xs = peaks.map((p) => toXVal(p.mass));
  let xMin = Math.min(...xs);
  let xMax = Math.max(...xs);
  const span = xMax - xMin || 1;
  xMin -= span * 0.06;
  xMax += span * 0.06;
  const xRange = xMax - xMin;

  const px = (v) => padL + ((v - xMin) / xRange) * plotW;
  const py = (intensity) => padT + plotH - intensity * plotH;

  // axes
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + plotH);
  ctx.lineTo(padL + plotW, padT + plotH);
  ctx.stroke();

  // y tick labels (0 / 50 / 100 %)
  ctx.textAlign = "right";
  for (const v of [0, 0.5, 1]) {
    const y = py(v);
    ctx.fillText(`${Math.round(v * 100)}`, padL - 5, y);
  }

  // sticks
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (const p of peaks) {
    const x = px(toXVal(p.mass));
    const y = py(p.intensity);
    ctx.moveTo(x, padT + plotH);
    ctx.lineTo(x, y);
  }
  ctx.stroke();

  // x tick labels (5 evenly spaced)
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const ticks = 5;
  for (let t = 0; t <= ticks; t++) {
    const v = xMin + (xRange * t) / ticks;
    const x = px(v);
    ctx.fillText(formatMass(v), x, padT + plotH + 4);
  }

  // axis title
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.fillText(xLabel, padL + plotW, cssH - 1);
}

function formatMass(v) {
  if (Math.abs(v) >= 1000) return v.toFixed(0);
  if (Math.abs(v) >= 100) return v.toFixed(1);
  return v.toFixed(2);
}
