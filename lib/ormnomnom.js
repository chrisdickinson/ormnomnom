'use strict'

module.exports = DAO

const symbols = require('./shared-symbols.js')
const privateAPISym = symbols.privateAPI
const classToDAOSym = symbols.clsToDAO
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
}

const proto = DAO.prototype

DAO.setConnection = function (getConnection) {
  PrivateAPI.setConnection(getConnection)
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

proto.all = function () {
  return this.getQuerySet()
}

proto.create = function (data) {
  return this.getQuerySet().create(data)
}

proto.update = function (data) {
  return this.getQuerySet().update(data)
}

symbols.cleanup()
