{BASE_FIELDS, o} = require '../fields'

PG_BASE_FIELDS = Object.create BASE_FIELDS

PG_BASE_FIELDS.id = o null, 'serial'
PG_BASE_FIELDS.date = o null, 'date'
PG_BASE_FIELDS.datetime = o null, 'timestamp with time zone'

exports.BASE_FIELDS = PG_BASE_FIELDS
