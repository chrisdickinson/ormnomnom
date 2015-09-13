'use strict'

module.exports = defineModel

// fields:
//   Integer
//   PositiveInteger
//   Float
//   Decimal
//   ForeignKey
//   ManyToMany
//   CharField
//   TextField
//   DateField
//   EnumField
//   

var Promise = require('bluebird')

function Model (metadata) {
  this._metadata = metadata
}

var cons = Model
var proto = cons.prototype

proto.save = function () {

}

proto.delete = function () {

}

cons.filter = function () {

}

cons.delete = function () {

}

cons.update = function () {

}

cons.all = function () {

}
