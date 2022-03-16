'use strict'

const { beforeEach, afterEach, teardown, test } = require('tap')

const orm = require('..')
const db = require('./db')

const QuerySet = require('../lib/queryset.js')

db.setup(beforeEach, afterEach, teardown)

test('test calling a scope', assert => {
  class Node {
    constructor (obj) {
      this.id = obj.id
      this.name = obj.name
      this.val = obj.val
    }
  }

  class NodeQuerySet extends QuerySet {
    name (n) {
      return this.filter({ name: n })
    }
  }

  const NodeObjects = orm(Node, {
    id: { type: 'integer' },
    name: { anyOf: [{ type: 'null' }, { type: 'string' }], default: null },
    val: { type: 'number' }
  }, {
    querySetClass: NodeQuerySet
  })

  return NodeObjects.create({
    name: 'jake busey',
    val: -100
  }).then(() => {
    return NodeObjects.all().name('jake busey').then(xs => {
      assert.equal(xs.length, 1)
      assert.equal(xs[0].name, 'jake busey')
      assert.equal(xs[0].val, -100)
    })
  })
})

test('test chaining scopes', assert => {
  class Node {
    constructor (obj) {
      this.id = obj.id
      this.name = obj.name
      this.val = obj.val
    }
  }

  class NodeQuerySet extends QuerySet {
    name (n) {
      return this.filter({ name: n })
    }

    val (v) {
      return this.filter({ val: v })
    }
  }

  const NodeObjects = orm(Node, {
    id: { type: 'integer' },
    name: { anyOf: [{ type: 'null' }, { type: 'string' }], default: null },
    val: { type: 'number' }
  }, {
    querySetClass: NodeQuerySet
  })

  return NodeObjects.create({
    name: 'jake busey',
    val: -100
  }).then(() => {
    return NodeObjects.all().name('jake busey').val(-100).then(xs => {
      assert.equal(xs.length, 1)
      assert.equal(xs[0].name, 'jake busey')
      assert.equal(xs[0].val, -100)
    })
  })
})
