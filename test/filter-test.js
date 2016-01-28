'use strict'

const Promise = require('bluebird')
const tape = require('tape')
const util = require('util')

const ormnomnom = require('..')
const db = require('./db.js')

class Frobnicator {
  constructor (props) {
    util._extend(this, props)
  }
}

class Ref {
  constructor (props) {
    util._extend(this, props)
  }
}

const FrobnicatorObjects = ormnomnom(Frobnicator, {
  'id': ormnomnom.joi.number(),
  'name': ormnomnom.joi.string(),
  'val': ormnomnom.joi.number().required()
})

const RefObjects = ormnomnom(Ref, {
  'id': ormnomnom.joi.number(),
  'frob': ormnomnom.fk(Frobnicator),
  'val': ormnomnom.joi.number().required()
})

const testData = [
  {kind: FrobnicatorObjects, name: 'HELLO', val: 3},
  {kind: FrobnicatorObjects, name: 'Gary busey', val: -10},
  {kind: FrobnicatorObjects, name: 'John Bonham', val: 10000},
  {kind: FrobnicatorObjects, name: 'Mona Lisa', val: 10},
  {kind: FrobnicatorObjects, val: 10},
  {kind: RefObjects, frob_id: 1, val: 10},
  {kind: RefObjects, frob_id: 2, val: 0},
  {kind: RefObjects, frob_id: 3, val: 0}
]

tape('setup database', function (assert) {
  db.setup().then(assert.end, assert.end)
})

tape('create schema', function (assert) {
  const frobs = db.schema`
    CREATE TABLE frobnicators (
      id serial primary key,
      name varchar(255),
      val real
    );
  `
  const refs = frobs.then(_ => db.schema`
    CREATE TABLE refs (
      id serial primary key,
      frob_id integer not null references "frobnicators" ("id") on delete cascade,
      val real
    );
  `)
  const data = refs.then(_ => {
    return testData.reduce((seq, xs) => {
      return seq.then(_ => {
        return xs.kind.create(xs)
      })
    }, Promise.resolve(null))
  })

  data
    .return(null)
    .then(assert.end)
    .catch(assert.end)
})

const filterTests = [{
  query: FrobnicatorObjects.all(),
  expect: [1, 2, 3, 4, 5]
}, {
  query: FrobnicatorObjects.filter({
    'name:eq': 'HELLO'
  }),
  expect: [1]
}, {
  query: FrobnicatorObjects.filter({
    'name:eq': 'hello'
  }),
  expect: []
}, {
  query: FrobnicatorObjects.filter({
    'name:neq': 'HELLO'
  }),
  expect: [2, 3, 4]
}, {
  query: FrobnicatorObjects.filter({
    'name:raw' (column, push) {
      return `char_length(${column}) = $${push(11)}`
    }
  }),
  expect: [3]
}, {
  query: FrobnicatorObjects.filter({
    'name:contains': 'on'
  }),
  expect: [3, 4]
}, {
  query: FrobnicatorObjects.filter({
    'name:startsWith': 'Gary'
  }),
  expect: [2]
}, {
  query: FrobnicatorObjects.filter({
    'name:endsWith': 'busey'
  }),
  expect: [2]
}, {
  query: FrobnicatorObjects.filter({
    'name:in': ['Gary busey', 'Mona Lisa', 'HELLO']
  }),
  expect: [1, 2, 4]
}, {
  query: FrobnicatorObjects.filter({
    'name:in': []
  }),
  expect: []
}, {
  query: FrobnicatorObjects.filter({
    'name:notIn': ['Gary busey']
  }),
  expect: [1, 3, 4]
}, {
  query: FrobnicatorObjects.filter({
    'name:notIn': []
  }),
  expect: [1, 2, 3, 4, 5]
}, {
  query: FrobnicatorObjects.filter({
    'name:isNull': true
  }),
  expect: [5]
}, {
  query: FrobnicatorObjects.filter({
    'name:isNull': false
  }),
  expect: [1, 2, 3, 4]
}, {
  query: RefObjects.filter([{
    'frob.name': 'HELLO'
  }, {
    'val': 0
  }]),
  expect: [1, 2, 3]
}, {
  query: FrobnicatorObjects.filter({
    'val:lt': 3
  }),
  expect: [2]
}, {
  query: FrobnicatorObjects.filter({
    'val:lte': 5
  }),
  expect: [1, 2]
}, {
  query: FrobnicatorObjects.filter({
    'val:gt': 10
  }),
  expect: [3]
}, {
  query: FrobnicatorObjects.filter({
    'val:gte': 10
  }),
  expect: [3, 4, 5]
}, {
  query: FrobnicatorObjects.filter({
    'name:iStartsWith': 'm'
  }),
  expect: [4]
}, {
  query: FrobnicatorObjects.filter({
    'name:iEndsWith': 'o'
  }),
  expect: [1]
}, {
  query: FrobnicatorObjects.filter({
    'name:iContains': 'o'
  }),
  expect: [1, 3, 4]
}, {
  query: RefObjects.filter({
    'frob.name:contains': 'o',
    'frob.val:gt': 10
  }),
  expect: [3]
}, {
  query: RefObjects.all().order('-frob.name'),
  expect: [3, 1, 2]
}, {
  query: RefObjects.all().order('frob.val'),
  expect: [2, 1, 3]
}, {
  query: FrobnicatorObjects.all().order('val'),
  expect: [2, 1, 4, 5, 3]
}, {
  query: FrobnicatorObjects.all().order(['val', '-id']),
  expect: [2, 1, 5, 4, 3]
}, {
  query: FrobnicatorObjects.exclude({'name:iContains': 'o'}),
  expect: [2]
}]

