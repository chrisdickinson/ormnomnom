'use strict'

const joi = require('joi')

const RowStreamQuery = require('./query').RowStreamQuery

module.exports = class Insert extends RowStreamQuery {
  buildSQL (builder) {
    const dao = this.attrs.dao
    const data = this.attrs.data
    const validator = {}
    const returningKeys = []
    for (var key in dao.ddl) {
      const col = dao.ddl[key]
      if (col.isFK && !col.isForwardRelation) {
        continue
      }
      if (!col.isFK) {
        returningKeys.push(col.name)
      }
      if (key === dao.primaryKeyName && !(key in data)) {
        continue
      }
      validator[key] = col.getDataValidator()
    }

    const insertSchema = new Set()
    const preppedData = new Array(data.length)
    const allowUnknown = {allowUnknown: true}
    for (var i = 0; i < data.length; ++i) {
      const keys = Object.keys(data[i])
      preppedData[i] = {}
      for (var j = 0; j < keys.length; ++j) {
        if (!dao.ddl[keys[j]]) {
          continue
        }
        preppedData[i][keys[j]] = dao.ddl[keys[j]].dbPrepData(data[i][keys[j]])
      }

      const validated = joi.validate(preppedData[i], validator, allowUnknown)
      if (validated.error) {
        throw validated.error
      }
      preppedData[i] = validated.value
      for (var resultKey in validated.value) {
        insertSchema.add(resultKey)
      }
    }

    const rows = []
    for (var x = 0; x < preppedData.length; ++x) {
      const row = []
      for (var col of insertSchema) {
        row.push('$' + this.values.push(preppedData[x][col]))
      }
      rows.push(`(${row.join(', ')})`)
    }

    const columns = Array.from(insertSchema).map(xs => {
      return `"${dao.ddl[xs].column}"`
    })

    return `
      INSERT INTO "${dao.tableName}"
      (${columns}) VALUES ${rows}
      RETURNING ${returningKeys.map(
        xs => '"' + xs + '" AS "' + dao.tableName + '.' + xs + '"'
      )}
    `
  }
}
