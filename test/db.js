'use strict'

module.exports = {
  createdb: createdb,
  setup: setup,
  getConnection: getConnection
}

const Promise = require('bluebird')
const fs = require('fs')
const ormnomnom = require('..')
const path = require('path')
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
    return getConnection().then(client => {
      return client.connection.query(fs.readFileSync(path.join(__dirname, 'fixture.sql'), { encoding: 'utf8' })).then(_ => client.connection.end())
    })
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