filterTests.forEach(test => {
  tape('test of ' + JSON.stringify(test.query._filter), assert => {
    test.query.valuesList('id').then(ids => {
      assert.deepEqual(ids, test.expect)
    }, err => {
      return test.query.sql.then(sql => {
        throw new Error(sql + '\n' + err.message)
      })
    })
    .return(null)
    .then(assert.end)
    .catch(assert.end)
  })
})

tape('test invalid fk filter: not a model', function (assert) {
  class Ref {
    constructor (props) {
      util._extend(this, props)
    }
  }

  class FakeFrob {
  }

  const RefObjects = ormnomnom(Ref, {
    'id': ormnomnom.joi.number(),
    'frob': ormnomnom.fk(FakeFrob),
    'val': ormnomnom.joi.number().required()
  })

  RefObjects.filter({'frob.id': 3}).then(_ => {
    throw new Error('expected error')
  }, err => {
    assert.equal(err.message, 'No DAO registered for FakeFrob')
  }).return(null).then(assert.end).catch(assert.end)
})

tape('test invalid fk filter: not a fk', function (assert) {
  RefObjects.filter({'val.id': 3}).then(_ => {
    throw new Error('expected error')
  }, err => {
    assert.equal(err.message, 'val is not a join-able column')
  }).return(null).then(assert.end).catch(assert.end)
})

tape('test order + count', function (assert) {
  FrobnicatorObjects.all().order('val').count().then(cnt => {
    assert.ok('should have succeeded.')
  }).return(null).then(assert.end).catch(assert.end)
})

tape('test filter by foreign instance', function (assert) {
  var getFrob = FrobnicatorObjects.get({name: 'Gary busey'})
  var getRefs = getFrob.then(frob => {
    return RefObjects.filter({frob}).valuesList('id')
  })
  getRefs.then(ids => {
    assert.deepEqual(ids, [2])
  }).return(null).then(assert.end).catch(assert.end)
})

tape('test filter by foreign promise', function (assert) {
  var getRefs = RefObjects.filter({
    frob: FrobnicatorObjects.get({name: 'Gary busey'})
  }).valuesList('id')
  getRefs.then(ids => {
    assert.deepEqual(ids, [2])
  }).return(null).then(assert.end).catch(assert.end)
})

tape('drop database', function (assert) {
  db.teardown().then(assert.end, assert.end)
})
