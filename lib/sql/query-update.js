'use strict'

const joi = require('joi')

const RowCountQuery = require('./query').RowCountQuery

module.exports = class Update extends RowCountQuery {
  buildSQL (builder) {
    const keys = []
    const preppedData = {}
    const validator = {}
    const dao = this.attrs.dao
    const data = this.attrs.data
    for (const key in data) {
      if (!dao.ddl[key]) {
        continue
      }
      if (dao.ddl[key].isFK && !dao.ddl[key].isForwardRelation) {
        continue
      }
      const col = dao.ddl[key]
      const val = col.dbPrepData(data[key])
      preppedData[key] = val
      validator[key] = col.getDataValidator()
      keys.push(`"${col.column}"`)
      this.values.push(val)
    }

    if (!keys.length) {
      throw new dao.MissingUpdateData()
    }

    const result = joi.validate(preppedData, validator)
    if (result.error) {
      throw result.error
    }

    for (const clause of this.attrs.filter) {
      Array.isArray(clause)
        ? builder.addWhereAny(clause)
        : builder.addWhereAll(clause)
    }

    return `
      UPDATE "${dao.tableName}" "${builder.targetTableName}"
      SET ${keys.map((key, idx) => key + ' = $' + (idx + 1))}
      ${builder.getUpdateJoinClause()}
      ${builder.getWhereClause(this.values)}
    `.split('\n').map(xs => xs.trim()).join(' ').trim()
  }
}
