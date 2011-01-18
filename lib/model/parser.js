var LOOKUP_DELIM = '__';

exports.NO_ALIAS = true;
exports.ALIASED = false;

var Source = function(model, join) {
  this.model = model;
  this.join = join;
  this.children = [];
};

Source.prototype.toString = function() {
  return this.model._meta.getTableName();
};

Source.new = function(model, join) {
  return new Source(model, join);
};

Source.prototype.extend = function(fromField, toModel, toField) {
  this.children.filter(function(child) {
    return (child.childModel === toModel && child.childField.modelField === toField);
  });
  if(this.children.length) return this.children[0].childSource;

  var join = new Join(this, new FieldClause(this, fromField), toModel, toField);
  this.children.push(join);
  return join.childSource;
}; 

Source.prototype.getAliasedName = function() {
  var s = this,
      names = [],
      j = this.join;
  while(j !== null) {
    names.push(j.parentField.modelField.name);
    s = j.parentSource;
    j = s.join; 
  }
  names.push('root');
  names = names.reverse();
  return names.join(LOOKUP_DELIM);
};

Source.prototype.field = function(modelField) {
  return new FieldClause(this, modelField);
};

var FieldClause = function(source, modelField) {
  this.source = source;
  this.modelField = modelField;
  this.alias = {
    table:this.source.getAliasedName(),
    column:this.modelField.getColumnName()
  };
};

FieldClause.prototype.negotiateBackendRepr = function() {
  return this.modelField.negotiateBackendRepr.apply(this.modelField, arguments);
};

FieldClause.prototype.toSQL = function(backend) {
  return backend.parseColumn(this);
};

var Join = function(source, sourceField, childModel, childField) {
  this.parentSource = source;
  this.parentField = sourceField;
  this.childModel = childModel;
  this.childSource = Source.new(childModel, this);
  this.childField = new FieldClause(this.childSource, childField);
};

var WhereNode = function(source, children, negated, connector) {
  this.source = source;
  this.children = children;
  this.negated = negated || false;
  this.connector = connector || ' AND ';
};

WhereNode.prototype.toSQL = function(backend) {
  if(!this.children.length) return null;


  var sql = '('+this.children.map(function(item) {
    return item.toSQL(backend);
  }).join(this.connector)+')';

  this.negated && (sql = 'NOT '+sql);
  return sql;
};

var WhereClause = function(field, operator, value) {
  this.field = field;
  this.operator = operator;
  this.value = value;
};

WhereClause.prototype.toSQL = function(backend) {
  return backend.Lookups[this.operator].call(backend, this.field, this.value);
};

exports.FieldClause = FieldClause;
exports.WhereClause = WhereClause;
exports.WhereNode = WhereNode;

exports.parse = function() {
  // `this` is a QuerySet.operation.
  var qs = this,
      op = this._operation,
      filterKwargs = {},
      limit = null,
      ordering = qs.model._meta.getOrdering();

  while(op) {
    op.filterKwargs && Object.keys(op.filterKwargs).forEach(function(lookup) {
      // lookups we pick up earlier override previous lookups.
      this[lookup] === undefined &&
        (this[lookup] = op.filterKwargs[lookup]);
    }.bind(filterKwargs));

    op.limit && op.limit.length && !limit &&
      (limit = op.limit.slice());

    op = op.prevOp;
  }

  var root = Source.new(qs.model, null),
      whereChildren = [],
      nullable = false;

  Object.keys(filterKwargs).forEach(function(lookup) {
    var bits = lookup.split(LOOKUP_DELIM),
        last = bits[bits.length-1];
    if(!(last in qs.constructor.Lookups)) {
      bits.push('exact');
      last = 'exact';
    }

    var filterExpr = qs.constructor.Lookups[last].bind(qs),
        outValue = filterExpr(bits.slice(0, -1), filterKwargs[lookup]);

    nullable = nullable || filterExpr.nullable;
    var src = root,
        lookupBits = bits.slice(0, -1),
        bit, field;

    do {
      bit = lookupBits.shift();
      field = src.model._meta.getFieldByName(bit);

      if(field.rel) {
        // join from `src`.`field` to `field.rel.to`.`relatedField`
        src = src.extend(field, field.rel.to, field.rel.toField, nullable);
      }
    } while(lookupBits.length);

    var field = src.field(field),
        clause = new WhereClause(field, last, outValue);

    whereChildren.push(clause);
  });

  var tree = new WhereNode(root, whereChildren, nullable),
      outOrdering = [];

  var src = root;
  ordering && ordering.forEach(function(item) {
    var dir = item.charAt(0) === '-' ? -1 : 1;
    dir == -1 && (item = item.slice(1));

    var src = root,
        lookupBits = item.split(LOOKUP_DELIM),
        bit, field;
    do {
      bit = lookupBits.shift();
      field = src.model._meta.getFieldByName(bit);

      if(field.rel) {
        src = src.extend(field, field.rel.to, field.rel.to._meta.getFieldByName(field.rel.relatedField));
      }
    } while(lookupBits.length);

    outOrdering.push(new OrderClause(src, src.field(field)));
  });

  return {
    qs:qs,
    nullable:nullable,
    tree:tree,
    limit:limit,
    ordering:outOrdering,
    root:root
  };
};
