DBField = (base_field, connection, sql_type, extra)->
    @field = base_field
    @connection = connection
    @_sql_type = sql_type
    @_extra = extra
    @

DBField::defer_fk_constraint = -> no
DBField::related_table = ->
    @field.related._meta.db_table

DBField::get_related_type =->
    related_field = @field.related._schema.get_field_by_name @field.to_field
    force_type = if related_field.db_type is 'id' then 'integer' else null
    related_type = @connection.negotiate_type related_field, force_type
    related_type.sql_type()

DBField::sql_type = -> 
    if @_sql_type instanceof Function 
        @_sql_type.call @ 
    else @_sql_type

DBField::extra = ->
    extra = @_extra
    if extra instanceof Function 
        extra = extra.call @
    if extra? then extra else ''

DBField::quote = (what)->
    @connection.quote what

DBField::framing = ->
    """
    #{@quote @field.db_field()} 
    #{@sql_type()}
    #{if @field.nullable then 'NULL DEFAULT NULL' else 'NOT NULL'} 
    #{if @field.unique then 'UNIQUE' else ''} 
    #{if @field.primary_key then 'PRIMARY KEY' else ''}
    #{@extra()}
    """

DBField::get_real_field = (field_name)->
    {BaseModel} = require '../models'
    if not @field.related.__locked__ then BaseModel.lock @field.related
    real_field = @field.related._schema.get_field_by_name field_name
    real_field.db_field()

DBField::contribute_to_table = (fields, pending_constraints, visited)->
    if @field.related and not (@field.related in visited)
        @defer_fk_constraint = -> yes
        pending_constraints.push """
            ALTER TABLE #{@field.model._meta.db_table} 
            ADD CONSTRAINT #{@field.db_field()}_refs_#{@get_real_field @field.to_field}
            FOREIGN KEY (#{@field.db_field()}) 
            REFERENCES #{@related_table()} (#{@get_real_field @field.to_field}) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
        """.replace(/\n/g, ' ')

    fields.push @framing().replace(/\n/g, ' ')

o = (extra, sql)->
    (base_field, connection)->
        new DBField base_field, connection, sql, extra

BASE_FIELDS =
    date:
        o null, "DATE"
    datetime:
        o null, "DATETIME"
    varchar:
        o null, -> "VARCHAR(#{@field.max_length})"
    integer:
        o null, "INTEGER"
    text:
        o null, "TEXT"
    id:
        o (->"AUTOINCREMENT"), "INTEGER"
    fk:
        o (->
            if not @defer_fk_constraint()
                "REFERENCES #{@related_table()} (#{@get_real_field @field.to_field}) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED" 
            else ""
        ), 
        (->
            @get_related_type @connection
        )

exports.BASE_FIELDS = BASE_FIELDS
exports.DBField = DBField
exports.o = o