'use strict'

const {beforeEach, afterEach, teardown, test} = require('tap')
const {Writable} = require('stream')

const ormnomnom = require('..')
const {Node, Ref, Farout} = require('./models')
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
      return conn.query(
        `select * from nodes where id=${xs.id}`
      )
    }).then(results => {
      assert.deepEqual(results.rows, [{
        id: xs.id,
        name: 'hello world',
        val: 3
      }], 'independently verify presence in db')
    })
  })
})

test('test insert with falsey data', assert => {
  return Farout.objects.create(null).then(xs => {
    assert.match(xs, {
      ref_id: null
    })
  })
})

test('test bulk insert', assert => {
  return Node.objects.create([{
    name: 'one',
    val: 1
  }, {
    name: 'two',
    val: 2
  }]).then(xs => {
    assert.equals(xs.length, 2)
    assert.match(xs, [{
      name: 'one',
      val: 1
    }, {
      name: 'two',
      val: 2
    }])
  })
})

test('test bulk insert with differing columns', assert => {
  return Node.objects.create([{
    name: 'one',
    val: 1
  }, {
    val: 2
  }]).then(xs => {
    assert.equals(xs.length, 2)
    assert.match(xs, [{
      name: 'one',
      val: 1
    }, {
      name: null,
      val: 2
    }])
  })
})

test('test bulk insert with falsey data', assert => {
  return Farout.objects.create([{
    ref_id: 1
  }, null]).then(xs => {
    assert.match(xs, [{
      ref_id: 1
    }, {
      ref_id: null
    }])
  })
})

test('test insert (skips keys that arent columns)', assert => {
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
      return conn.query(
        `select * from nodes where id=${xs.id}`
      )
    }).then(results => {
      assert.deepEqual(results.rows, [{
        id: xs.id,
        name: 'hello world',
        val: 3
      }], 'independently verify presence in db')
    })
  })
})

test('test insert errors when validation fails', assert => {
  return Node.objects.create({
    name: 'hello world'
  }).catch(err => {
    assert.equals(err.name, 'ValidationError')
  })
})

test('test insert fails when primary key conflicts', assert => {
  ormnomnom.describeConflict('nodes_pkey', 'Node already exists')
  return Node.objects.create({
    id: 1,
    name: 'broken',
    val: 100
  }).then(() => {
    assert.fail('should not be reachable')
  }).catch(err => {
    assert.equals(err.message, 'Node already exists')
  })
})

test('test insert fails when primary key conflicts (no description available)', assert => {
  return Ref.objects.create({
    id: 1,
    node_id: 1,
    val: 100
  }).then(() => {
    assert.fail('should not be reachable')
  }).catch(err => {
    assert.equals(err.message, 'duplicate key value violates unique constraint "refs_pkey"')
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
      return conn.query(
        'select * from nodes where name = \'janis joplin\''
      )
    }).then(results => {
      assert.deepEqual(results.rows, [], 'independently verify presence in db')
    })
})

test('test update with missing data', assert => {
  return Node.objects.update().catch(err => {
    assert.equals(err.message, 'Attempted update of Node object with no data')
  })
})

test('test update', assert => {
  return Node.objects.filter({id: 1}).update([{name: 'janis joplin'}, null]).catch(err => {
    assert.equals(err.message, 'Attempted update of Node object with no data')
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
      return conn.query(
        'select * from nodes where name = \'gary busey\''
      )
    }).then(results => {
      assert.deepEqual(results.rows, [{
        id: 1,
        name: 'gary busey',
        val: 10
      }], 'independently verify presence in db')
    })
})

test('test update (one affected, with join)', assert => {
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
      return conn.query(
        'select * from refs where val=1000'
      )
    }).then(results => {
      assert.match(results.rows, [{
        node_id: 4,
        val: 1000
      }], 'independently verify presence in db')
    })
})

test('test update (all affected)', assert => {
  return Node.objects.update({val: 14}).then(xs => {
    assert.deepEqual(xs, 5)
    return db.getConnection()
  }).then(conn => {
    return conn.query(
      'select * from nodes'
    )
  }).then(results => {
    assert.match(results.rows, [{
      id: 1,
      name: 'HELLO',
      val: 14
    }, {
      id: 2,
      name: 'Gary busey',
      val: 14
    }, {
      id: 3,
      name: 'John Bonham',
      val: 14
    }, {
      id: 4,
      name: 'Mona Lisa',
      val: 14
    }, {
      id: 5,
      name: null,
      val: 14
    }])
  })
})

