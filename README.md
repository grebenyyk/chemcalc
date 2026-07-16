# chemcalc

A small, self-contained **molecular-formula calculator** that runs entirely in
the browser — a drop-in replacement for the parts of chemcalc.org that matter for
everyday use. No framework, no build step, no network calls at runtime. Type a
formula and the results update as you type.

Designed to deploy as a static page to GitHub Pages at
`https://<username>.github.io/chemcalc/`.

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

Unknown elements and typos (e.g. `NaCL`, `Xx`) produce a clear error.

## Run it locally

It must be served over HTTP (opening `index.html` directly via `file://` won't
work, because the code is loaded as ES modules):

```bash
cd chemcalc
python3 -m http.server 8000
# open http://localhost:8000/
```

## Deploy to GitHub Pages

1. Create a repository named **`chemcalc`** (the name sets the URL).
2. Push every file in this folder to the `main` branch.
3. In the repo: **Settings → Pages → Source: Deploy from a branch → `main` /
   (root)**.
4. Wait a minute. Your site is live at
   `https://<username>.github.io/chemcalc/`.

All asset paths are relative, so it works under the `/chemcalc` subpath with no
configuration. (To serve from a subfolder instead of the repo root, point Pages
at that folder.)

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

## Notes & data

- **Monoisotopic mass convention:** this tool uses the *lightest* naturally
  occurring isotope of each element. This matches the first peak of the isotopic
  distribution it draws. (The literal IUPAC wording says "most abundant isotope",
  which disagrees with the first peak for a few elements such as Fe and Te — the
  lightest-isotope choice keeps the displayed mass and the chart consistent.)
- **Isotope data** comes from the CIAAW/AME representative isotopic composition
  (via `Gregstrq/Isotope-data`), covering elements that occur in nature
  (H → U, including Th, Pa, U). It is embedded in `js/elements.js`, so the page
  works offline once loaded.
- To refresh the dataset (optional): `python3 data/build_elements.py`
  (fetches the upstream CSV and rewrites `js/elements.js`).
