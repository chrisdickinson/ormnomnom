{models} = require '../'
{exec} = require 'child_process'
platoon = require 'platoon'

testing_backend = process.env.TESTING_BACKEND || 'postgres'

models.configure 'default', {
        sqlite:{backend:'ormnomnom/lib/backends/sqlite', name:'test_ormnomnom.db'}
        mysql:{backend:'ormnomnom/lib/backends/mysql', name:'test_ormnomnom'}
        postgres:{backend:'ormnomnom/lib/backends/postgres', name:'test_ormnomnom'}
    }[testing_backend]

export_module = (module_name)->
    mod = require './'+module_name
    for key, val of mod
        exports["#{module_name}: #{key}"] = val

if testing_backend is 'postgres'
    platoon.setBeforeStart (ready)->
        exec 'createdb test_ormnomnom', ->
            {ns} = require './fixtures/models'
            ns.db_creation 'default', true, ->
                ready()

    platoon.setBeforeFinish (ready)->
        connection = models.Connection.get_connection 'default'
        connection.close ->
            exec 'dropdb test_ormnomnom', (err)->
                if err
                    setTimeout(exec.bind({}, 'dropdb test_ormnomnom', arguments.callee), 10)
                else
                    ready()

if testing_backend is 'sqlite'
    platoon.setBeforeStart (ready)->
        {ns} = require './fixtures/models'
        ns.db_creation 'default', true, (err)->
            ready()

    platoon.setBeforeFinish (ready)->
        exec 'rm test_ormnomnom.db', ->
            ready()

export_module 'models'
export_module 'filters'
