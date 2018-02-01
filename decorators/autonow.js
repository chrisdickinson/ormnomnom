'use strict'

const clone = require('clone')
const Promise = require('bluebird')

const symbols = require('../lib/shared-symbols')
const privateAPISym = symbols.privateAPI
const DAO = require('..')

const autoNowSym = Symbol('auto_now')

module.exports = function (dao, opts = {}) {
  if (!(dao instanceof DAO)) {
    throw new Error('Expected instance of DAO')
  }

  if (!opts.column) {
    throw new Error('Must specify column name for automatic timestamps')
  }
  const column = opts.column
  const createOnly = 'createOnly' in opts ? opts.createOnly : false

  if (dao[autoNowSym] && dao[autoNowSym].has(column)) {
    throw new Error(`The column "${column}" is already configured for automatic timestamps`)
  }

  const wrappedDao = clone(dao)
  // We also have to manually copy getQuerySet(), clone skips it since
  // it's part of the original prototype
  wrappedDao[privateAPISym].getQuerySet = dao[privateAPISym].getQuerySet

  if (!wrappedDao[autoNowSym]) {
    wrappedDao[autoNowSym] = new Set()
  }
  wrappedDao[autoNowSym].add(column)

  const privateAPI = wrappedDao[privateAPISym]
  const queryset = privateAPI.getQuerySet()

  class AutoNowQuerySet extends queryset.constructor {
    create (data) {
      const isBulk = Array.isArray(data)
      const getData = isBulk
          ? Promise.all(data.map(xs => Promise.props(xs || {})))
          : Promise.props(data || {}).then(xs => [xs])

      return getData.then(data => {
        const wrapped = data.map(props => {
          if (!(column in props) || !props[column]) {
            props[column] = new Date()
          }
          return props
        })

        return super.create(isBulk ? wrapped : wrapped[0])
      })
    }

    update (data) {
      if (createOnly) {
        return super.update(data)
      }

      return Promise.props(data || {}).then(props => {
        if (!(column in props) || !props[column]) {
          props[column] = new Date()
        }

        return super.update(props)
      })
    }
  }

  privateAPI.getQuerySet = function () {
    return new AutoNowQuerySet(this, null)
  }.bind(privateAPI)

  return wrappedDao
}
