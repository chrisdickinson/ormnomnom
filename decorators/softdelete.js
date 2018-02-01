'use strict'

const clone = require('clone')

const symbols = require('../lib/shared-symbols')
const privateAPISym = symbols.privateAPI
const DAO = require('..')

const softDeleteSym = Symbol('soft_delete')

module.exports = function (dao, opts = {}) {
  if (!(dao instanceof DAO)) {
    throw new Error('Expected instance of DAO')
  }

  if (!opts.column) {
    throw new Error('Must specify column name for soft deletions')
  }
  const column = opts.column

  if (dao[softDeleteSym] && dao[softDeleteSym].has(column)) {
    throw new Error(`The column "${column}" is already configured for soft deletions`)
  }

  const wrappedDao = clone(dao)
  // We also have to manually copy getQuerySet(), clone skips it since
  // it's part of the original prototype
  wrappedDao[privateAPISym].getQuerySet = dao[privateAPISym].getQuerySet

  if (!wrappedDao[softDeleteSym]) {
    wrappedDao[softDeleteSym] = new Set()
  }
  wrappedDao[softDeleteSym].add(column)

  const privateAPI = wrappedDao[privateAPISym]
  const queryset = privateAPI.getQuerySet()

  class SoftDeleteQuerySet extends queryset.constructor {
    get (query) {
      return super.get(Object.assign({}, { 'deleted:isNull': true }, query))
    }

    filter (query) {
      return super.filter(Object.assign({}, { 'deleted:isNull': true }, query))
    }

    delete () {
      return super.update({ deleted: new Date() })
    }
  }

  wrappedDao.all = function () {
    return this.getQuerySet().filter({ 'deleted:isNull': true })
  }.bind(wrappedDao)

  privateAPI.getQuerySet = function () {
    return new SoftDeleteQuerySet(this, null)
  }.bind(privateAPI)

  return wrappedDao
}
