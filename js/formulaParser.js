// Molecular-formula parser (recursive descent, position-tracked errors).
//
// Grammar (informal):
//   formula      := adductTerm ( joiner adductTerm )*  trailingCharge?
//   adductTerm   := [0-9]* unitSeq          -- a leading integer (only right
//                                              after a joiner) is a coefficient
//   unitSeq      := unit ( unit )*           -- stops at a joiner / end / ')'/']'
//   unit         := '(' unitSeq ')' count?
//                 | '[' unitSeq ']' count?
//                 | isotopeNum? ELEMENT count?
//   count        := [0-9]+
//   isotopeNum   := [0-9]+   (binds to the single element that follows)
//   joiner       := '.' | '·' | '∙' | '*' | '•'   (hydrate / adduct)
//   trailingCharge := '^' <charge> | <charge>     (see matchChargeAt)
//
// Disambiguation rules:
//  * A number right AFTER a joiner is a stoichiometric coefficient for that term
//    (so "CuSO4.5H2O" -> CuSO4 + 5 H2O).
//  * A number anywhere else (including at the start) immediately before an element
//    is an isotopic prefix, e.g. "13C6H12", "2H2O" (heavy water = D2O).
//  * Charges use '^' anywhere, or a +/- form only when followed by end/joiner.
//  * Charge affects m/z only, never the neutral mass.

import { ELEMENTS } from "./elements.js";

const SYMBOLS = new Set(Object.keys(ELEMENTS));
const JOINERS = new Set([".", "·", "∙", "*", "•"]);

export const ELECTRON_MASS = 0.000548579909065; // unified atomic mass units

export class ParseError extends Error {
  constructor(message, position) {
    super(message);
    this.name = "ParseError";
    this.position = position; // 0-based index into the input, or null
  }
}

const isDigit = (c) => c >= "0" && c <= "9";
const isUpper = (c) => c >= "A" && c <= "Z";
const isLower = (c) => c >= "a" && c <= "z";
const isSign = (c) => c === "+" || c === "-";
const isWs = (c) => c === " " || c === "\t" || c === "\n" || c === "\r";
const isLetter = (c) => isUpper(c) || isLower(c);

// Case-insensitive element input: normalize a formula to canonical element case
// (e.g. "fe(oh)3" / "FE(OH)3" -> "Fe(OH)3"), preserving length so error
// positions stay valid. Disambiguation follows standard chemistry convention:
// a properly-cased two-letter symbol is honored ("Co" = cobalt), but two
// adjacent letters that are EACH valid single-letter elements are kept separate
// ("CO"/"co" = carbon+oxygen, so "CO2" is not read as cobalt).
function normalizeCase(input) {
  let out = "";
  let i = 0;
  const n = input.length;
  while (i < n) {
    if (isLetter(input[i])) {
      let j = i;
      while (j < n && isLetter(input[j])) j++;
      out += segmentRun(input.slice(i, j), i);
      i = j;
    } else {
      out += input[i];
      i++;
    }
  }
  return out;
}

function segmentRun(run, basePos) {
  let out = "";
  let p = 0;
  while (p < run.length) {
    const L1 = run[p];
    const L2 = run[p + 1];
    const u1 = L1.toUpperCase();
    if (L2 !== undefined && L1 === u1 && isLower(L2) && SYMBOLS.has(u1 + L2)) {
      out += u1 + L2; // proper-case two-letter symbol: Co, Fe, Na, Cl, ...
      p += 2;
      continue;
    }
    if (L2 !== undefined) {
      const c2 = u1 + L2.toLowerCase();
      const bothSingle = SYMBOLS.has(u1) && SYMBOLS.has(L2.toUpperCase());
      if (SYMBOLS.has(c2) && !bothSingle) {
        out += c2; // two-letter symbol reached via wrong case: fe/FE/cu/cl/na ...
        p += 2;
        continue;
      }
    }
    if (SYMBOLS.has(u1)) {
      out += u1; // single-letter element
      p += 1;
      continue;
    }
    throw new ParseError(`Unknown element "${run.slice(p, p + 2).trim()}"`, basePos + p);
  }
  return out;
}

/**
 * Parse a molecular formula string.
 * @returns {{ counts:Object, tagged:Array, charge:number, warnings:Array }}
 *   counts: symbol -> number of natural-abundance atoms
 *   tagged: [{ element, massNumber, count }] specific-isotope atoms
 */
