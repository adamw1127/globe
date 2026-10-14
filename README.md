# Economic Globe

An interactive 3D globe of economic, financial and social data from 1600 to today. Click a territory (or search for one), pick a year, and the left panel shows every metric that has a real recorded value for that place and year, each with a trend chart that opens full size. The right panel lists notable events for the place and period and has a chat that answers questions about the data. Borders change with the year.

React + Vite, Globe.gl (three.js), Recharts and Tailwind. All data is static JSON in `public/`. The app makes no API calls at runtime.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/
```

`npm run build:artifact -- <folder>` builds a copy for hosts that limit file counts (such as a claude.ai Artifact): it packs the trade and per-territory files into a few bundles (`data/packs/`) and the flags into one file.

Views are shareable through the URL hash, for example `#year=1914&color=exports_usd&sel=GBR`.

## How it fits together

| Path | What it is |
| --- | --- |
| `public/config/metrics.json` | **Metrics registry.** The UI renders entirely from it. |
| `public/config/categories.json` | Side-panel sections: add, rename or reorder them here. |
| `public/config/eras.json` | Era labels on the slider and the era-based coverage notes. |
| `public/data/metrics/<id>.json` | One file per metric: `{ entityCode: { year: value } }`. |
| `public/data/entities.json` | Maps map territories to data entities (see below). |
| `public/data/borders/` | Snapshots to 1885, `cshapes.json` (TopoJSON, every shape dated with the years it applies to) for 1886 to 2013, Natural Earth from 2014, and `land.json` drawn under every map. |
| `public/data/stats/<id>.json` | Per metric: color breaks, countries ranked per year, and regional ranges per slider stop. |
| `public/data/trade/<CODE>/<year>.json` | Top exports, imports and partners for one territory-year. |
| `public/data/entity/<CODE>.json` | Every metric for one territory, for the panels and the chat. |
| `public/data/timeline.json` | Slider stops, the first year each metric can color the map, and years it would leave the map blank. |
| `scripts/lib/timeline.mjs` | Year rules shared by the scripts and the app (benchmarks, latest-value fill). |
| `src/data/borders.js` | Border loader. The only code that knows where borders come from. |

### Adding a metric

1. Add an entry to `public/config/metrics.json`:

   ```json
   {
     "id": "my_metric",
     "name": "My metric",
     "category": "economy",
     "priority": 7,
     "source": "Where it comes from",
     "unit": "% of GDP",
     "format": "percent",
     "firstYear": null,
     "description": "Shown when hovering the metric name.",
     "loader": { "type": "worldbank", "indicator": "XX.YYY.ZZZ" }
   }
   ```

2. Put the data at `public/data/metrics/my_metric.json` as `{ "FRA": { "1990": 1.5 } }`. For a World Bank indicator, `npm run data:worldbank my_metric` does it. For an Our World in Data chart, use `"loader": { "type": "owid", "slug": "...", "column": "..." }` and `npm run data:owid`.
3. Run `npm run data:coverage` to set `firstYear` and `lastYear` from the data and recompute the slider stops.

No UI code changes are needed. The metric shows up in its category (sorted by `priority`, lower first) and in the "Color by" menu.

Formats: `usd`, `usd_compact`, `percent`, `compact`, `integer`, `decimal1`, `decimal2`, `label` (text shown as a tag) and `events` (a list of names, such as wars). Labels and events get tags instead of a trend chart and are left out of the choropleth. A metric can also list `extend` loaders that only fill years its main source lacks (population uses the World Bank from 1960 and long-run estimates before that).

### Display rules

