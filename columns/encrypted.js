'use strict'

const Iron = require('@hapi/iron')

const orm = require('..')

module.exports = encrypted

function encrypted (schema, { password, iron = Iron.defaults }) {
  iron = { ...Iron.defaults, ...(iron || Iron.defaults) }

  return orm.col(schema, {
    encode (appData) {
      return Iron.seal(appData, password, iron)
    },
    decode (dbData) {
      return Iron.unseal(dbData, password, iron)
    },
    encodeQuery (appData) {
      return Iron.seal(appData, password, iron)
    }
  })
}
