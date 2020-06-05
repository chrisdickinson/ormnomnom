'use strict'

const ajv = require('ajv')({ coerceTypes: true, useDefaults: true })
const { ValidationError } = require('../errors')
const RowStreamQuery = require('./query').RowStreamQuery

module.exports = class Insert extends RowStreamQuery {
  buildSQL (builder) {
    const dao = this.attrs.dao
    const data = this.attrs.data
    const validator = {}
    const returningKeys = []

    const requiredProps = new Set()
    const fkProps = new Set()

    // for every non-nullable foreign key, you must provide either:
    // - the column equivalent (`foo_id: 3`)
    // - or a full object (`foo: Foo { }`)
    for (const key in dao.ddl) {
      const col = dao.ddl[key]
      if (col.isFK && !col.isForwardRelation) {
        continue
      }
      if (!col.isFK) {
        returningKeys.push(col.name)
      }
      validator[key] = col.getDataValidator()
      if (key !== dao.primaryKeyName && !('default' in validator[key])) {
        if (col.isFK) {
          requiredProps.delete(col.column)
          fkProps.add(col.name)
          fkProps.add(col.column)
        } else if (!fkProps.has(key)) {
          requiredProps.add(key)
        }
      }
    }

    const insertSchema = new Set()
    const preppedData = new Array(data.length)

    const validate = ajv.compile({
      type: 'object',
      required: [...requiredProps],
      properties: validator
    })

    // XXX: watch out for reverse relations that may be listed in the ddl
    const keys = Object.keys(dao.ddl)
    for (let i = 0; i < data.length; ++i) {
      const entry = keys.reduce((acc, key) => {
        if (key in data[i]) {
          acc[key] = data[i][key]
        }
        return acc
      }, {})

      const valid = validate(entry)
      if (!valid) {
        throw new ValidationError(entry, validate.errors)
      }

      for (const resultKey in entry) {
        entry[resultKey] = dao.ddl[resultKey].encode(entry[resultKey])
        insertSchema.add(resultKey)
      }

      preppedData[i] = entry
    }

    const rows = []
    for (let x = 0; x < preppedData.length; ++x) {
      const row = []
      for (const col of insertSchema) {
        if (!(col in preppedData[x]) || (col === dao.primaryKeyName && !preppedData[x][col])) {
          row.push('DEFAULT')
        } else {
          row.push('$' + this.values.push(preppedData[x][col]))
        }
      }
      rows.push(`(${row.join(', ')})`)
    }

    const columns = Array.from(insertSchema).map(xs => `"${dao.ddl[xs].column}"`)

    const values = insertSchema.size ? `(${columns}) VALUES ${rows}` : 'DEFAULT VALUES'

    return `
      INSERT INTO "${dao.tableName}"
      ${values}
      RETURNING ${returningKeys.map(
        xs => '"' + xs + '" AS "' + dao.tableName + '.' + xs + '"'
      )}
    `
  }
}
