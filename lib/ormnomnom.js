'use strict'

const joi = require('joi')

module.exports = DAO
module.exports.joi = joi

const Promise = require('bluebird')

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

proto.delete = function () {
  return this.getQuerySet().delete()
}

proto.getOrCreate = function (data) {
  var getObject = this.getQuerySet().get(data)

  return getObject.then(obj => {
    return [false, obj]
  }).catch(err => {
    if (err.isBoom && err.output.statusCode === 404) {
      return Promise.all([true, this.create(data)])
    }
    throw err
  })
}

symbols.cleanup()
