'use strict'

const Promise = require('bluebird')
const tape = require('tape')

const ormnomnom = require('..')
const db = require('./db.js')

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
  node: ormnomnom.fk(Node),
  val: ormnomnom.joi.number()
})
var NodeObjects = ormnomnom(Node, {
  id: ormnomnom.joi.number(),
  name: ormnomnom.joi.string(),
  val: ormnomnom.joi.number()
})

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
    return Promise.promisify(conn.connection.query.bind(conn.connection))(
      'select * from nodes where id=1'
    ).tap(() => conn.release())
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
  NodeObjects
    .filter({'val:gt': 3})
    .update({val: 10, name: 'gary busey'})
    .then(xs => {
      assert.equal(xs, 0)
      return db.getConnection()
    }).then(conn => {
      return Promise.promisify(conn.connection.query.bind(conn.connection))(
        'select * from nodes'
      ).tap(() => conn.release())
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
  NodeObjects
    .filter({'val': 3})
    .update({val: 10, name: 'gary busey'})
    .then(xs => {
      assert.deepEqual(xs, 1)
      return db.getConnection()
    }).then(conn => {
      return Promise.promisify(conn.connection.query.bind(conn.connection))(
        'select * from nodes'
      ).tap(() => conn.release())
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
  NodeObjects
    .delete()
    .then(xs => {
      assert.deepEqual(xs, 1)
      return db.getConnection()
    }).then(conn => {
      return Promise.promisify(conn.connection.query.bind(conn.connection))(
        'select * from nodes'
      ).tap(() => conn.release())
    }).then(results => {
      assert.deepEqual(results.rows, [], 'independently verify absence in db')
    })
  .return(null)
  .then(assert.end)
  .catch(assert.end)
})

tape('test nested insert', function (assert) {
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

tape('test simple select', function (assert) {
  RefObjects.create({val: 300, node: NodeObjects.create({
    name: 'gary busey',
    val: -100
  })}).then(_ => {
    return RefObjects.filter({'node.name:startsWith': 'jake'}).then(xs => {
      assert.equal(xs.length, 1)
      assert.equal(xs[0].node.name, 'jake busey')
      assert.equal(xs[0].val, 10)
    })
  })
  .return(null)
  .then(assert.end)
  .catch(assert.end)
})

tape('test values select', function (assert) {
  RefObjects.filter({'node.name:endsWith': 'busey'}).values('node_id').then(xs => {
    assert.deepEqual(xs, [{
      node_id: 2
    }, {
      node_id: 3
    }])
    assert.ok(!(xs[0] instanceof Ref), 'should be plain objects')
  })
  .return(null)
  .then(assert.end)
  .catch(assert.end)
})

tape('test deep values select', function (assert) {
  RefObjects.filter({'node.name:endsWith': 'busey'}).values(['node.name', 'node_id']).then(xs => {
    assert.deepEqual(xs, [{
      node: {name: 'jake busey'},
      node_id: 2
    }, {
      node: {name: 'gary busey'},
      node_id: 3
    }])
    assert.ok(!(xs[0] instanceof Ref), 'should be plain objects')
  })
  .return(null)
  .then(assert.end)
  .catch(assert.end)
})

tape('test "in query" optimization', function (assert) {
  RefObjects.filter({
    'node_id:in': NodeObjects.filter({name: 'gary busey'}).valuesList('id')
  }).sql.then(sql => {
    assert.equal(sql.replace(/\n\s+/gm, ' ').trim(), `SELECT  "refs"."id" as "refs.id" , "refs"."node_id" as "refs.node_id" , "refs"."val" as "refs.val" FROM "refs" WHERE (("refs"."node_id" IN ( SELECT  "nodes"."id" as "nodes.id" FROM "nodes" WHERE (("nodes"."name" = $1)) LIMIT ALL OFFSET 0 ))) LIMIT ALL OFFSET 0`)
    assert.end()
  })
})

tape('test "in query" optimization w/prepended value', function (assert) {
  RefObjects.filter({
    'node.name': 'squidward',
    'node_id:in': NodeObjects.filter({name: 'gary busey'}).valuesList('id')
  }).sql.then(sql => {
    assert.equal(sql.replace(/\n\s+/gm, ' ').trim(), `SELECT  "refs"."id" as "refs.id" , "refs"."node_id" as "refs.node_id" , "refs"."val" as "refs.val" , "nodes"."id" as "refs.node.id" , "nodes"."name" as "refs.node.name" , "nodes"."val" as "refs.node.val" FROM "refs" LEFT JOIN "nodes" ON ( "refs"."node_id" = "nodes"."id" ) WHERE (("nodes"."name" = $1) AND ("refs"."node_id" IN ( SELECT  "nodes"."id" as "nodes.id" FROM "nodes" WHERE (("nodes"."name" = $2)) LIMIT ALL OFFSET 0 ))) LIMIT ALL OFFSET 0`)
    assert.end()
  })
})

tape('test values list', function (assert) {
  RefObjects.filter({'node.name:endsWith': 'busey'}).valuesList(['node_id', 'node.val']).then(xs => {
    assert.deepEqual(xs, [2, 100, 3, -100])
  })
  .return(null)
  .then(assert.end)
  .catch(assert.end)
})

tape('test count', function (assert) {
  NodeObjects.filter({'val:gt': 10}).count().then(function (xs) {
    assert.equal(xs, '1')
  })
  .return(null)
  .then(assert.end)
  .catch(assert.end)
})

tape('test getOrCreate already exists', function (assert) {
  NodeObjects.getOrCreate({name: 'jake busey', val: 100}).spread((created, xs) => {
    assert.equal(created, false)
    assert.equal(xs.name, 'jake busey')
  })
  .return(null)
  .then(assert.end)
  .catch(assert.end)
})

tape('test getOrCreate does not exist', function (assert) {
  NodeObjects.getOrCreate({name: 'johnny five', val: 100}).spread((created, xs) => {
    assert.equal(created, true)
    assert.equal(xs.name, 'johnny five')
  })
  .return(null)
  .then(assert.end)
  .catch(assert.end)
})

tape('test getOrCreate multiple objects returned', function (assert) {
  var cloneBusey = NodeObjects.create({
    name: 'jake busey',
    val: 0xdeadbeef
  })

  NodeObjects.getOrCreate({name: cloneBusey.get('name')}).then(_ => {
    throw new Error('should throw exception')
  }, err => {
    assert.equal(err.constructor, NodeObjects.MultipleObjectsReturned)
  })
  .return(null)
  .then(assert.end)
  .catch(assert.end)
})

tape('test get fails on multiple objects returned', function (assert) {
  NodeObjects.get({'name:contains': 'busey'}).catch(err => {
    assert.equal(err.constructor, NodeObjects.MultipleObjectsReturned)
    assert.equal(err.message, 'Multiple Node objects returned')
    assert.ok(err instanceof ormnomnom.MultipleObjectsReturned)
  })
  .return(null)
  .then(assert.end)
  .catch(assert.end)
})

tape('test get fails on zero objects returned', function (assert) {
  NodeObjects.get({'name': 'ford prefect'})
  .catch(NodeObjects.NotFound, err => {
    assert.equal(err.message, 'Node not found')
    assert.ok(err instanceof ormnomnom.NotFound)
  })
  .return(null)
  .then(assert.end)
  .catch(assert.end)
})

tape('test reverse relation', function (assert) {
  NodeObjects.refsSetFor(
    NodeObjects.get({name: 'gary busey'})
  ).then(xs => {
    assert.equal(xs.length, 1)
    assert.equal(xs[0].val, 300)
  })
  .return(null)
  .then(assert.end)
  .catch(assert.end)
})

tape('test reverse query', function (assert) {
  NodeObjects.filter({'refs.val:gt': 0}).then(xs => {
    assert.equal(xs.length, 2)
  })
  .return(null)
  .then(assert.end)
  .catch(assert.end)
})

tape('drop database', function (assert) {
  db.teardown().then(assert.end, assert.end)
})