- **Benchmark years before 1820.** The slider stops at 1600, 1650, 1700, 1750, 1800 and 1820, then every year. Each benchmark stands for its span (1700 means 1700 to 1749): a figure is the first value inside the span, and events cover the whole span. Set in `eras.json` (`benchmarks`, `annualFrom`).
- **Latest value for ended series.** When a series has ended (for example it stops in 2021 and you view 2023), the panel and map use its last value if it is at most 10 years old, marked with the year it is from. Metrics with `"carryForward": false` (wars, banking crises, colonial status) never do this.
- **Slider blocker.** The slider skips years in which no territory has data for the "Color by" metric, and shades the blocked stretch at the start.
- A metric appears only when it has a value for that territory in that year or span. Sections start collapsed under a card of headline figures (`summaryMetrics` in `metrics.json`).
- `badge` on a metric says when to use it over a look-alike (GDP vs. long-run GDP, for example); `sourceUrl` links each metric to its source.
- The coverage note adapts to the era (`coverageNotes` in `eras.json`) and names the metrics when only a few exist.
- **Colors** run from red (worse) to green (better), following each metric's `better` field (`up` or `down`); measures with no better direction run red for low to green for high. By default one scale per metric covers every year (breaks in `data/stats/<id>.json`), so a color means the same value in 1900 and 2000; the legend can switch to this year's spread. Gray means no figure; the darker land layer is land no state on that map covers.
- **Estimates** fill missing values, always marked "est." and drawn faded on the map. They are computed in `scripts/lib/estimates.mjs` from real figures only: between two real values of the same territory (`estimate.interpolate`), a historical state's present-day successor for rates and per-person measures (`estimate.proxy`), or the typical range (20th to 80th percentile) of the region's countries that year, else of all countries (`estimate.peers`). Measures that did not exist yet (`notApplicable`) say so; anything else says why it is unknown, with an "Ask Claude for a rough estimate" button on claude.ai whose answer is labeled as Claude's guess and never stored.
- **Percentiles** for every recorded value (`$pct` in the entity bundles, computed against present-day countries that year).
- **Definitions**: underlined terms and metric names show a short definition with a Wikipedia link on hover or tap (`src/data/glossary.js`).
- Notable events come only from the datasets (wars, regime changes, banking crises, inflation above 40%, GDP falls of 8% or more). The AI summary and the chat use Claude through the claude.ai Artifact `sample` capability, so they work only on the claude.ai copy of the page; the chat reads the globe's data through tools and says when it is using general knowledge.

## Borders and historical entities

`npm run data:borders` builds three border sources and tags every territory with `ENTITY` (an ISO3 code, a historical key, `PART:<ISO3>`, or null), `RULER` (the ruling power when the territory is subject to another, used for "Colonial status") and, on the old maps, `REGION` for territories that match no data entity:

