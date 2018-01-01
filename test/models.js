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
  }
}

Farout.objects = orm(Farout, {
  id: orm.joi.number(),
  ref: orm.fk(Ref, { nullable: true })
})

module.exports = {
  Invoice,
  LineItem,
  Node,
  Ref,
  Farout
}
