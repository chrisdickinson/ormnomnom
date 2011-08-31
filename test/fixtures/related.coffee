{models} = require '../../'
{Model} = require './models'
ns =
models.namespace 'related', (ns)->
    Related = ns.create 'Related'
    Related.schema
        model:models.ForeignKey Model
        pub_date: models.DateField {nullable:yes}

    Related::toString =->
        "<Related: #{@pk}>"

    Many = ns.create 'ManyToMany'
    Many.schema
        related: models.ManyToMany Related
        fulltime: models.DateTimeField {nullable:yes}
    Many::toString =->
        "<Many: #{@pk}>"
    exports.Related = Related
    exports.Many = Many

exports.ns = ns
