Creation = (filename, using)->
    @models = if Array.isArray(models) then models else [models]
    @connection = using or 'default'
    @

Creation::initial = ()->
    framing = """
        CREATE TABLE {table_name} (
            {fields}
            {table_constraints}
        )
    """
    (framing.replace /\{[^\}]*\}/gm, (all, repl)->(lookup context, repl)) for context in create_contexts @models

    @

Creation::alter_add_field = (model, field_name)->
    @

Creation::alter_remove_field = (model, field_name)->
    @

MigrationWriter = (filename)->
    @models = (val for key, val of require filename when val instanceof BaseModel)
    @frozen = JSON.stringify (@freeze_model model for model in @models)
    @

MigrationWriter::freeze_model = (model)->
    blob = {}
    arg_to_val = (arg)->
        if arg instanceof BaseModel then arg.name else arg

    for field in model._schema.fields
        blob[field.name] =
            type:field.type
            args:(arg_to_val arg for arg in field.original_arguments)

    out = {}
    out[model.name] = blob
    out





