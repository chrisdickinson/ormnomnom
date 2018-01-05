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

for (const scenario of filterTests) {
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
}

test('test invalid fk filter: not a model', assert => {
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

test('test invalid fk filter: not a fk', assert => {
  Ref.objects.filter({'val.id': 3}).then(_ => {
    throw new Error('expected error')
  }, err => {
    assert.equal(err.message, 'val is not a join-able column')
  }).return(null).then(assert.end).catch(assert.end)
})

test('test order + count', assert => {
  Node.objects.all().order('val').count().then(cnt => {
    assert.ok('should have succeeded.')
  }).return(null).then(assert.end).catch(assert.end)
})

test('test filter by foreign instance', assert => {
  const getNode = Node.objects.get({name: 'Gary busey'})
  const getRefs = getNode.then(node => {
    return Ref.objects.filter({node}).valuesList('id')
  })
  getRefs.then(ids => {
    assert.deepEqual(ids, [2])
  }).return(null).then(assert.end).catch(assert.end)
})

test('test filter by OR', assert => {
  const getSQL = Node.objects.filter([{
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

test('test filter by OR+promise', assert => {
  const getSQL = Node.objects.filter([{
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

test('test filter by foreign promise', assert => {
  const getRefs = Ref.objects.filter({
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

test('test select with empty condition', assert => {
  return Node.objects.filter().sql.then(xs => {
    assert.equals(xs, 'SELECT "nodes"."id" AS "nodes.id", "nodes"."name" AS "nodes.name", "nodes"."val" AS "nodes.val" FROM "nodes" "nodes"')
  })
})

test('test select with empty object as filter', assert => {
  return Node.objects.filter({}).sql.then(xs => {
    assert.equals(xs, 'SELECT "nodes"."id" AS "nodes.id", "nodes"."name" AS "nodes.name", "nodes"."val" AS "nodes.val" FROM "nodes" "nodes"  WHERE 1=1')
  })
})

test('test select with empty or', assert => {
  return Node.objects.filter([]).sql.then(xs => {
    assert.equals(xs, 'SELECT "nodes"."id" AS "nodes.id", "nodes"."name" AS "nodes.name", "nodes"."val" AS "nodes.val" FROM "nodes" "nodes"  WHERE 1=1')
  })
})

test('test select with or with single empty object', assert => {
  return Node.objects.filter([{}]).sql.then(xs => {
    assert.equals(xs, 'SELECT "nodes"."id" AS "nodes.id", "nodes"."name" AS "nodes.name", "nodes"."val" AS "nodes.val" FROM "nodes" "nodes"  WHERE 1=1')
  })
})

test('test select with or with two empty objects', assert => {
  return Node.objects.filter([{}, {}]).sql.then(xs => {
    assert.equals(xs, 'SELECT "nodes"."id" AS "nodes.id", "nodes"."name" AS "nodes.name", "nodes"."val" AS "nodes.val" FROM "nodes" "nodes"  WHERE (1=1 OR 1=1)')
  })
})

test('test select with or with one filter and one empty object', assert => {
  return Node.objects.filter([{ id: 1 }, {}]).sql.then(xs => {
    assert.equals(xs, 'SELECT "nodes"."id" AS "nodes.id", "nodes"."name" AS "nodes.name", "nodes"."val" AS "nodes.val" FROM "nodes" "nodes"  WHERE ("nodes"."id" = $1 OR 1=1)')
  })
})

test('test select with empty exclude', assert => {
  return Node.objects.exclude().sql.then(xs => {
    assert.equals(xs, 'SELECT "nodes"."id" AS "nodes.id", "nodes"."name" AS "nodes.name", "nodes"."val" AS "nodes.val" FROM "nodes" "nodes"')
  })
})

test('test select with empty object as exclude', assert => {
  return Node.objects.exclude({}).sql.then(xs => {
    assert.equals(xs, 'SELECT "nodes"."id" AS "nodes.id", "nodes"."name" AS "nodes.name", "nodes"."val" AS "nodes.val" FROM "nodes" "nodes"  WHERE NOT 1=1')
  })
})

test('test select with empty or as exclude', assert => {
  return Node.objects.exclude([]).sql.then(xs => {
    assert.equals(xs, 'SELECT "nodes"."id" AS "nodes.id", "nodes"."name" AS "nodes.name", "nodes"."val" AS "nodes.val" FROM "nodes" "nodes"  WHERE NOT 1=1')
  })
})

test('test select with or with single empty object as exclude', assert => {
  return Node.objects.exclude([{}]).sql.then(xs => {
    assert.equals(xs, 'SELECT "nodes"."id" AS "nodes.id", "nodes"."name" AS "nodes.name", "nodes"."val" AS "nodes.val" FROM "nodes" "nodes"  WHERE NOT 1=1')
  })
})

test('test select with or with two empty objects as exclude', assert => {
  return Node.objects.exclude([{}, {}]).sql.then(xs => {
    assert.equals(xs, 'SELECT "nodes"."id" AS "nodes.id", "nodes"."name" AS "nodes.name", "nodes"."val" AS "nodes.val" FROM "nodes" "nodes"  WHERE NOT (1=1 OR 1=1)')
  })
})

test('test select with or with one filter and one empty object as exclude', assert => {
  return Node.objects.exclude([{ id: 1 }, {}]).sql.then(xs => {
    assert.equals(xs, 'SELECT "nodes"."id" AS "nodes.id", "nodes"."name" AS "nodes.name", "nodes"."val" AS "nodes.val" FROM "nodes" "nodes"  WHERE NOT ("nodes"."id" = $1 OR 1=1)')
  })
})
