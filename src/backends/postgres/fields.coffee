{BASE_FIELDS, o} = require '../fields'

PG_BASE_FIELDS = Object.create BASE_FIELDS

PG_BASE_FIELDS.id = o null, 'serial'

exports.BASE_FIELDS = PG_BASE_FIELDS
