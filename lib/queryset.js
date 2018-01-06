'use strict'

const symbols = require('./shared-symbols.js')
const queryEventSym = symbols.queryEvent
const classToDAOSym = symbols.clsToDAO
const querySetSym = symbols.querySet

const concat = require('concat-stream')
const Promise = require('bluebird')
const streams = require('stream')

const PassThrough = streams.PassThrough
const Transform = streams.Transform

const NEGATE_SYM = Symbol('negation')

const Select = require('./sql/query-select')
const Update = require('./sql/query-update')
const Delete = require('./sql/query-delete')
const Insert = require('./sql/query-insert')
const Count = require('./sql/query-count')

const daoSym = Symbol('dao')

class QuerySet {
  constructor (dao, parent) {
    this._transformer = null
    this._columns = null
    this._Query = null
    this._order = null
    this._data = null

    this._distinct = null
    this._filter = null
    this._slice = null

    this._grouping = null
    this._annotation = null

    this._parent = parent
    this[daoSym] = dao
    this[querySetSym] = true
  }

  count () {
    const qs = new QuerySet(this[daoSym], this)
    qs._Query = Select
    qs._order = []

    const getAttrs = Attributes.from(this)

    const annotate = getAttrs.then(attrs => {
      const isGrouped = Boolean(attrs.grouping)

      if (!isGrouped) {
        return qs.annotate({
          result (ref, push) {
            return 'COUNT(*)'
          }
        }).valuesList(['result'])
      } else {
        qs._Query = Count
        return qs.raw().then(({db, release, sql, values}) => {
          // Wrapping db.query(sql, values) in a Bluebird promise because it returns
          // a native promise. When Ormnomnom is used with domains for CLS, this can
          // lead to the domain dropping in Node 6.
          return Promise.resolve(db.query(sql, values)).then(({rows}) => {
            release()
            return rows.map(({result}) => result) // make it quack the same as the valuesList
          })
        })
      }
    })

    return annotate.then(xs => xs[0])
  }

  group (by = this[daoSym].primaryKeyName) {
    const qs = new QuerySet(this[daoSym], this)
    qs._grouping = [].concat(by)
    return qs
  }

  aggregate (agg) {
    const qs = new QuerySet(this[daoSym], this)
    qs._grouping = []
    qs._order = []
    return qs.annotate({
      result: agg
    }).valuesList(['result']).then(xs => xs[0])
  }

  annotate (ann) {
    const qs = new QuerySet(this[daoSym], this)
    qs._Query = Select
    qs._annotation = ann
    return qs
  }

  distinct (expr = [this[daoSym].primaryKeyName]) {
    const qs = new QuerySet(this[daoSym], this)
    qs._distinct = [].concat(expr)
    return qs
  }

  order (by) {
    const qs = new QuerySet(this[daoSym], this)
    qs._order = [].concat(by)
    return qs
  }

  get (query) {
    return this.filter(query).slice(0, 2).then((xs) => {
      switch (xs.length) {
        case 0:
          throw new this[daoSym].NotFound()
        case 2:
          throw new this[daoSym].MultipleObjectsReturned()
      }
      return xs[0]
    })
  }

  none () {
    // XXX(chrisdickinson): hack: grab the first available
    // column from our DDL, we won't _actually_ reference it
    // though.
    const [column] = this[daoSym].columns()
    return this.filter({
      [`${column.name}:raw`] () {
        return '0 = 1'
      }
    })
  }

  filter (query) {
    const qs = new QuerySet(this[daoSym], this)
    qs._filter = query
    return qs
  }

  exclude (query) {
    if (!query) {
      return this
    }
    const qs = new QuerySet(this[daoSym], this)
    query[NEGATE_SYM] = true
    qs._filter = query
    return qs
  }

