'use strict'

module.exports = makeDAO
module.exports.describeConflict = describeConflict

// These are required here so they can cache references to the private symbols
require('../decorators/autonow')
require('../decorators/softdelete')

const symbols = require('./shared-symbols.js')
const queryEventSym = symbols.queryEvent
const privateAPISym = symbols.privateAPI
const classToDAOSym = symbols.clsToDAO
const fkFieldSym = symbols.fkField
const colFieldSym = symbols.colField
const PrivateAPI = require('./private-api.js')()
const QuerySet = require('./queryset.js')
const errors = require('./errors.js')

function makeDAO (...args) {
  return new DAO(...args)
}

makeDAO.onQuery = (...args) => DAO.onQuery(...args)
makeDAO.fk = (...args) => DAO.fk(...args)
makeDAO.col = (...args) => DAO.col(...args)
makeDAO.setConnection = (...args) => DAO.setConnection(...args)
makeDAO.removeQueryListener = (...args) => DAO.removeQueryListener(...args)
makeDAO.ValidationError = errors.ValidationError

class DAO {
  constructor (instanceClass, ddl, opts) {
    if (Object.prototype.hasOwnProperty.call(instanceClass, classToDAOSym)) {
      throw new Error('function may be passed to at most _one_ data mapper')
    }

    instanceClass[classToDAOSym] = this

    this[privateAPISym] = new PrivateAPI(this, instanceClass, ddl, opts)
    addErrors(
      this,
      this[privateAPISym],
      instanceClass
    )
    this[privateAPISym].install()

    this.scopes = buildScopes(this, opts.scopes)
  }

  static onQuery (fn) {
    process.on(queryEventSym, fn)
    return this
  }

  static removeQueryListener (fn) {
    process.removeListener(queryEventSym, fn)
    return this
  }

  static setConnection (getConnection) {
    PrivateAPI.setConnection(getConnection)
  }

  static fk (model, opts = {}) {
    return { [fkFieldSym]: { model, nullable: opts.nullable, column: opts.column } }
  }

  static col (spec, opts = {}) {
    return { ...spec, [colFieldSym]: opts }
  }

  getQuerySet () {
    return this[privateAPISym].getQuerySet()
  }

  get (query) {
    return this.getQuerySet().get(query)
  }

  filter (query) {
    return this.getQuerySet().filter(query)
  }

  exclude (query) {
    return this.getQuerySet().exclude(query)
  }

  connection (connection) {
    return this.getQuerySet().connection(connection)
  }

  all () {
    return this.getQuerySet()
  }

  none () {
    return this.getQuerySet().none()
  }

  create (data) {
    return this.getQuerySet().create(data)
  }

  update (data) {
    return this.getQuerySet().update(data)
  }

  delete (filter) {
    return this.getQuerySet().delete(filter)
  }

  async getOrCreate (data) {
    try {
      return [false, await this.getQuerySet().get(data)]
    } catch (err) {
      if (err.constructor === this.NotFound) {
        return [true, await this.create(data)]
      }
      throw err
    }
  }
}
makeDAO.DAO = DAO

class GenericNotFound extends Error {
}

class GenericMultipleObjectsReturned extends Error {
}

class GenericConflict extends Error {
}

class GenericMissingUpdateData extends TypeError {
}

for (const xs of [DAO, makeDAO]) {
  Object.defineProperties(xs, {
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
    },
    MissingUpdateData: {
      enumerable: false,
      configurable: false,
      value: GenericMissingUpdateData
    }
  })
}

function addErrors (publicDAO, privateDAO, cls) {
  const type = privateDAO.modelName.toLowerCase()
  cls.NotFound =
  privateDAO.NotFound =
  publicDAO.NotFound = class NotFound extends GenericNotFound {
    constructor (msg = `${privateDAO.modelName} not found`) {
      super(msg)
      Error.captureStackTrace(this, NotFound)
      this.type = type
    }
  }
  cls.MultipleObjectsReturned =
  privateDAO.MultipleObjectsReturned =
  publicDAO.MultipleObjectsReturned =
  class MultipleObjectsReturned extends GenericMultipleObjectsReturned {
    constructor (msg = `Multiple ${privateDAO.modelName} objects returned`) {
      super(msg)
      Error.captureStackTrace(this, MultipleObjectsReturned)
      this.type = type
    }
  }
  cls.Conflict =
  privateDAO.Conflict =
  publicDAO.Conflict =
  class Conflict extends GenericConflict {
    constructor (msg, conflictType) {
      super(msg)
      Error.captureStackTrace(this, Conflict)
      this.type = type
      this.conflict = conflictType
    }
  }
  cls.MissingUpdateData =
  privateDAO.MissingUpdateData =
  publicDAO.MissingUpdateData =
  class MissingUpdateData extends GenericMissingUpdateData {
    constructor (msg = `Attempted update of ${privateDAO.modelName} object with no data`) {
      super(msg)
      Error.captureStackTrace(this, MissingUpdateData)
      this.type = type
    }
  }
}

function describeConflict (name, description, type) {
  PrivateAPI.errorMap[name] = { description, type }
}

symbols.cleanup()

/* istanbul ignore next */
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

function buildScopes (instance, scopes) {
  const obj = {}
  for (const scopeName in scopes) {
    // prevent scopes overwriting existing methods.
    if (QuerySet.prototype[scopeName]) {
      throw errors.ScopeConflictError(scopeName)
    }
    // call the scope methods on the QuerySet whilst lazily evaluating the
    // QuerySet itself.
    obj[scopeName] = (...args) => {
      return instance.getQuerySet()[scopeName](...args)
    }
  }
  return obj
}