export function parseFormula(input) {
  const s = normalizeCase(String(input));
  let i = 0;
  const counts = {};
  const tagged = [];
  const order = [];
  const warnings = [];
  let charge = 0;

  const peek = () => s[i];
  const eof = () => i >= s.length;
  const skipWs = () => {
    while (!eof() && isWs(s[i])) i++;
  };
  const err = (msg, pos = i) => {
    throw new ParseError(msg + ` (at position ${pos + 1})`, pos);
  };

  function readInt() {
    const start = i;
    while (!eof() && isDigit(s[i])) i++;
    if (i === start) return null;
    return parseInt(s.slice(start, i), 10);
  }

  // A count/multiplier: a run of digits NOT immediately followed by a +/- sign.
  // Digits immediately followed by a sign form a charge instead (e.g. "(P)22+"
  // -> charge +22, not P22 with charge +1).
  function readCount() {
    skipWs();
    const start = i;
    while (!eof() && isDigit(s[i])) i++;
    if (i === start) return null;
    if (!eof() && isSign(s[i])) {
      i = start; // leave the digits for charge parsing
      return null;
    }
    return parseInt(s.slice(start, i), 10);
  }

  function readElement() {
    if (eof() || !isUpper(s[i])) err("Expected an element symbol");
    const start = i;
    const c1 = s[i++];
    let sym = c1;
    if (!eof() && isLower(s[i])) sym += s[i]; // tentative two-letter symbol
    if (SYMBOLS.has(sym)) {
      if (sym.length === 2) i++;
    } else if (SYMBOLS.has(c1)) {
      sym = c1; // one-letter symbol; stray lowercase follows
    } else {
      err(`Unknown element "${sym}"`, start);
    }
    if (!order.includes(sym)) order.push(sym); // first-appearance order for display
    return sym;
  }

  // Match a charge pattern starting at index j (no side effects).
  // Returns { value, next } or null.
  function matchChargeAt(j) {
    const n = s.length;
    const boundary = (k) => {
      while (k < n && isWs(s[k])) k++;
      return k >= n || JOINERS.has(s[k]) || s[k] === ")" || s[k] === "]";
    };
    if (j >= n) return null;

    if (s[j] === "^") {
      let k = j + 1;
      // <digits><sign>
      let d = k;
      while (d < n && isDigit(s[d])) d++;
      if (d > k && d < n && isSign(s[d]))
        return { value: (s[d] === "+" ? 1 : -1) * parseInt(s.slice(k, d), 10), next: d + 1 };
      // <sign>[<digits>]
      if (k < n && isSign(s[k])) {
        const sign = s[k];
        let m = k + 1;
        while (m < n && isDigit(s[m])) m++;
        const num = m > k + 1 ? parseInt(s.slice(k + 1, m), 10) : 1;
        return { value: (sign === "+" ? 1 : -1) * num, next: m };
      }
      return null;
    }

    // no '^': <digits><sign>
    let d = j;
    while (d < n && isDigit(s[d])) d++;
    if (d > j && d < n && isSign(s[d]) && boundary(d + 1))
      return { value: (s[d] === "+" ? 1 : -1) * parseInt(s.slice(j, d), 10), next: d + 1 };
    // <sign>[<digits>]
    if (isSign(s[j])) {
      const sign = s[j];
      let m = j + 1;
      while (m < n && isDigit(s[m])) m++;
      const num = m > j + 1 ? parseInt(s.slice(j + 1, m), 10) : 1;
      if (boundary(m)) return { value: (sign === "+" ? 1 : -1) * num, next: m };
    }
    return null;
  }

  // If a charge sits at the current position, consume it and add to `charge`.
  function tryConsumeCharge() {
    skipWs();
    const m = matchChargeAt(i);
    if (!m) return false;
    charge += m.value;
    i = m.next;
    return true;
  }

  function scaleFrag(frag, mult) {
    if (mult === 1) return frag;
    for (const k in frag.counts) frag.counts[k] *= mult;
    for (const t of frag.tagged) t.count *= mult;
    return frag;
  }

  function mergeFrag(dst, src) {
    for (const k in src.counts) dst.counts[k] = (dst.counts[k] || 0) + src.counts[k];
    for (const t of src.tagged) dst.tagged.push({ ...t });
    return dst;
  }

  function parseUnit() {
    skipWs();
    if (eof()) err("Unexpected end of formula");
    const c = s[i];

    if (c === "(" || c === "[") {
      const close = c === "(" ? ")" : "]";
      i++;
      const inner = parseUnitSeq();
      skipWs();
      if (eof() || s[i] !== close)
        err(`Expected "${close}"`);
      i++;
      const mult = readCount() ?? 1;
      return scaleFrag(inner, mult);
    }

    // element, optionally with an isotopic prefix
    let isotopeNum = null;
    if (isDigit(c)) isotopeNum = readInt();
    const sym = readElement();
    const mult = readCount() ?? 1;
    if (isotopeNum !== null) {
      // validate that this mass number exists for the element (warn, don't throw,
      // so mass calc can still surface a clear message)
      const iso = ELEMENTS[sym].isotopes.find((x) => x.a === isotopeNum);
      if (!iso)
        warnings.push(`Isotope ${isotopeNum}${sym} is not in the database (treating its mass as unknown).`);
      return { counts: {}, tagged: [{ element: sym, massNumber: isotopeNum, count: mult }] };
    }
    return { counts: { [sym]: mult }, tagged: [] };
  }

  // Parse a run of units until a joiner / end / closing bracket. Charge tokens
  // that appear between units are consumed here. tryConsumeCharge is safe to
  // call before every unit: its boundary check rejects a leading digit that is
  // actually an isotopic prefix (e.g. "13C", "2H") since those are followed by
  // an element, not a sign.
  function parseUnitSeq() {
    const frag = { counts: {}, tagged: [] };
    while (true) {
      skipWs();
      if (eof() || s[i] === ")" || s[i] === "]" || JOINERS.has(s[i])) break;
      if (tryConsumeCharge()) continue;
      mergeFrag(frag, parseUnit());
    }
    return frag;
  }

  // ---- top level ----
  const result = { counts: {}, tagged: [] };
  mergeFrag(result, parseUnitSeq());

  while (true) {
    skipWs();
    if (eof()) break;
    if (JOINERS.has(s[i])) {
      i++;
      skipWs();
      const coef = readCount(); // coefficient after a joiner (may be absent -> 1)
      const term = parseUnitSeq();
      if (coef !== null) scaleFrag(term, coef);
      mergeFrag(result, term);
      continue;
    }
    if (s[i] === "^" || isSign(s[i])) {
      if (tryConsumeCharge()) continue;
      err(`Unexpected "${s[i]}"`);
    }
    err(`Unexpected "${s[i]}"`);
  }

  result.charge = charge;
  result.order = order;
  result.warnings = warnings;
  return result;
}
