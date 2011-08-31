{unit, test} = require 'platoon'
{models, exceptions} = require '../'

unittest = (ns, functions...)->
    coerce = (fn)->
        r = fn.bind({}, ns)
        r.__doc__ = fn.__doc__
        r

    unit(
        {
            setup:(ready)->
                ns.db_creation 'default', yes, (err, data)->
                    ready()
            teardown:(ready)->
                ns.db_deletion 'default', yes, (err, data)->
                    ready()
        }
        (coerce fn for fn in functions)...
    )

exports.unittest = unittest
exports.models = models
exports.exceptions = exceptions
exports.test = test
exports.unit = unit
