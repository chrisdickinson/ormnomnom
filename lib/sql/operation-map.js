'use strict'

module.exports = {
  eq (col, val, push) {
    return `${col} = $${push(val)}`
  },
  neq (col, val, push) {
    return `${col} != $${push(val)}`
  },
  raw (col, val, push) {
    return val(col, push)
  },
  contains (col, val, push) {
    return `${col} like $${push('%' + val.replace(/%/g, '%%') + '%')}`
  },
  startsWith (col, val, push) {
    return `${col} like $${push(val.replace(/%/g, '%%') + '%')}`
  },
  endsWith (col, val, push) {
    return `${col} like $${push('%' + val.replace(/%/g, '%%'))}`
  },
  in (col, val, push) {
    if (val.length < 1) {
      return 'false'
    }
    return `${col} in (${val.map(xs => '$' + push(xs))})`
  },
  notIn (col, val, push) {
    if (val.length < 1) {
      return 'true'
    }
    return `${col} not in (${val.map(xs => '$' + push(xs))})`
  },
  isNull (col, val, push) {
    return `${col} is ${val ? '' : 'NOT'} NULL`
  },
  lt (col, val, push) {
    return `${col} < $${push(val)}`
  },
  gt (col, val, push) {
    return `${col} > $${push(val)}`
  },
  lte (col, val, push) {
    return `${col} <= $${push(val)}`
  },
  gte (col, val, push) {
    return `${col} >= $${push(val)}`
  },
  iContains (col, val, push) {
    return `UPPER(${col}) like UPPER($${push('%' + val.replace(/%/g, '%%') + '%')})`
  },
  iStartsWith (col, val, push) {
    return `UPPER(${col}) like UPPER($${push(val.replace(/%/g, '%%') + '%')})`
  },
  iEndsWith (col, val, push) {
    return `UPPER(${col}) like UPPER($${push('%' + val.replace(/%/g, '%%'))})`
  },
  regex (col, val, push) {
    return `${col} ~ $${push(val)}`
  }
}
