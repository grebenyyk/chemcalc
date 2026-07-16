# chemcalc

Hommage to the old chemcalc.org 
that allows to copy the molecular weight to the clipboard — a technology too advanced by today's standards.

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
| `CuSO4.5H2O` | hydrates / adducts (`.` `·` `∙` `*` join; the number after is a coefficient) |
| `[NH4]+`, `SO4^2-`, `SO4 2+` | charges (affects m/z only) |
| `13C6H12`, `2H2O` | specific-isotope labels (heavy water `2H2O` = D₂O) |

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
```
