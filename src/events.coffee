events = require 'events'
EE = events.EventEmitter

nothing = {}
okay = (what)-> what isnt nothing

EventEmitter = (args...) ->
    _cache_data = _cache_err = null

    ret = (ready)->
        if ready
            if not _cache_data and not _cache_err
                ret.on 'data', (data)->ready(null, data)
                ret.on 'error', (err)->ready(err, null)
            else
                ready _cache_err, _cache_data
            undefined
        else
            ret

    EE.apply ret, args

    for key, val of @.__proto__
        do(key,val)->
          ret[key] = val

    ret.on 'data', (data)-> _cache_data = data
    ret.on 'error', (err)-> _cache_err = err

    ret

EventEmitter.Base = EE
EventEmitter.prototype = new EE
EventEmitter.subclass = (ctor)->
    ret = (args...)->
        ee = new EventEmitter
        for key, val of ret::
            ee[key] = val
        ctor.apply ee, args
        ee

exports.EventEmitter = EventEmitter
