var fields = require('ormnomnom/fields'),
    Manager = require('ormnomnom/model/manager').Manager,
    EventEmitter = require('events').EventEmitter;

var ModelMeta = function(name, model) {
  this.model_name = name;
  this.model = model;
  this.fields = {};
  this.fieldsByColumnName = {};
  this.aliasFields = {};
};

ModelMeta.prototype.getTableName = function() {
  return this.model_name.toLowerCase();
};

ModelMeta.prototype.decodeData = function(instance, data) {
  Object.keys(data).forEach(function(key) {
    instance[key] = data[key];
  });
};

ModelMeta.prototype.getFieldByName = function(name) {
  var ret = this.fields[name];

  !ret && (ret = this.aliasFields[name]);
  if(ret) return ret; 
  else {
    throw new Error("No such field "+name);
  }
};

ModelMeta.prototype.getOrdering = function() {
  return this.ordering || null; 
};

ModelMeta.prototype.getFieldNames = function() {
  return Object.keys(this.fields);
};

ModelMeta.prototype.aliasField = function(field, toName) {
  this.aliasFields[toName] = field;
};

ModelMeta.prototype.addField = function(name, field) {
  field.contributeToClass(name, this.model);
  this.fields[name] = field;
  this.fieldsByColumnName[field.getColumnName()] = field;
};

var Model = function(name, options) {
  var needsAutoField = true;

  var meta = new ModelMeta(name, this);
  this._meta = meta;

  Object.keys(options).forEach(function(key) {
    meta.addField(key, options[key]);
    if(options[key].isPrimaryKey()) {
      needsAutoField = false;
      this.setPrimaryKey(options[key]);
    }
  }.bind(this));

  if(needsAutoField) {
    var autoField = fields.AutoField();
    meta.addField('id', autoField);
    this.setPrimaryKey(autoField);
  }
};

Model.prototype.setPrimaryKey = function(field) {
  this._meta.aliasField(field, 'pk'); 
};

Model.define = function(name, opts) {
  var ModelInstance = function(data) {
    ModelInstance._meta.decodeData(this, data);
  };

  ModelInstance.prototype = new Model(name, opts);
  ModelInstance.objects = new Manager(ModelInstance);
  ModelInstance.meta = function(opts) {
    Object.keys(opts).forEach(function(key) {
      this[key] = opts[key];
    }.bind(this._meta));
  };
  ModelInstance._meta = ModelInstance.prototype._meta;

  Model.events.emit('model', ModelInstance); 
  Model.events.emit('model:'+ModelInstance._meta.model_name, ModelInstance); 
  return ModelInstance;
};

Model.events = new EventEmitter();

Model.events.emit = function(what, instance) {
  var bits = what.split(':').slice(1).join(':');
  if(bits.length) {
    this.models = this.models || {};
    this.models[bits] = instance;
  }
  EventEmitter.prototype.emit.apply(this, arguments);
};

Model.events.on = function(what, cb) {
  var bits = what.split(':').slice(1).join(':');
  if(bits.length) {
    this.models = this.models || {};
    if(this.models[bits]) {
      cb(this.models[bits]);
      return;
    }
  } else {
    EventEmitter.prototype.on.apply(this, arguments);
  }
};

exports.Model = Model;
exports.ModelMeta = ModelMeta;
