'use strict'

module.exports = {
  setup: setup,
  teardown: teardown,
  schema: schema,
  getConnection: getConnection
}

const spawn = require('child_process').spawn
const Promise = require('bluebird')
const ormnomnom = require('..')
const pg = require('pg')

function setup (ready) {
  return teardown().then(_ => new Promise(function (resolve, reject) {
    spawn('createdb', [process.env.TEST_DB_NAME || 'onn_test']).on('exit', function () {
      ormnomnom.setConnection(getConnection)
      resolve()
    })
  }))
}

function teardown (ready) {
  return new Promise(function (resolve, reject) {
    spawn('dropdb', [process.env.TEST_DB_NAME || 'onn_test']).on('exit', function () {
      resolve()
    })
  })
}

function getConnection () {
  return new Promise(function (resolve, reject) {
    const client = new pg.Client({
      host: 'localhost',
      database: process.env.TEST_DB_NAME || 'onn_test'
    })
    client.connect()
    client
      .once('error', reject)
      .once('connect', _ => {
        client.removeListener('error', reject)
        resolve(client)
        setTimeout(_ => {
          client.end()
        }, 50)
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
  return getConnection().then(function (client) {
    return new Promise((resolve, reject) => {
      const query = client.query(ddl)
      query.once('error', reject)
      query.once('end', function () {
        client.end()
        resolve()
      })
    })
  })
}
