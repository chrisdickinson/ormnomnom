'use strict'

const Select = require('./query-select')

module.exports = class Count extends Select {
  buildSQL (builder) {
    return `
      SELECT COUNT (*) AS "result"
      FROM (${super.buildSQL(builder)}) t0
    `.split('\n').map(xs => xs.trim()).join(' ').trim()
  }
}
