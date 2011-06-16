ExtendableError = (args...)->
    Error.apply @, args
    Error.captureStackTrace @
    @

ExtendableError:: = new Error

exports.ExtendableError = ExtendableError
