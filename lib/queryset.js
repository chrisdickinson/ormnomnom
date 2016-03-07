'use strict'

const symbols = require('./shared-symbols.js')
const Builder = require('./sql-builder.js')
const classToDAOSym = symbols.clsToDAO
const querySetSym = symbols.querySet

module.exports = createQueryClass()

const QueryStream = require('pg-query-stream')
const concat = require('concat-stream')
const Promise = require('bluebird')
const streams = require('stream')
const joi = require('joi')

const Transform = streams.Transform
const Readable = streams.Readable

const once = require('once')

const NEGATE_SYM = Symbol('negation')

const DELETE = Symbol('delete')
const INSERT = Symbol('insert')
const UPDATE = Symbol('update')
const SELECT = Symbol('select')
const COUNT = Symbol('count')

const daoSym = Symbol('dao')

function createQueryClass () {
  return class QuerySet {
    constructor (dao, parent) {
      this._transformer = null
      this._action = parent === null ? SELECT : null
      this._filter = null
      this._slice = null
      this._data = null
      this._order = null
      this._columns = null
      this._parent = parent
      this[daoSym] = dao
    }

    [querySetSym] () {
    }

    count () {
      var qs = new QuerySet(this[daoSym], this)
      qs._action = COUNT
      return qs.valuesList(['count']).then(xs => xs[0])
    }

    order (by) {
      by = Array.isArray(by) ? by : [by]
      var qs = new QuerySet(this[daoSym], this)
      qs._order = by
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

    filter (query) {
      var qs = new QuerySet(this[daoSym], this)
      qs._filter = query
      return qs
    }

    exclude (query) {
      var qs = new QuerySet(this[daoSym], this)
      query[NEGATE_SYM] = true
      qs._filter = query
      return qs
    }

    slice (start, end) {
      var qs = new QuerySet(this[daoSym], this)
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
      var qs = new QuerySet(this[daoSym], this)
      qs._action = DELETE
      qs._transformer = countTransform
      return qs.then(xs => xs[0])
    }
    update (data) {
      var qs = new QuerySet(this[daoSym], this)
      qs._action = UPDATE
      qs._data = data
      qs._transformer = countTransform
      return qs.then(xs => xs[0])
    }
    create (data) {
      const isBulk = Array.isArray(data)
      const getData = isBulk
          ? Promise.all(data.map(Promise.props))
          : Promise.props(data).then(xs => [xs])

      return getData.then(data => {
        var qs = new QuerySet(this[daoSym], this)
        qs._action = INSERT
        qs._data = data
        return qs.then(xs => {
          return isBulk
            ? xs.map((ys, idx) => decorateData(ys, data[idx], this[daoSym]))
            : decorateData(xs[0], data[0], this[daoSym])
        })
      })
    }

    values (values) {
      var qs = new QuerySet(this[daoSym], this)
      values = Array.isArray(values) ? values : [values]
      qs._columns = values
      qs._transformer = this[daoSym].createValuesTransformer(values)
      return qs
    }
    valuesList (values) {
      var qs = new QuerySet(this[daoSym], this)
      values = Array.isArray(values) ? values : [values]
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
      var mapper = createMapper(this)
      materialize(this).then(stream => {
        stream.on('error', err => {
          // wrap database errors as conflicts where appropriate
          mapper.emit('error', errorToConflict(err, this[daoSym]))
        })
        stream.pipe(mapper)
      }, err => {
        mapper.emit('error', err)
      })
      return mapper
    }

    pipe (dst, opts) {
      return this.createStream().pipe(dst, opts)
    }
    then (onsuccess, onfail) {
      var deferred = Promise.defer()
      var reject = once(deferred.reject.bind(deferred))

      var promise = deferred.promise

      if (onsuccess && onfail) {
        promise = promise.then(onsuccess, onfail)
      } else if (onsuccess) {
        promise = promise.then(onsuccess)
      } else if (onfail) {
        promise = promise.catch(onfail)
      }

      try {
        var src = this.createStream()
      } catch (err) {
        reject(err)
        return promise
      }
      var dst = concat({encoding: 'object'}, items => {
        deferred.resolve(items)
      })
      src.once('error', reject)
      dst.once('error', reject)
      src.pipe(dst)

      return promise
    }
    get sql () {
      return materialize(this, (db, values, sql, release) => {
        release()
        return sql
      })
    }
  }
}

function * iterate (qs) {
  var current = qs
  while (current) {
    yield current
    current = current._parent
  }
}

function materialize (queryset, destination) {
  var action = null
  var order = null
  var filter = []
  var slice = []
  var data = null
  for (var xs of iterate(queryset)) {
    action = action || xs._action
    data = data || xs._data
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

  var getData = action !== INSERT && action !== UPDATE
    ? Promise.resolve({})
    : Array.isArray(data)
      ? Promise.all(data.map(Promise.props))
      : Promise.props(data)

  var getWhere = Promise.all(filter).then(filter => {
    return Promise.all(filter.map(function (xs) {
      return (
        Array.isArray(xs)
        ? Promise.all(xs.map(rewriteOperationInToSelect))
        : Promise.props(rewriteOperationInToSelect(xs))
      ).then(function (ys) {
        ys[NEGATE_SYM] = xs[NEGATE_SYM]
        return ys
      })
    }))
  })
  var connection = getWhere.then(where => {
    return queryset[daoSym].getConnection()
  })

  var retVal = Promise.all([
    getData,
    getWhere,
    Promise.resolve(connection).get('connection'),
    Promise.resolve(connection).get('release')
  ]).spread(buildQuery)

  return Promise.all([
    connection,
    retVal.reflect()
  ]).spread(function (conn, status) {
    if (status.isRejected()) {
      return conn.release(status.reason())
    }
  }).return(retVal)

  function buildQuery (data, where, db, release) {
    var values = []
    var result = null
    const dao = queryset[daoSym]
    switch (action) {
      case UPDATE:
        destination = destination || queryCount
        result = buildUpdate(
          dao, data, where, slice, order, values)
        break
      case DELETE:
        destination = destination || queryCount
        result = buildDelete(
          dao, where, slice, order, values)
        break
      case SELECT:
        destination = destination || queryMap
        result = buildSelect(
          dao, where, slice, order, values, queryset._columns)
        break
      case COUNT:
        destination = destination || queryMap
        result = buildCount(
          dao, where, slice, order, values)
        break
      case INSERT:
        destination = destination || queryMap
        result = buildInsert(
          dao, data, values)
        break
    }
    return destination(db, values, result, release)
  }
}

function rewriteOperationInToSelect (filter) {
  const out = {}
  for (var key in filter) {
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
        var len = 0
        while (query.values.length) {
          len = len || push(query.values.shift())
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

function queryCount (db, values, sql, release) {
  var stream = new Readable({
    objectMode: true,
    read (n) {}
  })
  db.query(sql, values, function (err, rows) {
    if (err) {
      return stream.emit('error', err)
    }
    stream.push(rows.rowCount)
    stream.push(null)
  })
  stream.once('error', release)
  stream.once('end', release)
  return stream
}

function queryMap (db, values, sql, release) {
  var query = new QueryStream(sql, values)
  query.once('error', release)
  query.once('end', release)
  return db.query(query)
}

function decorateData (instance, data, dao) {
  if (!instance) {
    return
  }
  for (var key in data) {
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

function createMapper (queryset) {
  var transformer = null
  for (var xs of iterate(queryset)) {
    transformer = xs._transformer
    if (transformer) {
      break
    }
  }
  transformer = transformer || queryset[daoSym].createObjectTransformer()
  return new Transform({
    objectMode: true,
    transform (chunk, enc, cb) {
      transformer(chunk, out => this.push(out))
      cb()
    }
  })
}

function buildUpdate (dao, data, where, bounds, order, values) {
  var keys = []
  var preppedData = {}
  var validator = {}
  for (var key in data) {
    if (!dao.ddl[key]) {
      continue
    }
    if (dao.ddl[key].isFK && !dao.ddl[key].isForwardRelation) {
      continue
    }
    var col = dao.ddl[key]
    var val = col.dbPrepData(data[key])
    preppedData[key] = val
    validator[key] = col.getDataValidator()
    keys.push(`"${col.column}"`)
    values.push(val)
  }

  var result = joi.validate(preppedData, validator)
  if (result.error) {
    throw result.error
  }

  const builder = new Builder(dao, NEGATE_SYM)

  where.forEach(clause => {
    Array.isArray(clause)
      ? builder.addWhereAny(clause)
      : builder.addWhereAll(clause)
  })

  const fromClause = Array.from(builder.joins()).map(xs => {
    builder.addWhereAll({
      [`${xs.parent.prefix || ''}${xs.column.column}:raw`] (col, push) {
        return `${col} = "${xs.targetTableName}"."${xs.column.remoteColumn()}"`
      }
    })
    return `"${xs.dao.tableName}" "${xs.targetTableName}"`
  })

  const whereClause = builder.getWhereClause(values)

  return `
    UPDATE "${dao.tableName}" "${builder.targetTableName}"
    SET (${keys}) = (${keys.map((key, idx) => '$' + (idx + 1))})
    ${fromClause.length ? 'FROM ' + fromClause : ''}
    ${whereClause}
  `.split('\n').map(xs => xs.trim()).join(' ').trim()
}

function buildDelete (dao, where, bounds, order, values) {
  const builder = new Builder(dao, NEGATE_SYM)

  where.forEach(clause => {
    Array.isArray(clause)
      ? builder.addWhereAny(clause)
      : builder.addWhereAll(clause)
  })

  const usingClause = Array.from(builder.joins()).map(xs => {
    builder.addWhereAll({
      [`${xs.parent.prefix || ''}${xs.column.column}:raw`] (col, push) {
        return `${col} = "${xs.targetTableName}"."${xs.column.remoteColumn()}"`
      }
    })
    return `"${xs.dao.tableName}" "${xs.targetTableName}"`
  })

  const whereClause = builder.getWhereClause(values)

  return `
    DELETE FROM "${dao.tableName}" "${builder.targetTableName}"
    ${usingClause.length ? 'USING ' + usingClause : ''}
    ${whereClause}
  `.split('\n').map(xs => xs.trim()).join(' ').trim()
}

function buildCount (dao, where, bounds, order, values) {
  const builder = new Builder(dao, NEGATE_SYM)
  const offset = bounds[0]
  const limit = bounds[1] - bounds[0]

  // add order clauses just to pick up joins.
  if (order && order.length) {
    order.forEach(xs => builder.addOrderClause(xs))
  }

  where.forEach(clause => {
    Array.isArray(clause)
      ? builder.addWhereAny(clause)
      : builder.addWhereAll(clause)
  })

  const joinClause = Array.from(builder.joins()).map(xs => {
    return `
      LEFT ${xs.column.nullable ? 'OUTER' : ''} JOIN
      "${xs.dao.tableName}" "${xs.targetTableName}" ON (
        "${xs.parent.targetTableName}"."${xs.column.column}" =
        "${xs.targetTableName}"."${xs.column.remoteColumn()}"
      )
    `
  })

  const whereClause = builder.getWhereClause(values)

  return `
    SELECT COUNT(*) AS "${dao.tableName}.count" FROM
    "${dao.tableName}" "${builder.targetTableName}"
    ${joinClause.join(' ')}
    ${whereClause}
    LIMIT ${isFinite(limit) ? limit : 'ALL'}
    OFFSET ${offset}
  `.split('\n').map(xs => xs.trim()).join(' ').trim()
}

function buildSelect (dao, where, bounds, order, values, onlyFields) {
  onlyFields = onlyFields ? new Set(onlyFields) : onlyFields
  const fieldFilter = onlyFields ? xs => onlyFields.has(xs) : Boolean
  const builder = new Builder(dao, NEGATE_SYM)
  const offset = bounds[0]
  const limit = bounds[1] - bounds[0]

  if (order && order.length) {
    order.forEach(xs => builder.addOrderClause(xs))
  }

  where.forEach(clause => {
    Array.isArray(clause)
      ? builder.addWhereAny(clause)
      : builder.addWhereAll(clause)
  })

  const joinClause = Array.from(builder.joins()).map(xs => {
    return `
LEFT ${xs.column.nullable ? 'OUTER' : ''} JOIN
"${xs.dao.tableName}" "${xs.targetTableName}" ON (
  "${xs.parent.targetTableName}"."${xs.column.column}" =
  "${xs.targetTableName}"."${xs.column.remoteColumn()}"
)`.trim()
  })

  const selectClause = []
  for (const pair of builder.selecting) {
    const targetName = pair[0]
    if (!fieldFilter(targetName)) {
      continue
    }
    const column = pair[1]
    selectClause.push(`
${column.sqlName} AS "${column.outputName}"
    `.trim())
  }

  const whereClause = builder.getWhereClause(values)

  return `
    SELECT ${selectClause.join(', ')} FROM
    "${dao.tableName}" "${builder.targetTableName}"
    ${joinClause.join(' ')}
    ${whereClause}
    ${order && order.length ? 'ORDER BY ' + builder.ordering.map(toOrdering) : ''}
    LIMIT ${isFinite(limit) ? limit : 'ALL'}
    OFFSET ${offset}
  `.split('\n').map(xs => xs.trim()).join(' ').trim()

  function toOrdering (xs) {
    return `${xs.column.sqlName} ${xs.dir}`
  }
}

function buildInsert (dao, data, values) {
  const validator = {}
  const returningKeys = []
  for (var key in dao.ddl) {
    const col = dao.ddl[key]
    if (col.isFK && !col.isForwardRelation) {
      continue
    }
    if (!col.isFK) {
      returningKeys.push(col.name)
    }
    if (key === dao.primaryKeyName) {
      continue
    }
    validator[key] = col.getDataValidator()
  }

  const insertSchema = new Set()
  const preppedData = new Array(data.length)
  const allowUnknown = {allowUnknown: true}
  for (var i = 0; i < data.length; ++i) {
    const keys = Object.keys(data[i])
    preppedData[i] = {}
    for (var j = 0; j < keys.length; ++j) {
      if (!dao.ddl[keys[j]]) {
        continue
      }
      preppedData[i][keys[j]] = dao.ddl[keys[j]].dbPrepData(data[i][keys[j]])
    }

    const validated = joi.validate(preppedData[i], validator, allowUnknown)
    if (validated.error) {
      throw validated.error
    }
    preppedData[i] = validated.value
    for (var resultKey in validated.value) {
      if (!dao.ddl[resultKey] || !(resultKey in validator)) {
        continue
      }
      insertSchema.add(resultKey)
    }
  }

  const rows = []
  for (var x = 0; x < preppedData.length; ++x) {
    const row = []
    for (var col of insertSchema) {
      if (col in preppedData[x]) {
        row.push(
          col in preppedData[x]
            ? '$' + values.push(preppedData[x][col])
            : 'DEFAULT'
        )
      }
    }
    rows.push(`(${row.join(', ')})`)
  }

  const columns = Array.from(insertSchema).map(xs => {
    return `"${dao.ddl[xs].column}"`
  })

  return `
    INSERT INTO "${dao.tableName}"
    (${columns}) VALUES ${rows}
    RETURNING ${returningKeys.map(
      xs => '"' + xs + '" AS "' + dao.tableName + '.' + xs + '"'
    )}
  `
}

function countTransform (row, push) {
  return push(row)
}

function errorToConflict (err, dao) {
  if (String(err.code) === '23505') {
    const constraint =
      /duplicate key value violates unique constraint "(\w+)"/
      .exec(err.message)[1]
    return new dao.Conflict(dao.errorMap[constraint] || err.message)
  }
  return err
}
