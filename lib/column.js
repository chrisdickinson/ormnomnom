'use strict'

const joi = require('joi')

const symbols = require('./shared-symbols.js')
const privateAPISym = symbols.privateAPI
const classToDAOSym = symbols.clsToDAO

class Column {
  constructor (name, column, validator, opts) {
    opts = Object.assign({}, {
      cls: null,
      isForwardRelation: null,
      remoteColumn: null,
      nullable: null
    }, opts || {})
    this.name = name
    this.column = column
    this.validator = validator
    this.cls = opts.cls
    this.nullable = opts.nullable
    this._remoteColumn = opts.remoteColumn
    this.isForwardRelation = opts.isForwardRelation
  }

  get isFK () {
    return false
  }

  getAPI () {
    throw new Error(`${this.name} is not a join-able column`)
  }

  dbPrepData (val) {
    return val
  }

  dbPrepQuery (val) {
    return val
  }

  getDataValidator () {
    return this.validator
  }

  getQueryValidator (query) {
    switch (query) {
      case 'raw':
        return joi.any()
      case 'in':
      case 'notIn':
        return joi.alternatives().try(
          joi.array().items(this.validator),
          joi.array().min(0).max(0)
        )
      case 'isNull':
        return joi.boolean()
      case 'lt':
      case 'gt':
      case 'lte':
      case 'gte':
        return joi.alternatives().try(joi.number(), joi.date())
      case 'startsWith':
      case 'endsWith':
      case 'contains':
      case 'iStartsWith':
      case 'iEndsWith':
      case 'iContains':
        return joi.string()
    }
    return this.validator
  }
}

class ForeignKey extends Column {
  constructor (name, cls, localColumn, remoteColumn, nullable, isForwardRelation) {
    super(name, localColumn, null, {
      cls,
      nullable,
      remoteColumn,
      isForwardRelation
    })
  }

  get isFK () {
    return true
  }

  getAPI () {
    if (this.cls[classToDAOSym]) {
      return this.cls[classToDAOSym][privateAPISym]
    }
    throw new Error('No DAO registered for ' + this.cls.name)
  }

  remoteColumn () {
    const foreignDAO = this.getAPI()
    return this._remoteColumn || foreignDAO.primaryKeyName
  }

  dbPrepData (val) {
    if (val) {
      return this.getAPI().getPrimaryKey(val)
    }
    return val
  }

  // XXX(chrisdickinson): this should probably look at remoteColumn vs. grabbing
  // the primaryKey automatically.
  dbPrepQuery (val) {
    return this.getAPI().getPrimaryKey(val)
  }

  getDataValidator () {
    const foreignDAO = this.getAPI()
    const validator = foreignDAO.ddl[foreignDAO.primaryKeyName].getDataValidator()
    if (this.nullable) {
      return joi.alternatives().try(
        validator,
        joi.any().default(null, 'null').allow(null)
      )
    }
    return validator
  }

  getQueryValidator () {
    const foreignDAO = this.getAPI()
    return joi.object({
      [foreignDAO.primaryKeyName]:
        foreignDAO.ddl[foreignDAO.primaryKeyName].getDataValidator().required()
    }).unknown()
  }
}

module.exports = {Column, ForeignKey}
