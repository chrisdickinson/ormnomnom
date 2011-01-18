var parser = require('ormnomnom/model/parser'),
    WhereNode = parser.WhereNode,
    WhereClause = parser.WhereClause;

var BackendClass = function() {
  this.manager = null;
  this.client = null;
};

var QUERY_DELIM = '__';

BackendClass.prototype.query = function(type, query) {
  throw new Error("Not implemented");
};

BackendClass.prototype.buildQuery = function(query) {
  var op = query.qs._operation.toString(),
      qstr = this['build'+op+'Query'](query);

  return qstr+';';
};

BackendClass.prototype.supportsAutoincrement = function() {
  return true;
};

BackendClass.prototype.createTable = function(model) {
  var tableName = model._meta.getTableName(),
      fields = [],
      unique = [],
      bits,
      fks = [];

  bits = Object.keys(model._meta.fields).map(function(name) {
    var field = model._meta.fields[name];

    var    repr = field.negotiateBackendRepr(this);
    repr.unique && unique.push(field);

    field.hasRelation() && fks.push(field.rel);
    return field.getColumnName() + ' ' + repr.repr() + (repr.nullable ? '' : ' NOT NULL ') + ' ' +
           (field.isPrimaryKey() ? ' primary key ' : '') +
           (repr.autoincrement && this.supportsAutoincrement() ? ' autoincrement ' : '');
  }.bind(this));

  unique.length && bits.push('UNIQUE('+unique.map(function(field) {
    return field.getColumnName();
  }).join(', ')+')');

  return 'CREATE TABLE '+tableName+'(\n\t'+bits.join(',\n\t')+')';
};

BackendClass.prototype.getType = function() {
  var args = Array.prototype.slice.call(arguments),
      types = args.slice();
  if(this.types) while(types) {
    var bit = types.shift();
    if(this.types[bit]) return this.types[bit](this);
  };
  throw new Error('This backend does not support any of "'+args.join('", "')+'"');
};

BackendClass.prototype.processRowData = function(model, op, data, cb) {
  this['process'+op+'Data'](model, data, cb);
};

BackendClass.prototype.processSELECTData = function(model, data, cb) {
  // expects an object returned.
  cb(null, data);
};

BackendClass.prototype.processUPDATEData = function(model, data, cb) {
  // expects the number of updated objects returned.
  cb(null, data);
};

BackendClass.prototype.processDELETEData = function(model, data, cb) {
  // expects the number of deleted objects returned.
  cb(null, data);
};

BackendClass.prototype.processINSERTData = function(model, data, cb) {
  // expects the resultant object(s) from an insert operation returned.
  cb(null, data);
};


BackendClass.walkFields = function(model, bits, each) {
  var field;
  do {
    field = model.constructor._meta.getFieldByName(bits.shift());
    each(model, field, field.rel && field.rel.toField);
    if(field.rel) {
      model = field.rel.to;
      field = field.rel.toField;
    }
  } while(bits.length > 1);
  return {field:field, model:model};
};

