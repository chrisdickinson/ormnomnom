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

    seen_models = []

    repeat = =>
      for name, model of @models
          if not (model in seen_models)
              BaseModel.lock model
              seen_models.push model
      if seen_models.length < Object.keys @models
          repeat()
    repeat()

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
    BaseModel.create_manager model_fn

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
            if field.db_field()
                db_field = connection.negotiate_type field
                db_field.contribute_to_table fields, pending_constraints, visited
        table_constraints = model._meta.get_table_constraints(connection) or []
        visited.push model

        _sql = """
            CREATE TABLE #{model._meta.db_table} (
                #{fields.join ', '}
                #{if table_constraints.length then ', '+table_constraints.join ', ' else ''}
            );
        """
        sql.push _sql

    if pending_constraints.length
        sql.push (connection.constraint constraint for constraint in pending_constraints).join ';'

    if execute
        [errors, data] = [[],[]]

        recurse = ->
            ee = connection.execute sql.shift(), [], null, null
            done = ->
                if sql.length
                    recurse()
                else
                    ready(errors, data)

            ee.on 'err', (err)-> [errors.push(err), done()]
            ee.on 'data', (result)-> [data.push(result), done()]

        if sql.length then recurse() else ready(errors, data)
    else
        console.log sql

Scope::db_deletion = (connection, execute=yes, ready)->
    if typeof(connection) is 'string'
        connection = Connection.get_connection connection

    if execute instanceof Function
        ready = execute
        execute = yes

    models = (model for name, model of @models)
    {ForeignKey} = require './fields'
    scope = @
    sql = []
    recurse = (model)->
        if model not in models then return

        drop_sql = connection.drop_table model
        if not (drop_sql in sql) then sql.push drop_sql
        models.splice models.indexOf(model), 1
        for field in model._schema.fields
            if field instanceof ForeignKey and field.related.scope is scope
                recurse field.related
            else if field.through and field.through.scope is scope
                recurse field.through

    while models.length
        recurse models[0]

    if execute
        [errors, data] = [[],[]]

        recurse = ->
            ee = connection.execute sql.shift(), [], null, null
            done = ->
                if sql.length
                    recurse()
                else
                    ready(errors, data)

            ee.on 'err', (err)-> [errors.push(err), done()]
            ee.on 'data', (result)-> [data.push(result), done()]

        if sql.length then recurse() else ready(errors, data)
    else
        console.log sql.join(';\n')+';\n'
exports.Scope = Scope
