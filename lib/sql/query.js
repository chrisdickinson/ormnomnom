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

  run (connection, toStream) {
    return (
      toStream ||
      this[TO_STREAM]
    )(connection, this.values, this.sql, this.annotations)
  }

  /* istanbul ignore next */
  [TO_STREAM] () {
    throw new Error('Query#TO_STREAM: not implemented')
  }
}

class RowCountQuery extends Query {
  [TO_STREAM] (db, values, sql) {
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
    return stream
  }
}

class RowStreamQuery extends Query {
  [TO_STREAM] (db, values, sql, annotations) {
    const query = new QueryStream(sql, values)
    query.annotations = annotations
    return db.query(query)
  }
}

module.exports = {
  RowCountQuery,
  RowStreamQuery
}
