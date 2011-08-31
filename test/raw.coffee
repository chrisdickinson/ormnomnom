{unittest, test, models, exceptions} = require './_utils'
{sql} = require '..'

random_name = {
    toString:->
        ''+~~(Math.random()*100)
}

module.exports = exports =
    'test raw connection':unittest(
        models.namespace 'raw_connection', (ns)->
            Model = ns.create 'Model'
            Model.schema
                value:models.CharField

        test "Test raw connection, no values, no callback", (ns, assert)->
            expected = 'raw_'+random_name
            creation = ns.models.Model.objects.create {value:expected}
            creation assert.async (err, data)->
                assert.fail err
                assert.ok data
                sql('SELECT * FROM raw_connection_model') assert.async (err, rows)->
                    assert.fail err
                    assert.ok rows
                    assert.equal rows.length, 1
                    assert.equal rows[0].value, expected

        test "Test raw connection with values", (ns, assert)->
            expected = 'values_raw_'+random_name
            creation = ns.models.Model.objects.create {value:expected}
            creation assert.async (err, data)->
                assert.fail err
                assert.ok data
                sql('SELECT * FROM raw_connection_model WHERE value = $1', [expected]) assert.async (err, rows)->
                    assert.fail err
                    assert.ok rows
                    assert.equal rows.length, 1
                    assert.equal rows[0].value, expected

        test "Test raw connection with values and callback", (ns, assert)->
            expected = 'values_raw_'+random_name
            creation = ns.models.Model.objects.create {value:expected}
            creation assert.async (err, data)->
                assert.fail err
                assert.ok data
                callback = assert.async (err, rows)->
                    assert.fail err
                    assert.ok rows
                    assert.equal rows.length, 1
                    assert.equal rows[0].value, expected
                query = sql('SELECT * FROM raw_connection_model WHERE value = $1', [expected], callback)
                assert.strictEqual query, undefined
    )
