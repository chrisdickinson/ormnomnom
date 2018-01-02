'use strict'

const Promise = require('bluebird')
const { beforeEach, afterEach, teardown, test } = require('tap')

const ormnomnom = require('..')
const { Node, Ref, Farout } = require('./models')
const db = require('./db')

db.setup(beforeEach, afterEach, teardown)

test('test insert', assert => {
  return Node.objects.create({
    name: 'hello world',
    val: 3
  }).then(xs => {
    assert.ok(xs instanceof Node, 'xs is a Node')
    assert.equal(xs.name, 'hello world')
    assert.equal(xs.val, 3)
    return db.getConnection().then(conn => {
      return Promise.promisify(conn.connection.query.bind(conn.connection))(
        `select * from nodes where id=${xs.id}`
      ).tap(() => conn.release())
    }).then(results => {
      assert.deepEqual(results.rows, [{
        id: xs.id,
        name: 'hello world',
        val: 3
      }], 'independently verify presence in db')
    })
  })
})

test('test insert (skips keys that arent columns)', function (assert) {
  return Node.objects.create({
    name: 'hello world',
    val: 3,
    bananas: true
  }).then(xs => {
    assert.ok(xs instanceof Node, 'xs is a Node')
    assert.equal(xs.name, 'hello world')
    assert.equal(xs.val, 3)
    assert.notOk(xs.bananas)
    return db.getConnection().then(conn => {
      return Promise.promisify(conn.connection.query.bind(conn.connection))(
        `select * from nodes where id=${xs.id}`
      ).tap(() => conn.release())
    }).then(results => {
      assert.deepEqual(results.rows, [{
        id: xs.id,
        name: 'hello world',
        val: 3
      }], 'independently verify presence in db')
    })
  })
})

test('test insert errors when validation fails', function (assert) {
  return Node.objects.create({
    name: 'hello world'
  }).catch(err => {
    assert.equals(err.name, 'ValidationError')
  })
})

test('test update (none affected)', assert => {
  return Node.objects
    .filter({'val:gt': 30000})
    .update({val: 10, name: 'janis joplin'})
    .then(xs => {
      assert.equal(xs, 0)
      return db.getConnection()
    }).then(conn => {
      return Promise.promisify(conn.connection.query.bind(conn.connection))(
        'select * from nodes where name = \'janis joplin\''
      ).tap(() => conn.release())
    }).then(results => {
      assert.deepEqual(results.rows, [], 'independently verify presence in db')
    })
})

