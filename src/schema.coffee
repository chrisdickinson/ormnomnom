{Field} = require './fields'

lowercase = String::toLowerCase.call.bind String::toLowerCase

base_keys = (kwargs)->
    Object.keys(kwargs).map (key)->
        key.split('__')[0]

Schema = (model)->
    @fields = []
    @related_fields = []
    @aliases = {}
    @model = model
    @has_primary_key = no
    @

Schema::get_field_names = ->
    (field.name for field in @fields when field.db_field())

Schema::get_field_by_db_name = (key)->
    (field for field in @fields when field.db_field() is key)[0]

Schema::get_field_by_name = (key)->
    if @aliases[key]
        return @aliases[key]

    for field in @related_fields
        if field.name is key
            return field

    for field in @fields
        if field.name is key
            return field
    undefined

Schema::register_related_field = (field)->
    @related_fields.push field

Schema::set = (key, val)->
    if val instanceof Function
        val = val {}
    if not val instanceof Field
        throw new SchemaError "#{@model._meta.name}.#{key} is not an instance of Field"

    field_instance = val.create_instance key, @model

    if val.primary_key
        @has_primary_key = yes
        @alias 'pk', field_instance

    @fields.push field_instance
    field_instance

Schema::alias = (name, to_field)->
    @aliases[name] = to_field

Schema::connect_related = ->
    fk = @get_field_by_name 'hometown'
    field.connect() for field in @fields when field.needs_connection()

Schema::validate =(kwargs, strict=no)->
    fields = if strict then Object.keys kwargs else base_keys kwargs
    fields.forEach (field_name)=>
        field_instance = @get_field_by_name field_name
        if not field_instance
            return false
            throw new SchemaError "#{field_name} is not a field on #{@model._meta.name}"
    yes

Meta = (name, model)->
    @model = model
    @name = name
    @db_table = Meta.get_db_table_name name
    @

Meta.set_prefix = (prefix) -> @prefix = prefix
Meta.get_db_table_name = (name)-> if @prefix then @prefix+'_'+lowercase(name) else lowercase name

Meta::get_table_constraints = (conn)->
    constraints = []
    schema = @model._schema
    if @unique_together and @unique_together instanceof Array
        constraints.push "CONSTRAINT #{conn.quote @unique_together.join('_')+'_unique'} (#{(conn.quote(schema.get_field_by_name(field).db_field()) for field in @unique_together).join(', ')})" 
    constraints

Meta::set = (key, val)->
    @[key] = val

exports.Schema = Schema
exports.Meta = Meta
