var EventEmitter = require('events').EventEmitter,
    QuerySet = require('ormnomnom/model/queryset').QuerySet;

var Manager = function(model) {
  this.model = model;
};

Manager.prototype.getBaseQuerySet = function() {
  return new QuerySet(this.model);
};

Manager.prototype.createTable = function(using) {
  using = using || 'default';
  var settings = require('ormnomnom/settings'),
      opts = settings[using];

  var backend = require(opts.backend).Backend;
  return backend.createTable(this.model);
};

Manager.prototype.all = function() {
  var qs = this.getBaseQuerySet();
  return qs.filter({});
};

Manager.prototype.filter = function(kwargs) {
  return this.getBaseQuerySet().filter(kwargs);
};

Manager.prototype.create = function(kwargs) {
  return this.getBaseQuerySet().create(kwargs);
};

Manager.prototype.get = function(kwargs) {
  var self = this,
      ee = new EventEmitter(),
      filter = this.filter(kwargs);

  filter.on('error', ee.emit.bind(ee, 'error'));
  filter.on('end', function(err, data) {
    if(!err) ee.emit('end', err, data[0]);
  });
  filter.on('data', ee.emit.bind(ee, 'data')); 

  var retVal = function(cb) {
    retVal.__proto__.on('end', cb);
  };
  retVal.__proto__ = ee;
  return retVal;
};

Manager.prototype.count = function() {
  var qs = this.getBaseQuerySet(),
      ee = new EventEmitter();
  qs.on('data', function(data) {
    ee.emit('data', data.length);
  });

  qs.on('error', ee.emit.bind(ee, 'error'));
  qs.on('end', function(err, data) {
    err && ee.emit('error', err) || ee.emit('data', data.length);
  });

  var retVal = function(cb) {
    retVal.__proto__.on('end', cb);
  };
  retVal.__proto__ = ee;
  return retVal;
};

Manager.prototype.getOrCreate = function(kwargs) {
  var item = this.getBaseQuerySet().get(kwargs),
      ee = new EventEmitter(),
      self = this;

  item.on('error', function(err) {
      var result = self.create(kwargs);
      result.on('error', ee.emit.bind(ee, 'error'));
      result.on('data', ee.emit.bind(ee, 'data'));
      result.on('end', ee.emit.bind(ee, 'end'));
  });

  item.on('data', function(data) {
     ee.emit('data', data);
     ee.emit('end', null, data);
  });

  var retVal = function(callback) {
    retVal.__proto__.on('end', callback);
    return ee;
  };
  retVal.__proto__ = ee;
  return retVal;
};

exports.Manager = Manager;
