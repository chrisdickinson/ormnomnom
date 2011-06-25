{Manager} = require './managers'
{EventEmitter} = require './events'
Field = (kwargs)->
    {@required,@default,@primary_key,@db_index,@nullable} = kwargs
    @

Field::get_prepdb_value = (value)->
    value

Field::db_field =->
    @name

Field::validate_comparison = (value)->
    yes

Field::validate_value = (value)->
    yes

Field::apply_value = (instance, value)->
    instance[@name] = value

Field::needs_connection =-> no
Field::connect =-> no

Field::create_instance = (name, model)->
    clone = Object.create @
    [clone.name, clone.model] = [name, model]
    clone

CharField = (kwargs)->
    Field.call @, kwargs
    {@max_length,@regex}=kwargs
    if @max_length is null then @max_length = 255
    @

CharField:: = new Field {}
CharField::db_type = 'varchar'

CharField::validate_comparison = (value)->
    typeof value is 'string' or (not val? and @nullable)

CharField::validate_value = (value)->
    if not value?
        @nullable
    else
        valid = value.length < @max_length
        if @regex
            @regex.lastIndex = 0
            valid = valid and @regex.test value
        valid

TextField = (kwargs)->
    Field.call @, kwargs
    @

TextField:: = new CharField {}
TextField::db_type = 'text'

IntegerField = (kwargs)->
    Field.call @, kwargs
    {@min, @max} = kwargs
    @

IntegerField:: = new Field {}
IntegerField::db_type = 'integer'

IntegerField::validate_value = (val)->
    if not val?
        @nullable
    else
        valid = typeof val is 'number'
        valid = valid and (if @min then val>@min else valid)
        valid = valid and (if @max then val<@max else valid)


IntegerField::validate_comparison = (val)->
    typeof val is 'number' or (not val? and @nullable)

PositiveIntegerField = (kwargs)->
    kwargs.min = -1
    IntegerField.call @, kwargs
    @

PositiveIntegerField:: = new IntegerField {}

AutoField = (kwargs)->
    kwargs.primary_key = yes
    PositiveIntegerField.call @, kwargs
    @

AutoField:: = new PositiveIntegerField {}
AutoField::db_type = 'id'

ForeignKey = (related, kwargs)->
    PositiveIntegerField.call @, kwargs
    {@related_name, @to_field} = kwargs
    @to_field = @to_field or 'pk'
    @related = related
    @

ForeignKey::validate_comparison = (val)->
    (typeof val is @related) or (not val? and @nullable)

ForeignKey::validate_value = (val)->
    if not val?
        @nullable
    else
        valid = val instanceof @related
        valid = valid and val[@to_field]?

ForeignKey:: = new PositiveIntegerField {}
ForeignKey::db_type = 'fk'
ForeignKey::db_field =-> "#{@name}_id"
ForeignKey::needs_connection =-> yes
ForeignKey::get_related_name =-> @related_name or "#{@model._meta.name.toLowerCase()}_set"

ForeignKey::apply_value = (obj, val)->
    obj._fk_cache[@name] = obj._fk_cache[@name] or {}
    obj._fk_cache[@name].id = val

ForeignKey::join_struct =->
    [{lhs:@model, lhs_field:@, rhs:@related, rhs_field:@related._schema.get_field_by_name(@to_field)}]

ForeignKey::get_prepdb_value = (val)->
    val[@to_field]

ForeignKey::connect =->
    if typeof @related is 'string'
        [file, target] = @related.split '#'
        file = require file
        @related = file[target]

    local_mgr = new Manager @related
    [model, field_name, db_field, to_field] = [@model, @name, @db_field, @to_field]

    @model::[@name] = ()->
        if @_fk_cache[field_name]
            if @_fk_cache[field_name].instance
                instance = @_fk_cache[field_name].instance
                ee = new EventEmitter
                setTimeout (-> ee.emit 'data', instance), 0
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

    @model.scope.depend_on @related.scope
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
        model = @model.scope.create "#{@model.name}_#{@name}"
        model.schema
            from:models.ForeignKey model, {}
            to:models.ForeignKey @related, {}
        @through = model

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

module.exports = exports =
    Field:Field
    ForeignKey:ForeignKey
    IntegerField:IntegerField
    PositiveIntegerField:PositiveIntegerField
    AutoField:AutoField
    CharField:CharField
    TextField:TextField
