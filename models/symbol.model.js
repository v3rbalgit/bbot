const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const candleSchema = new Schema({
  _id: Schema.Types.ObjectId,
  openTime: { type: Number, required: true },
  open: String,
  high: String,
  low: String,
  close: String,
  volume: String,
  quoteVolume: String,
  closeTime: Number,
  quoteAssetVolume: String,
  trades: Number,
  baseAssetVolume: String
});

const symbolSchema = new Schema({
  symbol: { type: String, required: true },
  '5m': [candleSchema],
  '1h': [candleSchema],
  '4h': [candleSchema],
  '1d': [candleSchema]
});

const symbol = mongoose.model('Symbol', symbolSchema);

module.exports = symbol;
