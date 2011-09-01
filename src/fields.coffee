{Manager} = require './managers'
{EventEmitter} = require './events'
Field = (kwargs)->
    {@required,@default,@primary_key,@db_index,@nullable} = kwargs
    @

Field::disable_order_by = -> no

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

DateField = (kwargs)->
    Field.call @, kwargs
    @

DateField:: = new Field {}
DateField::db_type = 'date'

DateField::apply_value = (instance, value)->
    instance[@name] = if not isNaN(~~value) then new Date value else Date.parse value

DateField::validate_comparison = (value)->
    not isNaN Date.parse value

DateField::validate_value = (value)->
    if not value?
        @nullable
    else
        not isNaN Date.parse value

DateField::get_prepdb_value = (value)->
    new Date Date.parse value

DateTimeField = (kwargs)->
    DateField.call @, kwargs
    @

DateTimeField:: = new DateField {}
DateTimeField::db_type = 'datetime'

CharField = (kwargs)->
    Field.call @, kwargs
    {@max_length,@regex}=kwargs
    if not @max_length then @max_length = 255
    @

CharField:: = new Field {}
CharField::db_type = 'varchar'

CharField::validate_comparison = (value)->
    typeof value is 'string' or (not val? and @nullable)

CharField::validate_value = (value)->
    if not value?
        @nullable
    else
        valid = value.length <= @max_length
        if @regex
            @regex.lastIndex = 0
            valid = valid and @regex.test value
        valid

TextField = (kwargs)->
    Field.call @, kwargs
    @

TextField:: = new CharField {}
TextField::db_type = 'text'

TextField::validate_value = (value)->
    if not value?
        @nullable
    else
        yes

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
PositiveIntegerField::db_type = 'bigint'

AutoField = (kwargs)->
    kwargs.primary_key = yes
    PositiveIntegerField.call @, kwargs
    @

AutoField:: = new PositiveIntegerField {}
AutoField::db_type = 'id'

ReverseRelation = (name, local_field, remote_field)->
    @name = name
    [@local_field, @remote_field] = [local_field, remote_field]
    @related = remote_field.model
    @

ReverseRelation:: = new Field {}

ReverseRelation::db_field =->null
ReverseRelation::join_struct =->
    remote_join = @remote_field.join_struct()
    join_type = @remote_field.join_type()
    reversed_struct = (struct)->
        {lhs, lhs_field, rhs, rhs_field} = struct
        {lhs:rhs, lhs_field:rhs_field, rhs:lhs, rhs_field:lhs_field, join_type:join_type}
    (reversed_struct(struct) for struct in remote_join).reverse()

ForeignKey = (related, kwargs)->
    PositiveIntegerField.call @, kwargs
    {@related_name, @to_field} = kwargs
    @to_field = @to_field or 'pk'
    @related = related
    @

ForeignKey:: = new PositiveIntegerField {}
ForeignKey::validate_comparison = (val)->
    (val instanceof @related) or (not val? and @nullable)

ForeignKey::validate_value = (val)->
    if not val?
        @nullable
    else
        valid = val instanceof @related
        valid = valid and val[@to_field]?

ForeignKey::db_type = 'fk'
ForeignKey::db_field =-> "#{@name}_id"
ForeignKey::needs_connection =-> yes
ForeignKey::get_related_name =-> @related_name or "#{@model._meta.name.toLowerCase()}_set"

ForeignKey::apply_value = (obj, val)->
    obj._fk_cache[@name] = obj._fk_cache[@name] or {}
    obj._fk_cache[@name].id = val

ForeignKey::join_type =-> "LEFT"

ForeignKey::join_struct =->
    [{lhs:@model, lhs_field:@, rhs:@related, rhs_field:@related._schema.get_field_by_name(@to_field), join_type:@join_type()}]

ForeignKey::get_prepdb_value = (val)->
    @related._schema.get_field_by_name(@to_field).get_prepdb_value val[@to_field]

