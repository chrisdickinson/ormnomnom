module.exports = exports =
  models: require './models'
  connection: require './connection'
  backends: require './backends'
  constants: require './constants'
  exceptions: require './exceptions'
  sql:(sql, values, ready)->
    require('./connection').sql sql, values, ready
