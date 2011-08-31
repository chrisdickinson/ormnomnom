{models} = require '../../'
ns =
models.namespace 'test', (ns)->
    Model = ns.create 'Model'
    Model.schema
        anything:models.CharField {max_length:100}
        validated:models.CharField {max_length:20, regex:/^[\w\d\-_]*$/g}

    Model::toString =->
        "<Model: #{@anything}:#{@pk}>"

    exports.Model = Model

exports.ns = ns
