'use strict'

const OPERATION_MAP = require('./operation-map')
const joi = require('joi')

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
    return (
      this.children.length < 2
      ? this.children[0].toSQL(values)
      : `(${this.children.map(xs => xs.toSQL(values)).join(' AND ')})`
    )
  }
}

class Or extends Operand {
  toSQL (values) {
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
  constructor (column, operand, value, fullkey) {
    this.column = column
    this.operand = operand || 'eq'
    this.value = value
    this.fullkey = fullkey
  }

  toSQL (values) {
    const validator = this.column.info.getQueryValidator(this.operand)
    const validResult = joi.validate({[this.fullkey]: this.value}, {[this.fullkey]: validator})
    if (validResult.error) {
      throw validResult.error
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
