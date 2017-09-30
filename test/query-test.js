'use strict'

const Promise = require('bluebird')
const test = require('tap').test

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
class Farout {
  constructor (props) {
    this.id = props.id
    this.ref = props.ref
    this.ref_id = props.ref_id
  }
}

const FaroutObjects = ormnomnom(Farout, {
  id: ormnomnom.joi.number(),
  ref: ormnomnom.fk(Ref, {nullable: true})
})
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

test('setup database', function (assert) {
  db.setup().then(assert.end, assert.end)
})

test('create schema', function (assert) {
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
  const farouts = refs.then(_ => db.schema`
    CREATE TABLE farouts (
      id serial primary key,
      ref_id integer default null references "refs" ("id") on delete cascade
    );
  `)
  farouts
    .return(null)
    .then(assert.end)
    .catch(assert.end)
})

test('test insert', assert => {
  return NodeObjects.create({
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
})

test('test update (none affected)', assert => {
  return NodeObjects
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
})

test('test update (one affected)', assert => {
  return NodeObjects
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
})

test('test update (one affected, with join)', function (assert) {
  return RefObjects.create({val: 0, node: NodeObjects.get({name: 'gary busey'})})
    .then(() => {
      const subquery = RefObjects
        .filter({'node.val': 10})
        .update({val: 1000})

      return subquery
    }).then(xs => {
      assert.deepEqual(xs, 1)
      return db.getConnection()
    }).then(conn => {
      return Promise.promisify(conn.connection.query.bind(conn.connection))(
        'select * from refs'
      ).tap(() => conn.release())
    }).then(results => {
      assert.deepEqual(results.rows, [{
        id: 1,
        node_id: 1,
        val: 1000
      }], 'independently verify presence in db')
    })
})

test('test delete', function (assert) {
  return NodeObjects
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
})

test('test nested insert', function (assert) {
  const createRef = RefObjects.create({
    val: 10,
    node: NodeObjects.create({
      val: 100,
      name: 'jake busey'
    })
  })

  return createRef
    .then(ref => {
      assert.equal(ref.node.val, 100)
      assert.equal(ref.node.name, 'jake busey')
      assert.equal(ref.node_id, ref.node.id)
      assert.equal(ref.val, 10)
    })
})

test('test simple select', function (assert) {
  return RefObjects.create({
    val: 300,
    node: NodeObjects.create({
      name: 'gary busey',
      val: -100
    })
  }).then(_ => {
    return RefObjects.filter({'node.name:startsWith': 'jake'}).then(xs => {
      assert.equal(xs.length, 1)
      assert.equal(xs[0].node.name, 'jake busey')
      assert.equal(xs[0].val, 10)
    })
  })
})

test('test values select', function (assert) {
  return RefObjects.filter({'node.name:endsWith': 'busey'}).values('node_id').then(xs => {
    assert.deepEqual(xs, [{
      node_id: 2
    }, {
      node_id: 3
    }])
    assert.ok(!(xs[0] instanceof Ref), 'should be plain objects')
  })
})

test('test deep values select', function (assert) {
  return RefObjects.filter({'node.name:endsWith': 'busey'}).values(['node.name', 'node_id']).then(xs => {
    assert.deepEqual(xs, [{
      node: {name: 'jake busey'},
      node_id: 2
    }, {
      node: {name: 'gary busey'},
      node_id: 3
    }])
    assert.ok(!(xs[0] instanceof Ref), 'should be plain objects')
  })
})

test('test "in query" optimization', function (assert) {
  return RefObjects.filter({
    'node_id:in': NodeObjects.filter({name: 'gary busey'}).valuesList('id')
  }).sql.then(sql => {
    assert.equal(sql.replace(/\n\s+/gm, ' ').trim(), `SELECT "refs"."id" AS "refs.id", "refs"."node_id" AS "refs.node_id", "refs"."val" AS "refs.val" FROM "refs" "refs"  WHERE "refs"."node_id" IN (SELECT "nodes"."id" AS "nodes.id" FROM "nodes" "nodes"  WHERE "nodes"."name" = $1)`)
  })
})

test('test "in query" optimization w/prepended value', function (assert) {
  return RefObjects.filter({
    'node.name': 'squidward',
    'node_id:in': NodeObjects.filter({name: 'gary busey'}).valuesList('id')
  }).sql.then(sql => {
    assert.equal(sql.replace(/\n\s+/gm, ' ').trim(), `SELECT "refs"."id" AS "refs.id", "refs"."node_id" AS "refs.node_id", "refs"."val" AS "refs.val", "nodes"."id" AS "refs.node.id", "nodes"."name" AS "refs.node.name", "nodes"."val" AS "refs.node.val" FROM "refs" "refs" LEFT  JOIN "nodes" "nodes" ON ( "refs"."node_id" = "nodes"."id" ) WHERE ("nodes"."name" = $1 AND "refs"."node_id" IN (SELECT "nodes"."id" AS "nodes.id" FROM "nodes" "nodes"  WHERE "nodes"."name" = $2))`)
  })
})

test('test values list', function (assert) {
  return RefObjects.filter({'node.name:endsWith': 'busey'}).valuesList(['node_id', 'node.val']).then(xs => {
    assert.deepEqual(xs, [2, 100, 3, -100])
  })
})

test('test count', function (assert) {
  return NodeObjects.filter({'val:gt': 10}).count().then(function (xs) {
    assert.equal(xs, '1')
  })
})

test('test getOrCreate already exists', function (assert) {
  return NodeObjects.getOrCreate({name: 'jake busey', val: 100}).spread((created, xs) => {
    assert.equal(created, false)
    assert.equal(xs.name, 'jake busey')
  })
})

test('test getOrCreate does not exist', function (assert) {
  return NodeObjects.getOrCreate({name: 'johnny five', val: 100}).spread((created, xs) => {
    assert.equal(created, true)
    assert.equal(xs.name, 'johnny five')
  })
})

test('test getOrCreate multiple objects returned', function (assert) {
  var cloneBusey = NodeObjects.create({
    name: 'jake busey',
    val: 0xdeadbeef
  })

  return NodeObjects.getOrCreate({name: cloneBusey.get('name')}).then(_ => {
    throw new Error('should throw exception')
  }, err => {
    assert.equal(err.constructor, NodeObjects.MultipleObjectsReturned)
  })
})

test('test get fails on multiple objects returned', function (assert) {
  return NodeObjects.get({'name:contains': 'busey'}).catch(err => {
    assert.equal(err.constructor, NodeObjects.MultipleObjectsReturned)
    assert.equal(err.message, 'Multiple Node objects returned')
    assert.ok(err instanceof ormnomnom.MultipleObjectsReturned)
  })
})

test('test get fails on zero objects returned', function (assert) {
  return NodeObjects.get({'name': 'ford prefect'})
  .catch(NodeObjects.NotFound, err => {
    assert.equal(err.message, 'Node not found')
    assert.ok(err instanceof ormnomnom.NotFound)
  })
})

test('test reverse relation', function (assert) {
  return NodeObjects.refsSetFor(
    NodeObjects.get({name: 'gary busey'})
  ).then(xs => {
    assert.equal(xs.length, 1)
    assert.equal(xs[0].val, 300)
  })
})

test('test reverse query', function (assert) {
  return NodeObjects.filter({'refs.val:gt': 0}).then(xs => {
    assert.equal(xs.length, 2)
  })
})

test('test bulk insert', function (assert) {
  const bulkInsert = NodeObjects.create([{
    val: 100,
    name: 'jake busey'
  }, {
    val: 200,
    name: 'gerald busey'
  }])

  return bulkInsert
    .then(ref => {
      assert.equal(ref[0].val, 100)
      assert.equal(ref[0].name, 'jake busey')
      assert.equal(ref[1].val, 200)
      assert.equal(ref[1].name, 'gerald busey')
    })
})

test('test group (no column specified)', assert => {
  const getNode = NodeObjects.create({
    val: 10,
    name: 'goof'
  })

  const getRefs = RefObjects.create(Array.from(Array(10)).map((xs, idx) => {
    return {
      node: getNode,
      val: idx
    }
  }))

  return getRefs.then(refs => {
    return NodeObjects.filter({
      id: getNode.get('id'),
      'refs.id:isNull': false
    }).group().annotate({
      nerds (ref) {
        return `array_agg(${ref('refs.val')})`
      }
    }).values(['nerds'])
  }).then(results => {
    assert.deepEqual(results, [{
      nerds: Array.from(Array(10)).map((xs, idx) => idx)
    }])
  })
})

test('test group (no column specified, nonvalues)', assert => {
  const getNode = NodeObjects.create([{
    val: 10,
    name: 'cat'
  }, {
    val: 66044,
    name: 'floof'
  }])

  const getRefs = RefObjects.create(Array.from(Array(10)).map((xs, idx) => {
    return {
      node: getNode.get(idx & 1),
      val: idx
    }
  }))

  return getRefs.then(refs => {
    return NodeObjects.filter({
      'name:in': ['cat', 'floof'],
      'refs.id:isNull': false
    }).group().annotate({
      nerds (ref) {
        return `array_agg(${ref('refs.val')})`
      }
    }).annotate({
      howMuch (ref) {
        return `sum(${ref('refs.val')})`
      }
    }).order('-howMuch')
  }).then(results => {
    assert.deepEqual(results, [
      [{id: 10, name: 'floof', val: 66044}, {nerds: [1, 3, 5, 7, 9], howMuch: 25}],
      [{id: 9, name: 'cat', val: 10}, {nerds: [0, 2, 4, 6, 8], howMuch: 20}]
    ])
  })
})

test('join delete', assert => {
  const getNode = NodeObjects.create({
    val: 10,
    name: 'troop'
  })

  const getRefs = RefObjects.create(Array.from(Array(10)).map((xs, idx) => {
    return {
      node: getNode,
      val: idx
    }
  })).then().map(xs => {
    return FaroutObjects.create({ref: xs})
  })

  return getRefs.then(() => {
    return FaroutObjects.delete({'ref.node.name': 'troop'})
  }).then(() => {
    return FaroutObjects.filter({'ref.node.name': 'troop'}).count()
  }).then(result => {
    assert.equal(Number(result), 0)
  })
})

test('empty AND', assert => {
  return Promise.all([
    NodeObjects.filter({}).order('id'),
    NodeObjects.all().order('id')
  ]).spread((lhs, rhs) => {
    assert.deepEqual(lhs, rhs)
  })
})

test('empty OR', assert => {
  return Promise.all([
    NodeObjects.filter([]).order('id'),
    NodeObjects.all().order('id')
  ]).spread((lhs, rhs) => {
    assert.deepEqual(lhs, rhs)
  })
})

test('empty bulk INSERT', assert => {
  return NodeObjects.create([]).then(result => {
    assert.deepEqual(result, [])
  })
})

test('create null fk', assert => {
  return FaroutObjects.create({ref: null}).then(result => {
    assert.equal(result.ref_id, null)
  })
})

test('join over non-fk', assert => {
  return NodeObjects.filter({'val.foo': 3}).then(() => {
    throw new Error('unexpected')
  }, err => {
    assert.ok(/val/.test(err.message))
  })
})

test('filter bad column', assert => {
  return NodeObjects.filter({'dne': 3}).then(() => {
    throw new Error('unexpected')
  }, err => {
    assert.ok(/"dne"/.test(err.message))
  })
})

test('filter does not satisfy validator', assert => {
  return NodeObjects.filter({'val': 'banana'}).then(() => {
    throw new Error('did not expect to make it this far')
  }, err => {
    assert.ok(/"val"/.test(err.message))
  })
})

test('exclude or', assert => {
  return NodeObjects.exclude([{val: 10}, {val: 0}]).order('name').then(results => {
    assert.deepEqual(results.map(xs => xs.name), [
      'cat',
      'goof',
      'troop'
    ])
  })
})

test('error from postgres in row count', assert => {
  return NodeObjects.filter({
    val: -1,
    'val:raw' () {
      return 'not valid sql'
    }
  }).update({val: 1}).then(() => {
    throw new Error('did not expect to make it this far')
  }, err => {
    assert.ok(/at or near/.test(err))
  })
})

test('update ignores non-forward relations, non-ddl items', assert => {
  // just shouldn't explode!
  return NodeObjects.filter({val: -1}).update({val: 1, refs: 'goof', newman: 'jerry'})
})

test('update throws on bad data validation', assert => {
  // just shouldn't explode!
  return NodeObjects.filter([{val: -1}, {val: 100000}]).update({val: 'goof'}).then(() => {
    throw new Error('did not expect to make it this far')
  }, err => {
    assert.ok(/"val".*must be a number/.test(err.message))
  })
})

test('update allows OR', assert => {
  return NodeObjects.filter([{val: 10}, {val: 100}]).update({val: 0}).then(results => {
    assert.equal(Number(results), 6)
  })
})

test('count() on annotated query', assert => {
  const root = NodeObjects.create({name: 'count-annotation'})
  const root2 = NodeObjects.create({name: 'count-annotation'})
  const refs = Array.from(Array(10)).map((_, idx) => {
    return RefObjects.create({node: root, val: idx})
  })

  return Promise.all(refs.concat([root2])).then(() => {
    const qs = NodeObjects.filter({name: 'count-annotation'}).annotate({
      total (ref) {
        return `sum(${ref('refs.val')})`
      }
    }).group()

    return qs.order('total').then(result => {
      assert.equal(result.length, 2)
      assert.equal(result[0][1].total, 45)
      assert.equal(result[1][1].total, null)

      return qs.count()
    }).then(result => {
      assert.equal(Number(result), 2)
    })
  })
})

test('none() works as expected', assert => {
  return NodeObjects.none().then(results => {
    assert.equal(results.length, 0)
  })
})

test('drop database', function (assert) {
  db.teardown().then(assert.end, assert.end)
})
