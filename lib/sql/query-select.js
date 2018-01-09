'use strict'

const chain = require('@iterables/chain')

const RowStreamQuery = require('./query').RowStreamQuery

module.exports = class Select extends RowStreamQuery {
  buildSQL (builder) {
    if (this.attrs.distinct.size) {
      builder.addDistinctExpression(this.attrs.distinct)
    }

    if (this.attrs.onlyColumns) {
      builder.addOnlyColumns(this.attrs.onlyColumns)
    }

    if (this.attrs.annotations) {
      builder.addAnnotations(this.attrs.annotations, this.values)
    }

    if (this.attrs.grouping) {
      builder.addGrouping(new Set(chain(this.attrs.grouping)))
    }

    builder.addBoundsFromSlice(this.attrs.slice)

    if (this.attrs.order && this.attrs.order.length) {
      for (const clause of this.attrs.order) {
        builder.addOrderClause(clause)
      }
    }

    for (const clause of this.attrs.filter) {
      Array.isArray(clause)
        ? builder.addWhereAny(clause)
        : builder.addWhereAll(clause)
    }

    return `
      SELECT
      ${builder.getSelectColumnsClause()}
      FROM "${this.attrs.dao.tableName}" "${builder.targetTableName}"
      ${builder.getSelectJoinClause()}
      ${builder.getWhereClause(this.values)}
      ${builder.getGroupByClause()}
      ${builder.getOrderClause()}
      ${builder.getBoundsClause()}
    `.split('\n').map(xs => xs.trim()).join(' ').trim()
  }
}