  slice (start, end) {
    const qs = new QuerySet(this[daoSym], this)
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

  delete (query) {
    const qs = new QuerySet(this[daoSym], (
      query
      ? this.filter(query)
      : this
    ))
    qs._Query = Delete
    qs._transformer = (row, push) => push(row)
    return qs.then(xs => xs[0])
  }

  update (data) {
    const qs = new QuerySet(this[daoSym], this)
    qs._Query = Update
    qs._data = data
    qs._transformer = (row, push) => push(row)
    return qs.then(xs => xs[0])
  }

  create (data) {
    const isBulk = Array.isArray(data)
    const getData = isBulk
        ? Promise.all(data.map(xs => Promise.props(xs || {})))
        : Promise.props(data || {}).then(xs => [xs])

    return getData.then(data => {
      if (isBulk && !data.length) {
        return []
      }

      const qs = new QuerySet(this[daoSym], this)
      qs._Query = Insert
      qs._data = data
      return qs.then(xs => {
        return isBulk
          ? xs.map((ys, idx) => decorateData(ys, data[idx], this[daoSym]))
          : decorateData(xs[0], data[0], this[daoSym])
      })
    })
  }

  values (values) {
    const qs = new QuerySet(this[daoSym], this)
    values = [].concat(values)
    qs._columns = values
    qs._transformer = this[daoSym].createValuesTransformer(values)
    return qs
  }

  valuesList (values) {
    const qs = new QuerySet(this[daoSym], this)
    values = [].concat(values)
    qs._columns = values
    qs._transformer = this[daoSym].createValuesListTransformer(values)
    return qs
  }

  raw () {
    return materialize(this, (db, values, sql, release) => {
      return {db, values, sql, release}
    })
  }

  createStream () {
    const outer = new PassThrough({objectMode: true})

    materialize(this).then(stream => {
      const mapper = createMapper(this, stream.annotations)
      /* istanbul ignore next */
      mapper.on('error', err => outer.emit('error', err))
      stream.on('error', err => {
        // wrap database errors as conflicts where appropriate
        outer.emit('error', errorToConflict(err, this[daoSym]))
      })
      stream.pipe(mapper).pipe(outer)
    }, err => {
      outer.emit('error', err)
    })

    return outer
  }

  pipe (dst, opts) {
    return this.createStream().pipe(dst, opts)
  }

  then (onsuccess, onfail) {
    return new Promise((resolve, reject) => {
      const src = this.createStream()
      const dst = concat({encoding: 'object'}, items => {
        resolve(items)
      })
      src.once('error', reject)
      dst.once('error', reject)
      src.pipe(dst)
    }).then(onsuccess, onfail)
  }

  get sql () {
    return materialize(this, (db, values, sql, release) => {
      release()
      return sql
    })
  }
}

module.exports = QuerySet

class Attributes {
  constructor (
    transformer,
    distinct,
    onlyColumns,
    annotations,
    grouping,
    filter,
    slice,
    Query,
    order,
    data,
    dao
  ) {
    this.distinct = distinct
    this.onlyColumns = onlyColumns
    this.annotations = annotations
    this.grouping = grouping
    this.filter = filter
    this.slice = slice
    this.transformer = transformer
    this.Query = Query
    this.order = order
    this.data = data
    this.dao = dao
  }

