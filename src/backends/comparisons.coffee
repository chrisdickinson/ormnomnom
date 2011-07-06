{Comparison} = require '../qcons'

o = (str, special_validation, decorate_value)->
    new Comparison str, special_validation, decorate_value

comparisons = {
    exact:      o '$1 = $2'
    iexact:     o 'UPPER($1) = UPPER($2)'
    lt:         o '$1 < $2'
    gt:         o '$1 > $2'
    lte:        o '$1 <= $2'
    gte:        o '$1 >= $2'
    in:         o '$1 in (@)'
    isnull:     o '$1 IS ? NULL'
    contains:   o '$1 LIKE $2', null, (val)->"%#{val.replace /%/g, '\\%'}%"
    startswith: o '$1 LIKE $2', null, (val)-> "#{val.replace /%/g, '\\%'}%"
    endswith:   o '$1 LIKE $2', null, (val)-> "%#{val.replace /%/g, '\\%'}"
    icontains:  o 'UPPER($1) LIKE UPPER($2)', null, (val)->"%#{val.replace /%/g, '\\%'}%"
    istartswith:o 'UPPER($1) LIKE UPPER($2)', null, (val)-> "#{val.replace /%/g, '\\%'}%"
    iendswith:  o 'UPPER($1) LIKE UPPER($2)', null, (val)-> "%#{val.replace /%/g, '\\%'}"
    range:      o '$1 BETWEEN $2 AND $3'
    year:       o 'EXTRACT(\'year\' from $1) = $2', (val)-> not isNaN val
    month:      o 'EXTRACT(\'month\' from $1) = $2', (val)-> not isNaN val
    day:        o 'EXTRACT(\'day\' from $1) = $2', (val)-> not isNaN val
    week_day:   o 'EXTRACT(\'dow\' from $1) + 1 = $2', (val)-> not isNaN val
    regex:      o '$1 REGEXP $2'
}

exports.comparisons = comparisons
exports.o = o
