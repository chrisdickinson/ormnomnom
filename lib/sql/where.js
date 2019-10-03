'use strict'

const { ValidationError } = require('../errors')
const OPERATION_MAP = require('./operation-map')
const ajv = require('ajv')()

class Operand {
  constructor () {
    this.children = []
  }

  add (target) {
    this.children.push(target)
    return target
  }
}

class And extends Operand {
  toSQL (values) {
    if (this.children.length === 0) {
      return '1=1'
    }

    return (
      this.children.length < 2
        ? this.children[0].toSQL(values)
        : `(${this.children.map(xs => xs.toSQL(values)).join(' AND ')})`
    )
  }
}

class Or extends Operand {
  toSQL (values) {
    if (this.children.length === 0) {
      return '1=1'
    }

    return (
      this.children.length < 2
        ? this.children[0].toSQL(values)
        : `(${this.children.map(xs => xs.toSQL(values)).join(' OR ')})`
    )
  }
}

class Not extends Operand {
  toSQL (values) {
    return `NOT ${this.children[0].toSQL(values)}`
  }
}

class Comparison {
  constructor (column, operand = 'eq', value, fullkey) {
    this.column = column
    this.operand = operand
    this.value = value
    this.fullkey = fullkey
  }

  toSQL (values) {
    const validator = this.column.info.getQueryValidator(this.operand)
    const validate = ajv.compile({
      required: [this.fullkey],
      properties: {
        [this.fullkey]: validator
      }
    })
    const validResult = validate({ [this.fullkey]: this.value })
    if (!validResult) {
      throw new ValidationError(this.value, validate.errors)
    }

    return OPERATION_MAP[this.operand](
      this.column.sqlName,
      this.value,
      finalValue => values.push(this.column.info.dbPrepQuery(finalValue))
    )
  }
}

module.exports = {
  Comparison,
  Not,
  And,
  Or
}
