'use strict'

const test = require('tap').test

const ormnomnom = require('..')
const db = require('./db.js')

test('setup database', function (assert) {
  db.setup().then(assert.end, assert.end)
})

test('produces expected table name', function (assert) {
  class TestFoo {
  }
  const objects = ormnomnom(TestFoo, {
    id: ormnomnom.joi.number()
  })
  objects.all().sql.then(sql => {
    assert.ok(/"test_foos"/g.test(sql))
  })
  .return(null)
  .then(assert.end)
  .catch(assert.end)
})

test('throws if passed to two ormnomnoms', function (assert) {
  class TestFoo {
  }
  ormnomnom(TestFoo, {
    id: ormnomnom.joi.number()
  })

  assert.throws(() => {
    ormnomnom(TestFoo)
  })

  assert.end()
})

test('drop database', function (assert) {
  db.teardown().then(assert.end, assert.end)
})
