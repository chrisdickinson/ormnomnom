'use strict'

const clone = require('lodash.clonedeep')

const symbols = require('../lib/shared-symbols')
const privateAPISym = symbols.privateAPI
const DAO = require('..')
const { props } = require('../lib/promises')

const autoNowSym = Symbol('auto_now')

module.exports = function (dao, opts = {}) {
  if (!(dao instanceof DAO.DAO)) {
    throw new Error('Expected instance of DAO')
  }

  if (!opts.column) {
    throw new Error('Must specify column name for automatic timestamps')
  }
  const column = opts.column
  if (!(column in dao[privateAPISym].ddl) || dao[privateAPISym].ddl[column].isFK) {
    throw new Error(`Column "${column}" does not exist and cannot be configured for automatic timestamps`)
  }

  const createOnly = 'createOnly' in opts ? opts.createOnly : false

  if (dao[autoNowSym] && dao[autoNowSym].has(column)) {
    throw new Error(`The column "${column}" is already configured for automatic timestamps`)
  }

  const wrappedDao = clone(dao)
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
          ? Promise.all(data.map(xs => props(xs || {})))
          : props(data || {}).then(xs => [xs])

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

      return props(data || {}).then(props => {
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
