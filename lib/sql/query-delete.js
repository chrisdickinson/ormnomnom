'use strict'

const RowCountQuery = require('./query').RowCountQuery

module.exports = class Delete extends RowCountQuery {
  buildSQL (builder) {
    this.attrs.filter.forEach(clause => {
      Array.isArray(clause)
        ? builder.addWhereAny(clause)
        : builder.addWhereAll(clause)
    })

    return `
      DELETE FROM "${this.attrs.dao.tableName}" "${builder.targetTableName}"
      ${builder.getDeleteJoinClause()}
      ${builder.getWhereClause(this.values)}
    `.split('\n').map(xs => xs.trim()).join(' ').trim()
  }
}
