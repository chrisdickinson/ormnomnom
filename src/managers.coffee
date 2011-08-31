{EventEmitter} = require './events'
{QuerySet} = require './query'

Manager = (model_fn)->
    @model = model_fn
    @

Manager::get_base_payload = ->
    null

Manager::start_query =->
    new QuerySet @model

Manager::filter = (kwargs, ready)->
    q = @start_query()
    result = q.filter kwargs
    if ready
        result ready
        return undefined
    result

Manager::all =(ready)->
    result = @start_query()
    if ready
        result ready
        return undefined
    result

Manager::create = (kwargs, ready)->
    q = @start_query()
    base = @get_base_payload() or {}
    for key, val of kwargs
        base[key] = val

    result = q.create base

    if ready
        result ready
        return undefined
    result

Manager::delete =(ready)->
    result = @start_query().delete()

    if ready
        result ready
        return undefined
    result

Manager::update = (kwargs, ready)->
    result = @start_query().update(kwargs)

    if ready
        result ready
        return undefined
    result


Manager::get = (kwargs, ready)->
    ee = new EventEmitter
    # try to grab two: if more than one exists then things are wrong. 
    base = @filter(kwargs).limit(2)

    base.on 'data', (data)=>
        if data.length > 1
            ee.emit 'error', new @model.MultipleObjectsReturned
        else if data.length < 1
            ee.emit 'error', new @model.DoesNotExist
        else
            ee.emit 'data', data[0]

    base.on 'error', (err)->ee.emit 'error', err

    if ready
        ee ready
        return undefined
    ee

Manager::get_or_create =(kwargs, ready)->
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

    if ready
        ee ready
        return undefined
    ee

exports.Manager = Manager
