var EventEmitter = require('events').EventEmitter,
    inherits = require('util').inherits;

var QuerySet = function(model) {
  EventEmitter.call(this);
  this.model = model;

  var listenCount = 0;

  this.timeout = null;
  this.errors = [];
  this._operation = null;
  this.setOperation(QuerySet.Select);
  this._using = 'default';
  this.hasListeners = false;
};

inherits(QuerySet, EventEmitter);

QuerySet.prototype.on = function() {
  if(this._resultCache) {
    // we've already fired, so send the results
    // to the listener.
    var evName = arguments[0],
        callback = arguments[1];

    if(evName === 'end') callback(this._resultCache.err, this._resultCache.data);
    else {
      callback(this._resultCache[evName]);
    }
  }
  var ret = EventEmitter.prototype.on.apply(this, arguments);

  !this.timeout &&
    (this.timeout = setTimeout(this.execute.bind(this)));
  return this;
};

QuerySet.prototype.using = function(dbname) {
  this._using = dbname;
};

QuerySet.prototype.box = function() {
  var retVal = function(cb) {
    retVal.__proto__.on('error', cb);
    retVal.__proto__.on('end', cb);
    return retVal;
  };
  retVal.__proto__ = this;
  retVal.apply = Function.prototype.apply;
  retVal.call = Function.prototype.call;
  retVal.on = this.on.bind(this);
  retVal.unbox = function() {
    return retVal.__proto__;
  };
  return retVal;
};

QuerySet.prototype.unbox = function() {
  return this;
};

QuerySet.prototype.filter = function(kwargs) {
  var self = this.unbox();
  self.setOperation(QuerySet.Select);
  self.operation(kwargs); 
  return self.box();
};

QuerySet.prototype.create = function(kwargs) {
  var self = this.unbox();
  self.setOperation(QuerySet.Create);
  self.operation(kwargs);
  return self.box();
};

QuerySet.prototype.setError = function(error) {
  this.errors.push(error);
};

QuerySet.prototype.exclude = function() {
  var self = this.unbox();
  self.operation('exclude', Array.prototype.slice.call(arguments));
  return self.box();
};

QuerySet.prototype.orderBy = function() {
  var self = this.unbox();
  self.operation('orderBy', Array.prototype.slice.call(arguments));
  return self.box();
};

QuerySet.prototype.only = function() {
  var self = this.unbox();
  self.operation('only', Array.prototype.slice.call(arguments));
  return self.box();
};

QuerySet.prototype.update = function(kwargs) {
  var self = this.unbox();
  self.setOperation(QuerySet.Update);
  self.operation(kwargs);
  return self.box();
};

QuerySet.prototype.delete = function() {
  var self = this.unbox();
  self.setOperation(QuerySet.Delete);
  return self.box();
};

QuerySet.prototype.setOperation = function(op) {
  // exit early if we're already in `op` mode
  if(this._operation instanceof op) return;

  var oldOp = this._operation,
      newOp = new op(this, oldOp);

  if(!newOp.okay(oldOp)) {
    this.setError(new Error("Cannot "+newOp+" "+oldOp+" querysets."));
  }
  this._operation = newOp;
};

QuerySet.prototype.operation = function(delegate) {
  if(!this.errors.length) {
    var target = typeof(delegate) === 'string' ? delegate : this._operation.mainOperation;
    var args = Array.prototype.slice.call(arguments, target === this._operation.mainOperation ? 0 : 1);

    if(this._operation[target]) {
      this._operation[target].apply(this._operation, args);
    } else {
      this.setError(new Error(this._operation+' queries do not support `'+target+'`'));
    }
  }
};

QuerySet.Create = function(qs, prevOp) {
  this.qs = qs;
  this.prevOp = prevOp;
  this.creationKwargs = {};
};

QuerySet.Create.prototype.mainOperation = 'pushCreationKwargs';

QuerySet.Create.prototype.pushCreationKwargs = function(kwargs) {
  Object.keys(kwargs).forEach(function(key) {
    this[key] = kwargs[key];
  }, this.creationKwargs);
};

QuerySet.Create.prototype.okay = function(oldOp) {
  // create can only be chained with other 'create' calls.
  var op = oldOp;
  while(op !== null) {
    if(!(op instanceof QuerySet.Create) && !(op instanceof QuerySet.Select))
      return false;
    op = op.prevOp;
  }
  return true;
};

QuerySet.Create.prototype.toString = function() {
  return 'INSERT';
};

QuerySet.Create.prototype.processData = function(data) {
  return new this.qs.model(data);
};

QuerySet.Delete = function(qs, prevOp) {
  this.qs = qs;
  this.prevOp = prevOp;
};

// delete is a no-op
QuerySet.Delete.prototype.mainOperation = '';

QuerySet.Delete.prototype.processData = function(data) {
  return parseInt(data, 10);
};

QuerySet.Delete.prototype.toString = function() {
  return 'DELETE';
};

QuerySet.Delete.prototype.okay = function(oldOp) {
  // delete is okay with SELECT
  var op = oldOp;
  while(op !== null) {
    if(!(op instanceof QuerySet.Select)) {
      return false;
    }
    op = op.prevOp;
  }
  return true;
};

