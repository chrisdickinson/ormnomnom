{ExtendableError} = require './utils'

SchemaError = (message, args...)->
    ExtendableError.apply @, args
    @message = message
    @

SchemaError:: = new ExtendableError
SchemaError::constructor = SchemaError

ValidationError = (message, args...)->
    ExtendableError.apply @, args
    @message = message
    @

ValidationError:: = new ExtendableError
ValidationError::constructor = ValidationError

DoesNotExist = (message, args...)->
    ExtendableError.apply @, args
    @message = message
    @

DoesNotExist:: = new ExtendableError
DoesNotExist::constructor = DoesNotExist

MultipleObjectsReturned = (message, args...)->
    ExtendableError.apply @, args
    @message = message
    @

MultipleObjectsReturned:: = new ExtendableError
MultipleObjectsReturned::constructor = MultipleObjectsReturned

module.exports = exports =
    SchemaError:SchemaError
    DoesNotExist:DoesNotExist
    MultipleObjectsReturned:MultipleObjectsReturned
    ValidationError:ValidationError
