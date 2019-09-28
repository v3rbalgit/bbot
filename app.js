const mongoose = require('mongoose');
const binance = require('binance-api-node').default;
let Symbols = require('./models/symbol.model');
const intervalToMs = require('./utils/interval-to-ms.util');

const bClient = binance();

mongoose.set('useNewUrlParser', true);
mongoose.set('useFindAndModify', false);
mongoose.set('useCreateIndex', true);
mongoose.set('useUnifiedTopology', true);

mongoose.connect('mongodb://localhost/binance');
mongoose.connection
  .once('open', () => console.log('Database successfully connected!'))
  .on('error', err => {
    if (err) throw err;
  });

async function fillDB(...args) {
  const params = ['symbol', 'interval', 'limit', 'startTime', 'endTime'];
  const options = {};

  // prepare options object for binance client according to the number of arguments
  for (let i = 0; i < args.length; i++) {
    options[params[i]] = args[i];
  }

  // does data for a symbol already exist?
  const result = await Symbols.exists({ symbol: options['symbol'] });

  const data = await bClient.candles(options);

  return new Promise((resolve, reject) => {
    if (result) {
      // if it does exist, find it and update it with new price data
      Symbols.findOneAndUpdate(
        { symbol: options['symbol'] },
        { $push: { [args[1]]: data } },
        { safe: true, upsert: true, new: true },
        (err, doc) => {
          if (err) return reject(`There was an error: ${err}`);
          resolve(doc.length);
        }
      );
    } else {
      // otherwise make a new symbol collection and save it
      const symbol = new Symbols({
        symbol: options['symbol'],
        [args[1]]: data
      });

      symbol
        .save()
        .then(doc => resolve(doc.length))
        .catch(err => reject(`There was an error: ${err}`));
    }
  });
}

async function getData(...args) {
  // check for oldest entry on record
  const oldest = await bClient.candles({ symbol: args[0], interval: args[1], limit: 1, startTime: 0 });
  const time = oldest ? oldest[0].openTime : null;

  // make sure we get a proper response before attempting
  if (time) {
    const rateLimit = 500;
    const waitTime = 800;
    const curDate = Date.now();
    const diff = Math.floor((curDate - time) / intervalToMs(args[1]));

    // const pipeline = [{ $match: { symbol: args[0] } }, { $unwind: `$${args[1]}` }, { $count: 'count' }];
    const pipeline = [
      { $match: { symbol: args[0] } },
      { $project: { symbols: { $size: `$${args[1]}` } } },
      { $group: { _id: null, count: { $sum: '$symbols' } } }
    ];

    const result = await Symbols.aggregate(pipeline);
    let count = result.length ? result[0].count : 0;

    console.log('Checking price data...');

    while (diff > count) {
      // find count of candlesticks for specified symbol and interval
      process.stdout.clearLine();
      process.stdout.cursorTo(0);
      process.stdout.write(`Remaining: ${diff - count}`);

      await fillDB(args[0], args[1], rateLimit, count * intervalToMs(args[1]) + time);

      count += rateLimit;
      await sleep(waitTime);
    }

    process.stdout.write('\n'); // end the line

    // TODO: Subscribe to price changes of individual intervals and automatically update data
    console.log(`Price data OK!`);
  } else {
    throw new Error("ERROR: Couldn't check historical data (Invalid response)");
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

// fillDB('BTCUSDT', '1d', 100, 0);
