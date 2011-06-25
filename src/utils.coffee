ExtendableError = (args...)->
    Error.apply @, args
    Error.captureStackTrace @
    @

ExtendableError:: = new Error

ExtendableError::toString = ->
    "#{@constructor.name}: #{@message}"

exports.ExtendableError = ExtendableError
