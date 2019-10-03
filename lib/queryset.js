'use strict'

const symbols = require('./shared-symbols.js')
const { props } = require('./promises.js')
const queryEventSym = symbols.queryEvent
const classToDAOSym = symbols.clsToDAO
const querySetSym = symbols.querySet

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
    this._connection = null

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

  async count () {
    const qs = new this.constructor(this[daoSym], this)
    qs._Query = Select
    qs._order = []

    const attrs = await Attributes.from(this)
    const isGrouped = Boolean(attrs.grouping)
    let result = null
    if (!isGrouped) {
      result = await qs.annotate({
        result (ref, push) {
          return 'COUNT(*)'
        }
      }).valuesList(['result'])
    } else {
      qs._Query = Count
      const { db, sql, values } = await qs.raw()
      const { rows } = await db.query(sql, values)
      result = rows.map(({ result }) => result)
    }

    return result[0]
  }

  connection (conn) {
    const qs = new this.constructor(this[daoSym], this)
    qs._connection = conn
    return qs
  }

  group (by = this[daoSym].primaryKeyName) {
    const qs = new this.constructor(this[daoSym], this)
    qs._grouping = [].concat(by)
    return qs
  }

  aggregate (agg) {
    const qs = new this.constructor(this[daoSym], this)
    qs._grouping = []
    qs._order = []
    return qs.annotate({
      result: agg
    }).valuesList(['result']).then(xs => xs[0])
  }

  annotate (ann) {
    const qs = new this.constructor(this[daoSym], this)
    qs._Query = Select
    qs._annotation = ann
    return qs
  }

  distinct (expr = [this[daoSym].primaryKeyName]) {
    const qs = new this.constructor(this[daoSym], this)
    qs._distinct = [].concat(expr)
    return qs
  }

  order (by) {
    const qs = new this.constructor(this[daoSym], this)
    qs._order = [].concat(by)
    return qs
  }

  get (query) {
    return this.filter(query).slice(0, 2).then(xs => {
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
    const qs = new this.constructor(this[daoSym], this)
    qs._filter = query
    return qs
  }

  exclude (query) {
    if (!query) {
      return this
    }
    const qs = new this.constructor(this[daoSym], this)
    query[NEGATE_SYM] = true
    qs._filter = query
    return qs
  }

  slice (start, end) {
    const qs = new this.constructor(this[daoSym], this)
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
    const qs = new this.constructor(this[daoSym], (
      query
        ? this.filter(query)
        : this
    ))
    qs._Query = Delete
    qs._transformer = (row, push) => push(row)
    return qs.then(xs => xs[0])
  }

  update (data) {
    const qs = new this.constructor(this[daoSym], this)
    qs._Query = Update
    qs._data = data
    qs._transformer = (row, push) => push(row)
    return qs.then(xs => xs[0])
  }

  async create (data) {
    const isBulk = Array.isArray(data)

    const resolved = await Promise.all([].concat(data).map(xs => props(xs)))

    if (isBulk && !data.length) {
      return []
    }

    const qs = new this.constructor(this[daoSym], this)
    qs._Query = Insert
    qs._data = resolved

    const result = await qs
    const results = result.map((ys, idx) => decorateData(ys, resolved[idx], this[daoSym]))
    if (isBulk) {
      return results
    }
    return results[0]
  }

  values (values) {
    const qs = new this.constructor(this[daoSym], this)
    values = [].concat(values)
    qs._columns = values
    qs._transformer = this[daoSym].createValuesTransformer(values)
    return qs
  }

  valuesList (values) {
    const qs = new this.constructor(this[daoSym], this)
    values = [].concat(values)
    qs._columns = values
    qs._transformer = this[daoSym].createValuesListTransformer(values)
    return qs
  }

  raw () {
    return materialize(this, (db, values, sql) => {
      return { db, values, sql }
    })
  }

  createStream () {
    const outer = new PassThrough({ objectMode: true })
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

  async _consume () {
    const src = this.createStream()
    const items = []
    for await (const item of src) {
      items.push(item)
    }

    return items
  }

  then (onsuccess, onfail) {
    return new Promise((resolve, reject) => {
      resolve(this._consume())
    }).then(onsuccess, onfail)
  }

  get sql () {
    return materialize(this, (db, values, sql) => {
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
    dao,
    connection
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
    this.connection = connection
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
      flattened._connection = xs._connection || flattened._connection
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

    return Promise.all([
      resolveData(flattened._Query, flattened._data || []),
      resolveFilter(flattened._filter || [])
    ]).then(([data, filter]) => {
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
        qs[daoSym],
        flattened._connection
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
      data.map(xs => props(xs || {}))
    )
  }

  return props(data)
}

async function resolveFilter (outer) {
  const out = new Array(outer.length)
  let idx = 0
  for (const filterInputP of outer) {
    const filterInput = await filterInputP
    const isArray = Array.isArray(filterInput)
    const filters = [].concat(filterInput) // if it's not an array, make it an array.

    let resolved = await Promise.all(filters.map(async filterMember => {
      return props(rewriteOperationInToSelect(await filterMember))
    }))

    resolved = isArray ? resolved : resolved[0]
    resolved[NEGATE_SYM] = filterInputP[NEGATE_SYM] || filterInput[NEGATE_SYM]
    out[idx++] = resolved
  }

  return out
}

async function materialize (queryset, toStream) {
  const attrs = await Attributes.from(queryset)
  // run this before grabbing the connection to skip
  // grabbing the connection if it explodes!
  const query = new attrs.Query(attrs, NEGATE_SYM)

  const dao = queryset[daoSym]
  const conn = (
    attrs.connection
      ? attrs.connection
      : await dao.getConnection()
  )

  process.emit(
    queryEventSym,
    dao.InstanceCls,
    query.sql
  )

  return query.run(
    conn,
    toStream
  )
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