test('test update (one affected)', assert => {
  return Node.objects
    .filter({'val': 3})
    .update({val: 10, name: 'gary busey'})
    .then(xs => {
      assert.deepEqual(xs, 1)
      return db.getConnection()
    }).then(conn => {
      return Promise.promisify(conn.connection.query.bind(conn.connection))(
        'select * from nodes where name = \'gary busey\''
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
  return Ref.objects.create({val: 0, node: Node.objects.get({name: 'Mona Lisa'})})
    .then(() => {
      const subquery = Ref.objects
        .filter({'node.val': 100})
        .update({val: 1000})

      return subquery
    }).then(xs => {
      assert.deepEqual(xs, 1)
      return db.getConnection()
    }).then(conn => {
      return Promise.promisify(conn.connection.query.bind(conn.connection))(
        'select * from refs where val=1000'
      ).tap(() => conn.release())
    }).then(results => {
      assert.match(results.rows, [{
        node_id: 4,
        val: 1000
      }], 'independently verify presence in db')
    })
})

test('test filter with delete', function (assert) {
  return Node.objects
    .filter({ id: 1000 })
    .delete()
    .then(xs => {
      assert.deepEqual(xs, 0)
      return db.getConnection()
    }).then(conn => {
      return Promise.promisify(conn.connection.query.bind(conn.connection))(
        'select * from nodes'
      ).tap(() => conn.release())
    }).then(results => {
      assert.deepEqual(results.rows.length, 5, 'verify all rows still exists')
    })
})

test('test delete', function (assert) {
  return Node.objects
    .delete({ id: 1 })
    .then(xs => {
      assert.deepEqual(xs, 1)
      return db.getConnection()
    }).then(conn => {
      return Promise.promisify(conn.connection.query.bind(conn.connection))(
        'select * from nodes'
      ).tap(() => conn.release())
    }).then(results => {
      assert.deepEqual(results.rows.length, 4, 'verify one row is removed')
      assert.notOk(results.rows.find(row => row.id === 1), 'verify correct node is removed')
    })
})

test('test delete with or', function (assert) {
  return Node.objects
    .delete([{ id: 1 }, { id: 2 }])
    .then(xs => {
      assert.deepEqual(xs, 2)
      return db.getConnection()
    }).then(conn => {
      return Promise.promisify(conn.connection.query.bind(conn.connection))(
        'select * from nodes'
      ).tap(() => conn.release())
    }).then(results => {
      assert.deepEqual(results.rows.length, 3, 'verify one row is removed')
      assert.notOk(results.rows.find(row => row.id === 1), 'verify node 1 is removed')
      assert.notOk(results.rows.find(row => row.id === 2), 'verify node 2 is removed')
    })
})

test('test nested insert', function (assert) {
  const createRef = Ref.objects.create({
    val: 10,
    node: Node.objects.create({
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
  return Ref.objects.create({
    val: 300,
    node: Node.objects.create({
      name: 'jake busey',
      val: -100
    })
  }).then(_ => {
    return Ref.objects.filter({'node.name:startsWith': 'jake'}).then(xs => {
      assert.equal(xs.length, 1)
      assert.equal(xs[0].node.name, 'jake busey')
      assert.equal(xs[0].val, 300)
    })
  })
})

test('test values select', function (assert) {
  return Ref.objects.filter({'node.name:endsWith': 'busey'}).values('node_id').then(xs => {
    assert.deepEqual(xs, [{
      node_id: 2
    }])
    assert.ok(!(xs[0] instanceof Ref), 'should be plain objects')
  })
})

test('test deep values select', function (assert) {
  return Ref.objects.filter({'node.name:endsWith': 'busey'}).values(['node.name', 'node_id']).then(xs => {
    assert.deepEqual(xs, [{
      node: {name: 'Gary busey'},
      node_id: 2
    }])
    assert.ok(!(xs[0] instanceof Ref), 'should be plain objects')
  })
})

test('test distinct', function (assert) {
  return Ref.objects.filter({ val: 0 }).distinct('val').then(xs => {
    assert.deepEqual(xs, [{
      node: null,
      id: 2,
      node_id: 2,
      val: 0
    }])
  })
})

test('test "in query" optimization', function (assert) {
  return Ref.objects.filter({
    'node_id:in': Node.objects.filter({name: 'gary busey'}).valuesList('id')
  }).sql.then(sql => {
    assert.equal(sql.replace(/\n\s+/gm, ' ').trim(), `SELECT "refs"."id" AS "refs.id", "refs"."node_id" AS "refs.node_id", "refs"."val" AS "refs.val" FROM "refs" "refs"  WHERE "refs"."node_id" IN (SELECT "nodes"."id" AS "nodes.id" FROM "nodes" "nodes"  WHERE "nodes"."name" = $1)`)
  })
})

test('test "in query" optimization w/prepended value', function (assert) {
  return Ref.objects.filter({
    'node.name': 'squidward',
    'node_id:in': Node.objects.filter({name: 'gary busey'}).valuesList('id')
  }).sql.then(sql => {
    assert.equal(sql.replace(/\n\s+/gm, ' ').trim(), `SELECT "refs"."id" AS "refs.id", "refs"."node_id" AS "refs.node_id", "refs"."val" AS "refs.val", "nodes"."id" AS "refs.node.id", "nodes"."name" AS "refs.node.name", "nodes"."val" AS "refs.node.val" FROM "refs" "refs" LEFT  JOIN "nodes" "nodes" ON ( "refs"."node_id" = "nodes"."id" ) WHERE ("nodes"."name" = $1 AND "refs"."node_id" IN (SELECT "nodes"."id" AS "nodes.id" FROM "nodes" "nodes"  WHERE "nodes"."name" = $2))`)
  })
})

test('test values list', function (assert) {
  return Ref.objects.filter({'node.name:endsWith': 'busey'}).valuesList(['node_id', 'node.val']).then(xs => {
    assert.deepEqual(xs, [2, -10])
  })
})

test('test count', function (assert) {
  return Node.objects.filter({'val:gt': 10}).count().then(function (xs) {
    assert.equal(xs, '2')
  })
})

test('test getOrCreate already exists', function (assert) {
  return Node.objects.getOrCreate({name: 'Gary busey', val: -10}).spread((created, xs) => {
    assert.equal(created, false)
    assert.equal(xs.name, 'Gary busey')
  })
})

test('test getOrCreate does not exist', function (assert) {
  return Node.objects.getOrCreate({name: 'johnny five', val: 100}).spread((created, xs) => {
    assert.equal(created, true)
    assert.equal(xs.name, 'johnny five')
  })
})

test('test getOrCreate multiple objects returned', function (assert) {
  var cloneBusey = Node.objects.create({
    name: 'Gary busey',
    val: 0xdeadbeef
  })

  return Node.objects.getOrCreate({name: cloneBusey.get('name')}).then(_ => {
    throw new Error('should throw exception')
  }, err => {
    assert.equal(err.constructor, Node.objects.MultipleObjectsReturned)
  })
})

test('test get fails on multiple objects returned', function (assert) {
  return Node.objects.get({'name:contains': 'busey'}).catch(err => {
    assert.equal(err.constructor, Node.objects.MultipleObjectsReturned)
    assert.equal(err.message, 'Multiple Node objects returned')
    assert.ok(err instanceof ormnomnom.MultipleObjectsReturned)
  })
})

test('test get fails on zero objects returned', function (assert) {
  return Node.objects.get({'name': 'ford prefect'})
  .catch(Node.objects.NotFound, err => {
    assert.equal(err.message, 'Node not found')
    assert.ok(err instanceof ormnomnom.NotFound)
  })
})

test('test reverse relation', function (assert) {
  return Node.objects.refsSetFor(
    Node.objects.get({name: 'Gary busey'})
  ).then(xs => {
    assert.equal(xs.length, 1)
    assert.equal(xs[0].val, 0)
    assert.equal(xs[0].node.val, -10)
  })
})

test('test reverse query', function (assert) {
  return Node.objects.filter({'refs.val:gt': 0}).then(xs => {
    assert.equal(xs.length, 1)
  })
})

test('test bulk insert', function (assert) {
  const bulkInsert = Node.objects.create([{
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
  const getNode = Node.objects.create({
    val: 10,
    name: 'goof'
  })

  const getRefs = Ref.objects.create(Array.from(Array(10)).map((xs, idx) => {
    return {
      node: getNode,
      val: idx
    }
  }))

  return getRefs.then(refs => {
    return Node.objects.filter({
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
  const getNode = Node.objects.create([{
    val: 10,
    name: 'cat'
  }, {
    val: 66044,
    name: 'floof'
  }])

  const getRefs = Ref.objects.create(Array.from(Array(10)).map((xs, idx) => {
    return {
      node: getNode.get(idx & 1),
      val: idx
    }
  }))

  return getRefs.then(refs => {
    return Node.objects.filter({
      'name:in': ['cat', 'floof'],
      'refs.id:isNull': false
    }).group().annotate({
      nerds (ref) {
        return `array_agg(${ref('refs.val')} order by "refs"."val")`
      }
    }).annotate({
      howMuch (ref) {
        return `sum(${ref('refs.val')})`
      }
    }).order('-howMuch')
  }).then(results => {
    assert.match(results, [
      [{name: 'floof', val: 66044}, {nerds: [1, 3, 5, 7, 9], howMuch: 25}],
      [{name: 'cat', val: 10}, {nerds: [0, 2, 4, 6, 8], howMuch: 20}]
    ])
  })
})

test('join delete', assert => {
  const getNode = Node.objects.create({
    val: 10,
    name: 'troop'
  })

  const getRefs = Ref.objects.create(Array.from(Array(10)).map((xs, idx) => {
    return {
      node: getNode,
      val: idx
    }
  })).then().map(xs => {
    return Farout.objects.create({ref: xs})
  })

  return getRefs.then(() => {
    return Farout.objects.delete({'ref.node.name': 'troop'})
  }).then(() => {
    return Farout.objects.filter({'ref.node.name': 'troop'}).count()
  }).then(result => {
    assert.equal(Number(result), 0)
  })
})

test('empty AND', assert => {
  return Promise.all([
    Node.objects.filter({}).order('id'),
    Node.objects.all().order('id')
  ]).spread((lhs, rhs) => {
    assert.deepEqual(lhs, rhs)
  })
})

test('empty OR', assert => {
  return Promise.all([
    Node.objects.filter([]).order('id'),
    Node.objects.all().order('id')
  ]).spread((lhs, rhs) => {
    assert.deepEqual(lhs, rhs)
  })
})

test('empty bulk INSERT', assert => {
  return Node.objects.create([]).then(result => {
    assert.deepEqual(result, [])
  })
})

test('create null fk', assert => {
  return Farout.objects.create({ref: null}).then(result => {
    assert.equal(result.ref_id, null)
  })
})

test('join over non-fk', assert => {
  return Node.objects.filter({'val.foo': 3}).then(() => {
    throw new Error('unexpected')
  }, err => {
    assert.ok(/val/.test(err.message))
  })
})

test('filter bad column', assert => {
  return Node.objects.filter({'dne': 3}).then(() => {
    throw new Error('unexpected')
  }, err => {
    assert.ok(/"dne"/.test(err.message))
  })
})

test('filter does not satisfy validator', assert => {
  return Node.objects.filter({'val': 'banana'}).then(() => {
    throw new Error('did not expect to make it this far')
  }, err => {
    assert.ok(/"val"/.test(err.message))
  })
})

test('exclude or', assert => {
  return Node.objects.exclude([{val: 10}, {val: 0}]).order('name').then(results => {
    assert.deepEqual(results.map(xs => xs.name), [
      'Gary busey',
      'HELLO',
      'John Bonham',
      'Mona Lisa'
    ])
  })
})

test('error from postgres in row count', assert => {
  return Node.objects.filter({
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
  return Node.objects.filter({val: -1}).update({val: 1, refs: 'goof', newman: 'jerry'})
})

test('update throws on bad data validation', assert => {
  // just shouldn't explode!
  return Node.objects.filter([{val: -1}, {val: 100000}]).update({val: 'goof'}).then(() => {
    throw new Error('did not expect to make it this far')
  }, err => {
    assert.ok(/"val".*must be a number/.test(err.message))
  })
})

test('update allows OR', assert => {
  return Node.objects.filter([{val: 10}, {val: 100}]).update({val: 0}).then(results => {
    assert.equal(Number(results), 2)
  })
})

test('count() on annotated query', assert => {
  const root = Node.objects.create({name: 'count-annotation', val: 0})
  const root2 = Node.objects.create({name: 'count-annotation', val: 0})
  const root3 = Node.objects.create({name: 'count-annotation', val: 0})
  const refs = Array.from(Array(20)).map((_, idx) => {
    return Ref.objects.create({node: root, val: idx})
  })

  return Promise.all(refs.concat([root2]).concat([root3])).then(() => {
    const qs = Node.objects.filter({name: 'count-annotation'}).annotate({
      total (ref) {
        return `sum(${ref('refs.val')})`
      }
    }).group()

    return qs.order('total').count().then(result => {
      assert.equal(Number(result), 3)
    })
  })
})

test('none() works as expected', assert => {
  return Node.objects.none().then(results => {
    assert.equal(results.length, 0)
  })
})
