'use strict'

const Promise = require('bluebird')
const tape = require('tape')

const ormnomnom = require('..')
const db = require('./db.js')

tape('setup database', function (assert) {
  db.setup().then(assert.end, assert.end)
})

tape('create schema', function (assert) {
  const nodes = db.schema`
    CREATE TABLE nodes (
      id serial primary key,
      name varchar(255),
      val real
    );
  `
  const refs = nodes.then(_ => db.schema`
    CREATE TABLE refs (
      id serial primary key,
      node_id integer not null references "nodes" ("id") on delete cascade,
      val real
    );
  `)
  refs
    .return(null)
    .then(assert.end)
    .catch(assert.end)
})

tape('test insert', function (assert) {
  class Node {
    constructor (props) {
      this.id = props.id
      this.name = props.name
      this.val = props.val
    }
  }
  var NodeObjects = ormnomnom(Node, {
    id: ormnomnom.joi.number().integer(),
    name: ormnomnom.joi.string(),
    val: ormnomnom.joi.number()
  })
  NodeObjects.create({
    name: 'hello world',
    val: 3
  }).then(xs => {
    assert.ok(xs instanceof Node, 'xs is a Node')
    assert.equal(xs.id, 1)
    assert.equal(xs.name, 'hello world')
    assert.equal(xs.val, 3)
    return db.getConnection()
  }).then(conn => {
    return Promise.promisify(conn.query.bind(conn))(
      'select * from nodes where id=1'
    )
  }).then(results => {
    assert.deepEqual(results.rows, [{
      id: 1,
      name: 'hello world',
      val: 3
    }], 'independently verify presence in db')
  })
  .return(null)
  .then(assert.end)
  .catch(assert.end)
})

tape('test update (none affected)', function (assert) {
  class Node {
    constructor (props) {
      this.id = props.id
      this.name = props.name
      this.val = props.val
    }
  }
  var NodeObjects = ormnomnom(Node, {
    id: ormnomnom.joi.number(),
    name: ormnomnom.joi.string().required(),
    val: ormnomnom.joi.number()
  })
  NodeObjects
    .filter({'val:gt': 3})
    .update({val: 10, name: 'gary busey'})
    .then(xs => {
      assert.equal(xs, 0)
      return db.getConnection()
    }).then(conn => {
      return Promise.promisify(conn.query.bind(conn))(
        'select * from nodes'
      )
    }).then(results => {
      assert.deepEqual(results.rows, [{
        id: 1,
        name: 'hello world',
        val: 3
      }], 'independently verify presence in db')
    })
  .return(null)
  .then(assert.end)
  .catch(assert.end)
})

tape('test update (one affected)', function (assert) {
  class Node {
    constructor (props) {
      this.id = props.id
      this.name = props.name
      this.val = props.val
    }
  }
  var NodeObjects = ormnomnom(Node, {
    id: ormnomnom.joi.number(),
    name: ormnomnom.joi.string(),
    val: ormnomnom.joi.number()
  })
  NodeObjects
    .filter({'val': 3})
    .update({val: 10, name: 'gary busey'})
    .then(xs => {
      assert.deepEqual(xs, 1)
      return db.getConnection()
    }).then(conn => {
      return Promise.promisify(conn.query.bind(conn))(
        'select * from nodes'
      )
    }).then(results => {
      assert.deepEqual(results.rows, [{
        id: 1,
        name: 'gary busey',
        val: 10
      }], 'independently verify presence in db')
    })
  .return(null)
  .then(assert.end)
  .catch(assert.end)
})

tape('test delete', function (assert) {
  class Node {
    constructor (props) {
      this.id = props.id
      this.name = props.name
      this.val = props.val
    }
  }
  var NodeObjects = ormnomnom(Node, {
    id: ormnomnom.joi.number(),
    name: ormnomnom.joi.string(),
    val: ormnomnom.joi.number()
  })
  NodeObjects
    .delete()
    .then(xs => {
      assert.deepEqual(xs, 1)
      return db.getConnection()
    }).then(conn => {
      return Promise.promisify(conn.query.bind(conn))(
        'select * from nodes'
      )
    }).then(results => {
      assert.deepEqual(results.rows, [], 'independently verify absence in db')
    })
  .return(null)
  .then(assert.end)
  .catch(assert.end)
})

tape('test nested insert', function (assert) {
  class Node {
    constructor (props) {
      this.id = props.id
      this.name = props.name
      this.val = props.val
    }
  }
  class Ref {
    constructor (props) {
      this.id = props.id
      this.node = props.node
      this.node_id = props.node_id
      this.val = props.val
    }
  }
  const RefObjects = ormnomnom(Ref, {
    id: ormnomnom.joi.number(),
    node: Node,
    val: ormnomnom.joi.number()
  })
  var NodeObjects = ormnomnom(Node, {
    id: ormnomnom.joi.number(),
    name: ormnomnom.joi.string(),
    val: ormnomnom.joi.number()
  })

  const createRef = RefObjects.create({
    val: 10,
    node: NodeObjects.create({
      val: 100,
      name: 'jake busey'
    })
  })

  createRef
    .then(ref => {
      assert.equal(ref.node.val, 100)
      assert.equal(ref.node.name, 'jake busey')
      assert.equal(ref.node_id, ref.node.id)
      assert.equal(ref.val, 10)
    })
  .return(null)
  .then(assert.end)
  .catch(assert.end)
})

tape('drop database', function (assert) {
  db.teardown().then(assert.end, assert.end)
})
