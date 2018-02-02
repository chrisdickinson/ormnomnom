'use strict'

const autoNow = require('./autonow')
const softDelete = require('./softdelete')

const defaults = {
  created: 'created',
  updated: 'updated',
  deleted: 'deleted'
}

module.exports = function (dao, opts = {}) {
  const options = Object.assign({}, defaults, opts)

  return autoNow(autoNow(softDelete(dao, { column: options.deleted }), { column: options.updated }), { column: options.created, createOnly: true })
}
