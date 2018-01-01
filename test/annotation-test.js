'use strict'

const { beforeEach, afterEach, teardown, test } = require('tap')

const db = require('./db')
const { Invoice, LineItem } = require('./models')

db.setup(beforeEach, afterEach, teardown)

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
