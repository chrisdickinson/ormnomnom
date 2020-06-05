'use strict'

const orm = require('..')

class Invoice {
  constructor (obj) {
    this.id = obj.id
    this.name = obj.name
    this.date = obj.date
  }
}

Invoice.objects = orm(Invoice, {
  id: { type: 'integer' },
  name: { type: 'string' },
  date: { format: 'date-time' }
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
  id: { type: 'integer' },
  invoice: orm.fk(Invoice),
  subtotal: { type: 'number' },
  discount: { type: 'number' }
})

class Node {
  constructor (obj) {
    this.id = obj.id
    this.name = obj.name
    this.val = obj.val
  }
}

Node.objects = orm(Node, {
  id: { type: 'integer' },
  name: { anyOf: [{ type: 'null' }, { type: 'string' }], default: null },
  val: { type: 'number' }
})

class Ref {
  constructor (obj) {
    this.id = obj.id
    this.node = obj.node
    this.node_id = obj.node_id
    this.val = obj.val
  }
}

Ref.objects = orm(Ref, {
  id: { type: 'integer' },
  node: orm.fk(Node),
  val: { type: 'number' }
})

class Farout {
  constructor (obj) {
    this.id = obj.id
    this.ref = obj.ref
    this.ref_id = obj.ref_id
    this.second_ref = obj.second_ref
    this.second_ref_id = obj.second_ref_id
  }
}

Farout.objects = orm(Farout, {
  id: { type: 'integer' },
  ref: orm.fk(Ref, { nullable: true }),
  second_ref: orm.fk(Ref, { nullable: true })
})

class Item {
  constructor (obj) {
    this.id = obj.id
    this.name = obj.name
    this.created = obj.created
    this.updated = obj.updated
    this.deleted = obj.deleted
  }
}

Item.objects = orm(Item, {
  id: { type: 'integer' },
  name: { anyOf: [{}, { type: 'string' }], default: null },
  created: { anyOf: [{}, { type: 'string', format: 'date-time' }], default: null },
  updated: { anyOf: [{}, { type: 'string', format: 'date-time' }], default: null },
  deleted: { anyOf: [{}, { type: 'string', format: 'date-time' }], default: null }
})

class ItemDetail {
  constructor (obj) {
    this.id = obj.id
    this.comment = obj.comment
    this.item_id = obj.item_id
    this.item = obj.item
    this.deleted_at = obj.deleted_at
  }
}

ItemDetail.objects = orm(ItemDetail, {
  id: { type: 'integer' },
  comment: { type: 'string' },
  item: orm.fk(Item, { nullable: true }),
  deleted_at: { anyOf: [{}, { type: 'string', format: 'date-time' }], default: null }
})

class ItemPrice {
  constructor (obj) {
    this.id = obj.id
    this.price = obj.price
    this.item_detail = obj.item_detail
    this.item_detail_id = obj.item_detail_id
  }
}

ItemPrice.objects = orm(ItemPrice, {
  id: { type: 'integer' },
  price: { type: 'number' },
  item_detail: orm.fk(ItemDetail, { nullable: true })
})

class ColumnTest {
  constructor (obj) {
    this.id = obj.id
    this.b64_json_column = obj.b64_json_column
  }
}

ColumnTest.objects = orm(ColumnTest, {
  id: { type: 'integer' },
  b64_json_column: orm.col({
    type: 'object',
    required: ['foo'],
    properties: {
      foo: {
        type: 'integer'
      }
    }
  }, {
    encode (appData) {
      return Buffer.from(JSON.stringify(appData)).toString('base64').replace(/=+$/, '')
    },
    decode (dbData) {
      return JSON.parse(String(Buffer.from(dbData, 'base64')))
    },
    encodeQuery (appData) {
      return Buffer.from(JSON.stringify(appData)).toString('base64').replace(/=+$/, '')
    }
  })
})

class RefColumnTest {
  constructor (obj) {
    this.id = obj.id
    this.column_id = obj.column_id
    this.column = obj.column
  }
}

RefColumnTest.objects = orm(RefColumnTest, {
  id: { type: 'integer' },
  column: orm.fk(ColumnTest)
})

module.exports = {
  Invoice,
  LineItem,
  Node,
  Ref,
  Farout,
  Item,
  ItemDetail,
  ItemPrice,
  ColumnTest,
  RefColumnTest
}
