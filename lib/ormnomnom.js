'use strict'

const joi = require('joi')

module.exports = DAO
module.exports.joi = joi
module.exports.describeConflict = describeConflict

const Promise = require('bluebird')

const symbols = require('./shared-symbols.js')
const queryEventSym = symbols.queryEvent
const privateAPISym = symbols.privateAPI
const classToDAOSym = symbols.clsToDAO
const fkFieldSym = symbols.fkField
const PrivateAPI = require('./private-api.js')()

function DAO (instanceClass, ddl, opts) {
  if (instanceClass[classToDAOSym]) {
    throw new Error('function may be passed to at most _one_ data mapper')
  }
  if (!(this instanceof DAO)) {
    return new DAO(instanceClass, ddl, opts)
  }

  instanceClass[classToDAOSym] = this

  this[privateAPISym] = new PrivateAPI(this, instanceClass, ddl, opts)
  addErrors(
    this,
    this[privateAPISym],
    instanceClass
  )
  this[privateAPISym].install()
}

const proto = DAO.prototype

DAO.onQuery = function (fn) {
  process.on(queryEventSym, fn)
  return this
}

DAO.removeQueryListener = function (fn) {
  process.removeListener(queryEventSym, fn)
  return this
}

DAO.setConnection = function (getConnection) {
  PrivateAPI.setConnection(getConnection)
}

DAO.fk = function (model, opts) {
  opts = opts || {}
  return {[fkFieldSym]: {model, nullable: opts.nullable}}
}

proto.getQuerySet = function () {
  return this[privateAPISym].getQuerySet()
}

proto.get = function (query) {
  return this.getQuerySet().get(query)
}

proto.filter = function (query) {
  return this.getQuerySet().filter(query)
}

proto.exclude = function (query) {
  return this.getQuerySet().exclude(query)
}

proto.all = function () {
  return this.getQuerySet()
}

proto.none = function () {
  return this.getQuerySet().none()
}

proto.create = function (data) {
  return this.getQuerySet().create(data)
}

proto.update = function (data) {
  return this.getQuerySet().update(data)
}

proto.delete = function (filter) {
  return this.getQuerySet().delete(filter)
}

proto.getOrCreate = function (data) {
  var getObject = this.getQuerySet().get(data)

  return getObject.then(obj => {
    return [false, obj]
  }).catch(err => {
    if (err.constructor === this.NotFound) {
      return Promise.all([true, this.create(data)])
    }
    throw err
  })
}

class GenericNotFound extends Error {
}

class GenericMultipleObjectsReturned extends Error {
}

class GenericConflict extends Error {
}

Object.defineProperties(DAO, {
  NotFound: {
    enumerable: false,
    configurable: false,
    value: GenericNotFound
  },
  MultipleObjectsReturned: {
    enumerable: false,
    configurable: false,
    value: GenericMultipleObjectsReturned
  },
  Conflict: {
    enumerable: false,
    configurable: false,
    value: GenericConflict
  }
})

function addErrors (publicDAO, privateDAO, cls) {
  const type = privateDAO.modelName.toLowerCase()
  cls.NotFound =
  privateDAO.NotFound =
  publicDAO.NotFound = class NotFound extends GenericNotFound {
    constructor (msg) {
      super(msg || `${privateDAO.modelName} not found`)
      Error.captureStackTrace(this, NotFound)
      this.type = type
    }
  }
  cls.MultipleObjectsReturned =
  privateDAO.MultipleObjectsReturned =
  publicDAO.MultipleObjectsReturned =
  class MultipleObjectsReturned extends GenericMultipleObjectsReturned {
    constructor (msg) {
      super(msg || `Multiple ${privateDAO.modelName} objects returned`)
      Error.captureStackTrace(this, MultipleObjectsReturned)
      this.type = type
    }
  }
  cls.Conflict =
  privateDAO.Conflict =
  publicDAO.Conflict =
  class Conflict extends GenericConflict {
    constructor (msg, conflictType) {
      super(msg || `Unexpected conflict`)
      Error.captureStackTrace(this, Conflict)
      this.type = type
      this.conflict = conflictType
    }
  }
}

function describeConflict (name, description, type) {
  PrivateAPI.errorMap[name] = {description, type}
}

symbols.cleanup()

if (process.env.ORMNOMNOM_LOG_QUERIES) {
  const set = new Set(process.env.ORMNOMNOM_LOG_QUERIES.split(','))
  const check = (
    process.env.ORMNOMNOM_LOG_QUERIES.indexOf(',') === -1
    ? Boolean
    : xs => set.has(xs)
  )

  DAO.onQuery((Class, sql) => {
    if (check(Class.name)) {
      console.error(Class.name + ': ' + sql.split('\n').map(xs => xs.trim()).filter(Boolean).join(' '))
    }
  })
} else if (process.env.ORMNOMNOM_TRACE_QUERIES) {
  const set = new Set(process.env.ORMNOMNOM_TRACE_QUERIES.split(','))
  const check = (
    process.env.ORMNOMNOM_TRACE_QUERIES.indexOf(',') === -1
    ? Boolean
    : xs => set.has(xs)
  )

  DAO.onQuery((Class, sql) => {
    if (check(Class.name)) {
      console.trace(Class.name + ': ' + sql.split('\n').map(xs => xs.trim()).filter(Boolean).join(' '))
    }
  })
}
