var fieldBase = require('ormnomnom/fields/base'),
    Field = fieldBase.Field,
    AutoField = fieldBase.AutoField,
    IntegerField = fieldBase.IntegerField,
    EventEmitter = require('events').EventEmitter,
    Model = require('ormnomnom/model/base').Model;

var OneToManyRelation = function(fromField, to, toField) {
  this.fromField = fromField;
  this.to = to;
  this.toField = toField;
};

var ManyToOneRelation = function(fromField, to, toField) {
  this.fromField = fromField;
  this.to = to;
  this.toField = toField;
};

var ManyToManyRelation = function(fromField, to, toField) {
  this.fromField = fromField;
  this.to = to;
  this.toField = toField;
};

var OneToOneRelation = function(fromField, to, toField) {
  this.fromField = fromField;
  this.to = to;
  this.toField = toField;
};

var ForeignKey = Field.subclass(function(to, kwargs) {
  this.contributeToClass = function(name, model) {
    this.getColumnName = function() { return name+'_id'; };
    Field.prototype.contributeToClass.apply(this, [name, model]);

    var listenFor = typeof(to) === 'string' ?
      to :
      to._meta.model_name;
    Model.events.on('model:'+listenFor, this.setupRelation.bind(this, kwargs, name, model));

    //typeof(to) === 'string' && Model.events.on('model:'+to, this.setupRelation.bind(this, kwargs, name, model)) || this.setupRelation(kwargs, name, model, to);
  };
});

ForeignKey.prototype.setupRelation = function(kwargs, fieldName, onModel, to) {
  var targetFieldName = kwargs.to_field || 'pk',
      targetField = to._meta.getFieldByName(targetFieldName);

  var negotiate;
  if(targetField instanceof AutoField) {
    negotiate = IntegerField.prototype.negotiateBackendRepr.bind(targetField); 
  } else {
    negotiate = targetField.negotiateBackendRepr.bind(targetField);
  }
  this.negotiateBackendRepr = function() {
    var repr = negotiate.apply(this, arguments);
    return repr;
  };
  this.getLookupValue = function(initial) {
    if(!(initial instanceof onModel)) {
      throw new Error("Lookup value must be instance of target model!");
    }
    return initial[targetFieldName];
  };

  var relatedName = kwargs.related_name || this.model._meta.model_name.toLowerCase() + '_set',
      nameAvailable = false;
  try {
    onModel._meta.getFieldByName(relatedName);
  } catch(err) {
    nameAvailable = true;
  }
  if(!nameAvailable) throw new Error("Name '"+relatedName+"' is already registered on '"+onModel.modelName+"'.");

  //onModel._meta.addRelatedField(new OneToManyRelation(this, to, targetField));
  this.rel = new ManyToOneRelation(this, to, targetField);
};

var ManyToManyField = Field.subclass(function(to, kwargs) {

});

var OneToOneField = Field.subclass(function(to, kwargs) {

});

exports.ForeignKey = ForeignKey;
exports.ManyToManyField = ManyToManyField;
exports.OneToOneField = OneToOneField;
