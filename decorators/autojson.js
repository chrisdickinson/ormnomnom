'use strict'

const clone = require('lodash.clonedeep')

const symbols = require('ormnomnom/lib/shared-symbols')
const privateAPISym = symbols.privateAPI
const DAO = require('ormnomnom')
const { props } = require('ormnomnom/lib/promises')

const autoJsonSym = Symbol('auto_json_decorator')

module.exports = function (dao, opts = {}) {
  if (!(dao instanceof DAO.DAO)) {
    throw new Error('Expected instance of DAO')
  }

  if (!opts.column) {
    throw new Error('Must specify column name for automatic json')
  }
  const column = opts.column
  if (!(column in dao[privateAPISym].ddl) || dao[privateAPISym].ddl[column].isFK) {
    throw new Error(`Column "${column}" does not exist and cannot be configured for automatic json`)
  }

  if (dao[autoJsonSym] && dao[autoJsonSym].has(column)) {
    throw new Error(`The column "${column}" is already configured for automatic json`)
  }

  const wrappedDao = clone(dao)
  if (!wrappedDao[autoJsonSym]) {
    wrappedDao[autoJsonSym] = new Set()
  }
  wrappedDao[autoJsonSym].add(column)

  const privateAPI = wrappedDao[privateAPISym]
  const queryset = privateAPI.getQuerySet()

  class AutoJsonQuerySet extends queryset.constructor {
    create (data) {
      const isBulk = Array.isArray(data)
      const getData = isBulk
        ? Promise.all(data.map(xs => props(xs || {})))
        : props(data || {}).then(xs => [xs])

      return getData.then(data => {
        const wrapped = data.map(props => {
          if ((column in props) && typeof props[column] !== 'string') {
            props[column] = JSON.stringify(props[column])
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
        if ((column in props) && typeof props[column] !== 'string') {
          props[column] = JSON.stringify(props[column])
        }

        return super.update(props)
      })
    }
  }

  privateAPI.getQuerySet = function () {
    return new AutoJsonQuerySet(this, null)
  }.bind(privateAPI)

  return wrappedDao
}