  static from (qs) {
    const flattened = new QuerySet(qs[daoSym], null)
    let xs = qs
    while (xs) {
      flattened._transformer = flattened._transformer || xs._transformer
      flattened._columns = flattened._columns || xs._columns
      flattened._Query = flattened._Query || xs._Query
      flattened._order = flattened._order || xs._order
      flattened._data = flattened._data || xs._data
      flattened._grouping = flattened._grouping || xs._grouping
      if (xs._distinct) {
        flattened._distinct = (flattened._distinct || []).concat(xs._distinct)
      }
      if (xs._filter) {
        flattened._filter = (
          flattened._filter
          ? [xs._filter].concat(flattened._filter)
          : [xs._filter]
        )
      }
      if (xs._annotation) {
        flattened._annotation = (
          flattened._annotation
          ? [xs._annotation].concat(flattened._annotation)
          : [xs._annotation]
        )
      }
      if (xs._slice) {
        flattened._slice = [xs._slice].concat(flattened._slice || [])
      }
      xs = xs._parent
    }

    const slice = (flattened._slice || []).reduce((current, next) => {
      return [
        current[0] + next[0],
        Math.min(current[0] + next[1], current[1])
      ]
    }, [0, Infinity])

    return Promise.join(
      resolveData(flattened._Query, flattened._data || []),
      resolveFilter(flattened._filter || [])
    ).spread((data, filter) => {
      return new Attributes(
        flattened._transformer,
        new Set(flattened._distinct || []),
        flattened._columns,
        flattened._annotation,
        flattened._grouping,
        filter,
        slice,
        flattened._Query || Select,
        flattened._order || [],
        data,
        qs[daoSym]
      )
    })
  }
}

function resolveData (Query, data) {
  if (Query !== Insert && Query !== Update) {
    return Promise.resolve({})
  }

  if (Array.isArray(data)) {
    return Promise.all(
      data.map(xs => Promise.props(xs || {}))
    )
  }

  return Promise.props(data)
}

function resolveFilter (outer) {
  return Promise.all(outer).map(filter => {
    return (
      Array.isArray(filter)
      ? Promise.all(filter.map(ys => {
        return Promise.props(rewriteOperationInToSelect(ys || {}))
      }))
      : Promise.props(rewriteOperationInToSelect(filter))
    ).then(result => {
      result[NEGATE_SYM] = filter[NEGATE_SYM]
      return result
    })
  })
}

function materialize (queryset, toStream) {
  const getAttributes = Attributes.from(queryset)
  const getQuery = getAttributes.then(attrs => {
    // run this before grabbing the connection to skip
    // grabbing the connection if it explodes!
    return new attrs.Query(attrs, NEGATE_SYM)
  })

  return getQuery.then(query => {
    const dao = queryset[daoSym]
    return dao.getConnection().then(pair => {
      process.emit(
        queryEventSym,
        dao.InstanceCls,
        query.sql
      )
      return query.run(
        pair,
        toStream
      )
    })
  })
}

function rewriteOperationInToSelect (filter) {
  const out = {}
  for (const key in filter) {
    if (filter[key] && !filter[key][querySetSym]) {
      out[key] = filter[key]
      continue
    }

    if (!filter[key] ||
        !filter[key]._columns ||
        filter[key]._columns.length !== 1) {
      out[key] = filter[key]
      continue
    }

    const split = key.split(':')
    if (split[1] !== 'in' &&
        split[1] !== 'notIn') {
      out[key] = filter[key]
      continue
    }

    const newKey = `${split[0]}:raw`
    const op = split[1] === 'in' ? 'IN' : 'NOT IN'
    out[newKey] = filter[key].raw().then(query => {
      query.release()
      return (col, push) => {
        let len = 0
        while (query.values.length) {
          const next = push(query.values.shift())
          len = len || next
        }
        if (len) {
          query.sql = query.sql.replace(
            /\$(\d+)/g,
            (all, match) => `$${Number(match) + len - 1}`
          )
        }

        return `${col} ${op} (${query.sql})`
      }
    })
  }
  return out
}

function decorateData (instance, data, dao) {
  for (const key in data) {
    if (data[key] &&
        data[key].constructor &&
        data[key].constructor[classToDAOSym] &&
        dao.ddl[key] &&
        dao.ddl[key].isFK &&
        dao.ddl[key].isForwardRelation) {
      instance[key] = data[key]
    }
  }

  return instance
}

function createMapper (queryset, annotations) {
  let xs = queryset
  while (xs) {
    if (xs._transformer) {
      break
    }
    xs = xs._parent
  }

  const transformer = (
    xs
    ? xs._transformer
    : queryset[daoSym].createObjectTransformer(annotations)
  )
  return new Transform({
    objectMode: true,
    transform (chunk, enc, cb) {
      transformer(chunk, out => this.push(out))
      cb()
    }
  })
}

function errorToConflict (err, dao) {
  if (String(err.code) === '23505') {
    const constraint =
      /duplicate key value violates unique constraint "(\w+)"/
      .exec(err.message)[1]

    const mappedError = dao.errorMap[constraint] || {}
    return new dao.Conflict(
      mappedError.description || err.message,
      mappedError.type || 'unknown'
    )
  }
  return err
}
