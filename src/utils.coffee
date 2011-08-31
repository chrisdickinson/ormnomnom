ExtendableError = (args...)->
    Error.apply @, args
    Error.captureStackTrace @
    @

ExtendableError:: = new Error

ExtendableError::toString = ->
    "#{@constructor.name}: #{@message}"

exports.ExtendableError = ExtendableError

if !Array::collect
    Array::collect = (ready)->
        errors = []
        instances = []
        got = 0
        @map (query, idx, all)->
            query (err, data)->
                errors[idx] = err
                instances[idx] = data
                if ++got is all.length
                    ready(errors, instances)
        if @length is 0
            setTimeout (-> ready(errors, instances)), 0
