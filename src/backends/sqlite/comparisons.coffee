{comparisons, o} = require '../comparisons'

sqlite_comparisons = Object.create comparisons
sqlite_comparisons.year = o 'strftime("%Y", date($1, "unixepoch")) = $2', (val)-> not isNaN val
sqlite_comparisons.month = o 'strftime("%m", date($1, "unixepoch")) = $2', (val)-> not isNaN val
sqlite_comparisons.day = o 'strftime("%d", date($1, "unixepoch")) = $2', (val)-> not isNaN val
sqlite_comparisons.week_day = o 'strftime("%w", date($1, "unixepoch")) = $2', (val)-> not isNaN val

exports.comparisons = sqlite_comparisons

