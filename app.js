require('dotenv').config();

const binance = require('binance-api-node').default;
const intervalToMs = require('./utils/interval-to-ms.util');

const { Client } = require('pg');
const pgFormat = require('pg-format');
const pgClient = new Client({
  connectionString: process.env.PG_URL
});

pgClient.connect();

const bClient = binance();

async function fillDB(...args) {
  const params = ['symbol', 'interval', 'limit', 'startTime', 'endTime'];
  const options = {};

  // prepare options object for binance client according to the number of arguments
  for (let i = 0; i < args.length; i++) {
    options[params[i]] = args[i];
  }

  // get the data from binance
  const data = await bClient.candles(options);

  return new Promise((resolve, reject) => {
    const values = data.map(obj => [
      obj.openTime,
      obj.open,
      obj.high,
      obj.low,
      obj.close,
      obj.volume,
      obj.closeTime,
      obj.quoteVolume,
      obj.trades,
      obj.baseAssetVolume,
      obj.quoteAssetVolume
    ]);

    pgClient
      .query(
        pgFormat(
          `INSERT INTO %s (open_time, open, high, low, close, volume, close_time, quote_asset_volume, trades, taker_base_volume, taker_quote_volume)
    VALUES %L`,
          String(args[0] + '_' + args[1]).toLowerCase(),
          values
        )
      )
      .then(() => {
        // get number of items in a table
        pgClient.query(pgFormat(`SELECT * FROM %s`, String(args[0] + '_' + args[1]).toLowerCase())).then(res => {
          let count = res.rowCount;
          resolve(count);
        });
      })
      .catch(err => reject(err));
  });
}

async function getData(...args) {
  console.log(`Checking price data...`);

  const rateLimit = 500;
  const waitTime = 800;
  let count = 0;

  // check for oldest entry on record
  const oldest = await bClient.candles({ symbol: args[0], interval: args[1], limit: 1, startTime: 0 });
  const time = oldest ? oldest[0].openTime : null;

  // need the most recent candle to proceed
  if (time) {
    const curDate = Date.now();
    const diff = Math.floor((curDate - time) / intervalToMs(args[1]));

    const tableName = String(args[0] + '_' + args[1]).toLowerCase();

    // check if table already exists
    const isTable = await pgClient.query(pgFormat(`SELECT to_regclass('%s');`, tableName));

    // if it doesnt, create it and fill with initial data
    if (!isTable.rows[0].to_regclass) {
      console.log('No historical data found. Creating new table...');
      await pgClient.query(
        pgFormat(
          `CREATE TABLE %s (
        id BIGSERIAL NOT NULL PRIMARY KEY,
        open_time BIGINT NOT NULL,
        open NUMERIC(20,8) NOT NULL,
        high NUMERIC(20,8) NOT NULL,
        low NUMERIC(20,8) NOT NULL,
        close NUMERIC(20,8) NOT NULL,
        volume NUMERIC(20,8) NOT NULL,
        close_time BIGINT NOT NULL,
        quote_asset_volume NUMERIC(20,8) NOT NULL,
        trades INTEGER NOT NULL,
        taker_base_volume NUMERIC(20,8) NOT NULL,
        taker_quote_volume NUMERIC(20,8) NOT NULL
      )`,
          tableName
        )
      );

      count = await fillDB(args[0], args[1], rateLimit, time);
    }

    // get number of items in the table
    const query = await pgClient.query(pgFormat(`SELECT * FROM %s`, tableName));
    count = query.rowCount;

    while (diff > count) {
      // fill DB until up-to-date
      process.stdout.clearLine();
      process.stdout.cursorTo(0);
      process.stdout.write(`Remaining: ${diff - count}`);

      count = await fillDB(args[0], args[1], rateLimit, count * intervalToMs(args[1]) + time);
      // wait before each subsequent request
      await sleep(waitTime);
    }

    process.stdout.clearLine();
    process.stdout.cursorTo(0);
    process.stdout.write(`Total entries: ${count}\n`);

    // real-time database updates
    bClient.ws.candles(args[0], args[1], async candle => {
      if (candle.isFinal) {
        await fillDB(args[0], args[1], 1, count * intervalToMs(args[1]) + time);
        count++;
        console.log(`\nNew candle!`);
      }
      process.stdout.clearLine();
      process.stdout.cursorTo(0);
      process.stdout.write(`Current price: ${Number(candle.close).toFixed(2)}`);
    });
  } else {
    throw new Error('E: Unable to retrieve oldest remote record');
  }
}

function sleep(x) {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve(true);
    }, x);
  });
}

getData('BTCUSDT', '5m');
