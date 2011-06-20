{BaseModel, set_prefix} = require './models'
{Connection} = require './connection'

Scope = (name)->
    @name = name
    @models = {}
    @depends_on_scopes = []
    @

Scope::depend_on = (scope)->
    if not scope in @depends_on_scopes
        @depends_on_scopes.push scope

Scope::execute = (scope_fn)->
    set_prefix @name
    scope_fn @
    for name, model of @models
        BaseModel.lock model

Scope::create = (model_name)->
    managers = {}
    model_fn = (kwargs)->
        @_fk_cache = {}

        @assign kwargs

        for key, value of managers
            @[key] = value
            @[key].instance = @

        for key, value of model_fn._schema.aliases
            Object.defineProperty @, key, {
                get:=>@[value.name],
                set:(val)=>@[value.name]=val
            }
        @

    model_fn.register_manager = (at, manager)->
        managers[at] = manager

    model_fn:: = new BaseModel model_name, model_fn

    @models[model_name] = model_fn
    model_fn.scope = @
    model_fn

Scope::db_creation = (connection, execute=yes, ready)->
    if typeof(connection) is 'string'
        connection = Connection.get_connection connection

    if execute instanceof Function
        ready = execute
        execute = yes

    pending_constraints = []
    sql = []
    visited = []
    for name, model of @models
        fields = []
        for field in model._schema.fields
            db_field = connection.negotiate_type field
            db_field.contribute_to_table fields, pending_constraints, visited
        table_constraints = model._meta.get_table_constraints() or []
        visited.push model
        sql.push """
            CREATE TABLE #{model._meta.db_table} (
                #{fields.join ', '}
                #{if table_constraints.length then ', '+table_constraints.join ', ' else ''}
            );
        """

    sql.push (connection.constraint constraint for constraint in pending_constraints).join ';'
    sql = sql.join '\n'

    if execute
        ee = connection.execute sql, [], null, null
        ee.on 'error', ready
        ee.on 'data', ready.bind({}, null)
    else
        console.log sql

exports.Scope = Scope