BackendClass.prototype.Lookups = {
  'exact':function(field, value) {
    var backendField = field.negotiateBackendRepr(this);
    return field.toSQL(this)+' = '+backendField.clean(value);
  },
  'iexact':function(field, value) {
    var backendField = field.negotiateBackendRepr(this);
    return 'UPPER('+field.toSQL(this)+') = UPPER('+backendField.clean(value)+')';
  },
  'contains':function(field, value) {
    var backendField = field.negotiateBackendRepr(this);
    return field.toSQL(this)+' LIKE '+backendField.clean(value).modify(function(val) {
      return '%'+val+'%';
    });
  },
  'icontains':function(field, value) {
    var backendField = field.negotiateBackendRepr(this);
    return 'UPPER('+field.toSQL(this)+') LIKE UPPER('+backendField.clean(value).modify(function(val) {
      return '%'+val+'%';
    })+')';
  },
  'in':function(field, value) {
    var backendField = field.negotiateBackendRepr(this);
    return field.toSQL(this)+' IN ('+value.map(function(item) { return backendField.clean(item) }).join(',')+')';
   },
  'gt':function(field, value) {
    var backendField = field.negotiateBackendRepr(this);
    return field.toSQL(this)+' > '+backendField.clean(value);
  },
  'gte':function(field, value) {
    var backendField = field.negotiateBackendRepr(this);
    return field.toSQL(this)+' >= '+backendField.clean(value);
  },
  'lt':function(field, value) {
    var backendField = field.negotiateBackendRepr(this);
    return field.toSQL(this)+' < '+backendField.clean(value);
  },
  'lte':function(field, value) {
    var backendField = field.negotiateBackendRepr(this);
    return field.toSQL(this)+' <= '+backendField.clean(value);
  },
  'startswith':function(field, value) {
    var backendField = field.negotiateBackendRepr(this);
    return field.toSQL(this)+' LIKE '+backendField.clean(value).modify(function(val) {
      return val+'%';
    });
  },
  'istartswith':function(field, value) {
    var backendField = field.negotiateBackendRepr(this);
    return 'UPPER('+field.toSQL(this)+') LIKE UPPER('+backendField.clean(value).modify(function(val) {
      return val+'%';
    })+')';
  },
  'endswith':function(field, value) {
    var backendField = field.negotiateBackendRepr(this);
    return field.toSQL(this)+' LIKE '+backendField.clean(value).modify(function(val) {
      return '%'+val;
    });
  },
  'iendswith':function(field, value) {
    var backendField = field.negotiateBackendRepr(this);
    return 'UPPER('+field.toSQL(this)+') LIKE UPPER('+backendField.clean(value).modify(function(val) {
      return '%'+val;
    })+')';
  },
  'range':function(field, value) {
    var backendField = field.negotiateBackendRepr(this);
    return field.toSQL(this)+' BETWEEN '+backendField.clean(value[0])+' and '+backendField.clean(value[1]);
  },
  'year':function(field, value) {
    var backendField = field.negotiateBackendRepr(this);

    var value_start = new Date(value + '-01-01 00:00:00'),
        value_end = new Date((parseInt(value, 10)+1) + '-12-31 23:59:59');

    return field.toSQL(this)+' BETWEEN '+backendField.clean(value_start)+' and '+backendField.clean(value_end);
  },
  'isnull':function(field, value) {
    var interp = value ? 'IS NULL' : 'IS NOT NULL';
    return field.toSQL(this)+' '+interp;
  }
};

BackendClass.prototype.parseColumn = function(fieldClause) {
  return '"'+fieldClause.alias.table+'"."'+fieldClause.alias.column+'"';
};

BackendClass.prototype.setConnectionManager = function(manager) {
  this.manager = manager;
  this.manager.on('start', this.createClient.bind(this));
  this.manager.on('end', this.closeClient.bind(this));
};

exports.BackendClass = BackendClass;

var CleanedValue = function(baseValue, cleaner) {
  this.value = baseValue;
  this.cleaner = cleaner;
};

CleanedValue.prototype.toString = function() {
  return this.cleaner(this.value);
};

CleanedValue.prototype.modify = function(how) {
  this.value = how(this.value);
  return this;
};

CleanedValue.prototype.valueOf = function() {
  return this.cleaner(this.value);
};

var BaseField = function(backend, params) {
  this.backend = backend;
  Object.keys(params).forEach(function(key) {
    this[key] = params[key];
  }.bind(this));
};

BaseField.prototype.clean = function(value) {
  if(value instanceof parser.FieldClause) {
    return new CleanedValue(value, value.toSQL.bind(value, this.backend));
  }

  return new CleanedValue(value, this.parse_clean.bind(this));
};

BaseField.prototype.repr = function() {
  return this.parse_repr();
};

BaseField.prototype.pad = function(value, by, withValue) {
  by === undefined &&
    (by = 2);

  withValue === undefined &&
    (withValue = '0');

  var valueStr = value.toString();
  while(valueStr.length < by) {
    valueStr = withValue + valueStr; 
  }
  return valueStr;
};

BaseField.subclass = function(options) {
  var output = {};
  Object.keys(options).forEach(function(key) {
    if(key.search(/Format$/) !== -1) {
      var value = options[key].slice(),
          chunk = null,
          bits = [];

      while(value.length && (chunk = (/{.*?}/g)(value))) {
        if(chunk.index) {
          bits.push((function(str) {
              return function() {
                return str;
              }
          })(value.slice(0, chunk.index)));
        }

        bits.push(new Function('return '+chunk[0].replace(/\$(\d+)/g, function() { 
            return 'arguments['+arguments[1]+']'; 
          }).slice(1,-1)+';')
        );
        value = value.slice(chunk.index + chunk[0].length); 
      }

      if(value.length) {
        bits.push((function(str) {
          return function() {
            return str;
          };
        })(value));
      }

      this['parse_'+key.replace(/Format/g, '')] = function() {
        var args = arguments;
        return bits.map(function(bit) {
          return bit.apply(this, args);
        }.bind(this)).join('');
      };
    } else {
      output[key] = options[key];
    }
  }.bind(output));

  return function(backend) {
    return function(params) {
      var obj = new BaseField(backend, params);
      Object.keys(output).forEach(function(key) {
        this[key] = output[key];
      }.bind(obj));
      return obj;
    };
  };
};

exports.BaseField = BaseField;
