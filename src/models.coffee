fields = require './fields'
{DoesNotExist, MultipleObjectsReturned, ValidationError} = require './exceptions'
{Manager} = require './managers'
{Schema, Meta} = require './schema'
{Connection} = require './connection'

BaseModel = (name, model_fn)->
    @name = name

    model_fn._meta = new Meta name, model_fn
    model_fn._schema = new Schema model_fn

    dne_error = ()->
        DoesNotExist.call this
        this

    dne_error:: = new DoesNotExist

    mul_error = ()->
        MultipleObjectsReturned.call this
        this

    mul_error:: = new MultipleObjectsReturned

    model_fn.DoesNotExist = dne_error
    model_fn.MultipleObjectsReturned = mul_error

    model_fn.schema = (schema)->
        BaseModel.set_schema model_fn, schema

    model_fn.meta = (meta)->
        BaseModel.set_meta model_fn, meta

    @__mro__ = if @__mro__ then [model_fn].concat @__mro__ else [model_fn]
    @constructor = model_fn
    @

BaseModel::toString = ->
    "<#{@constructor._meta.name}: #{@__ident__ and @[@__ident__] or @pk}>"

BaseModel.lock = (model_fn)->
    if model_fn.__locked__
      return

    model_fn.schema = -> throw new Error("#{model_fn._meta.name}'s schema is locked!")
    model_fn.meta = -> throw new Error("#{model_fn._meta.name}'s meta is locked!")
    @compile model_fn
    model_fn.__locked__ = yes

BaseModel.set_meta = (model_fn, meta)->
    for key, value of meta
        model_fn._meta.set key, value

BaseModel.set_schema = (model_fn, schema)->
    for key, value of schema
        model_fn._schema.set key, value

BaseModel.compile = (model_fn)->
    if not model_fn._schema.has_primary_key
        id_field = model_fn._schema.set 'id', new fields.AutoField {}
        model_fn._schema.alias 'pk', id_field

    model_fn._schema.connect_related()

BaseModel.create_manager = (model_fn)->
    model_fn._default_manager = new Manager model_fn
    model_fn.objects = if model_fn.objects then new model_fn.objects(model_fn) else model_fn._default_manager

BaseModel::assign = (kwargs)->
    schema = @constructor._schema
    for key, val of kwargs
        field = (schema.get_field_by_name key) or (schema.get_field_by_db_name key)
        if not field
            throw new ValidationError "#{key} is not a valid field for #{@constructor._meta.name}"
        else
            field.apply_value @, val

BaseModel::value_dict = ->
    output = {}
    for field_name in @constructor._schema.get_field_names()
        if @[field_name] isnt undefined
            output[field_name] = @[field_name]
    output

BaseModel::save = ()->
    if @pk
        @constructor.objects.filter({pk:@pk}).update @value_dict()
    else
        @constructor.objects.create @value_dict()

BaseModel::delete = ()->
    if @pk
        @constructor.objects.filter({pk:@pk}).delete()
    else
        throw new Error "Can't delete object!"

exports.namespace = (name, do_fn)->
    {Scope} = require './scope'
    scope = new Scope name
    scope.execute do_fn
    scope

exports.BaseModel = BaseModel
exports.Connection = Connection
exports.configure = (name, connection_data)->
    Connection.register name, connection_data

exports.set_prefix = (prefix) ->
    Meta.set_prefix prefix

for name, field of fields
    do (name, field) ->
        exports[name] = (a,b)->
            if not a?
                a = {}
            if not b?
                b = {}
            ret = new field a,b
            ret.type = name
            ret.original_arguments = [].slice.call arguments
            ret
