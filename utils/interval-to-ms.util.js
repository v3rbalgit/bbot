// convert '1m,5m,1h,1d,1w,1m...' to ms
module.exports = function intervalToMs(interval) {
  let ms = 0;

  let seconds = {
    m: 60,
    h: 60 * 60,
    d: 24 * 60 * 60,
    w: 7 * 24 * 60 * 60
  };

  let unit = interval.slice(-1);

  if (unit) {
    ms = parseInt(interval.slice(0, -1)) * seconds[unit] * 1000;
  }

  return ms;
};