test('test filter with delete', assert => {
  return Node.objects
    .filter({id: 1000})
    .delete()
    .then(xs => {
      assert.deepEqual(xs, 0)
      return db.getConnection()
    }).then(conn => {
      return conn.query(
        'select * from nodes'
      )
    }).then(results => {
      assert.deepEqual(results.rows.length, 5, 'verify all rows still exists')
    })
})

test('test delete', assert => {
  return Node.objects
    .delete({id: 1})
    .then(xs => {
      assert.deepEqual(xs, 1)
      return db.getConnection()
    }).then(conn => {
      return conn.query(
        'select * from nodes'
      )
    }).then(results => {
      assert.deepEqual(results.rows.length, 4, 'verify one row is removed')
      assert.notOk(results.rows.find(row => row.id === 1), 'verify correct node is removed')
    })
})

test('test delete with or', assert => {
  return Node.objects
    .delete([{id: 1}, {id: 2}])
    .then(xs => {
      assert.deepEqual(xs, 2)
      return db.getConnection()
    }).then(conn => {
      return conn.query(
        'select * from nodes'
      )
    }).then(results => {
      assert.deepEqual(results.rows.length, 3, 'verify one row is removed')
      assert.notOk(results.rows.find(row => row.id === 1), 'verify node 1 is removed')
      assert.notOk(results.rows.find(row => row.id === 2), 'verify node 2 is removed')
    })
})

