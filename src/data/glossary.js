// Short definitions shown when hovering (or tapping) a term, with a link to
// the Wikipedia article for more. Keys are matched case-insensitively as
// whole words in descriptions, units, badges and labels.
const W = (article) => `https://en.wikipedia.org/wiki/${article}`;

export const TERMS = {
  'purchasing power parity': { text: 'An exchange rate that equalizes what money buys in each country, so incomes can be compared in real terms rather than at market exchange rates.', url: W('Purchasing_power_parity') },
  PPP: { see: 'purchasing power parity' },
  'int-$': { text: 'International dollars: a currency unit with the same buying power everywhere as a US dollar in the base year (here 2011), used to compare incomes across countries and centuries.', url: W('International_dollar') },
  'current US$': { text: "Values converted to US dollars at each year's exchange rate, without adjusting for inflation. Good for the size of an economy in its own time, not for comparing across decades.", url: W('Nominal_value') },
  GDP: { text: 'Gross domestic product: the value of all final goods and services produced in a country in a year.', url: W('Gross_domestic_product') },
  'GDP per capita': { text: 'GDP divided by population: the average output per person, a common measure of living standards.', url: W('List_of_countries_by_GDP_(nominal)_per_capita') },
  inflation: { text: 'The rate at which the general level of prices rises, usually measured by the change in a consumer price index over a year.', url: W('Inflation') },
  CPI: { text: 'Consumer price index: the price of a fixed basket of goods and services households buy, tracked over time to measure inflation.', url: W('Consumer_price_index') },
  deflation: { text: 'Falling prices: inflation below zero.', url: W('Deflation') },
  hyperinflation: { text: 'Extremely fast inflation, often defined as prices rising more than 50% a month.', url: W('Hyperinflation') },
  'Gini coefficient': { text: 'A measure of inequality from 0 (everyone has the same income) to 100 (one person has everything).', url: W('Gini_coefficient') },
  Gini: { see: 'Gini coefficient' },
  autocracy: { text: 'A system in which one person or a small group holds power without meaningful elections or limits. Polity scores of -10 to -6.', url: W('Autocracy') },
  anocracy: { text: 'A mixed regime with features of both democracy and autocracy, such as elections without real competition or weak limits on rulers. Polity scores of -5 to +5.', url: W('Anocracy') },
  democracy: { text: 'Rule by the people through free and fair elections, with limits on executive power. Polity scores of +6 to +10.', url: W('Democracy') },
  'Polity score': { text: 'A rating of political regimes from -10 (full autocracy) to +10 (full democracy), from the Polity5 project, covering 1800 to 2018.', url: W('Polity_data_series') },
  Polity: { see: 'Polity score' },
  'V-Dem': { text: 'Varieties of Democracy: a research project that rates democracy using thousands of country experts, from 1789 to today.', url: W('V-Dem_Institute') },
  'electoral democracy': { text: 'V-Dem\'s measure of how far rulers are chosen in free, fair elections with free speech and association, from 0 to 1.', url: W('Electoral_democracy') },
  percentile: { text: 'Where a value ranks: the 72nd percentile means it is higher than about 72% of the countries with data that year.', url: W('Percentile') },
  benchmark: { text: 'Before 1820 the globe uses benchmark years. Each one stands for the years up to the next, since records are too sparse to show year by year.', url: W('Economic_history') },
  estimate: { text: 'A value worked out from real figures, not recorded directly: between two real years, from a present-day successor, or the typical range of neighboring countries. Always marked.', url: W('Interpolation') },
  'current account': { text: 'A country\'s trade in goods and services plus income and transfers with the rest of the world. A surplus means it earns more abroad than it spends.', url: W('Current_account') },
  'foreign direct investment': { text: 'Investment by a company in one country into a business in another, with lasting control or influence.', url: W('Foreign_direct_investment') },
  FDI: { see: 'foreign direct investment' },
  remittances: { text: 'Money sent home by people working abroad.', url: W('Remittance') },
  'broad money': { text: 'Cash plus bank deposits and similar easily spent assets: a measure of the money supply.', url: W('Broad_money') },
  'market capitalization': { text: 'The total value of the shares of companies listed on a country\'s stock exchanges.', url: W('Market_capitalization') },
  'real interest rate': { text: 'An interest rate minus inflation: what lenders really earn after rising prices.', url: W('Real_interest_rate') },
  tariff: { text: 'A tax on imported goods.', url: W('Tariff') },
  'trade balance': { text: 'Exports minus imports. Positive means a surplus, negative a deficit.', url: W('Balance_of_trade') },
  'banking crisis': { text: 'A period when many banks fail or need rescue at once, with bank runs and large losses.', url: W('Banking_crisis') },
  'infant mortality': { text: 'Deaths of children under one year old per 1,000 live births.', url: W('Infant_mortality') },
  'child mortality': { text: 'Deaths of children under five per 1,000 live births (shown here as a percentage).', url: W('Child_mortality') },
  'life expectancy': { text: 'The average number of years a newborn would live if the death rates of that year stayed the same. Low historical values mostly reflect child deaths.', url: W('Life_expectancy') },
  'fertility rate': { text: 'The average number of children a woman would have over her life at that year\'s birth rates.', url: W('Total_fertility_rate') },
  urbanization: { text: 'The share of people living in towns and cities.', url: W('Urbanization') },
  literacy: { text: 'The share of adults who can read and write.', url: W('Literacy') },
  'colonial status': { text: 'Whether a territory was ruled by another power in that year, from the historical borders on the map.', url: W('Colonialism') },
  colony: { text: 'A territory ruled by another state.', url: W('Colony') },
  protectorate: { text: 'A territory that keeps its own ruler but is controlled by a stronger state, usually in foreign affairs and defense.', url: W('Protectorate') },
  'Maddison Project': { text: 'A long-running research project that reconstructs GDP and population for countries back to the year 1, used for economic history.', url: W('Maddison_Project') },
  'Clio Infra': { text: 'A research project that collects long-run historical statistics, such as prices and debt, for countries back to 1500.', url: 'https://clio-infra.eu' },
  'World Bank': { text: 'An international financial institution whose World Development Indicators cover most countries from 1960.', url: W('World_Bank') },
  'Our World in Data': { text: 'A publication at the University of Oxford that compiles long-run data from many research sources.', url: W('Our_World_in_Data') },
  'current dollars': { see: 'current US$' },
  'oil rents': { text: 'The value of oil produced minus what it cost to produce it: the windfall a country earns from oil.', url: W('Economic_rent') },
  'R&D': { text: 'Research and development spending.', url: W('Research_and_development') },
};

