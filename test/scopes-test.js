'use strict'

const { beforeEach, afterEach, teardown, test } = require('tap')

const orm = require('..')
const db = require('./db')

db.setup(beforeEach, afterEach, teardown)

test('test calling a scope', assert => {
  class Node {
    constructor (obj) {
      this.id = obj.id
      this.name = obj.name
      this.val = obj.val
    }
  }

  const NodeObjects = orm(Node, {
    id: { type: 'integer' },
    name: { anyOf: [{ type: 'null' }, { type: 'string' }], default: null },
    val: { type: 'number' }
  }, {
    scopes: {
      name: (qs, n) => {
        return qs.filter({ name: n })
      }
    }
  })
  return NodeObjects.create({
    name: 'jake busey',
    val: -100
  }).then(() => {
    return NodeObjects.scopes.name('jake busey').then(xs => {
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

  const NodeObjects = orm(Node, {
    id: { type: 'integer' },
    name: { anyOf: [{ type: 'null' }, { type: 'string' }], default: null },
    val: { type: 'number' }
  }, {
    scopes: {
      name: (qs, n) => {
        return qs.filter({ name: n })
      },
      val: (qs, v) => {
        return qs.filter({ val: v })
      }
    }
  })
  return NodeObjects.create({
    name: 'jake busey',
    val: -100
  }).then(() => {
    return NodeObjects.scopes.name('jake busey').val(-100).then(xs => {
      assert.equal(xs.length, 1)
      assert.equal(xs[0].name, 'jake busey')
      assert.equal(xs[0].val, -100)
    })
  })
})

test('test trying to add a scope with a reserved name', assert => {
  class Node {
    constructor (obj) {
      this.id = obj.id
      this.name = obj.name
      this.val = obj.val
    }
  }

  assert.throws(() => {
    orm(Node, {
      id: { type: 'integer' },
      name: { anyOf: [{ type: 'null' }, { type: 'string' }], default: null },
      val: { type: 'number' }
    }, {
      scopes: {
        filter: () => {}
      }
    })
  })

  assert.end()
})
