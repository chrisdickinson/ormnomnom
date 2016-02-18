'use strict'

const joi = require('joi')

module.exports = DAO
module.exports.joi = joi
module.exports.describeConflict = describeConflict

const Promise = require('bluebird')

const symbols = require('./shared-symbols.js')
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

DAO.setConnection = function (getConnection) {
  PrivateAPI.setConnection(getConnection)
}

DAO.fk = function (model, opts) {
  opts = opts || {}
  return {[fkFieldSym]: {model, opts}}
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

proto.create = function (data) {
  return this.getQuerySet().create(data)
}

proto.update = function (data) {
  return this.getQuerySet().update(data)
}

proto.delete = function () {
  return this.getQuerySet().delete()
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
  constructor (msg) {
    super(msg)
  }
}

class GenericMultipleObjectsReturned extends Error {
  constructor (msg) {
    super(msg)
  }
}

class GenericConflict extends Error {
  constructor (msg) {
    super(msg)
  }
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
  cls.NotFound =
  privateDAO.NotFound =
  publicDAO.NotFound = class NotFound extends GenericNotFound {
    constructor (msg) {
      super(msg || `${privateDAO.modelName} not found`)
      Error.captureStackTrace(this, NotFound)
    }
  }
  cls.MultipleObjectsReturned =
  privateDAO.MultipleObjectsReturned =
  publicDAO.MultipleObjectsReturned =
  class MultipleObjectsReturned extends GenericMultipleObjectsReturned {
    constructor (msg) {
      super(msg || `Multiple ${privateDAO.modelName} objects returned`)
      Error.captureStackTrace(this, MultipleObjectsReturned)
    }
  }
  cls.Conflict =
  privateDAO.Conflict =
  publicDAO.Conflict =
  class Conflict extends GenericConflict {
    constructor (msg) {
      super(msg || `Unexpected conflict`)
      Error.captureStackTrace(this, Conflict)
    }
  }
}

function describeConflict (name, description) {
  PrivateAPI.errorMap[name] = description
}

symbols.cleanup()