ForeignKey::connect =->
    if typeof @related is 'string'
        [file, target] = @related.split '#'
        file = require file
        @related = file[target]

    local_mgr = new Manager @related
    [model, field_name, db_field, to_field] = [@model, @name, @db_field, @to_field]

    Object.defineProperty @model.prototype, @name, {
        get:->
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
        set:(val)->
            if val and val.pk
                @_fk_cache[field_name] = @_fk_cache[field_name] or {}
                @_fk_cache[field_name].id = val.pk
    }

    mgr = new Manager @model
    mgr.start_query = ->
        base = Manager::start_query.call mgr
        filter = {}
        filter[field_name] = @instance
        base.filter filter

    mgr.get_base_payload = ->
        base = Manager::get_base_payload.call this
        base = base or {}
        base[field_name] = @instance
        base

    @model.scope.depend_on @related.scope
    @related._schema.register_related_field new ReverseRelation @get_related_name(), @to_field, @
    @related.register_manager @get_related_name(), mgr

ManyToMany = (related, kwargs)->
    PositiveIntegerField.call @, kwargs
    {@through, @related_name} = kwargs
    @related = related
    @

ManyToMany:: = new PositiveIntegerField {}
ManyToMany::join_type =-> "INNER"
ManyToMany::db_field =-> null
ManyToMany::needs_connection =-> yes
ManyToMany::get_related_name =-> @related_name or "#{@model._meta.name.toLowerCase()}_set"
ManyToMany::join_struct =->
    [{lhs:@model, lhs_field:@model._schema.get_field_by_name('pk'), rhs:@through, rhs_field:@through_local_field, join_type:@join_type()},
     {lhs:@through, lhs_field:@through_remote_field, rhs:@related, rhs_field:@related._schema.get_field_by_name('pk'), join_type:@join_type()}]

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
        models = require './models'
        model = @model.scope.create "#{@model._meta.name}_#{@name}"
        model.schema {
            id:models.AutoField {}
            from:models.ForeignKey @model, {}
            to:models.ForeignKey @related, {}
        }
        {BaseModel} = require './models'
        BaseModel.lock model

        @through = model

    process.nextTick =>
        from_field = to_field = null
        for field in @through._schema.fields
            if field.related is @model
                from_field = field
            else if field.related is @related
                to_field = field

        if not (from_field and to_field)
            throw new Error "Could not create M2M for #{@model._meta.name}.#{@name}"

        @through_local_field = from_field
        @through_remote_field = to_field

        mgr_local = new Manager @related
        mgr_foreign = new Manager @model


        mgr_local.start_query = ->
            base = Manager::start_query.call mgr_local
            filter = {}
            filter["#{to_field.get_related_name()}__#{from_field.name}__pk__exact"] = @instance.pk
            base.filter filter

        through = @through

        mgr_local.add = (item) ->
            kwargs = {}
            kwargs[from_field.name] = @instance
            kwargs[to_field.name] = item
            through.objects.get_or_create(kwargs)

        mgr_local.remove = (item) ->
            kwargs = {}
            kwargs[from_field.name] = @instance
            kwargs[to_field.name] = item
            through.objects.filter(kwargs).delete()

        mgr_foreign.start_query = ->
            base = Manager::start_query.call mgr_foreign
            filter = {}
            filter["#{from_field.get_related_name()}__#{to_field.name}__pk__exact"] = @instance.pk
            base.filter filter

        mgr_foreign.add = (item) ->
            kwargs = {}
            kwargs[to_field.name] = @instance
            kwargs[from_field.name] = item
            through.objects.get_or_create(kwargs)

        mgr_foreign.remove = (item) ->
            kwargs = {}
            kwargs[to_field.name] = @instance
            kwargs[from_field.name] = item
            through.objects.filter(kwargs).delete()


        @model.register_manager @name, mgr_local
        @related.register_manager @get_related_name(), mgr_foreign

        @model._schema.register_related_field @name, @
        @related._schema.register_related_field new ReverseRelation @get_related_name(), @to_field, @

Count = (alias)->
    @alias = alias
    @

Count:: = new PositiveIntegerField {}
Count::disable_order_by = -> yes
Count::is_decoration = yes
Count::db_repr = (connection)->
    "COUNT(*) as #{connection.quote @alias}"

Count::db_field = ->
    @alias

module.exports = exports =
    Count:Count
    Field:Field
    ForeignKey:ForeignKey
    IntegerField:IntegerField
    PositiveIntegerField:PositiveIntegerField
    AutoField:AutoField
    CharField:CharField
    TextField:TextField
    ManyToMany:ManyToMany
    DateField:DateField
    DateTimeField:DateTimeField
