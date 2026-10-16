// Smoke test: run with `node test/smoke.mjs` (no dependencies; plain node)
import { pathToFileURL } from "node:url";
const dir = pathToFileURL(new URL("../js/", import.meta.url).pathname);
const { parseFormula } = await import(new URL("formulaParser.js", dir));
const { analyze } = await import(new URL("mass.js", dir));
const { isotopicDistribution } = await import(new URL("isotopes.js", dir));

let fails = 0;
function check(formula, prop, expected, tol, note = "") {
  const p = parseFormula(formula);
  const a = analyze(p);
  const got = a[prop];
  const ok = Math.abs(got - expected) <= tol;
  if (!ok) fails++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${formula.padEnd(24)} ${prop} = ${got.toFixed(4)} (want ${expected} ±${tol}) ${note}${
      p.warnings.length ? "  [warn: " + p.warnings.join(" | ") + "]" : ""
    }`
  );
  return { parsed: p, a, dist: isotopicDistribution(p) };
}
function checkBool(cond, label) {
  if (!cond) fails++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
}

// --- new: decimals ---
check("Fe0.5O", "averageMass", 43.92, 0.02); // 0.5*55.845 + 15.999
check("Fe0.5O", "totalAtoms", 1.5, 1e-9);
check("Mg0.5Fe0.5O", "averageMass", 56.07, 0.02); // 0.5*24.305+0.5*55.845+15.999
check("Co1.5O", "averageMass", 104.4, 0.05); // 1.5*58.933+15.999
check("YBa2Cu3O6.5", "averageMass", 658.19, 0.05); // YBCO, O6.5 content
check("(C2H4)0.6(C3H6)0.4", "averageMass", 33.66, 0.02); // C2.4H4.8
check("(CH3)2.5", "averageMass", 37.59, 0.02); // C2.5H7.5, decimal group multiplier
check("Fe0,5O", "averageMass", 43.92, 0.02, "(decimal comma)");

// --- new: fractions ---
check("CaSO4·1/2H2O", "averageMass", 145.15, 0.02); // hemihydrate
check("CaSO4.1/2H2O", "averageMass", 145.15, 0.02, "(via ambiguous dot -> fallback)");

// --- regressions: documented behavior unchanged ---
check("C8H10N4O2", "monoisotopicMass", 194.0804, 0.001); // caffeine
check("C8H10N4O2", "averageMass", 194.19, 0.01);
check("C6H12O6", "averageMass", 180.156, 0.01); // glucose
check("CuSO4.5H2O", "averageMass", 249.68, 0.02); // pentahydrate via dot joiner
check("[Co(NH3)6]Cl3", "averageMass", 267.47, 0.02);
check("13C6H12", "monoisotopicMass", 90.114, 0.005); // isotope labels intact
check("2H2O", "monoisotopicMass", 20.0231, 0.001); // D2O
const so4 = check("SO4^2-", "monoisotopicMass", 95.9517, 0.001);
checkBool(Math.abs(so4.a.mzMono - 47.9764) < 0.001, "SO4^2- m/z = 47.9764");
check("(P)22+", "charge", 22, 0, "charge parse unchanged");

// --- warnings surface on ambiguous decimal ---
const ybco = parseFormula("YBa2Cu3O6.5");
checkBool(ybco.warnings.length === 1, "YBCO emits exactly one decimal-reading warning");
const pent = parseFormula("CuSO4.5H2O");
checkBool(pent.warnings.length === 0, "pentahydrate emits no warning");
const fe25 = parseFormula("(Fe2.5)O3");
checkBool(Math.abs(fe25.counts.Fe - 2.5) < 1e-9, "(Fe2.5)O3 -> Fe 2.5");

// --- isotopic distribution with fractional counts ---
const dist = isotopicDistribution(parseFormula("Fe0.5O"));
checkBool(dist.length > 2 && Math.abs(dist[0].intensity - 1) < 1e-9, `Fe0.5O distribution (${dist.length} peaks, base=1)`);
const mean = dist.reduce((s, p) => s + p.mass * p.intensity, 0) / dist.reduce((s, p) => s + p.intensity, 0);
checkBool(Math.abs(mean - 43.924) < 0.05, `Fe0.5O intensity-weighted mean mass ~43.92 (got ${mean.toFixed(3)})`);
const dist13 = isotopicDistribution(parseFormula("13C6H12"));
checkBool(Math.abs(dist13[0].mass - 90.114) < 0.01, `13C6H12 first peak at mono mass (got ${dist13[0].mass.toFixed(4)})`);
const distHalf = isotopicDistribution(parseFormula("13C0.5")); // half a labelled carbon
checkBool(distHalf.length >= 2, `13C0.5 mixture envelope (${distHalf.length} peaks: unlabelled + shifted)`);

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILURE(S)`);
process.exit(fails === 0 ? 0 : 1);
