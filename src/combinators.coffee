{AND, OR, NOT} = require './constants'

Q = (kwargs)->
    ret = (next)->
        console.log next
        [q, combinator] = next
        ret.query.rhs = q
        ret.query.connector = combinator
        ret

    ret.kwargs = kwargs 
    ret.query= {lhs:ret, rhs:null, connector:null}
    ret.is_combinator = yes
    ret

combinator = (connector)->
    (q)->
        [q, connector]

exports.Q = Q
exports.AND = combinator AND
exports.OR = combinator OR
exports.NOT = combinator NOT

console.log((Q({lol:1}) exports.AND exports.NOT Q({rofl:2})).query)
