'use strict'

const QueryStream = require('pg-query-stream')
const Readable = require('stream').Readable

const Builder = require('./builder')
const TO_STREAM = Symbol('to-stream')

class Query {
  constructor (attrs, SHARED_NEGATE_SYM) {
    this.attrs = attrs
    this.values = []

    const builder = new Builder(attrs.dao, SHARED_NEGATE_SYM)
    this.sql = this.buildSQL(builder)
    this.annotations = builder.annotations
  }

  run (pair, toStream) {
    return (
      toStream ||
      this[TO_STREAM]
    )(pair.connection, this.values, this.sql, pair.release, this.annotations)
  }

  /* istanbul ignore next */
  [TO_STREAM] () {
    throw new Error('Query#TO_STREAM: not implemented')
  }
}

class RowCountQuery extends Query {
  [TO_STREAM] (db, values, sql, release) {
    const stream = new Readable({
      objectMode: true,
      read (n) {}
    })
    db.query(sql, values, (err, rows) => {
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
}

class RowStreamQuery extends Query {
  [TO_STREAM] (db, values, sql, release, annotations) {
    const query = new QueryStream(sql, values)
    query.once('error', release)
    query.once('end', release)
    query.annotations = annotations
    return db.query(query)
  }
}

module.exports = {
  RowCountQuery,
  RowStreamQuery
}
