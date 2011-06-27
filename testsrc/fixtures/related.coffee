{models} = require '../../'
{Model} = require './models'
ns =
models.namespace 'related', (ns)->
    Related = ns.create 'Related'
    Related.schema
        model:models.ForeignKey Model

    Related::toString =->
        "<Related: #{@pk}>"

    Many = ns.create 'ManyToMany'
    Many.schema
        related: models.ManyToMany Related
    Many::toString =->
        "<Many: #{@pk}>"
    exports.Related = Related
    exports.Many = Many

exports.ns = ns