QuerySet.Select = function(qs, prevOp) {
  this.qs = qs;
  this.prevOp = prevOp;
  this.filterKwargs = {};
  this.limits = [];
  this.orderBy = this.qs.model._meta.getOrdering();
  this.selectFields = this.qs.model._meta.getFieldNames();
};

QuerySet.Select.prototype.slice = function(from, num) {
  from !== undefined && (this.limits[0] = from);
  num !== undefined && (this.limits[1] = num);
};

QuerySet.Select.prototype.only = function() {
  var args = Array.prototype.slice.call(arguments);
  this.selectFields = this.qs.model._meta.getFieldNames().filter(function(field) {
    return args.indexOf(field) !== -1;
  });
};

QuerySet.Select.prototype.exclude = function() {
  var args = Array.prototype.slice.call(arguments);
  this.selectFields = this.qs.model._meta.getFieldNames().filter(function(field) {
    return args.indexOf(field) === -1;
  });
};

QuerySet.Select.prototype.orderBy = function() {
  var args = Array.prototype.slice.call(arguments);
  this.orderBy = args;
};

QuerySet.Select.prototype.okay = function(oldOp) {
  // select is okay with... well, select 
  var op = oldOp;
  while(op !== null) {
    if(!(op instanceof QuerySet.Select)) {
      return false;
    }
    op = op.prevOp;
  }
  return true;
};

QuerySet.Select.prototype.toString = function() {
  return 'SELECT'; 
};

QuerySet.Select.prototype.processData = function(data) {
  return new this.qs.model(data);
};

QuerySet.Select.prototype.mainOperation = 'pushSelectKwargs';

QuerySet.Select.prototype.pushSelectKwargs = function(kwargs) {
  Object.keys(kwargs).forEach(function(key) {
    this[key] = kwargs[key];
  }, this.filterKwargs);
}

QuerySet.Update = function(qs, prevOp) {
  this.qs = qs;
  this.prevOp = prevOp;
  this.updateKwargs = {};
};

QuerySet.Update.prototype.processData = function(data) {
  return parseInt(data, 10);
};

QuerySet.Update.prototype.mainOperation = 'pushUpdateKwargs';
QuerySet.Update.prototype.toString = function() { return 'UPDATE'; };
QuerySet.Update.prototype.okay = function(oldOp) {
  var op = oldOp;
  while(op !== null) {
    if(!(op instanceof QuerySet.Select) && !(op instanceof QuerySet.Update)) {
      return false;
    }
    op = op.prevOp;
  }
  return true;
};
QuerySet.Update.prototype.pushUpdateKwargs = function(kwargs) {
  Object.keys(kwargs).forEach(function(key) {
    this[key] = kwargs[key];
  }.bind(this.updateKwargs));
};

QuerySet.prototype.parse = require('ormnomnom/model/parser').parse;

QuerySet.prototype.execute = function() {
  var settings = require('ormnomnom/settings')
      opts = settings[this._using];
  
  if(!opts) {
    this.setError(new Error("Could not find '"+this.using+"' in DATABASES."));
  }

  this.on('end', function(err, data) {
    this._resultCache = {'err':err, 'data':data};
  }.bind(this));

  if(this.errors.length) {
    this.emit('error', this.errors[0]);
    this.emit('end', this.errors[0], null);
  } else {
    var backend = require(opts.backend),
        result = backend.Backend.query(this._operation.toString(), this.parse()),
        emittedEnd = 0,
        accum = [];

    result.on('data', function(data) {
      var obj = this._operation.processData(data);
      accum.push(obj);
      this.emit('data', obj);
    }.bind(this));

    result.on('error', function(err) {
      this.emit('error', err);
      ++emittedEnd && this.emit('end', err, null);
    }.bind(this));

    result.on('end', function(err, data) {
      if(!emittedEnd) this.emit('end', err, accum);
    }.bind(this));
  }
};


var getTarget = function(model, bits) {
  var field;
  do {
    field = model._meta.getFieldByName(bits.shift());
    
    if(field.rel) {
      model = field.rel.to;
      field = field.rel.toField;
    }
  } while(bits.length > 1);
  return {field:field, model:model};
};

var unrolled = function() {
  return function(bits, initial) {
    var target = getTarget(this.model, bits);
    return initial.map(function(value) {
      return target.field.getLookupValue(value);
    });
  };
}; 

var rolled = function() {
  return function(bits, initial) {
    return getTarget(this.model, bits, initial).field.getLookupValue(initial);
  };
};

QuerySet.Lookups = {
  // these are referenced from the base backend and
  // called in the context of the queryset where they've been found
  // -- so `this` ends up being a QuerySet instance.
  'exact':rolled(),
  'iexact':rolled(),
  'contains':rolled(),
  'icontains':rolled(),
  'in':unrolled(),
  'gt':rolled(),
  'gte':rolled(),
  'lt':rolled(),
  'lte':rolled(),
  'startswith':rolled(),
  'istartswith':rolled(),
  'endswith':rolled(),
  'iendswith':rolled(),
  'range':unrolled(),
  'year':rolled(),
  'month':rolled(),
  'day':rolled(),
  'week_day':rolled(),
  'isnull':rolled(),
  'search':rolled(),
  'regex':rolled(),
  'iregex':rolled(),
};

exports.QuerySet = QuerySet;
