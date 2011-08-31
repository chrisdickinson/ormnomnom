{Connection} = require '../../connection'
{AND, OR, NOT, SELECT, INSERT, UPDATE, DELETE} = require '../../constants'
{BASE_FIELDS} = require './fields'
{comparisons} = require './comparisons'

PGWrapper = (pg, config)->
    @config = config
    @pg = pg
    @

PGWrapper::execute = (sql, values, mode, model, ready)->
    if mode is INSERT
        sql += ' RETURNING *'

    @pg.connect @config, (err, client)->
      client.query sql, values, (err, data)->
        if mode in [UPDATE, DELETE]
            ready err, data
        else
            ready err, if not err then data.rows else null

PGWrapper::close = (ready)->
    #@client.end()
    if ready instanceof Function then ready()

PGConnection = (metadata)->
    @metadata = metadata
    @

PGConnection:: = new Connection

PGConnection::constraint = (constraint)->
    constraint

PGConnection::quote = (what)->
    "\"#{what.replace /\"/g, '\"\"'}\""

PGConnection::comparison = (name)->
    comparisons[name]

PGConnection::negotiate_type = (field, force_type)->
    BASE_FIELDS[force_type or field.db_type](field, @)

PGConnection::close = (ready)->
    @client (client)->
        client.close ready

PGConnection::drop_table = (model)->
    "#{Connection::drop_table.call @, model} CASCADE"

PGConnection::get_client =(ready)->
    config =
        user: @metadata.user
        password: @metadata.password
        database: @metadata.name
        host: @metadata.host or 'localhost'
        port: @metadata.port or 5432

    ready new PGWrapper @metadata.library, config

exports.Connection = PGConnection
