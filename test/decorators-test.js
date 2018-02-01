'use strict'

const {beforeEach, afterEach, teardown, test} = require('tap')

const {Item} = require('./models')
const autoNow = require('../decorators/autonow')
const db = require('./db')

db.setup(beforeEach, afterEach, teardown)

test('autonow: throws when argument is not a dao', assert => {
  assert.throws(() => {
    Item.wrappedObjects = autoNow(Item)
  }, {
    message: 'Expected instance of DAO'
  })

  assert.end()
})

test('autonow: throws when no column is passed', assert => {
  assert.throws(() => {
    Item.wrappedObjects = autoNow(Item.objects)
  }, {
    message: 'Must specify column name for automatic timestamps'
  })

  assert.end()
})

test('autonow: throws when trying to attach to the same column twice', assert => {
  Item.wrappedObjects = autoNow(Item.objects, { column: 'created' })

  assert.throws(() => {
    Item.doubleWrappedObjects = autoNow(Item.wrappedObjects, { column: 'created' })
  }, {
    message: 'The column "created" is already configured for automatic timestamps'
  })

  assert.end()
})

test('autonow: original dao is not modified', assert => {
  Item.wrappedObjects = autoNow(Item.objects, { column: 'created' })

  return Item.objects.create({ name: 'test' }).then(item => {
    assert.notOk(item.created, 'created column should not be set')
  })
})

test('autonow: sets the column on create', assert => {
  Item.wrappedObjects = autoNow(Item.objects, { column: 'created' })

  return Item.wrappedObjects.create({ name: 'test' }).then(item => {
    assert.ok(item.id, 'id column should be set')
    assert.equals(item.name, 'test', 'name column should be set')
    assert.notEqual(item.created, null, 'created column should be set')
  })
})

test('autonow: sets the column on create when no data is passed', assert => {
  Item.wrappedObjects = autoNow(Item.objects, { column: 'created' })

  return Item.wrappedObjects.create().then(item => {
    assert.ok(item.id, 'id column should be set')
    assert.equals(item.name, null, 'name column should be null')
    assert.notEqual(item.created, null, 'created column should be set')
  })
})

test('autonow: does not set the column on create if a value is already passed', assert => {
  Item.wrappedObjects = autoNow(Item.objects, { column: 'created' })
  const created = new Date()
  created.setYear(created.getFullYear() - 1)

  return Item.wrappedObjects.create({ created }).then(item => {
    assert.ok(item.id, 'id column should be set')
    assert.equals(item.name, null, 'name column should be null')
    assert.same(item.created, created, 'created column should match the given value')
  })
})

test('autonow: sets the column on create for bulk inserts', assert => {
  Item.wrappedObjects = autoNow(Item.objects, { column: 'created' })

  return Item.wrappedObjects.create([{name: 'one'}, {name: 'two'}]).then(items => {
    assert.equals(items.length, 2, 'should have created two items')
    assert.ok(items[0].id, 'id column should be set')
    assert.equals(items[0].name, 'one', 'name column should be set')
    assert.equals(typeof items[0].created, 'object', 'created column should be set')
    assert.ok(items[0].created.toISOString(), 'should be a date object')
    assert.ok(items[1].id, 'id column should be set')
    assert.equals(items[1].name, 'two', 'name column should be set')
    assert.equals(typeof items[1].created, 'object', 'created column should be set')
    assert.ok(items[1].created.toISOString(), 'should be a date object')
  })
})

test('autonow: sets the column on create for bulk inserts with falsy members', assert => {
  Item.wrappedObjects = autoNow(Item.objects, { column: 'created' })

  return Item.wrappedObjects.create([{name: 'one'}, null]).then(items => {
    assert.equals(items.length, 2, 'should have created two items')
    assert.ok(items[0].id, 'id column should be set')
    assert.equals(items[0].name, 'one', 'name column should be set')
    assert.equals(typeof items[0].created, 'object', 'created column should be set')
    assert.ok(items[0].created.toISOString(), 'should be a date object')
    assert.ok(items[1].id, 'id column should be set')
    assert.equals(items[1].name, null, 'name column should be null')
    assert.equals(typeof items[1].created, 'object', 'created column should be set')
    assert.ok(items[1].created.toISOString(), 'should be a date object')
  })
})

