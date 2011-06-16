{Manager} = require './managers'
{EventEmitter} = require './events'
Field = (kwargs)->
    {@required,@default,@primary_key,@db_index,@nullable} = kwargs
    @

Field::get_prepdb_value = (value)->
    value

Field::db_field =->
    @name

Field::apply_value = (instance, value)->
    instance[@name] = value

Field::needs_connection =-> no
Field::connect =-> no

Field::prepdb = (val)->
    val

Field::create_instance = (name, model)->
    clone = Object.create @
    [clone.name, clone.model] = [name, model]
    clone

CharField = (kwargs)->
    Field.call @, kwargs
    {@max_length,@match_regex}=kwargs
    @

CharField:: = new Field {}

IntegerField = (kwargs)->
    Field.call @, kwargs
    {@min, @max} = kwargs
    @

IntegerField:: = new Field {}

PositiveIntegerField = (kwargs)->
    kwargs.min = 0
    IntegerField.call @, kwargs
    @

PositiveIntegerField:: = new IntegerField {}

AutoField = (kwargs)->
    kwargs.primary_key = yes
    PositiveIntegerField.call @, kwargs
    @

AutoField:: = new PositiveIntegerField {}

ForeignKey = (related, kwargs)->
    PositiveIntegerField.call @, kwargs
    {@related_name, @to_field} = kwargs
    @to_field = @to_field or 'pk'
    @related = related
    @

ForeignKey:: = new PositiveIntegerField {}
ForeignKey::db_field =-> "#{@name}_id"
ForeignKey::needs_connection =-> yes
ForeignKey::get_related_name =-> @related_name or "#{@model._meta.name.toLowerCase()}_set"

ForeignKey::apply_value = (obj, val)->
    obj._fk_cache[@name] = obj._fk_cache[@name] or {}
    obj._fk_cache[@name].id = val

ForeignKey::join_struct =->
    [{lhs:@model, lhs_field:@, rhs:@related, rhs_field:@related._schema.get_field_by_name(@to_field)}]

ForeignKey::prepdb = (val)->
    val[@to_field]

ForeignKey::connect =->
    if typeof @related is 'string'
        [file, target] = @related.split '#'
        file = require file
        @related = file[target]

    local_mgr = new Manager @related
    [model, field_name, db_field, to_field] = [@model, @name, @db_field, @to_field]

    @model::[@name] = (ready)->
        if @_fk_cache[field_name]
            if @_fk_cache[field_name].instance
                instance = @_fk_cache[field_name].instance
                ee = new EventEmitter
                setTimeout -> ee.emit 'data', instance
                return ee
            else if @_fk_cache[field_name].id
                filter = {}
                filter[to_field] = @_fk_cache[field_name].id
                return local_mgr.get filter

    mgr = new Manager @model
    mgr.start_query = ->
        base = Manager::start_query.call mgr
        filter = {}
        filter[field_name] = @instance
        base.filter filter

    mgr.get_base_payload = ->
        base = Manager::get_base_payload.call this
        base = base or {}
        base[name] = @instance

    @related._schema.register_related_field @get_related_name(), @
    @related.register_manager @get_related_name(), mgr

ManyToMany = (related, kwargs)->
    PositiveIntegerField.call @, kwargs
    {@through, @related_name} = kwargs
    @related = related
    @

ManyToMany:: = new PositiveIntegerField {}
ManyToMany::db_field =-> null
ManyToMany::needs_connection =-> yes
ManyToMany::get_related_name =-> @related_name or "#{@model._meta.name.toLowerCase()}_set"
ManyToMany::join_struct =->
    [{lhs:@model, lhs_field:@model._schema.get_field_by_name('pk'), rhs:@through, rhs_field:@through_local_field},
     {lhs:@through, lhs_field:@through_remote_field, rhs:@related, rhs_field:@related._schema.get_field_by_name('pk')}]

ManyToMany::connect =->
    if typeof @related is 'string'
        [file, target] = @related.split '#'
        file = require file
        @related = file[target]

    if @through
        if typeof @through is 'string'
            [file, target] = @through.split '#'
            file = require file
            @related = file[target]
    else
        model = models.create "#{@model._meta.db_table}_#{@name}"
        model.schema
            from:models.ForeignKey model, {}
            to:models.ForeignKey @related, {}
        @through = model

    eventually = =>
            from_field = to_field = null
            for field in @through._schema.fields
                if field.related is @model
                    from_field = field
                else if field.related is @related
                    to_field = field

            if not (from_field and to_field)
                throw new Error "Could not create M2M for #{@model.name}"

            @through_local_field = from_field
            @through_remote_field = remote_field

            mgr_local = new Manager @related
            mgr_foreign = new Manager @model


            mgr_local.start_query = ->
                base = Manager::start_query.call mgr_local
                filter = {}
                filter["#{to_field.get_related_name()}__#{from_field.name}__pk__exact"] = @instance.pk
                @filter filter

            mgr_foreign.start_query = ->
                base = Manager::start_query.call mgr_foreign
                filter = {}
                filter["#{from_field.get_related_name()}__#{from_field.name}__pk__exact"] = @instance.pk
                @filter filter

            @model.register_manager @name, mgr_local
            @related.register_manager related_name, mgr_foreign

            @model._schema.register_related_field @name, @
            @related._schema.register_related_field @get_related_name(), @

    setTimeout(eventually, 0)

exports.Field = Field
exports.ForeignKey = ForeignKey
exports.IntegerField = IntegerField
exports.PositiveIntegerField = PositiveIntegerField
exports.AutoField = AutoField
exports.CharField = CharField
