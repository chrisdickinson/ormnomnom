'use strict'

const Iron = require('@hapi/iron')

const orm = require('..')

module.exports = encrypted

function encrypted (schema, { password, iron = Iron.defaults }) {
  iron = { ...Iron.defaults, ...(iron || Iron.defaults) }
  const getPassword = (
    typeof password === 'function'
    ? password
    : () => password
  )

  return orm.col(schema, {
    encode (appData) {
      return Iron.seal(appData, getPassword(), iron)
    },
    decode (dbData) {
      return Iron.unseal(dbData, getPassword(), iron)
    },
    encodeQuery (appData) {
      return Iron.seal(appData, getPassword(), iron)
    }
  })
}
