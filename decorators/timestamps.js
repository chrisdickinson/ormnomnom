'use strict'

const autoNow = require('./autonow')
const safeDelete = require('./safeDelete')

const defaults = {
  created: 'created',
  updated: 'updated',
  deleted: 'deleted'
}

module.exports = function (dao, opts = {}) {
  const options = Object.assign({}, defaults, opts)

  return autoNow(autoNow(safeDelete(dao, { column: options.deleted }), { column: options.updated }), { column: options.created, createOnly: true })
}
