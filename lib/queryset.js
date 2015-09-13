'use strict'

module.exports = createQueryClass()

const symbols = require('./shared-symbols.js')
const privateAPISym = symbols.privateAPI
const classToDAOSym = symbols.clsToDAO

const Promise = require('bluebird')
const boom = require('boom')

const DELETE = Symbol('delete')
const INSERT = Symbol('insert')
const UPDATE = Symbol('update')
const SELECT = Symbol('select')

function createQueryClass () {
  return class QuerySet {
    constructor (dao, parent) {
      this._transformer = null
      this._action = null
      this._filter = null
      this._slice = null
      this._data = null
      this._order = null
      this._parent = parent
      this._dao = dao
    }

    get (query) {
      return this.filter(query).then((xs) => {
        if (!xs) {
          throw boom.notFound(
            this._dao.modelName() + ' not found'
          )
        }
        return xs
      })
    }

    filter (query) {
      var qs = new QuerySet(this._dao, query, this)
      qs._filter = query
      return qs
    }

    slice (start, end) {
      var qs = new QuerySet(this._dao, query, this)
      switch (arguments.length) {
        case 1:
          qs._slice = [start, Infinity]
        break
        case 2:
          qs._slice = [start, end]
        break
      }
      return qs
    }

    delete () {
      var qs = new QuerySet(this._dao, query, this)
      qs._action = DELETE
      return qs.createStream()
    }
    update (data) {
      var qs = new QuerySet(this._dao, query, this)
      qs._action = UPDATE
      qs._data = data
      return qs.createStream()
    }
    create (data) {
      var qs = new QuerySet(this._dao, query, this)
      qs._action = INSERT
      qs._data = data
      return qs.then()
    }

    values (values) {
      var qs = new QuerySet(this._dao, query, this)
      qs._transformer = this._dao.createValuesTransformer(values)
      return qs
    }
    valuesList (values) {
      var qs = new QuerySet(this._dao, query, this)
      values = Array.isArray(values) ? values : [values]
      qs._transformer = this._dao.createValuesListTransformer(values)
      return qs
    }

    raw () {
      return materialize(this)
    }
    createStream() {
      return materialize(this).pipe(createMapper(this))
    }

    pipe(dst, opts) {
      return this.createStream().pipe(dst, opts)
    }
    then(onsuccess, onfail) {
      var deferred = Promise.defer()
      var reject = once(deferred.reject.bind(deferred))
      var src = this.createStream()
      var mid = createMapper(this)
      var dst = concat(items => {
        deferred.resolve(items)
      })
      src.once('error', reject)
      mid.once('error', reject)
      dst.once('error', reject)
      src.pipe(mid).pipe(dst)

      var promise = deferred.promise

      if (onsuccess && onfail) {
        promise = promise.then(onsuccess, onfail)
      } else if (onsuccess) {
        promise = promise.then(onsuccess)
      } else if (onfail) {
        promise = promise.catch(onfail)
      }

      return promise
    }
  }
}

function *iterate (qs) {
  var current = qs
  while (current) {
    yield current
    current = current._parent
  }
}

function materialize (queryset) {
  var transformer = null
  var action = null
  var order = null
  var filter = []
  var slice = []
  var data = null
  for (var xs of iterate(queryset)) {
    action = action || xs._action
    data = data || xs._data
    transformer = transformer || xs._transformer
    order = order || xs._order
    if (xs._filter) {
      filter.unshift(xs._filter)
    }
    if (xs._slice) {
      slice.unshift(xs._slice)
    }
  }

  slice.unshift([0, Infinity])
  slice = slice.reduce(function (current, next) {
    return [
      current[0] + next[0],
      Math.min(current[0] + next[1], current[1])
    ]
  }, [0, Infinity])

  var getData = action === INSERT || action === UPDATE ?
    settleData(data || {}) :
    Promise.cast({})

  var getWhere = settleFilter(filter)

  transformer = transformer || queryset._dao.createObjectTransformer()
  // x.y » "join x for y"
  // x:op » "compare x of y"
}

function settleData (data) {
  return Promise.props(data)
}

function settleFilter (filter) {
  return Promise.all(
    values.map(xs => Array.isArray(xs) ? Promise.all(xs) : Promise.props(xs))
  )
}
