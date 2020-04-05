const csv = require('csv-parser')
const fs = require('fs')
const path = require('path');

// From https://github.com/CSSEGISandData/COVID-19/tree/master/csse_covid_19_data/csse_covid_19_daily_reports
const dir = 'COVID-19/csse_covid_19_data/csse_covid_19_daily_reports/';
const files = fs.readdirSync(dir);

run();

async function run() {

  const locations = [
    { name: 'VIC', filter: d => d.country === 'Australia' && d.state === 'Victoria' },
    { name: 'NSW', filter: d => d.country === 'Australia' && d.state === 'New South Wales' },
    { name: 'AUS', filter: d => d.country === 'Australia' },
    { name: 'SAN', filter: d => d.country === 'US' && d.state === 'California' && d.Admin2 === 'San Diego' },
    { name: 'CAL', filter: d => d.country === 'US' && d.state === 'California' },
    { name: 'US', filter: d => d.country === 'US' },
    { name: 'SA', filter: d => d.country === 'US' && d.state === 'California' },
  ];

  const output = [];

  printRow(output, 'Day', ...locations.map(l => l.name));

  for (const f of files.filter(f => f.endsWith('.csv'))) {
    const rawData = await getDataForDay(path.join(dir, f))
    const data = rawData.map(preprocessRow);
    console.assert(f.endsWith('.csv'));
    const [,m, d, y] = /^(\d\d)-(\d\d)-(\d\d\d\d).csv$/.exec(f);
    const day = `${y}-${m}-${d}`;
    printRow(output, day, ...locations.map(l => analyzeDay(l, data).averageGrowthRatio * 100));
  }

  fs.writeFileSync('output.csv', output.join('\n'));
}

function analyzeDay(location, data) {
  let prevTotalActive = location.prevTotalActive || 0;
  let averagingWindow = location.averagingWindow || [];
  let lastUpdate = location.lastUpdate || [];

  const dataForLocation = data.filter(location.filter);
  let totalActive = 0;
  for (const row of dataForLocation) {
    totalActive += row.active;
    lastUpdate = row.lastUpdate;
  }

  const deltaActive = totalActive - prevTotalActive;
  const growthRatio = prevTotalActive ? deltaActive / prevTotalActive : 0;
  averagingWindow.push(growthRatio);
  if (averagingWindow.length > 5) averagingWindow.shift();
  const averageGrowthRatio = averagingWindow.reduce((a, b) => a + b, 0) / averagingWindow.length;

  location.averagingWindow = averagingWindow;
  location.prevTotalActive = totalActive;
  location.lastUpdate = lastUpdate;

  return {
    totalActive,
    deltaActive,
    growthRatio,
    averageGrowthRatio,
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
  output.push([timestamp, ...values.map(formatNumber)].join(','));
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