const lookup = new Map(Object.entries(TERMS).map(([k, v]) => [k.toLowerCase(), v.see ? { ...TERMS[v.see], term: v.see } : { ...v, term: k }]));
export const termFor = (word) => lookup.get(String(word).toLowerCase()) ?? null;

// Splits text into plain strings and { term, text } parts for the first
// occurrence of each known term (longest first, so "GDP per capita" wins
// over "GDP").
const keys = [...lookup.keys()].sort((a, b) => b.length - a.length);
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pattern = new RegExp(`(?<![\\w$-])(${keys.map(escape).join('|')})(?![\\w-])`, 'gi');
export function splitTerms(text) {
  if (!text) return [];
  const out = [];
  const seen = new Set();
  let last = 0;
  for (const m of String(text).matchAll(pattern)) {
    const entry = lookup.get(m[0].toLowerCase());
    if (!entry || seen.has(entry.term)) continue;
    seen.add(entry.term);
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push({ word: m[0], ...entry });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// Wikipedia article per metric, for the metric name's hover card.
export const METRIC_WIKI = {
  gdp: 'Gross_domestic_product', gdp_per_capita: 'List_of_countries_by_GDP_(nominal)_per_capita', maddison_gdppc: 'Maddison_Project',
  maddison_gdp: 'Maddison_Project', gdp_growth: 'Economic_growth', inflation: 'Inflation', unemployment: 'Unemployment',
  agriculture_share: 'Agriculture', industry_share: 'Industry_(economics)', services_share: 'Tertiary_sector_of_the_economy',
  labor_force_participation: 'Labor_force_participation_rate', wage_workers: 'Wage_labour', jst_wage_growth: 'Real_wages',
  poverty_rate: 'Extreme_poverty', gini: 'Gini_coefficient', investment: 'Gross_fixed_capital_formation', savings: 'Gross_national_saving',
  lending_rate: 'Interest_rate', deposit_rate: 'Interest_rate', real_interest_rate: 'Real_interest_rate', jst_ltrate: 'Yield_(finance)',
  jst_stir: 'Interest_rate', exchange_rate: 'Exchange_rate', broad_money: 'Broad_money', private_credit: 'Credit_(finance)',
  jst_bank_credit: 'Credit_(finance)', market_cap: 'Market_capitalization', jst_house_prices: 'House_price_index',
  fdi_inflows: 'Foreign_direct_investment', remittances: 'Remittance', banking_crisis: 'Banking_crisis', exports_gdp: 'Export',
  imports_gdp: 'Import', exports_usd: 'Export', imports_usd: 'Import', trade_balance: 'Balance_of_trade', current_account: 'Current_account',
  tariff_rate: 'Tariff', gov_debt: 'Government_debt', jst_public_debt: 'Government_debt', budget_balance: 'Government_budget_balance',
  tax_revenue: 'Tax_revenue', gov_spending: 'Government_spending', military_spending: 'Military_budget', population: 'Population',
  population_growth: 'Population_growth', birth_rate: 'Birth_rate', death_rate: 'Mortality_rate', fertility_rate: 'Total_fertility_rate',
  urbanization: 'Urbanization', age_0_14: 'Population_pyramid', age_65_plus: 'Population_ageing', net_migration: 'Net_migration_rate',
  population_density: 'Population_density', life_expectancy: 'Life_expectancy', infant_mortality: 'Infant_mortality',
  child_mortality: 'Child_mortality', health_spending: 'Health_care_finance', physicians: 'Physician', vacc_measles: 'Measles_vaccine',
  vacc_dpt: 'DPT_vaccine', energy_use: 'World_energy_supply_and_consumption', electricity_access: 'Electrification',
  renewable_share: 'Renewable_energy', co2_per_capita: 'List_of_countries_by_carbon_dioxide_emissions_per_capita',
  oil_production: 'Petroleum_industry', oil_rents: 'Economic_rent', forest_area: 'Forest_cover', literacy: 'Literacy',
  enroll_primary: 'Gross_enrolment_ratio', enroll_secondary: 'Gross_enrolment_ratio', enroll_tertiary: 'Tertiary_education',
  mean_schooling: 'Educational_attainment', expected_schooling: 'Education_Index', rnd_spending: 'Research_and_development',
  internet_users: 'Internet', mobile_subs: 'Mobile_phone', regime_type: 'Polity_data_series', polity2: 'Polity_data_series',
  democracy_vdem: 'V-Dem_Institute', wars: 'Correlates_of_War', colonial_status: 'Colonialism',
};
export const metricWikiUrl = (id) => (METRIC_WIKI[id] ? W(METRIC_WIKI[id]) : null);
