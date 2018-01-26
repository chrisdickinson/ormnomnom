'use strict'

const {beforeEach, afterEach, teardown, test} = require('tap')

const ormnomnom = require('..')
const symbols = require('../lib/shared-symbols')
const db = require('./db')

db.setup(beforeEach, afterEach, teardown)

test('produces expected table name', assert => {
  class TestFoo {
  }
  const objects = ormnomnom(TestFoo, {
    id: ormnomnom.joi.number()
  })
  return objects.all().sql.then(sql => {
    assert.ok(/"test_foos"/g.test(sql))
  })
})

test('throws if passed to two ormnomnoms', assert => {
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

test('correctly resolves foreign key classes when passed before assigned a dao', assert => {
  class TestFoo {
  }
  class TestSubFoo {
  }

  TestFoo.objects = ormnomnom(TestFoo, {
    id: ormnomnom.joi.number(),
    sub: ormnomnom.fk(TestSubFoo)
  })

  const privateAPISym = Object.getOwnPropertySymbols(TestFoo.objects)[0]
  assert.equals(TestFoo.objects[privateAPISym].ddl.sub.cls, TestSubFoo, 'sub class should be TestSubFoo')
  // Symbol counting is kind of a hacky way to test this, but the missing cls-to-dao symbol tells us that the
  // class is not yet registered, and the follow up assertion ensures that the class gets registered properly later
  assert.equals(Object.getOwnPropertySymbols(TestFoo.objects[privateAPISym].ddl.sub.cls).length, 0, 'should have no symbols')

  TestSubFoo.objects = ormnomnom(TestSubFoo, {
    id: ormnomnom.joi.number()
  })

  assert.equals(Object.getOwnPropertySymbols(TestFoo.objects[privateAPISym].ddl.sub.cls).length, 1, 'should have one symbol')
  assert.end()
})
