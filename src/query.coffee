{EventEmitter} = require './events'
{QCons, Comparison} = require './qcons'
{Connection} = require './connection'
{AND, OR, NOT, SELECT, INSERT, UPDATE, DELETE} = require './constants'

clone = (obj, props)->
    out = Object.create obj
    for key, val of props
        out[key] = val
    out

o = (str)->
    new Comparison str

comparisons = {
    exact:o '$1 = $2'
    lt:o '$1 < $2'
    gt:o '$1 > $2'
    lte:o '$1 <= $2'
    gte:o '$1 >= $2'
    in:o '$1 in (@)'
    isnull:o '$1 IS ? NULL'

}

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
    qcons.compile_where_clause @field, @cmp, @value

QuerySet = EventEmitter.subclass (model)->
    @using_connection = 'default'
    @model = model
    @timeout = setTimeout(
        => @execute()
        0
    )
    @query = null
    @payload = null
    @limit = null
    @order_by = @model._meta.order_by or null
    @_create = @_delete = no
    @_errored = null

    @_ready_count = 0
    @

QuerySet::ready =-> @_ready_count is 0

QuerySet::execute =->
    qcons = new QCons @
    ready = =>
        qcons.set_mode SELECT
        if @payload
            if @_create
                qcons.set_mode INSERT
            else
                qcons.set_mode UPDATE
            qcons.add_payload @payload
        else if @_delete
            qcons.set_mode DELETE

        if @query
            qcons.set_where @query.compile qcons

        if @order_by
            @order_by.forEach (field_name)->
                qcons.add_ordering field_name

        sql = qcons.compile()
        if not @connection
            @connection = Connection.get_connection @using_connection

        ee = @connection.execute sql, qcons.prepared_values(), qcons.mode, @model

        ee.on 'data', (data)=>@emit 'data', qcons.coerce data
        ee.on 'error', (error)=>@emit 'error', error

    interval = setInterval(=>
        if @ready()
            clearInterval interval
            if @_errored
                @emit 'error', @_errored
            else
                ready()
    1)
    @

QuerySet::using = (name)->
    @using_connection = name
    @

QuerySet::_select_query = (kwargs)->
    if @model._schema.validate kwargs
        children = []
        for key, val of kwargs
            [fields..., cmp] = key.split '__'
            if comparisons[cmp]
                cmp = comparisons[cmp]
            else
                fields.push cmp
                cmp = comparisons['exact']

            leaf = new QueryLeaf fields, val, cmp
            if val.on
                ++@_ready_count
                val.on 'data', (data)=>
                    --@_ready_count
                    leaf.value = data

                val.on 'error', (err)=>
                    --@_ready_count
                    @_errored = err

            children.push leaf
        return query = new Query(AND, children)

QuerySet::_update_payload = (kwargs)->
    if @model._schema.validate kwargs, yes
        @payload = if @payload then clone(@payload, kwargs) else kwargs
        for key, val of kwargs
            if val.on
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
        @query = @query.op_not()
    @

QuerySet::order_by = (ordering...)->
    ordering.forEach (val)->
        if '-' is val.charAt 0
            val = val.slice 1
        @model._schema.validate val

    @order_by = ordering

QuerySet::limit = (from, to)->
    [from, to] = if to isnt undefined then [from, to] else [0, from]
    @limit =
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

QuerySet::create = (kwargs)->
    @_update_payload kwargs
    @_create = yes
    @

exports.QuerySet = QuerySet
