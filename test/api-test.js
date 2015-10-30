'use strict'

const Promise = require('bluebird')
const tape = require('tape')

const ormnomnom = require('..')
const db = require('./db.js')

tape('setup database', function (assert) {
  db.setup().then(assert.end, assert.end)
})

tape('produces expected table name', function (assert) {
  Promise
  class TestFoo {
  }
  const objects = ormnomnom(TestFoo, {
    id: ormnomnom.joi.number()
  })
  objects.all().raw().then(info => {
    assert.ok(/"test_foos"/g.test(info.sql))
  })
  .return(null)
  .then(assert.end)
  .catch(assert.end)
})

tape('drop database', function (assert) {
  db.teardown().then(assert.end, assert.end)
})
