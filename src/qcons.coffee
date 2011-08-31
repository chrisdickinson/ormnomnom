{AND, OR, NOT, SELECT, INSERT, UPDATE, DELETE} = require './constants'
{SchemaError, ValidationError} = require './exceptions'

QCons = (queryset)->
    @queryset = queryset

    @mode = null

    @keys = []

    @tables = {}
    @joins = []
    @join_sql = []
    @values = []
    @ordering = []
    @limit = null
    @where_clause = null
    @field_aliases = {}
    @select_fields = null
    @register_table @queryset.model
    @

QCons::set_fields = (fields)->
    @select_fields = fields

QCons::set_mode = (mode)->
    @mode = mode

QCons::set_limit = (limit)->
    @limit = limit

QCons::compile =->
    if @mode is SELECT
        """
            SELECT #{(@get_db_repr(field) for field in @select_fields).join(', ')} 
            FROM #{@queryset.connection.quote @queryset.model._meta.db_table} #{@get_table @queryset.model}
            #{@join_sql.join(' ')}
            #{if @where_clause then 'WHERE '+@where_clause else ''}
            #{if @ordering.length then 'ORDER BY '+@ordering.join(', ') else ''}
            #{if @limit then 'LIMIT '+@limit.to+' OFFSET '+@limit.from else ''} 
        """.replace /\n/g, ' '
    else if @mode is INSERT

        its_a_valid = (field)=>
            if field.primary_key
                return @payload[field.name] or @payload['pk']
            return field.db_field and @payload[field.name] isnt undefined

        fields = (@queryset.connection.quote field.db_field() for field in @keys when its_a_valid field)
        """
            INSERT INTO #{@queryset.model._meta.db_table}
            #{if fields.length then '('+(fields.join ', ')+') VALUES' else ''}
            #{if fields.length then '('+(('$'+(i+1) for i in [0...@values.length]).join ', ')+')' else ''}
            #{if not fields.length then 'DEFAULT VALUES' else ''}
        """.replace /\n/g, ' '
    else if @mode is UPDATE
        """
            UPDATE #{@queryset.model._meta.db_table}
            SET
            #{(@keys[i].db_field()+' = $'+(i+1) for i in [0...@keys.length]).join ', '}
            #{if @where_clause then 'WHERE '+@where_clause else ''}
            #{if @join_sql.length then ' AND (' + (@join_sql.join ' AND ')+')' else ''}
            #{if @ordering.length then 'ORDER BY '+@ordering.join ', ' else ''}
            #{if @limit then 'LIMIT '+@limit.to+' OFFSET '+@limit.from else ''} 
        """.replace /\n/g, ' '
    else if @mode is DELETE
        """
            DELETE FROM #{@queryset.model._meta.db_table}
            #{if @where_clause then 'WHERE '+@where_clause else ''}
            #{if @join_sql.length then ' AND (' + (@join_sql.join ' AND ')+')' else ''}
            #{if @limit then 'LIMIT '+@limit.to+' OFFSET '+@limit.from else ''} 
        """.replace /\n/g, ' '

QCons::prepared_values = ->
    out = []
    for i in [0...@keys.length]
        field = @keys[i]
        db_field = @queryset.connection.negotiate_type field
        out.push db_field.map.js_to_db field.get_prepdb_value @values[i]
    out.concat(@values.slice(@keys.length))

QCons::compile_where_clause = (fields, cmp, value)->
    if @mode is INSERT
        return

    field = @get_field_and_register fields
    cmp.compile @queryset.connection, field, value, (value)=>
        @values.push value
        @values.length

QCons::set_where = (where_clause)->
    @where_clause = where_clause

QCons::add_payload = (payload)->
    Object.keys(payload).forEach (field_name)=>
        field = @get_field_and_register field_name.split '__'
        field = field.field

        if not field.validate_value payload[field_name]
            throw new ValidationError "#{payload[field_name]} is not a valid value for #{field.model._meta.name}.#{field.name}"

        @keys.push field
        @values.push payload[field_name]

    @payload = payload

    if @mode is INSERT
        for field in @queryset.model._schema.fields
            do (field)=>
                if field.db_field() and field not in @keys
                    if field.primary_key
                        field
                    else if field.default isnt undefined
                        if field.default instanceof Function
                            ret = field.default (val)=>
                                @values.push val
                                @keys.push field
                                @payload[field.name] = val
                            if ret?
                                @values.push ret
                                @keys.push field
                                @payload[field.name] = ret 
                        else
                            @values.push field.default
                            @keys.push field
                            @payload[field.name] = field.default
                    else if not field.nullable
                        throw new ValidationError "#{field.name} is required"

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

