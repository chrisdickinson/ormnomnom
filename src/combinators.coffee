{AND, OR, NOT} = require './constants'

Q = (kwargs)
    ret = (next)->
        [q, combinator] = next
        q

    ret.is_combinator = yes
    ret

combinator = (connector)->
    (q)->
        [q, connector]

exports.AND = ()-> combinator AND
exports.OR = ()-> combinator OR
exports.NOT = ()-> combinator NOT

Something.objects.filter Q({something:1}) OR Q({something:4})

