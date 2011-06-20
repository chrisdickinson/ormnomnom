{ExtendableError} = require './utils'
{Field} = require './fields'

lowercase = String::toLowerCase.call.bind String::toLowerCase

SchemaError = (args...)->
    ExtendableError.apply @, args
    @

SchemaError:: = new ExtendableError

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

Schema::get_field_by_db_name = (key)->
    (field for field in @fields when field.db_field() is key)[0]

Schema::get_field_by_name = (key)->
    if @aliases[key]
        return @aliases[key]

    for field in @fields
        if field.name is key
            return field
    undefined

Schema::register_related_field = (key, field)->
    @related_fields[key] = field

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
            throw new SchemaError "#{field_name} is not a field on #{@model._meta.name}"
    yes

Meta = (name, model)->
    @model = model
    @name = name
    @db_table = Meta.get_db_table_name name
    @

Meta.set_prefix = (prefix) -> @prefix = prefix
Meta.get_db_table_name = (name)-> if @prefix then @prefix+'_'+lowercase(name) else lowercase name

Meta::get_table_constraints = ->
    []

Meta::set = (key, val)->
    @[key] = val

exports.Schema = Schema
exports.Meta = Meta
