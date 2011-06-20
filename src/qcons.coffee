{AND, OR, NOT, SELECT, INSERT, UPDATE, DELETE} = require './constants'

QCons = (queryset)->
    @queryset = queryset

    @mode = null

    @keys = []

    @tables = {}
    @joins = []
    @join_sql = []
    @values = []
    @ordering = []
    @where_clause = null
    @field_aliases = {}
    @register_table @queryset.model
    @

QCons::set_mode = (mode)->
    @mode = mode

QCons::compile =->
    if @mode is SELECT
        """
            SELECT #{[@get_db_repr(field) for field in @queryset.model._schema.fields].join(', ')} 
            FROM #{@queryset.connection.quote @queryset.model._meta.db_table} #{@get_table @queryset.model}
            #{@join_sql.join(' ')}
            #{if @where_clause then 'WHERE '+@where_clause else ''}
            #{if @ordering.length then 'ORDER BY '+@ordering.join(', ') else ''}
        """.replace /\n/g, ' '
    else if @mode is INSERT
        """
            INSERT INTO #{@queryset.model._meta.db_table} 
            (#{(@queryset.connection.quote field.db_field() for field in @queryset.model._schema.fields when not field.primary_key).join ', '})
            VALUES
            (#{('$'+(i+1) for i in [0...@values.length]).join ', '})
        """.replace /\n/g, ' '
    else if @mode is UPDATE
        """
            UPDATE #{@queryset.model._meta.db_table}
            SET
            #{(keys[i]+' = $'+(i+1) for i in [0...keys.length]).join ' '}
            #{if @where_clause then 'WHERE '+@where_clause else ''}
            #{if @join_sql.length then ' AND (' + (@join_sql.join ' AND ')+')'}
            #{if @ordering.length then 'ORDER BY '+@ordering.join ', ' else ''}
        """.replace /\n/g, ' '
    else if @mode is DELETE
        """
            DELETE FROM #{@queryset.model._meta.db_table}
            #{if @where_clause then 'WHERE '+@where_clause else ''}
            #{if @join_sql.length then ' AND (' + (@join_sql.join ' AND ')+')' else ''}
        """.replace /\n/g, ' '

QCons::prepared_values = ->
    (@keys[i].prepdb @values[i] for i in [0...@keys.length]).concat(@values.slice(@keys.length))

QCons::compile_where_clause = (fields, cmp, value)->
    field = @get_field_and_register fields
    cmp.compile field, value, (value)=>
        @values.push value
        @values.length

QCons::set_where = (where_clause)->
    @where_clause = where_clause

QCons::add_payload = (payload)->
    Object.keys(payload).forEach (field_name)=>
        field = @get_field_and_register field_name.split '__'
        field = field.field
        @keys.push field
        @values.push payload[field_name]


    if @mode is INSERT
        for field in @queryset.model._schema.fields
            do (field)=>
                if field.db_field() and field not in @keys
                    if field.primary_key
                        field
                    else if field.default
                        if field.default instanceof Function
                            field.default (val)=>
                                @values.push val
                                @keys.push field
                        else
                            @values.push field.default
                            @keys.push field
                    else
                        throw new Error "#{field.name} is required"

QCons::add_ordering = (field_name)->
    dir = 'ASC'
    if field_name.charAt(0) is '-'
        dir = 'DESC'
        field_name = field_name.slice 1

    field_name = field_name.split '__'
    field = @get_field_and_register field_name
    @ordering.push "#{field.db_field} #{dir}"

QCons::register_table = (model)->
    if not @tables[model._meta.db_table]
        @tables[model._meta.db_table] = "T#{Object.keys(@tables).length}"
    @tables[model._meta.db_table]

QCons::register_join = (by_field)->
    if @joins.indexOf(by_field) is -1
        joins = by_field.join_struct()
        @joins.push by_field
        joins = joins.map (join)=>
            lhs_alias = @register_table join.lhs
            rhs_alias = @register_table join.rhs

            tbl = (model) => @queryset.connection.quote model._meta.db_table

            if @mode in [INSERT, DELETE, UPDATE]
                "#{tbl join.lhs}.#{@queryset.connection.quote join.lhs_field.db_field()} = #{tbl join.rhs}.#{@queryset.connection.quote join.rhs_field.db_field()}"
            else if @mode is SELECT
                "LEFT JOIN #{@queryset.connection.quote join.rhs._meta.db_table} #{@queryset.connection.quote rhs_alias} ON (#{@get_db_repr join.lhs_field} = #{@get_db_repr join.rhs_field})"
        @join_sql = @join_sql.concat joins

QCons::get_table = (model)->
    return @queryset.connection.quote @tables[model._meta.db_table]

QCons::get_db_repr = (field)->
    "#{@get_table field.model}.#{@queryset.connection.quote field.db_field()}"

QCons::get_field_and_register = (fields)->
    model = @queryset.model
    last_field = null
    fields.forEach (field)=>
        @register_table model
        if last_field
            new_model = last_field.related
            @register_join last_field
            model = new_model
            last_field = model._schema.get_field_by_name field
        else
            last_field = model._schema.get_field_by_name field

    return {
        db_field:"#{@get_table model}.#{@queryset.connection.quote last_field.db_field()}",
        field:last_field
    }

QCons::coerce = (rows)->
    {BaseModel} = require './models'

    if Array.isArray rows
        model = @queryset.model
        if @mode is INSERT
            # this is dumb, but if we have the old values, then we really should
            # use them.
            process = (row)=>
                instance = new model row
                for idx in [0...@keys.length]
                    [field, value] = [@keys[idx], @values[idx]]
                    if value instanceof BaseModel
                        instance._fk_cache[field.name] = instance._fk_cache[field.name] or {}
                        instance._fk_cache[field.name].instance = value
                instance
        else
            process = (row)->
                new model row

        rows = rows.map process

        if @mode is INSERT
            return rows[0]
    rows

Comparison = (string)->
    @string = string

Comparison::compile = (qcons_field, value, register_value)->
    if @string.indexOf('@') isnt -1
        values = value.map (val)->
            register_value qcons_field.field.prepdb val
        str = @string.replace '@', '$'+values.join(',$')
    else if @string.indexOf('?') isnt -1
        value = !!value
        str = @string.replace '?', ['NOT', ''][~~value]
    else
        value = register_value qcons_field.field.prepdb value
        str = @string.replace '$2', '$'+value

    # in case we need to decorate the type of the comparison, like __year or __month or whatever.
    db_field = if @decorate_field then @decorate_field qcons_field.db_field else qcons_field.db_field

    str.replace '$1', db_field

exports.Comparison = Comparison
exports.QCons = QCons
