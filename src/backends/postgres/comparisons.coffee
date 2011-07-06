{comparisons, o} = require '../comparisons'

pg_comparisons = Object.create comparisons
pg_comparisons.regex = o '$1 ~ $2'
exports.comparisons = pg_comparisons
