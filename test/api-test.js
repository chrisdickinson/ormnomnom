'use strict'

const { beforeEach, afterEach, teardown, test } = require('tap')

const ormnomnom = require('..')
const db = require('./db.js')

db.setup(beforeEach, afterEach, teardown)

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