test('autonow: sets the column on update', assert => {
  Item.wrappedObjects = autoNow(Item.objects, { column: 'updated' })

  return Item.wrappedObjects.create({ name: 'test' }).then(item => {
    assert.ok(item.id, 'id column should be set')
    assert.equals(item.name, 'test', 'name column should be set')
    assert.notEqual(item.updated, null, 'updated column should be set')
    return Item.wrappedObjects.filter({ id: item.id }).update({ name: 'updated' }).then(updated => {
      assert.equals(updated, 1, 'should have updated one row')
      return Item.wrappedObjects.get({ id: item.id }).then(newItem => {
        assert.equals(item.id, newItem.id, 'updated the right item')
        assert.equals(newItem.name, 'updated', 'name column should be updated')
        assert.ok(newItem.updated > item.updated, 'updated column should be updated')
      })
    })
  })
})

test('autonow: sets the column on update when given no data', assert => {
  Item.wrappedObjects = autoNow(Item.objects, { column: 'updated' })

  return Item.wrappedObjects.create({ name: 'test' }).then(item => {
    assert.ok(item.id, 'id column should be set')
    assert.equals(item.name, 'test', 'name column should be set')
    assert.notEqual(item.updated, null, 'updated column should be set')
    return Item.wrappedObjects.filter({ id: item.id }).update().then(updated => {
      assert.equals(updated, 1, 'should have updated one row')
      return Item.wrappedObjects.get({ id: item.id }).then(newItem => {
        assert.equals(item.id, newItem.id, 'updated the right item')
        assert.equals(newItem.name, item.name, 'name column should be the same')
        assert.ok(newItem.updated > item.updated, 'updated column should be updated')
      })
    })
  })
})

test('autonow: does not set the column on update if a value is passed', assert => {
  Item.wrappedObjects = autoNow(Item.objects, { column: 'updated' })
  const updatedTime = new Date()
  updatedTime.setYear(updatedTime.getFullYear() - 1)

  return Item.wrappedObjects.create({ name: 'test' }).then(item => {
    assert.ok(item.id, 'id column should be set')
    assert.equals(item.name, 'test', 'name column should be set')
    assert.notEqual(item.updated, null, 'updated column should be set')
    return Item.wrappedObjects.filter({ id: item.id }).update({ name: 'updated', updated: updatedTime }).then(updated => {
      assert.equals(updated, 1, 'should have updated one row')
      return Item.wrappedObjects.get({ id: item.id }).then(newItem => {
        assert.equals(item.id, newItem.id, 'updated the right item')
        assert.equals(newItem.name, 'updated', 'name column should be updated')
        assert.same(newItem.updated, updatedTime, 'updated column should match the given value')
      })
    })
  })
})

test('autonow: when createOnly is set only sets the timestamp on create', assert => {
  Item.wrappedObjects = autoNow(Item.objects, { column: 'created', createOnly: true })

  return Item.wrappedObjects.create({ name: 'test' }).then(item => {
    assert.ok(item.id, 'id column should be set')
    assert.equals(item.name, 'test', 'name column should be set')
    assert.notEqual(item.created, null, 'created column should be set')
    return Item.wrappedObjects.filter({ id: item.id }).update({ name: 'updated' }).then(updated => {
      assert.equals(updated, 1, 'should have updated one row')
      return Item.wrappedObjects.get({ id: item.id }).then(newItem => {
        assert.equals(item.id, newItem.id, 'updated the right item')
        assert.equals(newItem.name, 'updated', 'name column should be updated')
        assert.same(newItem.created, item.created, 'created column should remain the same')
      })
    })
  })
})

test('autonow: can add two columns with different settings', assert => {
  Item.wrappedObjects = autoNow(autoNow(Item.objects, { column: 'created', createOnly: true }), { column: 'updated' })

  return Item.wrappedObjects.create({ name: 'test' }).then(item => {
    assert.ok(item.id, 'id column should be set')
    assert.equals(item.name, 'test', 'name column should be set')
    assert.notEqual(item.created, null, 'created column should be set')
    assert.notEqual(item.updated, null, 'updated column should be set')
    return Item.wrappedObjects.filter({ id: item.id }).update({ name: 'updated' }).then(updated => {
      assert.equals(updated, 1, 'should have updated one row')
      return Item.wrappedObjects.get({ id: item.id }).then(newItem => {
        assert.equals(item.id, newItem.id, 'updated the right item')
        assert.equals(newItem.name, 'updated', 'name column should be updated')
        assert.same(newItem.created, item.created, 'created column should remain the same')
        assert.ok(newItem.updated > item.updated, 'updated column should be updated')
      })
    })
  })
})
