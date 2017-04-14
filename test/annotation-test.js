'use strict'

const test = require('tap').test

const orm = require('..')
const db = require('./db.js')

class Invoice {
  constructor (obj) {
    this.id = obj.id
    this.name = obj.name
    this.date = obj.date
  }
}

Invoice.objects = orm(Invoice, {
  id: orm.joi.number().required(),
  name: orm.joi.string(),
  date: orm.joi.date()
})

class LineItem {
  constructor (obj) {
    this.id = obj.id
    this.subtotal = obj.subtotal
    this.discount = obj.discount
    this.invoice_id = obj.invoice_id
    this.invoice = obj.invoice
  }
}

LineItem.objects = orm(LineItem, {
  id: orm.joi.number().required(),
  invoice: orm.fk(Invoice),
  subtotal: orm.joi.number(),
  discount: orm.joi.number()
})

test('setup database', function (assert) {
  db.setup().then(assert.end, assert.end)
})

test('create schema', function (assert) {
  const invoices = db.schema`
    CREATE TABLE invoices (
      id serial primary key,
      name varchar(255),
      date timestamp
    );
  `
  const lineitems = invoices.then(_ => db.schema`
    CREATE TABLE line_items (
      id serial primary key,
      subtotal real,
      discount real,
      invoice_id integer default null references "invoices" ("id") on delete cascade
    );
  `)

  return lineitems
})

test('create some invoices and line items', assert => {
  return Invoice.objects.create([{
    name: 'a thing',
    date: Date.UTC(2012, 0, 1)
  }, {
    name: 'another thing',
    date: Date.UTC(2013, 9, 19)
  }, {
    name: 'great',
    date: Date.UTC(2016, 10, 20)
  }]).then().map(invoice => {
    return LineItem.objects.create(Array.from(Array(10)).map((_, idx) => {
      return {
        invoice,
        subtotal: 10 * (idx + 1),
        discount: idx
      }
    }))
  })
})

test('non-grouped annotation', assert => {
  return LineItem.objects.all().annotate({
    total (ref) {
      return `${ref('subtotal')} - ${ref('discount')}`
    }
  }).order('subtotal').then(results => {
    assert.equal(results.map(tuple => {
      const lineItem = tuple[0]
      const annotation = tuple[1]
      return `${lineItem.subtotal} - ${lineItem.discount} = ${annotation.total}`
    }).join('\n'), `10 - 0 = 10
10 - 0 = 10
10 - 0 = 10
20 - 1 = 19
20 - 1 = 19
20 - 1 = 19
30 - 2 = 28
30 - 2 = 28
30 - 2 = 28
40 - 3 = 37
40 - 3 = 37
40 - 3 = 37
50 - 4 = 46
50 - 4 = 46
50 - 4 = 46
60 - 5 = 55
60 - 5 = 55
60 - 5 = 55
70 - 6 = 64
70 - 6 = 64
70 - 6 = 64
80 - 7 = 73
80 - 7 = 73
80 - 7 = 73
90 - 8 = 82
90 - 8 = 82
90 - 8 = 82
100 - 9 = 91
100 - 9 = 91
100 - 9 = 91`)
  })
})

test('aggregate count', assert => {
  return Invoice.objects.all().aggregate(
    ref => `array_agg(distinct to_char(${ref('date')}, 'YYYY-MM-DD'))`
  ).then(result => {
    assert.deepEqual(result.sort(), [
      '2012-01-01',
      '2013-10-19',
      '2016-11-20'
    ])
  })
})

test('annotate, group, refstar', assert => {
  return Invoice.objects.all().group().annotate({
    lineItems: ref => `json_agg(${ref('line_items.*')})`
  }).order('id').then(results => {
    assert.deepEqual(results.map(xs => {
      return [xs[0].id, xs[1].lineItems.map(ys => ys.invoice_id)]
    }), [
      [1, Array.from(Array(10)).map(xs => 1)],
      [2, Array.from(Array(10)).map(xs => 2)],
      [3, Array.from(Array(10)).map(xs => 3)]
    ])
  })
})

test('drop database', function (assert) {
  db.teardown().then(assert.end, assert.end)
})
