'use strict'

const symbols = require('./shared-symbols.js')
const privateAPISym = symbols.privateAPI
const classToDAOSym = symbols.clsToDAO

class Column {
  constructor (name, column, validator, opts = {}) {
    opts = Object.assign({}, {
      cls: null,
      isForwardRelation: null,
      remoteColumn: null,
      nullable: null
    }, opts)
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

  // Prepare a value about to be sent as part of an UPDATE or INSERT query. This will
  // be validated by the jsonschema returned by getDataValidator.
  dbPrepData (val) {
    return val
  }

  // Prepare a value about to be sent as part of a WHERE clause. This will be validated
  // by the jsonschema returned by getQueryValidator.
  dbPrepQuery (val) {
    return val
  }

  // Prepare a value received from the database for use in JS. (node-pg does a lot of this for us.)
  prepJSData (val) {
    return val
  }

  getDataValidator () {
    return this.validator
  }

  getQueryValidator (query) {
    switch (query) {
      case 'raw':
        return {}
      case 'in':
      case 'notIn':
        return {
          type: 'array',
          items: this.validator
        }
      case 'isNull':
        return { type: 'boolean' }
      case 'lt':
      case 'gt':
      case 'lte':
      case 'gte':
        return {
          oneOf: [
            { type: 'number' },
            { type: 'string', format: 'date-time' }
          ]
        }
      case 'startsWith':
      case 'endsWith':
      case 'contains':
      case 'iStartsWith':
      case 'iEndsWith':
      case 'iContains':
        return { type: 'string' }
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
    throw new Error(`No DAO registered for ${this.cls.name}`)
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
      return {
        anyOf: [
          {},
          { type: 'null' },
          validator
        ]
      }
    }
    return validator
  }

  getQueryValidator () {
    const foreignDAO = this.getAPI()
    return {
      type: 'object',
      required: [foreignDAO.primaryKeyName],
      properties: {
        [foreignDAO.primaryKeyName]: foreignDAO.ddl[foreignDAO.primaryKeyName].getDataValidator()
      }
    }
  }
}

module.exports = { Column, ForeignKey }
