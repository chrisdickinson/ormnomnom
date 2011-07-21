{DBField, BASE_FIELDS, o} = require '../fields'

SQLiteDBField = ->
    DBField.apply @, [].slice.call arguments
    @

SQLiteDBField:: = Object.create DBField::

SQLiteDBField::contribute_to_table = (fields, pending_constraints, visited)->
    if @field.related and not (@field.related in visited)
        @defer_fk_constraint = -> yes
    fields.push @framing().replace(/\n/g, ' ')

SQLITE_BASE_FIELDS = Object.create BASE_FIELDS

SQLITE_BASE_FIELDS.date = o null, 'DATE', {
    js_to_db:(val)->
        if not isNaN(val)
            # oh gross.
            date = new Date([val.getUTCFullYear(), val.getUTCMonth()+1, val.getUTCDate()].join('-')+' 00:00:00 GMT')
            ~~(date/1000)
        else
            val
    db_to_js:(val)->
        if val is null
            val
        else
            tmpdate = new Date(val*1000)
            date = new Date([tmpdate.getUTCFullYear(), tmpdate.getUTCMonth()+1, tmpdate.getUTCDate()].join('-')+' 00:00:00 GMT')
}
SQLITE_BASE_FIELDS.datetime = o null, 'DATETIME', {
    js_to_db:(val)->if not isNaN(val) then ~~(val/1000) else val
    db_to_js:(val)->if val is null then val else new Date(val*1000)
}

exports.BASE_FIELDS = SQLITE_BASE_FIELDS
exports.DBField = SQLiteDBField
