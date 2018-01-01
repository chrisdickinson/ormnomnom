'use strict'

const Promise = require('bluebird')
const { beforeEach, afterEach, teardown, test } = require('tap')

const ormnomnom = require('..')
const db = require('./db')
const { Node, Ref } = require('./models')

db.setup(beforeEach, afterEach, teardown)

const filterTests = [{
  query: Node.objects.all(),
  expect: [1, 2, 3, 4, 5]
}, {
  query: Node.objects.filter({
    'name:eq': 'HELLO'
  }),
  expect: [1]
}, {
  query: Node.objects.filter({
    'name:eq': 'hello'
  }),
  expect: []
}, {
  query: Node.objects.filter({
    'name:neq': 'HELLO'
  }),
  expect: [2, 3, 4]
}, {
  query: Node.objects.filter({
    'name:raw' (column, push) {
      return `char_length(${column}) = $${push(11)}`
    }
  }),
  expect: [3]
}, {
  query: Node.objects.filter({
    'name:contains': 'on'
  }),
  expect: [3, 4]
}, {
  query: Node.objects.filter({
    'name:startsWith': 'Gary'
  }),
  expect: [2]
}, {
  query: Node.objects.filter({
    'name:endsWith': 'busey'
  }),
  expect: [2]
}, {
  query: Node.objects.filter({
    'name:in': ['Gary busey', 'Mona Lisa', 'HELLO']
  }),
  expect: [1, 2, 4]
}, {
  query: Node.objects.filter({
    'name:in': []
  }),
  expect: []
}, {
  query: Node.objects.filter({
    'name:notIn': ['Gary busey']
  }),
  expect: [1, 3, 4]
}, {
  query: Node.objects.filter({
    'name:notIn': []
  }),
  expect: [1, 2, 3, 4, 5]
}, {
  query: Node.objects.filter({
    'name:isNull': true
  }),
  expect: [5]
}, {
  query: Node.objects.filter({
    'name:isNull': false
  }),
  expect: [1, 2, 3, 4]
}, {
  query: Ref.objects.filter([{
    'node.name': 'HELLO'
  }, {
    'val': 0
  }]),
  expect: [1, 2, 3]
}, {
  query: Node.objects.filter({
    'val:lt': 3
  }),
  expect: [2]
}, {
  query: Node.objects.filter({
    'val:lte': 5
  }),
  expect: [1, 2]
}, {
  query: Node.objects.filter({
    'val:gt': 10
  }),
  expect: [3, 4]
}, {
  query: Node.objects.filter({
    'val:gte': 10
  }),
  expect: [3, 4, 5]
}, {
  query: Node.objects.filter({
    'name:iStartsWith': 'm'
  }),
  expect: [4]
}, {
  query: Node.objects.filter({
    'name:iEndsWith': 'o'
  }),
  expect: [1]
}, {
  query: Node.objects.filter({
    'name:iContains': 'o'
  }),
  expect: [1, 3, 4]
}, {
  query: Ref.objects.filter({
    'node.name:contains': 'o',
    'node.val:gt': 10
  }),
  expect: [3]
}, {
  query: Ref.objects.all().order('-node.name'),
  expect: [3, 1, 2]
}, {
  query: Ref.objects.all().order('node.val'),
  expect: [2, 1, 3]
}, {
  query: Node.objects.all().order('val'),
  expect: [2, 1, 5, 4, 3]
}, {
  query: Node.objects.all().order(['val', '-id']),
  expect: [2, 1, 5, 4, 3]
}, {
  query: Node.objects.exclude({'name:iContains': 'o'}),
  expect: [2]
}]

filterTests.forEach(scenario => {
  test('test of ' + JSON.stringify(scenario.query._filter), assert => {
    scenario.query.valuesList('id').then(ids => {
      assert.deepEqual(ids, scenario.expect)
    }, err => {
      return scenario.query.sql.then(sql => {
        throw new Error(sql + '\n' + err.message)
      })
    })
    .return(null)
    .then(assert.end)
    .catch(assert.end)
  })
})

test('test invalid fk filter: not a model', function (assert) {
  class Ref {
    constructor (props) {
      Object.assign(this, props)
    }
  }

  class FakeNode {
  }

  const RefObjects = ormnomnom(Ref, {
    'id': ormnomnom.joi.number(),
    'node': ormnomnom.fk(FakeNode),
    'val': ormnomnom.joi.number().required()
  })

  RefObjects.filter({'node.id': 3}).then(_ => {
    throw new Error('expected error')
  }, err => {
    assert.equal(err.message, 'No DAO registered for FakeNode')
  }).return(null).then(assert.end).catch(assert.end)
})

test('test invalid fk filter: not a fk', function (assert) {
  Ref.objects.filter({'val.id': 3}).then(_ => {
    throw new Error('expected error')
  }, err => {
    assert.equal(err.message, 'val is not a join-able column')
  }).return(null).then(assert.end).catch(assert.end)
})

test('test order + count', function (assert) {
  Node.objects.all().order('val').count().then(cnt => {
    assert.ok('should have succeeded.')
  }).return(null).then(assert.end).catch(assert.end)
})

test('test filter by foreign instance', function (assert) {
  var getNode = Node.objects.get({name: 'Gary busey'})
  var getRefs = getNode.then(node => {
    return Ref.objects.filter({node}).valuesList('id')
  })
  getRefs.then(ids => {
    assert.deepEqual(ids, [2])
  }).return(null).then(assert.end).catch(assert.end)
})

test('test filter by OR', function (assert) {
  var getSQL = Node.objects.filter([{
    name: 'Gary busey'
  }, {
    name: 'Jake busey'
  }]).raw()

  return getSQL.then(raw => {
    raw.release()
    assert.ok(
      raw.sql.indexOf(
        'WHERE ("nodes"."name" = $1 OR "nodes"."name" = $2)'
      ) !== -1,
      'contains expected clause'
    )
    assert.deepEqual([
      'Gary busey',
      'Jake busey'
    ], raw.values)
  }).return(null).then(assert.end).catch(assert.end)
})

test('test filter by OR+promise', function (assert) {
  var getSQL = Node.objects.filter([{
    name: Promise.resolve('Gary busey')
  }, {
    name: Promise.resolve('Jake busey')
  }]).raw()

  return getSQL.then(raw => {
    raw.release()
    assert.ok(
      raw.sql.indexOf(
        'WHERE ("nodes"."name" = $1 OR "nodes"."name" = $2)'
      ) !== -1,
      'contains expected clause'
    )
    assert.deepEqual([
      'Gary busey',
      'Jake busey'
    ], raw.values)
  }).return(null).then(assert.end).catch(assert.end)
})

test('test filter by foreign promise', function (assert) {
  var getRefs = Ref.objects.filter({
    node: Node.objects.get({name: 'Gary busey'})
  }).valuesList('id')
  getRefs.then(ids => {
    assert.deepEqual(ids, [2])
  }).return(null).then(assert.end).catch(assert.end)
})

test('test :in on empty array', assert => {
  const getRefs = Ref.objects.filter({
    'id:in': []
  })

  return getRefs.then().catch(err => {
    assert.fail('did not expect err')
    assert.fail(err)
  })
})