QCons::register_join = (by_field, seen_models)->
    if @joins.indexOf(by_field) is -1
        joins = by_field.join_struct()

        joins = joins.filter (join)->
            not (join.rhs in seen_models)

        if joins.length is 0
            return

        @joins.push by_field

        joins = joins.map (join)=>
            lhs_alias = @register_table join.lhs
            rhs_alias = @register_table join.rhs

            tbl = (model) => @queryset.connection.quote model._meta.db_table

            if @mode in [INSERT, DELETE, UPDATE]
                "#{tbl join.lhs}.#{@queryset.connection.quote join.lhs_field.db_field()} = #{tbl join.rhs}.#{@queryset.connection.quote join.rhs_field.db_field()}"
            else if @mode is SELECT
                "#{join.join_type} JOIN #{tbl join.rhs} #{@queryset.connection.quote rhs_alias} ON (#{@get_db_repr join.lhs_field} = #{@get_db_repr join.rhs_field})"
        @join_sql = @join_sql.concat joins

QCons::get_table = (model)->
    if @mode is UPDATE or @mode is DELETE
      return @queryset.connection.quote model._meta.db_table
    return @queryset.connection.quote @tables[model._meta.db_table]

QCons::get_db_repr = (field)->
    if field.db_repr
        field.db_repr(@queryset.connection)
    else
        "#{@get_table field.model}.#{@queryset.connection.quote field.db_field()}"

QCons::get_field_and_register = (fields)->
    model = @queryset.model
    last_field = null
    seen_models = [model]

    fields.forEach (field)=>
        @register_table model
        if last_field
            new_model = last_field.related
            @register_join last_field, seen_models
            seen_models.push new_model
            model = new_model
            last_field = model._schema.get_field_by_name field
        else
            last_field = model._schema.get_field_by_name field

        if not last_field
            throw new SchemaError "#{fields.join '__'} is not a valid field!"
    return {
        db_field:"#{@get_table model}.#{@queryset.connection.quote last_field.db_field()}",
        field:last_field
    }

QCons::coerce = (rows)->
    {BaseModel} = require './models'

    connection = @queryset.connection
    fields = @select_fields
    num_real_fields = fields.length - (field for field in fields when field.is_decoration).length

    if Array.isArray rows
        model = @queryset.model

        db_to_js = (fn)->
            (row)->
                out = {}
                decoration = {}
                if fields
                    for field in fields
                        db_field = connection.negotiate_type field
                        key = field.db_field()
                        val = db_field.map.db_to_js row[key]
                        if field.is_decoration
                            decoration[key] = val
                        else
                            out[key] = val
                fn out, decoration

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
            process = (row, decoration)->
                if num_real_fields
                    instance = new model row
                    for key, val in decoration
                        instance[key] = val
                    instance
                else
                    decoration

        rows = rows.map db_to_js process
        rows.sql = => @compile()
        rows.values = => @values

        if @mode is INSERT
            return rows[0]
    rows

Comparison = (string, special_validation, decorate_value)->
    @string = string
    @special_validation = special_validation or null
    @decorate_value = decorate_value or null
    @

Comparison::compile = (connection, qcons_field, value, register_value)->
    validation = qcons_field.field.validate_comparison.bind qcons_field.field
    db_field = connection.negotiate_type qcons_field.field

    special_validation = no
    if @special_validation
        special_validation = yes
        validation = @special_validation

    decorate = (val)->val
    map = if special_validation then (v)->v else db_field.map.js_to_db
    if @decorate_value
        decorate = @decorate_value

    if @string.indexOf('@') isnt -1
        values = value.map (val)->
            if not validation val
                throw new ValidationError "#{val} is not a valid value for #{qcons_field.field.model._meta.name}.#{qcons_field.field.name}"
            register_value decorate map qcons_field.field.get_prepdb_value val
        str = @string.replace '@', '$'+values.join(',$')
    else if @string.indexOf('?') isnt -1
        value = !!value
        str = @string.replace '?', ['NOT', ''][~~value]
    else if @string.indexOf('BETWEEN') isnt -1
        [lower, upper] = value
        lower = decorate map qcons_field.field.get_prepdb_value lower
        upper = decorate map qcons_field.field.get_prepdb_value upper
        
        lower = register_value lower
        upper = register_value upper

        str = @string.replace '$3', '$'+upper
        str = str.replace '$2', '$'+lower
    else
        if not validation value
            throw new ValidationError "#{value} is not a valid value for #{qcons_field.field.model._meta.name}.#{qcons_field.field.name}"
        value = register_value decorate map qcons_field.field.get_prepdb_value value
        str = @string.replace '$2', '$'+value

    str.replace '$1', qcons_field.db_field

exports.Comparison = Comparison
exports.QCons = QCons
