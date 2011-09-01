{EventEmitter} = require './events'
{QCons} = require './qcons'
{Connection} = require './connection'
{AND, OR, NOT, SELECT, INSERT, UPDATE, DELETE} = require './constants'

valid_comparisons = [
    'exact'
    'iexact'
    'lt'
    'gt'
    'lte'
    'gte'
    'in'
    'isnull'
    'contains'
    'startswith'
    'endswith'
    'icontains'
    'istartswith'
    'iendswith'
    'range'
    'year'
    'month'
    'day'
    'week_day'
    'regex'
]

clone = (obj, props)->
    out = Object.create obj
    for key, val of props
        out[key] = val
    out

Query = (conn, children)->
    @conn = conn
    @children = children
    @

Query::op_and = (what)->
    new Query AND, [@, what]

Query::op_or = (what)->
    new Query OR, [@, what]

Query::op_not = ->
    new Query NOT, [@]

Query::compile = (qcons)->
    bits = @children.map (child)->
        child.compile qcons
    if @conn is NOT then @conn+"(#{bits.join AND})" else "(#{bits.join @conn.toString()})"

QueryLeaf = (field, value, cmp)->
    [@field, @value, @cmp] = [field, value, cmp]
    @

QueryLeaf::compile = (qcons)->
    qcons.compile_where_clause @field, qcons.queryset.connection.comparison(@cmp), @value

QuerySet = EventEmitter.subclass (model)->
    @using_connection = 'default'
    @model = model
    @timeout = setTimeout(
        => @execute()
        0
    )
    @query = null
    @payload = null
    @_limit = null
    @_order_by = @model._meta.order_by or null
    @_create = @_delete = no
    @_errored = null
    @_fields = null
    @_ready_count = 0
    @

QuerySet::ready =-> @_ready_count is 0

QuerySet::execute =->
    qcons = new QCons @
    if not @connection
        @connection = Connection.get_connection @using_connection
    ready = =>
        qcons.set_mode SELECT
        if @payload or @_create
            if @_create
                qcons.set_mode INSERT
            else
                qcons.set_mode UPDATE
            qcons.add_payload @payload
        else if @_delete
            qcons.set_mode DELETE

        fields = @_fields or @model._schema.real_fields()
        qcons.set_fields fields
        qcons.set_limit @_limit

        if @query
            qcons.set_where @query.compile qcons

        disable_order_by = (field for field in fields when field.disable_order_by()).length > 0
        if @_order_by and not disable_order_by
            @_order_by.forEach (field_name)->
                qcons.add_ordering field_name

        sql = qcons.compile()

        ee = @connection.execute sql, qcons.prepared_values(), qcons.mode, @model

        ee.on 'data', (data)=>@emit 'data', qcons.coerce data
        ee.on 'error', (error)=>@emit 'error', error

    interval = setInterval(=>
        if @ready()
            clearInterval interval
            if @_errored
                @emit 'error', @_errored
            else
                try
                    ready()
                catch err
                    @emit 'error', err
    1)
    @

QuerySet::using = (name)->
    @using_connection = name
    @

QuerySet::count = QuerySet::length = (ready)->
    {Count}= require './fields'
    @_fields = [new Count 'count']

    ee = new EventEmitter
    @ (err, data) ->
        if err
            ee.emit 'error', err
        else
            ee.emit 'data', data[0].count
    ee

QuerySet::_select_query = (kwargs)->
    if @model._schema.validate kwargs
        children = []
        for key, val of kwargs
            [fields..., cmp] = key.split '__'
            if not (cmp in valid_comparisons)
                fields.push cmp
                cmp = 'exact'

            leaf = new QueryLeaf fields, val, cmp

            if typeof val is 'function'
                do (leaf)=>
                    ++@_ready_count
                    val (err, data)=>
                        --@_ready_count
                        if err
                            @_errored = err
                        else
                            leaf.value = data

            children.push leaf
        return query = new Query(AND, children)

QuerySet::_update_payload = (kwargs)->
    if @model._schema.validate kwargs, yes
        @payload = if @payload then clone(@payload, kwargs) else kwargs
        for key, val of kwargs
            if val and val.on
                ++@_ready_count
                do(key, val)=>
                    val.on 'data', (data)=>
                        --@_ready_count
                        @payload[key] = data

                    val.on 'error', (err)=>
                        --@_ready_count
                        @_errored = err

QuerySet::exclude = (kwargs)->
    q = @_select_query kwargs
    if @query
        @query = @query.op_and @query.op_not()
    else
        @query = q.op_not()
    @

QuerySet::order_by = (ordering...)->
    ordering.forEach (val)=>
        if '-' is val.charAt 0
            val = val.slice 1
        @model._schema.validate_field val

    @_order_by = ordering
    @

QuerySet::slice = QuerySet::limit = (from, to)->
    [from, to] = if to isnt undefined then [from, to] else [0, from]
    @_limit =
        from:from
        to:to
    @

QuerySet::filter = (kwargs)->
    q = @_select_query kwargs
    if @query
        @query = @query.op_and q
    else
        @query = q
    @

QuerySet::each = (fn)->
    @on 'data', (items)->
        fn item for item in items

QuerySet::update = (kwargs)->
    @_update_payload kwargs
    @

QuerySet::delete = ()->
    @_delete = yes
    @

QuerySet::values_list = (values...)->
    for val in values
        if not @model._schema.get_field_by_name val
            @_errored = new SchemaError "#{val} is not a valid field on #{@model._meta.name}"
            return @

    ee = new EventEmitter
    @ (err, data) ->
        if err
            ee.emit 'error', err
        else
            ee.emit 'data', ((instance[key] for key in values) for instance in data)
    ee

QuerySet::flat_values_list = (values...)->
    ee = new EventEmitter
    values = @values_list(values...)
    values (err, data)->
        if err
            ee.emit 'error', err
        else
            out = []
            for instance in data
                for value in instance
                    out.push value
            ee.emit 'data', out
    ee

QuerySet::create = (kwargs)->
    @_update_payload kwargs
    @_create = yes
    @

exports.QuerySet = QuerySet
