{EventEmitter} = require './events'
{QuerySet} = require './query'

Manager = (model_fn)->
    @model = model_fn
    @

Manager::get_base_payload = ->
    null

Manager::start_query =->
    new QuerySet @model

Manager::filter = (kwargs)->
    q = @start_query()
    q.filter kwargs

Manager::all =->
    @start_query()

Manager::create = (kwargs)->
    q = @start_query()
    base = @get_base_payload() or {}

    clone = Object.create base
    for key, val of kwargs
        clone[key] = val

    q.create clone

Manager::delete =->
    @start_query().delete()

Manager::update = (kwargs)->
    @start_query().update(kwargs)

Manager::get = (kwargs)->
    ee = new EventEmitter
    base = @filter(kwargs)

    base.on 'data', (data)=>
        if data.length > 1
            ee.emit 'error', new @model.MultipleObjectsReturned
        else if data.length < 1
            ee.emit 'error', new @model.DoesNotExist
        else
            ee.emit 'data', data[0]

    base.on 'error', (err)->ee.emit 'error', err
    ee

Manager::get_or_create =(kwargs)->
    ee = new EventEmitter
    base = @get kwargs

    base.on 'data', (data)->
        ee.emit 'data', data

    base.on 'error', (err)=>
        if err instanceof @model.DoesNotExist
            new_base = @create kwargs
            new_base.on 'data', (data)->
                ee.emit 'data', data
            new_base.on 'error', (err)->
                ee.emit 'error', err
        else
            ee.emit 'error', err
    ee

exports.Manager = Manager
