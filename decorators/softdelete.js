'use strict'

const clone = require('lodash.clonedeep')

const symbols = require('../lib/shared-symbols')
const clsToDAOSym = symbols.clsToDAO
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
  if (!(column in dao[privateAPISym].ddl) || dao[privateAPISym].ddl[column].isFK) {
    throw new Error(`Column "${column}" does not exist and cannot be configured for soft deletions`)
  }

  if (dao[softDeleteSym] && dao[softDeleteSym] !== column) {
    throw new Error(`The column "${dao[softDeleteSym]}" is already configured for soft deletions`)
  }

  // We save the column name on the original dao before cloning so that we can reference it
  // while generating filters for joins later
  dao[softDeleteSym] = column

  const wrappedDao = clone(dao)
  const privateAPI = wrappedDao[privateAPISym]
  const queryset = privateAPI.getQuerySet()

  class SoftDeleteQuerySet extends queryset.constructor {
    get (query) {
      return super.get(Object.assign({}, {[`${column}:isNull`]: true}, query))
    }

    filter (query) {
      const arrayedQuery = Array.isArray(query) ? query : [ query ]

      const queryResult = []
      arrayedQuery.forEach(query => {
        const q = Object.assign({}, { [`${column}:isNull`]: true }, query)

        for (const key in q) {
          const path = key.split(':')[0]
          const bits = path.split('.')
          let ddl = wrappedDao[privateAPISym].ddl
          for (let i = 0; i < bits.length - 1; ++i) {
            const reference = bits[i]
            if (!(reference in ddl) || !(softDeleteSym in ddl[reference].cls[clsToDAOSym])) {
              continue
            }
            const segment = bits.slice(0, i + 1)
            q[`${segment.join('.')}.${ddl[reference].cls[clsToDAOSym][softDeleteSym]}:isNull`] = true
            ddl = ddl[reference].cls[clsToDAOSym][privateAPISym].ddl
          }
        }
        queryResult.push(query)
      })

      return super.filter(queryResult)
    }

    delete (query) {
      return (query ? this.filter(query) : this).update({[column]: new Date()})
    }
  }

  wrappedDao.all = function () {
    return this.getQuerySet().filter({[`${column}:isNull`]: true})
  }.bind(wrappedDao)

  privateAPI.getQuerySet = function () {
    return new SoftDeleteQuerySet(this, null)
  }.bind(privateAPI)

  return wrappedDao
}
