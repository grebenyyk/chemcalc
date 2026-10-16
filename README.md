# chemcalc

An hommage to the old chemcalc.org 
that allows you to copy the molecular weight to the clipboard — a technology too advanced by today's standards.

## What it computes

From a molecular formula it gives:

- **Monoisotopic mass** (using the lightest isotope of each element — the first
  peak of the distribution)
- **Average mass** / molecular weight (isotope-weighted mean)
- **Nominal mass**, total atom count
- **Elemental composition** — atoms, mass contribution, and % by mass per element
- **Theoretical isotopic distribution** — a stick-spectrum chart plus a peak
  table (mass, m/z when charged, relative %)

## Formula syntax

| You can write | Meaning |
| --- | --- |
| `C8H10N4O2` | plain counts |
| `(CH3)2`, `[Co(NH3)6]Cl3` | nested groups with multipliers |
| `CuSO4·5H2O`, `NaCl.H2O` | hydrates / adducts (`·` `∙` `*` `•` join; `.` only when no digit precedes it) |
| `[NH4]+`, `SO4^2-`, `SO4 2+` | charges (affects m/z only) |
| `13C6H12`, `2H2O` | specific-isotope labels (heavy water `2H2O` = D₂O) |
| `Fe0.5O`, `(C2H4)0.6(C3H6)0.4`, `CuSO4·1/2H2O` | non-integer counts — decimals, fractions (see below) |

## Non-integer counts

Subscripts may be decimals or fractions — for non-stoichiometric / defect
phases, polymer averages, and fractional hydrates:

- `Fe0.5O`, `Mg0.5Fe0.5O`, `O2.2(H2O)0.5` — decimal subscripts anywhere
- `(C2H4)0.6(C3H6)0.4` — fractional group multipliers
- `CaSO4·1/2H2O` — fractional hydrate coefficient (a decimal like `CuSO4*2.5H2O`
  works after any joiner)

Fractional atoms are treated statistically (expected composition): the isotopic
distribution of `Fe0.5O` is the O pattern convolved with a 50/50 mixture of
with/without an extra Fe atom.

**Dot rule.** A `.` between two digits is a decimal point. Write hydrates and
adducts with an explicit joiner: `CuSO4·5H2O` or `CuSO4*5H2O`. The schoolbook
spelling `CuSO4.5H2O` is therefore read as CuSO₄.₅H₂ — a warning is shown
whenever that hydrate reading was also plausible, so the ambiguity is never
silent. A `.` still joins when no digit precedes it (`NaCl.H2O`), and in
`CaSO4.1/2H2O` the `1/2` after the dot is taken as the coefficient
(hemihydrate). Decimal commas are accepted (`Fe0,5O`).

## Files

```
index.html          page + layout
css/style.css       plain, minimal styling
js/
  app.js            live input → recompute → render
  formulaParser.js  recursive-descent parser (groups, hydrates, charge, isotopes)
  mass.js           monoisotopic / average / nominal mass + composition
  isotopes.js       isotopic distribution via convolution
  chart.js          canvas stick-spectrum (no dependencies)
  elements.js       periodic-table + isotope data (generated; the foundation)
data/
  build_elements.py one-time generator for js/elements.js (not needed at runtime)
test/
  smoke.mjs         node smoke tests (no deps); CI gate before deploy
```
