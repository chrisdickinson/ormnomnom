{EventEmitter} = require './events'

Connection = ()->
    @

Connection.default = 'default'
Connection.registry = {}

Connection.register = (name, connection_data)->
    @registry[name] = connection_data

Connection.set_default = (name)->
    Connection.default = name 

Connection.get_connection =(name)->
    name = name or Connection.default
    if name and @registry[name]
        if Connection.registry[name].connection
            return Connection.registry[name].connection
        else
            [backend, target] = Connection.registry[name].backend.split '#'
            backend = require backend
            if not target then target = 'Connection'

            Connection.registry[name].connection = new backend[target](Connection.registry[name])
            return Connection.registry[name].connection
        return Connection.registry[name].connection
    else throw new Error "No connection registered under #{name}"

Connection::client =(ready)->
    if not @_client
        @get_client (client)=>
            @_client = client
            ready client
    else
        ready @_client

Connection::quote = (what)->
    "`#{what}`"

Connection::execute = (sql, values, mode, model)->
    ee = new EventEmitter
    @client =>
        @_client.execute sql, values, mode, model, (err, data)->
            if err
                err.__sql = sql
                err.__values = values

            if err then ee.emit('error', err) else ee.emit('data', data)
    ee

Connection::sql = (sql, values, ready)->
    ee = new EventEmitter
    values = values or []

    @client =>
        @_client.execute sql, values, {}, {}, (err, data)->
            if err
                err.__sql = sql
                err.__values = values
                ee.emit 'error', err
            else
                ee.emit 'data', data
            if ready
                ready err, data
    if ready
        return undefined
    ee

Connection::drop_table = (model)->
    "DROP TABLE #{@quote model._meta.db_table}"

Connection::close = (ready)->
    throw new Error 'Not implemented in base connection'

Connection::constraint = (constraint)->
    throw new Error 'Not implemented in base connection'

Connection::negotiate_type = (field_type)->
    throw new Error 'Not implemented in base connection'

Connection::comparison = (comparison)->
    throw new Error 'Not implemented in base connection'

Connection::db_field_type = ->
    {DBField} = require './backends/fields'
    DBField

module.exports = exports = (which)->
    Connection.get_connection which

exports.Connection = Connection
exports.sql = (sql, values, ready)->
    connection = Connection.get_connection 'default'
    connection.sql sql, values, ready
