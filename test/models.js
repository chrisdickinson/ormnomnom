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

class Node {
  constructor (obj) {
    this.id = obj.id
    this.name = obj.name
    this.val = obj.val
  }
}

Node.objects = orm(Node, {
  id: orm.joi.number(),
  name: orm.joi.string(),
  val: orm.joi.number().required()
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
  id: orm.joi.number().required(),
  node: orm.fk(Node),
  val: orm.joi.number().required()
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
  id: orm.joi.number(),
  ref: orm.fk(Ref, {nullable: true}),
  second_ref: orm.fk(Ref, {nullable: true})
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
  id: orm.joi.number(),
  name: orm.joi.string(),
  created: orm.joi.date(),
  updated: orm.joi.date(),
  deleted: orm.joi.date()
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
  id: orm.joi.number(),
  comment: orm.joi.string(),
  item: orm.fk(Item, {nullable: true}),
  deleted_at: orm.joi.date()
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
  id: orm.joi.number(),
  price: orm.joi.number(),
  item_detail: orm.fk(ItemDetail, {nullable: true})
})

module.exports = {
  Invoice,
  LineItem,
  Node,
  Ref,
  Farout,
  Item,
  ItemDetail,
  ItemPrice
}
