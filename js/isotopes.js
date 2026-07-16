// Theoretical isotopic distribution via convolution.
//
// For each natural element appearing N times we need its N-fold self-convolution
// (computed by exponentiation-by-squaring). Specific-isotope ("tagged") atoms
// contribute a single fixed mass, i.e. a delta that simply shifts the envelope.
//
// Every convolution step (a) merges peaks within `mergeTol` using an
// intensity-weighted centroid (kills floating-point near-duplicate explosion) and
// (b) prunes peaks below `threshold` of the running base peak (bounds peak count,
// so even proteins stay sub-second). No FFT needed.

import { ELEMENTS } from "./elements.js";
import { isotopeMass } from "./mass.js";

const DEFAULTS = { threshold: 1e-7, mergeTol: 1e-4, maxPeaks: 3000 };

function pruneAndMerge(peaks, o) {
  if (peaks.length === 0) return peaks;
  peaks.sort((p, q) => p.mass - q.mass);
  const merged = [];
  for (const p of peaks) {
    const last = merged[merged.length - 1];
    if (last && p.mass - last.mass <= o.mergeTol) {
      const newInt = last.intensity + p.intensity;
      last.mass = (last.mass * last.intensity + p.mass * p.intensity) / newInt;
      last.intensity = newInt;
    } else {
      merged.push({ mass: p.mass, intensity: p.intensity });
    }
  }
  let maxI = 0;
  for (const p of merged) if (p.intensity > maxI) maxI = p.intensity;
  const cutoff = maxI * o.threshold;
  let kept = cutoff > 0 ? merged.filter((p) => p.intensity >= cutoff) : merged.slice();
  if (kept.length > o.maxPeaks) {
    kept.sort((a, b) => b.intensity - a.intensity);
    kept = kept.slice(0, o.maxPeaks).sort((a, b) => a.mass - b.mass);
  }
  return kept;
}

function convolve(A, B, o) {
  const out = [];
  for (let a = 0; a < A.length; a++) {
    const pa = A[a];
    for (let b = 0; b < B.length; b++) {
      const pb = B[b];
      out.push({ mass: pa.mass + pb.mass, intensity: pa.intensity * pb.intensity });
    }
  }
  return pruneAndMerge(out, o);
}

// pattern convolved with itself `count` times (count >= 1).
function powConvolve(pattern, count, o) {
  let result = [{ mass: 0, intensity: 1 }];
  let base = pattern;
  let n = count;
  while (n > 0) {
    if (n & 1) result = convolve(result, base, o);
    n = Math.floor(n / 2);
    if (n > 0) base = convolve(base, base, o);
  }
  return result;
}

/**
 * @param {{counts:Object, tagged:Array}} parsed
 * @returns {Array<{mass:number, intensity:number}>} sorted by mass, base peak = 1.0
 */
export function isotopicDistribution(parsed, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const patternCache = new Map();
  let dist = [{ mass: 0, intensity: 1 }];

  for (const sym in parsed.counts) {
    const count = parsed.counts[sym];
    if (count <= 0) continue;
    const el = ELEMENTS[sym];
    if (!el) continue;
    let pattern = patternCache.get(sym);
    if (!pattern) {
      pattern = el.isotopes.map((iso) => ({ mass: iso.mass, intensity: iso.abundance }));
      patternCache.set(sym, pattern);
    }
    dist = convolve(dist, powConvolve(pattern, count, o), o);
  }

  // tagged atoms -> single fixed-mass offset
  let offset = 0;
  for (const t of parsed.tagged) {
    const m = isotopeMass(ELEMENTS[t.element], t.massNumber);
    if (m !== null) offset += m * t.count;
  }
  if (offset !== 0) for (const p of dist) p.mass += offset;

  let maxI = 0;
  for (const p of dist) if (p.intensity > maxI) maxI = p.intensity;
  if (maxI > 0) for (const p of dist) p.intensity /= maxI;
  dist.sort((a, b) => a.mass - b.mass);
  return dist;
}
