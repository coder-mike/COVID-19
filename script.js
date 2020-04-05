const csv = require('csv-parser')
const fs = require('fs')
const path = require('path');
// From https://github.com/CSSEGISandData/COVID-19/tree/master/csse_covid_19_data/csse_covid_19_daily_reports
const dir = 'COVID-19/csse_covid_19_data/csse_covid_19_daily_reports/';
const files = fs.readdirSync(dir);

run();

async function run() {

  const locations = [
    { name: 'VIC', population: 6_359_000, filter: d => d.country === 'Australia' && d.state === 'Victoria' },
    { name: 'NSW', population: 7_544_000, filter: d => d.country === 'Australia' && d.state === 'New South Wales' },
    { name: 'AUS', population: 24_600_000, filter: d => d.country === 'Australia' },
    { name: 'SAN', population: 3_338_000, filter: d => d.country === 'US' && d.state === 'California' && d.Admin2 === 'San Diego' },
    { name: 'CAL', population: 39_560_000, filter: d => d.country === 'US' && d.state === 'California' },
    { name: 'US', population: 327_200_000, filter: d => d.country === 'US' },
    { name: 'SA', population: 56_720_000, filter: d => d.country === 'South Africa' },
  ];

  const output = [];

  printRow(output, 'Day', ...locations.map(l => l.name));

  for (const f of files.filter(f => f.endsWith('.csv'))) {
    const [,m, d, y] = /^(\d\d)-(\d\d)-(\d\d\d\d).csv$/.exec(f);
    const date = `${y}-${m}-${d}`;
    const rawData = await getDataForDay(path.join(dir, f))
    const data = rawData.map(preprocessRow);
    printRow(output, date, ...locations.map(l => analyzeDay(l, date, data).averageActiveGrowthRatio * 100));
  }

  fs.writeFileSync('output.csv', output.join('\n'));
}

function analyzeDay(location, date, data) {
  let prevTotalActive = location.prevTotalActive || 0;
  let prevTotalConfirmed = location.prevTotalConfirmed || 0;
  let averagingWindow = location.averagingWindow || [];
  let lastUpdate = location.lastUpdate || [];

  const dataForLocation = data.filter(location.filter);
  let totalActive = 0;
  let totalConfirmed = 0;
  for (const row of dataForLocation) {
    totalActive += row.active;
    totalConfirmed += row.confirmed;
    lastUpdate = row.lastUpdate;
  }

  // Some days seem to be missing data
  if (dataForLocation.length === 0) {
    totalActive = location.prevTotalActive;
    totalConfirmed = location.prevTotalConfirmed;
  }

  const deltaConfirmed = totalConfirmed - prevTotalConfirmed;
  const confirmedGrowthRatio = prevTotalConfirmed > 20 ? deltaConfirmed / prevTotalConfirmed : 0;

  const deltaActive = totalActive - prevTotalActive;
  const activeGrowthRatio = prevTotalActive > 20 ? deltaActive / prevTotalActive : 0;

  averagingWindow.push({ activeGrowthRatio, confirmedGrowthRatio });
  if (averagingWindow.length > 5) averagingWindow.shift();
  const averageActiveGrowthRatio = averagingWindow.reduce((a, b) => a + b.activeGrowthRatio, 0) / averagingWindow.length;
  const averageConfirmedGrowthRatio = averagingWindow.reduce((a, b) => a + b.confirmedGrowthRatio, 0) / averagingWindow.length;

  location.averagingWindow = averagingWindow;
  location.prevTotalActive = totalActive;
  location.prevTotalConfirmed = totalConfirmed;
  location.lastUpdate = lastUpdate;

  return {
    totalActive,
    totalConfirmed,
    deltaActive,
    activeGrowthRatio,
    confirmedGrowthRatio,
    averageActiveGrowthRatio,
    averageConfirmedGrowthRatio,
    lastUpdate
  };
}

function getDataForDay(filename) {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filename)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', () => resolve(results));
  })
}

function preprocessRow(row) {
  // https://github.com/CSSEGISandData/COVID-19/issues/2001
  if (Object.keys(row).some(k => /[^a-zA-Z/. \-_0-9]/.test(k))) {
    row = Object.fromEntries(Object.entries(row).map(([k, v]) => [k.replace(/[^a-zA-Z/. \-_0-9]/, ''), v]));
  }

  const active = parseIntOrZero(row.Active);
  const confirmed = parseIntOrZero(row.Confirmed);
  const deaths = parseIntOrZero(row.Deaths);
  const recovered = parseIntOrZero(row.Recovered);
  return {
    ...row,
    lastUpdate: new Date(row['Last Update'] || row['Last_Update']),
    confirmed,
    deaths,
    recovered,
    active: confirmed - deaths - recovered,
    country: row['Country/Region'] || row['Country_Region'],
    state: row['Province/State'] || row['Province_State'],
  }
}

function printRow(output, timestamp, ...values) {
  console.log(timestamp.padStart(12), ...values.map(v => formatNumber(v).padStart(6)));
  output.push([timestamp, ...values].join(','));
}

function formatNumber(n) {
  if (typeof n === 'number') return n.toFixed(0);
  else return n;
}

function parseIntOrZero(s) {
  const result = parseInt(s);
  if (isNaN(result)) return 0;
  else return result;
}