- **1600 to 1885:** snapshots from [historical-basemaps](https://github.com/aourednik/historical-basemaps) by A. Ourednik (GPL-3.0). A year uses the latest snapshot at or before it; a later one would show states before they existed.
- **1886 to 2013:** [CShapes 2.0](https://icr.ethz.ch/data/cshapes/) (ETH Zurich, CC BY-NC-SA 4.0), which dates every border change of states and colonies, so each year gets its own map. Sovereignty comes from the Gleditsch-Ward list of independent states; colonial rulers from the [ICOW Colonial History](https://www.paulhensel.org/icowcol.html) dataset plus the handovers it does not record (German colonies after 1919, Spain's in 1898 and so on, listed in the script).
- **2014 onward:** Natural Earth (public domain) de facto borders (Crimea under Russia), which is also how the World Bank compiles Ukraine's figures from 2014.
- **Land layer:** Natural Earth land drawn under every map, so land that a map leaves unclaimed shows as land rather than as a hole in the globe.

`public/data/entities.json` has two parts:

- `aliases`: border names mapped to codes. Names not listed are matched to modern countries automatically. A value can be a list of `{ "until": 1944, "code": "COD" }` rules for names that change meaning (the 1880 "Congo" is today's DR Congo), or `{ "partOf": "VNM" }` for a territory that is only part of a modern state.
- `historical`: entities such as `SUN` (USSR), `YUG`, `CSK`, `DDR`, `BRD`, `AUH`, `OTT`, `QING`, `RAJ`, with `from`, `to` and `successors`. Datasets that cover these units directly (Maddison, Polity, V-Dem, RICardo) attach their data to the same code.

How data attaches to a territory:

1. Data for the entity's own code wins, within its `from`/`to` lifetime.
2. If the entity has a `proxy` (only set when one successor is clearly the core, such as the Russian Empire and Russia), the panel uses the successor's series and marks those rows. The map never paints proxy data.
3. Otherwise the panel says "No data for this entity in this period" and lists the successor states as buttons that open their present-day data. Nothing is guessed.

## Data sources and pipeline

`npm run data:all` rebuilds everything. Downloads are cached in `scripts/.cache/` (not committed). Run order matters because later steps merge into earlier output.

| Script | Source | Coverage found in the data |
| --- | --- | --- |
| `data:worldbank` | World Bank WDI API | 64 indicators, mostly 1960 to 2025 |
| `data:owid` | Our World in Data grapher CSVs | Long-run population (1600+), life expectancy (1603+), urbanization (1600+), literacy (1650+), child mortality (1751+), CO2 (1750+), oil production (1900+), years of schooling (1870+), V-Dem democracy (1789+) |
| `data:maddison` | Maddison Project Database 2023 | GDP per capita and GDP, 1600 to 2022 |
| `data:polity` | Polity5 (Center for Systemic Peace) | Polity score and regime type, 1776 to 2018 (USA to 2020) |
| `data:jst` | Jorda-Schularick-Taylor Macrohistory R6 | Interest rates, house prices, bank credit, public debt, wages, banking crises: 18 economies, 1870 to 2020 |
| `data:ricardo` | RICardo (Sciences Po medialab) | Total exports and imports in US$ (Federico-Tena, 1800 to 1938) and top 5 partners |
| `data:wars` | Brecke Conflict Catalog, Correlates of War, UCDP/PRIO | Wars each territory took part in, 1600 to 2025 (see below) |
| `data:borders` | historical-basemaps; Natural Earth | 19 historical snapshots, 1600 to 2010, plus current borders (2011, 2014) |
| `data:flags` | flagcdn.com | Flag images, saved locally |
| `data:atlas` | Atlas of Economic Complexity (Harvard Growth Lab) API | Top 5 products and partners, goods only, 1962 to 2024 |
| `data:sess` | Official Soviet trade statistics via SESS (Hokkaido University) | USSR partners and commodity groups, 1946 to 1989 |
| `data:imf` | IMF International Trade in Goods (Direction of Trade) API | Partners for territory-years still uncovered, 1948 onward |
| `data:cow-trade` | Correlates of War Trade v4.0 | Partners for territory-years still uncovered, 1870 to 2014 (mainly 1939 to 1947) |
| `data:coverage` | All of the above | Writes `firstYear`/`lastYear` and `timeline.json` |

Coverage in the registry is measured from the files, not assumed. Some notes from doing that:

- **Maddison:** the official workbook is on Dataverse, which blocks scripted downloads. The loader uses `scripts/.cache/mpd2023_web.xlsx` when present (download it by hand from the Maddison site) and otherwise reads Our World in Data's copy of the same 2023 release.
- **Timeline:** a year becomes a slider stop if it is a border snapshot or at least 10 territories have some value (a number, a label or an event such as a war). With the current sources every year from 1600 qualifies (Maddison alone has annual figures for about ten countries), so the slider moves year by year. If a source is removed and early years thin out, the slider goes back to snapping between the years that have data.

## Trade data

There is no mock or generated data anywhere in the app. Each territory-year trade file can hold `exports` and `imports` (top 5 products) and `partners` (top 5 export and import partners), each with a share of the total and a US$ value. `sources` names where each part came from.

- **1800 to 1938: RICardo.** Partners come from bilateral flows. Shares are computed within one source table per territory-year, so currencies are never mixed. RICardo has no product breakdown.
- **1962 to 2024: Atlas of Economic Complexity.** Products are SITC rev. 2 four-digit codes for 1962 to 1994 and HS 1992 four-digit codes from 1995 (the code shows in the chart tooltip). Shares are of total goods trade; services are excluded.
- **USSR, 1946 to 1989: official Soviet statistics** (*Vneshnyaya torgovlya SSSR*, the foreign-trade yearbooks), as digitized in the Soviet and Russian Economic Statistical Series at Hokkaido University. Partners are by country; products are the broad Soviet commodity groups. Values are shown in rubles, as published. Part of Soviet exports was never attributed to a named country (widely believed to be mostly arms). The tables give subtotals for socialist, developed and developing countries, so the unattributed remainder is known per region; partners are ranked with the rule below. The source has no figures for 1990 and 1991.
- **Gaps, 1948 onward: IMF** trade-by-partner statistics, used for any territory-year the sources above do not cover (for example 1948 to 1961, or Czechoslovakia and Yugoslavia).
- **Remaining gaps, mainly 1939 to 1947: Correlates of War Trade v4.0** (League of Nations data compiled by Hicks).
- **Products before 1962:** I found no open dataset with product-level trade by country before 1962 (the Atlas's SITC data starts that year), so product charts start in 1962, or 1946 for the USSR's commodity groups.

**Ranking rule (all partner sources).** Every source leaves some trade unattributed to a named country (the IMF's "other countries", "special categories" for military goods, regional "not specified" lines, or a national total larger than the sum of partners). A partner is only shown if it is larger than the largest such bucket, because an unlisted country can hide in at most one bucket. So the panel shows the top 5 when that is certain, otherwise as many as can be ranked with a note giving the unattributed share. Economies outside IMF reporting (the Soviet bloc before joining) are skipped by the IMF and Correlates of War loaders, because their partner figures are rebuilt from other countries' records and miss trade inside the bloc (`scripts/lib/non-reporting.mjs`).

Two Atlas series are handled specially for accuracy:

- **Russia before 1992:** Atlas files Soviet trade under Russia's code, built only from partners' reports. That misses most trade with other socialist economies and understates Soviet trade several times over, so those years are not used; Soviet trade comes from the official statistics above.
- **Germany before 1991:** this is West Germany, so it is attached to `BRD`.

## Wars

`npm run data:wars` builds the `wars` metric from three datasets, with no hand-written entries:

- **1600 to 1815: Brecke, Conflict Catalog** (Georgia Tech). Conflicts with at least 1,000 recorded deaths, plus campaigns the catalog names as part of such a war. Parties come from the catalog's conflict names (for example "Poland-Sweden, 1600-11"). The Thirty Years' War, French Revolutionary Wars and Napoleonic Wars appear in the catalog both as an umbrella entry without parties and as component campaigns with parties and dates; the components are used.
- **1816 to 2007 (civil wars to 2014): Correlates of War** inter-state, extra-state and intra-state war data (1,000+ battle deaths).
- **Later years: UCDP/PRIO Armed Conflict Dataset**, conflict-years at war intensity (1,000+ battle deaths that year). States that sent troops in support are marked "(supporting party)".

Rebel groups and polities without a data entity are skipped; the script prints them so the mapping can be extended.

## Known gaps

- **Soviet trade 1990 and 1991:** the official yearbook series ends in 1989, so the trade section has no figures for the USSR's last two years.

- **Sovereign credit rating** is not included. There is no free, openly licensed historical source for it.
- **Wages:** the World Bank has no comparable wage series. The registry uses wage and salaried workers (% of employment) and JST nominal wage growth (18 economies).
- **Oil:** oil production in TWh (Energy Institute via OWID) plus World Bank oil rents.
- Pre-colonial polities on the early maps (hundreds of small kingdoms and peoples) have no dataset coverage. They show the "no data" note.
- Kosovo (independent 2008) is drawn separately from 2011, when the Natural Earth borders start; the 2010 historical map does not separate it.
