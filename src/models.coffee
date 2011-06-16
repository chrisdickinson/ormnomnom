fields = require './fields'
{ExtendableError} = require './utils'
{Manager} = require './managers'
{Schema, Meta} = require './schema'

DoesNotExist = ()->
    ExtendableError.call this
    this

DoesNotExist:: = new ExtendableError

MultipleObjectsReturned = ()->
    ExtendableError.call this
    this

MultipleObjectsReturned:: = new ExtendableError

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

    setTimeout(BaseModel.lock.bind(BaseModel, model_fn), 0)

    @__mro__ = if @__mro__ then [model_fn].concat @__mro__ else [model_fn]
    @constructor = model_fn
    @

BaseModel.lock = (model_fn)->
    model_fn.schema = -> throw new Error("#{model_fn::name}'s schema is locked!")
    model_fn.meta = -> throw new Error("#{model_fn::name}'s meta is locked!")
    BaseModel.compile model_fn
    BaseModel.create_manager model_fn

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
    model_fn.objects = if model_fn.objects then model_fn.objects else model_fn._default_manager

BaseModel::assign = (kwargs)->
    schema = @constructor._schema
    for key, val of kwargs
        field = (schema.get_field_by_name key) or (schema.get_field_by_db_name key)
        if not field
            throw new Error "#{key} is not a valid field for #{@constructor._meta.name}"
        else
            field.apply_value @, val

BaseModel::save = ()->
    if @_from_db or @pk
        @constructor.objects.filter({pk:@pk}).update @value_dict()
    else
        @constructor.objects.create @value_dict

BaseModel::delete = ()->
    if @pk
        @constructor.objects.filter({pk:@pk}).delete()
    else
        throw new Error "Can't delete object!"

create = (name)->
    managers = {}
    model_fn = (kwargs)->
        @_fk_cache = {}

        @assign kwargs
        for key, value of managers
            @[key] = value
            @[key].instance = @

        for key, value of model_fn._schema.aliases
            Object.defineProperty @, key, {
                get:=>@[value.name],
                set:(val)=>@[value.name]=val
            }
        @

    model_fn.register_manager = (at, manager)->
        managers[at] = manager

    model_fn:: = new BaseModel name, model_fn

    model_fn

exports.BaseModel = BaseModel

exports.create = create

{Connection} = require './connection'

exports.configure = (name, connection_data)->Connection.register name, connection_data

exports.set_prefix = (prefix) -> Meta.set_prefix prefix

for name, field of fields
    do (name, field) ->
        exports[name] = (a,b)->
            if b is undefined and a is undefined
                a = {}
            new field a,b
