// Mass + elemental-composition calculations.
//
// Conventions (see data/elements.js header):
//  - monoisotopicMass uses the LIGHTEST naturally-occurring isotope of each element
//    (matches the first peak of the isotopic distribution).
//  - averageMass uses the isotope-weighted mean (≈ standard atomic weight).
//  - charge affects only m/z, never the neutral masses.

import { ELEMENTS } from "./elements.js";
import { ELECTRON_MASS } from "./formulaParser.js";

export function lightestIsotope(el) {
  return el.isotopes.reduce((m, x) => (x.mass < m.mass ? x : m), el.isotopes[0]);
}

export function elementAverageMass(el) {
  let s = 0;
  for (const iso of el.isotopes) s += iso.mass * iso.abundance;
  return s;
}

export function isotopeMass(el, massNumber) {
  const iso = el.isotopes.find((x) => x.a === massNumber);
  return iso ? iso.mass : null;
}

// Aggregate a parsed formula (natural counts + specific-isotope tags) into a
// per-element breakdown with both monoisotopic and average contributions.
function elementContributions(parsed) {
  const map = new Map(); // symbol -> { count, mono, avg }
  const add = (sym, count, monoPerAtom, avgPerAtom) => {
    const e = map.get(sym) || { count: 0, mono: 0, avg: 0 };
    e.count += count;
    e.mono += count * monoPerAtom;
    e.avg += count * avgPerAtom;
    map.set(sym, e);
  };

  for (const sym in parsed.counts) {
    const el = ELEMENTS[sym];
    if (!el) throw new Error(`Unknown element "${sym}"`);
    const count = parsed.counts[sym];
    const light = lightestIsotope(el);
    add(sym, count, light.mass, elementAverageMass(el));
  }
  for (const t of parsed.tagged) {
    const el = ELEMENTS[t.element];
    if (!el) throw new Error(`Unknown element "${t.element}"`);
    const m = isotopeMass(el, t.massNumber);
    if (m === null)
      throw new Error(`Isotope ${t.massNumber}${t.element} is not available in the database.`);
    add(t.element, t.count, m, m); // fixed isotope: mono == avg
  }
  return map;
}

/**
 * @returns {{
 *   monoisotopicMass:number, averageMass:number, nominalMass:number,
 *   charge:number, mzMono:number|null,
 *   totalAtoms:number,
 *   composition:Array<{symbol,name,count,mass,percent}>,
 * }}
 */
export function analyze(parsed) {
  const map = elementContributions(parsed);
  let mono = 0;
  let avg = 0;
  let nominal = 0;
  let totalAtoms = 0;
  const composition = [];

  for (const [sym, e] of map) {
    const el = ELEMENTS[sym];
    const light = lightestIsotope(el);
    mono += e.mono;
    avg += e.avg;
    nominal += e.count * light.a;
    totalAtoms += e.count;
    composition.push({
      symbol: sym,
      name: el.name,
      count: e.count,
      mass: e.avg,
      percent: 0, // filled after totals known
    });
  }

  if (avg > 0) for (const c of composition) c.percent = (c.mass / avg) * 100;

  // sort composition by Hill-ish order: C, H, then alphabetical (common convention)
  composition.sort((a, b) => hillOrder(a.symbol) - hillOrder(b.symbol));

  const charge = parsed.charge || 0;
  const mzMono = charge !== 0 ? (mono - charge * ELECTRON_MASS) / Math.abs(charge) : null;

  return {
    monoisotopicMass: mono,
    averageMass: avg,
    nominalMass: nominal,
    charge,
    mzMono,
    totalAtoms,
    composition,
  };
}

function hillOrder(sym) {
  if (sym === "C") return 0;
  if (sym === "H") return 1;
  return 2 + sym.charCodeAt(0); // alphabetical-ish after C,H
}
