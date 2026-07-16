// UI wiring: live (debounced) formula input -> parse -> analyze -> render.

import { parseFormula, ParseError, ELECTRON_MASS } from "./formulaParser.js";
import { analyze } from "./mass.js";
import { isotopicDistribution } from "./isotopes.js";
import { drawSpectrum } from "./chart.js";

const $ = (id) => document.getElementById(id);
const input = $("mf");

let timer = null;
let lastPeaks = null;
let lastCharge = 0;

function fmt(n, d = 6) {
  return Number.isFinite(n) ? n.toFixed(d) : "—";
}
function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ---- formula display: elements shown in the order first typed (not sorted).
//      The composition table below is sorted separately. ----
function formulaHtml(parsed) {
  const present = new Set([...Object.keys(parsed.counts), ...parsed.tagged.map((t) => t.element)]);
  const ordered = [];
  for (const s of parsed.order || []) if (present.has(s) && !ordered.includes(s)) ordered.push(s);
  for (const s of present) if (!ordered.includes(s)) ordered.push(s);
  let html = "";
  for (const sym of ordered) {
    const tm = new Map();
    for (const t of parsed.tagged)
      if (t.element === sym) tm.set(t.massNumber, (tm.get(t.massNumber) || 0) + t.count);
    for (const [a, c] of tm) html += `<sup>${a}</sup>${sym}${c !== 1 ? `<sub>${c}</sub>` : ""}`;
    const nc = parsed.counts[sym] || 0;
    if (nc > 0) html += `${sym}${nc !== 1 ? `<sub>${nc}</sub>` : ""}`;
  }
  if (parsed.charge) {
    const sign = parsed.charge > 0 ? "+" : "-";
    const m = Math.abs(parsed.charge);
    html += `<sup>${m !== 1 ? m : ""}${sign}</sup>`;
  }
  return html || "—";
}

function renderMasses(a) {
  const rows = [
    ["Molecular weight (average mass)", fmt(a.averageMass)],
    ["Monoisotopic mass", fmt(a.monoisotopicMass)],
    ["Nominal mass", a.nominalMass],
    ["Total atoms", a.totalAtoms],
    ["Charge", a.charge === 0 ? "0" : (a.charge > 0 ? "+" : "") + a.charge],
  ];
  if (a.mzMono !== null) rows.push(["m/z (monoisotopic)", fmt(a.mzMono)]);
  $("masses").innerHTML = rows
    .map(([k, v]) => `<tr><td class="l">${esc(k)}</td><td>${v}</td></tr>`)
    .join("");
}

function renderComposition(a) {
  $("composition").innerHTML = a.composition
    .map(
      (c) =>
        `<tr><td class="l">${esc(c.symbol)} <span class="name">${esc(c.name)}</span></td>` +
        `<td>${c.count}</td><td>${fmt(c.mass)}</td><td>${c.percent.toFixed(3)}</td></tr>`
    )
    .join("");
}

function renderPeaks(peaks, charge) {
  const head = $("peaks-head");
  const body = $("peaks");
  const MAX = 60;
  const shown = peaks.slice(0, MAX);
  head.innerHTML =
    `<tr><th>#</th>` +
    (charge !== 0 ? `<th>m/z</th>` : "") +
    `<th>Mass (Da)</th><th>Relative %</th></tr>`;
  body.innerHTML = shown
    .map((p, i) => {
      let cells = `<td>${i + 1}</td>`;
      if (charge !== 0) {
        const mz = (p.mass - charge * ELECTRON_MASS) / Math.abs(charge);
        cells += `<td>${fmt(mz)}</td>`;
      }
      cells += `<td>${fmt(p.mass)}</td><td>${(p.intensity * 100).toFixed(2)}</td>`;
      return `<tr>${cells}</tr>`;
    })
    .join("");
  if (peaks.length > MAX)
    body.innerHTML += `<tr><td colspan="${charge !== 0 ? 4 : 3}" class="l">… ${peaks.length - MAX} more peaks not shown</td></tr>`;
}

function showError(e) {
  $("results").hidden = true;
  $("error").textContent = e instanceof ParseError ? `Error: ${e.message}` : `Error: ${e.message || e}`;
  $("warnings").textContent = "";
  lastPeaks = null;
}
function clearError() {
  $("error").textContent = "";
}

function compute(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    $("results").hidden = true;
    clearError();
    $("warnings").textContent = "";
    lastPeaks = null;
    return;
  }
  let parsed;
  try {
    parsed = parseFormula(trimmed);
  } catch (e) {
    showError(e);
    return;
  }
  clearError();
  $("warnings").textContent = parsed.warnings.join(" ");

  const totalAtoms =
    Object.values(parsed.counts).reduce((a, b) => a + b, 0) +
    parsed.tagged.reduce((a, t) => a + t.count, 0);
  if (totalAtoms === 0) {
    $("results").hidden = true;
    $("error").textContent = "No atoms in formula.";
    lastPeaks = null;
    return;
  }

  const a = analyze(parsed);
  const peaks = isotopicDistribution(parsed);
  lastPeaks = peaks;
  lastCharge = parsed.charge || 0;

  $("formula").innerHTML = formulaHtml(parsed);
  renderMasses(a);
  renderComposition(a);
  renderPeaks(peaks, parsed.charge || 0);
  drawSpectrum($("chart"), peaks, { charge: parsed.charge || 0 });
  $("results").hidden = false;
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const text = input.value;
    compute(text);
    const url = new URL(location.href);
    if (text.trim()) url.searchParams.set("mf", text);
    else url.searchParams.delete("mf");
    history.replaceState(null, "", url);
  }, 120);
}

input.addEventListener("input", schedule);

// example links
document.querySelectorAll(".examples a[data-mf]").forEach((a) =>
  a.addEventListener("click", (e) => {
    e.preventDefault();
    input.value = a.dataset.mf;
    schedule();
  })
);

// redraw chart on resize
window.addEventListener("resize", () => {
  if (lastPeaks) drawSpectrum($("chart"), lastPeaks, { charge: lastCharge });
});

// initial: from ?mf= or default example
const initial = new URL(location.href).searchParams.get("mf");
input.value = initial !== null ? initial : "C8H10N4O2";
compute(input.value);
