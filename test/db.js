'use strict'

module.exports = {
  createdb: createdb,
  setup: setup,
  schema: schema,
  getConnection: getConnection
}

const Promise = require('bluebird')
const ormnomnom = require('..')
const models = require('./models')
const pg = require('pg')
const pgtools = require('pgtools')

const TEST_DB_NAME = process.env.TEST_DB_NAME || 'onn_test'
const client = new pg.Client({
  database: TEST_DB_NAME
})
let connected = false

function createdb () {
  ormnomnom.setConnection(getConnection)
  return pgtools.dropdb({}, TEST_DB_NAME).catch(err => {
    // ignore this error since it throws if the db doesn't exist
    if (err.name !== 'invalid_catalog_name') {
      throw err
    }
  }).then(_ => {
    return pgtools.createdb({}, TEST_DB_NAME)
  }).then(_ => {
    return schema`
      CREATE TABLE invoices (
        id serial primary key,
        name varchar(255),
        date timestamp
      );

      CREATE TABLE line_items (
        id serial primary key,
        subtotal real,
        discount real,
        invoice_id integer default null references "invoices" ("id") on delete cascade
      );

      CREATE TABLE nodes (
        id serial primary key,
        name varchar(255),
        val real
      );

      CREATE TABLE refs (
        id serial primary key,
        node_id integer not null references "nodes" ("id") on delete cascade,
        val real
      );

      CREATE TABLE farouts (
        id serial primary key,
        ref_id integer default null references "refs" ("id") on delete cascade
      );
    `
  }).then(_ => {
    return models.Invoice.objects.create([{
      name: 'a thing',
      date: Date.UTC(2012, 0, 1)
    }, {
      name: 'another thing',
      date: Date.UTC(2013, 9, 19)
    }, {
      name: 'great',
      date: Date.UTC(2016, 10, 20)
    }]).then().map(invoice => {
      return models.LineItem.objects.create(Array.from(Array(10)).map((_, idx) => {
        return {
          invoice,
          subtotal: 10 * (idx + 1),
          discount: idx
        }
      }))
    })
  }).then(_ => {
    return models.Node.objects.create([{
      name: 'HELLO',
      val: 3
    }, {
      name: 'Gary busey',
      val: -10
    }, {
      name: 'John Bonham',
      val: 10000
    }, {
      name: 'Mona Lisa',
      val: 100
    }])
  }).then(_ => {
    return models.Node.objects.create({
      val: 10
    })
  }).then(_ => {
    return models.Ref.objects.create([{
      node_id: 1,
      val: 10
    }, {
      node_id: 2,
      val: 0
    }, {
      node_id: 3,
      val: 0
    }])
  }).then(_ => {
    return getConnection().then(client => client.connection.end())
  })
}

function setup (beforeEach, afterEach, teardown) {
  beforeEach(function () {
    return getConnection().then(client => {
      return client.connection.query('BEGIN')
    })
  })

  afterEach(function () {
    return getConnection().then(client => {
      return client.connection.query('ROLLBACK')
    })
  })

  teardown(function () {
    return getConnection().then(client => {
      return client.connection.end()
    })
  })

  ormnomnom.setConnection(getConnection)
}

function getConnection (commit) {
  return new Promise((resolve, reject) => {
    if (connected) {
      return resolve({
        connection: client,
        release: _ => {}
      })
    }

    client.connect()
    client.once('error', reject)
    client.once('connect', _ => {
      client.removeListener('error', reject)
      connected = true
      resolve({
        connection: client,
        release: _ => {}
      })
    })
  })
}

function schema (chunks) {
  chunks = chunks.slice()
  const args = [].slice.call(arguments, 1)
  const out = [chunks.shift()]
  while (chunks.length) {
    out.push(args.shift())
    out.push(chunks.shift())
  }
  const ddl = out.join('')
  return getConnection(true).then(function (client) {
    return client.connection.query(ddl).then(_ => client.release())
  })
}