test('test nested insert', assert => {
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

test('test simple select', assert => {
  return Ref.objects.create({
    val: 300,
    node: Node.objects.create({
      name: 'jake busey',
      val: -100
    })
  }).then(() => {
    return Ref.objects.filter({'node.name:startsWith': 'jake'}).then(xs => {
      assert.equal(xs.length, 1)
      assert.equal(xs[0].node.name, 'jake busey')
      assert.equal(xs[0].val, 300)
    })
  })
})

test('test select with or (with only one condition)', assert => {
  return Node.objects.filter([{id: 1}]).then(xs => {
    assert.deepEqual(xs, [{
      id: 1,
      name: 'HELLO',
      val: 3
    }])
  })
})

test('test values select', assert => {
  return Ref.objects.filter({'node.name:endsWith': 'busey'}).values('node_id').then(xs => {
    assert.deepEqual(xs, [{
      node_id: 2
    }])
    assert.ok(!(xs[0] instanceof Ref), 'should be plain objects')
  })
})

test('test deep values select', assert => {
  return Ref.objects.filter({'node.name:endsWith': 'busey'}).values(['node.name', 'node_id']).then(xs => {
    assert.deepEqual(xs, [{
      node: {name: 'Gary busey'},
      node_id: 2
    }])
    assert.ok(!(xs[0] instanceof Ref), 'should be plain objects')
  })
})

test('test select with order by joined column', assert => {
  return Farout.objects.create({ref_id: 1}).then(() => {
    return Farout.objects.all().order('ref.node.id')
  }).then(xs => {
    assert.match(xs, [{
      ref_id: 1
    }])
  })
})

test('test select with multiple joins', assert => {
  return Farout.objects.create({ref_id: 1, second_ref_id: 2}).then(() => {
    return Farout.objects.filter([{'ref.id': 1}, {'second_ref.id': 2}])
  }).then(xs => {
    assert.match(xs, [{
      ref_id: 1,
      second_ref_id: 2
    }])
  })
})

test('test streaming select', assert => {
  return new Promise((resolve, reject) => {
    const receiver = new Writable({
      write (chunk, _, callback) {
        assert.deepEquals(chunk, {
          id: 1,
          name: 'HELLO',
          val: 3
        })
        callback()
      },
      objectMode: true
    })

    receiver.on('error', reject)
    receiver.on('finish', resolve)

    Node.objects.filter({id: 1}).pipe(receiver)
  })
})

test('test onQuery fires', assert => {
  const eventFired = new Promise(resolve => {
    const listener = function (cls, sql) {
      assert.equals(cls.name, 'Node')
      ormnomnom.removeQueryListener(listener)
      resolve()
    }
    ormnomnom.onQuery(listener)
  })

  return Promise.all([
    eventFired,
    Node.objects.filter({id: 1}).then(xs => {
      assert.match(xs[0], {id: 1, name: 'HELLO', val: 3})
    })
  ])
})

test('test distinct', assert => {
  return Ref.objects.filter({val: 0}).distinct('val').then(xs => {
    assert.deepEqual(xs, [{
      node: null,
      id: 2,
      node_id: 2,
      val: 0
    }])
  })
})

test('test distinct with default column', assert => {
  return Ref.objects.filter({val: 0}).distinct().then(xs => {
    assert.deepEqual(xs, [{
      node: null,
      id: 2,
      node_id: 2,
      val: 0
    }, {
      node: null,
      id: 3,
      node_id: 3,
      val: 0
    }])
  })
})

test('test slice', assert => {
  return Node.objects.all().slice(0, 1).order('id').then(xs => {
    assert.deepEqual(xs, [{
      id: 1,
      name: 'HELLO',
      val: 3
    }])
  })
})

test('test slice with offset', assert => {
  return Node.objects.all().slice(1, 3).order('id').then(xs => {
    assert.deepEqual(xs, [{
      id: 2,
      name: 'Gary busey',
      val: -10
    }, {
      id: 3,
      name: 'John Bonham',
      val: 10000
    }])
  })
})

test('test slice with no end', assert => {
  return Node.objects.all().slice(3).order('id').then(xs => {
    assert.deepEqual(xs, [{
      id: 4,
      name: 'Mona Lisa',
      val: 100
    }, {
      id: 5,
      name: null,
      val: 10
    }])
  })
})

test('test notIn with query as param', assert => {
  return Ref.objects.filter({
    'node_id:notIn': Node.objects.filter({'id:gt': 1}).valuesList('id')
  }).then(xs => {
    assert.deepEqual(xs, [{
      id: 1,
      node: null,
      node_id: 1,
      val: 10
    }])
  })
})

test('test gt with query as param (should throw validation error)', assert => {
  return Ref.objects.filter({
    'node_id:gt': Node.objects.filter({id: 1}).valuesList('id')
  }).then(() => {
    assert.fail('should not reach here')
  }).catch(err => {
    assert.equals(err.name, 'ValidationError')
    assert.equals(err.message, 'child "node_id:gt" fails because ["node_id:gt" must be a number, "node_id:gt" must be a number of milliseconds or valid date string]')
  })
})

test('test in with query containing no filter as param', assert => {
  return Ref.objects.filter({
    'node_id:in': Node.objects.all().valuesList('id')
  }).then(xs => {
    assert.deepEquals(xs, [{
      id: 1,
      node: null,
      node_id: 1,
      val: 10
    }, {
      id: 2,
      node: null,
      node_id: 2,
      val: 0
    }, {
      id: 3,
      node: null,
      node_id: 3,
      val: 0
    }])
  })
})

test('test "in query" optimization', assert => {
  return Ref.objects.filter({
    'node_id:in': Node.objects.filter({name: 'gary busey'}).valuesList('id')
  }).sql.then(sql => {
    assert.equal(sql.replace(/\n\s+/gm, ' ').trim(), `SELECT "refs"."id" AS "refs.id", "refs"."node_id" AS "refs.node_id", "refs"."val" AS "refs.val" FROM "refs" "refs"  WHERE "refs"."node_id" IN (SELECT "nodes"."id" AS "nodes.id" FROM "nodes" "nodes"  WHERE "nodes"."name" = $1)`)
  })
})

test('test "in query" optimization w/prepended value', assert => {
  return Ref.objects.filter({
    'node.name': 'squidward',
    'node_id:in': Node.objects.filter({name: 'gary busey'}).valuesList('id')
  }).sql.then(sql => {
    assert.equal(sql.replace(/\n\s+/gm, ' ').trim(), `SELECT "refs"."id" AS "refs.id", "refs"."node_id" AS "refs.node_id", "refs"."val" AS "refs.val", "nodes"."id" AS "refs.node.id", "nodes"."name" AS "refs.node.name", "nodes"."val" AS "refs.node.val" FROM "refs" "refs" LEFT  JOIN "nodes" "nodes" ON ( "refs"."node_id" = "nodes"."id" ) WHERE ("nodes"."name" = $1 AND "refs"."node_id" IN (SELECT "nodes"."id" AS "nodes.id" FROM "nodes" "nodes"  WHERE "nodes"."name" = $2))`)
  })
})

test('test values list', assert => {
  return Ref.objects.filter({'node.name:endsWith': 'busey'}).valuesList(['node_id', 'node.val']).then(xs => {
    assert.deepEqual(xs, [2, -10])
  })
})

test('test count', assert => {
  return Node.objects.filter({'val:gt': 10}).count().then(function (xs) {
    assert.equal(xs, '2')
  })
})

test('test getOrCreate already exists', assert => {
  return Node.objects.getOrCreate({name: 'Gary busey', val: -10}).then(([created, xs]) => {
    assert.equal(created, false)
    assert.equal(xs.name, 'Gary busey')
  })
})

test('test getOrCreate does not exist', assert => {
  return Node.objects.getOrCreate({name: 'johnny five', val: 100}).then(([created, xs]) => {
    assert.equal(created, true)
    assert.equal(xs.name, 'johnny five')
  })
})

test('test getOrCreate multiple objects returned', assert => {
  const cloneBusey = Node.objects.create({
    name: 'Gary busey',
    val: 0xdeadbeef
  })

  return Node.objects.getOrCreate({name: cloneBusey.then(xs => xs.name)}).then(() => {
    throw new Error('should throw exception')
  }, err => {
    assert.equal(err.constructor, Node.objects.MultipleObjectsReturned)
  })
})

test('test get fails on multiple objects returned', assert => {
  return Node.objects.get({'name:contains': 'busey'}).catch(err => {
    assert.equal(err.constructor, Node.objects.MultipleObjectsReturned)
    assert.equal(err.message, 'Multiple Node objects returned')
    assert.ok(err instanceof ormnomnom.MultipleObjectsReturned)
  })
})

test('test get fails on zero objects returned', assert => {
  return Node.objects.get({'name': 'ford prefect'})
  .catch(err => {
    if (err instanceof Node.objects.NotFound) {
      assert.equal(err.message, 'Node not found')
      assert.ok(err instanceof ormnomnom.NotFound)
    } else {
      throw err
    }
  })
})

test('test reverse relation', assert => {
  return Node.objects.refsSetFor(
    Node.objects.get({name: 'Gary busey'})
  ).then(xs => {
    assert.equal(xs.length, 1)
    assert.equal(xs[0].val, 0)
    assert.equal(xs[0].node.val, -10)
  })
})

test('test reverse query', assert => {
  return Node.objects.filter({'refs.val:gt': 0}).then(xs => {
    assert.equal(xs.length, 1)
  })
})

test('test bulk insert', assert => {
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

test('test group', assert => {
  return Ref.objects.create({
    node_id: 2,
    val: 5
  }).then(() => {
    return Ref.objects.all().group('node_id').annotate({
      highest (ref) {
        return `max(${ref('val')})`
      }
    }).order('highest')
  }).then(xs => {
    assert.equals(xs.length, 3)
    assert.match(xs, [
      [{node_id: 3}, {highest: 0}],
      [{node_id: 2}, {highest: 5}],
      [{node_id: 1}, {highest: 10}]
    ])
  })
})

test('test group (no annotations)', assert => {
  return Ref.objects.create({node_id: 3, val: 5}).then(() => {
    return Ref.objects.all().group('node_id').order('-node_id')
  }).then(xs => {
    assert.match(xs, [{
      node_id: 3
    }, {
      node_id: 2
    }, {
      node_id: 1
    }])
  })
})

test('test group (annotation using push)', assert => {
  return Ref.objects.all().group('node_id').annotate({
    matches (ref, push) {
      return `bool_and(${ref('val')} = ${push(10)})`
    }
  }).order('node_id').then(xs => {
    assert.match(xs, [
      [{node_id: 1}, {matches: true}],
      [{node_id: 2}, {matches: false}],
      [{node_id: 3}, {matches: false}]
    ])
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
      id: getNode.then(({id}) => id),
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
      node: getNode.then(xs => xs[idx & 1]),
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
  })).then(results => {
    return Promise.all(results.map(xs => {
      return Farout.objects.create({ref: xs})
    }))
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
  ]).then(([lhs, rhs]) => {
    assert.deepEqual(lhs, rhs)
  })
})

test('empty OR', assert => {
  return Promise.all([
    Node.objects.filter([]).order('id'),
    Node.objects.all().order('id')
  ]).then(([lhs, rhs]) => {
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

test('connection() uses the provided conn', async assert => {
  const conn = {
    async query (what) {
      const conn = await db.getConnection()
      return conn.query(what)
    }
  }

  const items = await Node.objects.connection(conn).slice(0, 10)
  assert.equal(items.length, 5)
})
