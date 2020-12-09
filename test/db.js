'use strict'

module.exports = {
  setup: setup,
  getConnection: getConnection
}

const ormnomnom = require('..')
const pg = require('pg')

const TEST_DB_NAME = process.env.TEST_DB_NAME || 'onn_test'
const client = new pg.Client({
  database: TEST_DB_NAME
})
let connected = false

function setup (beforeEach, afterEach, teardown) {
  beforeEach(async () => {
    const client = await getConnection()
    return client.query('BEGIN')
  })

  afterEach(async () => {
    const client = await getConnection()
    return client.query('ROLLBACK')
  })

  teardown(async () => {
    const client = await getConnection()
    return client.end()
  })

  ormnomnom.setConnection(getConnection)
}

async function getConnection () {
  if (connected) {
    return client
  }

  await client.connect()
  connected = true

  return client
}
