const csv = require('csv-parser')
const fs = require('fs')
const path = require('path');

// From https://github.com/CSSEGISandData/COVID-19/tree/master/csse_covid_19_data/csse_covid_19_daily_reports
const dir = 'COVID-19/csse_covid_19_data/csse_covid_19_daily_reports/';
const files = fs.readdirSync(dir);

run();

async function run() {

  const australia = [];

  for (const f of files) {
    const data = await getDataForDay(path.join(dir, f));
    australia.push(...data
      .map(preprocessRow)
      .filter(d => d.lastUpdate && d.confirmed && d.country === 'Australia' && d.state === 'Victoria'))
  }

  australia.sort((a, b) => a.lastUpdate - b.lastUpdate);

  const output = [];

  let lastUpdate = undefined;
  let confirmed = 0;
  let growthRatioRunningAverage = 0;
  printRow(output, 'Last Update', 'Confirmed', 'Delta Confirmed', 'Growth %/day', 'Avg Growth %/day');
  for (const row of australia) {
    // console.log(row.state, row.lastUpdate, row.confirmed);
    const isNewData = !(row.lastUpdate <= lastUpdate);
    if (isNewData) {
      // console.log(row)
      const deltaConfirmed = row.confirmed - (confirmed || 0);
      const deltaDays = lastUpdate ? (row.lastUpdate - lastUpdate) / 86_400_000 : 1;
      const growthRatio = (confirmed ? deltaConfirmed / confirmed : 0) / deltaDays;
      growthRatioRunningAverage = growthRatioRunningAverage * 0.9 + 0.1 * growthRatio;
      confirmed = row.confirmed;
      printRow(output, row.lastUpdate.toISOString(), confirmed, deltaConfirmed, growthRatio * 100, growthRatioRunningAverage * 100);
      lastUpdate = row.lastUpdate;
    }
  }

  fs.writeFileSync('output.csv', output.join('\n'));
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
  return {
    ...row,
    lastUpdate: new Date(row['Last Update'] || row['Last_Update']),
    confirmed: parseInt(row.Confirmed),
    deaths: parseInt(row.deaths),
    recovered: parseInt(row.recovered),
    country: row['Country/Region'] || row['Country_Region'],
    state: row['Province/State'] || row['Province_State'],
  }
}

function printRow(output, timestamp, ...values) {
  console.log(timestamp, ...values.map(v => formatNumber(v).padStart(5)));
  output.push([timestamp, ...values.map(formatNumber)].join(','));
}

function formatNumber(n) {
  if (typeof n === 'number') return n.toFixed(0);
  else return n;
}