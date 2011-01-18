var Field = function(kwargs) {
  this.validators = [];
  this.nullable = kwargs.nullable === undefined ? false : kwargs.nullable;
  this.unique = kwargs.unique === undefined ? false : kwargs.unique;
  this.index = kwargs.index === undefined ? false : kwargs.index;
  this.default = kwargs.default;
  this.always = kwargs.always;
  this.primary_key = kwargs.primary_key;
  if(!kwargs.nullable) {
    this.addValidation(function(value) {
      if(value === undefined || value === null) {
        throw new Error(this.name+' must not be null');
      }
    });
  }
};

Field.prototype.getDefault = function() {
  return this.default instanceof Function ?
    this.default() :
    this.default;
};

Field.prototype.hasRelation = function() {
  return this.rel !== undefined;
};

Field.prototype.contributeToClass = function(name, model) {
  this.name = name;
  this.model = model;
};

Field.prototype.getColumnName = function() {
  return this.name;
};

Field.prototype.isPrimaryKey = function() {
  return this.primary_key;
};

Field.prototype.addValidation = function(callback) {
  this.validators.push(callback);
};

Field.prototype.negotiateBackendRepr = function(backend) {
  throw new Error("Not Implemented");
};

Field.prototype.getLookupValue = function(initial) {
  return initial.valueOf();
};

Field.prototype.validate = function(value) {
  this.validators.forEach(function(validator) {
    validator.bind(this)(value);
  }.bind(this));
  return true;
};

Field.subclass = function(cb) {
  if(!cb.length) throw Error("Subclass must take kwargs at the very least.");

  var F = function() {
    var args = Array.prototype.slice.call(arguments);

    var self = this.constructor === F ? this : (function() {
      var lF = function() { this.constructor = F; return F.apply(this, args); };
      lF.prototype = F.prototype;
      return new lF();
    })();

    var kwargs = args[cb.length-1] || {};
    args[cb.length-1] = kwargs;
    Field.apply(self, [kwargs]);
    cb.apply(self, args);
    return self;
  };

  F.prototype = Object.create(Field.prototype);
  F.base = cb;
  return F;
};

var CharField = Field.subclass(function(kwargs) {
  if(!kwargs.max_length) 
    throw new Error("CharFields require a keyword argument of `max_length`.");

  this.max_length = kwargs.max_length; 
  this.addValidation(function(value) {
    return Buffer.byteLength(value, 'utf8') < this.max_length;
  }.bind(this));
});

CharField.prototype.negotiateBackendRepr = function(backend) {
  return backend.getType('VARCHAR')({
    max_length:this.max_length,
    nullable:this.nullable,
    unique:this.unique,
    index:this.index,   
  });
};

var IntegerField = Field.subclass(function(kwargs) {
  this.addValidation(function(value) {
    if(isNaN(value) || ~~value) {
      throw new Error("Number must be an integer.");
    }
  });
});

IntegerField.prototype.negotiateBackendRepr = function(backend) {
  return backend.getType('INTEGER')({
    nullable:this.nullable,
    unique:this.unique,
    index:this.index,
  });
};

var TextField = Field.subclass(function(kwargs) {
  this.nullable = kwargs.nullable === undefined ? true : kwargs.nullable; 
});

TextField.prototype.negotiateBackendRepr = function(backend) {
  return backend.getType('TEXT')({
    nullable:this.nullable,
    unique:this.unique,
    index:this.index,
  });
};

var BooleanField = Field.subclass(function(kwargs) {
});

BooleanField.prototype.negotiateBackendRepr = function(backend) {
  return backend.getType('BOOLEAN')({
    nullable:this.nullable,
    unique:this.unique,
    index:this.index,
  });
};

var URLField = Field.subclass(function(kwargs) {
  kwargs.max_length = kwargs.max_length || 255;
  CharField.apply(this, [kwargs]);
  this.addValidation(function(value) {
    // barf
    var validator = /^https?:\/\/(?:(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,6}\.?|localhost|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(?::\d+)?(?:\/?|[\/?]\S+)$/i;
    if(!validator(value)) {
      throw new Error("Value must be a valid URL.");
    }
  });

});
URLField.__proto__ = Object.create(CharField.prototype);

var SlugField = Field.subclass(function(kwargs) {
  kwargs.max_length = kwargs.max_length || 100;
  CharField.base.apply(this, [kwargs]);

  this.addValidation(function(value) {
    var validator = /^[-\w]+$/g;
    if(!validator(value)) {
      throw new Error("Valid slugs are comprised of letters, numbers, underscores and hyphens only.");
    }
  });
});

Object.keys(CharField.prototype).forEach(function(key) {
  SlugField.prototype[key] = CharField.prototype[key];
});

var PositiveIntegerField = Field.subclass(function(kwargs) {
  IntegerField.base.apply(this, [kwargs]);
  this.addValidation(function(value) {
    if(parseInt(value, 10) < 0) {
      throw new Error("Values must be greater than or equal to zero.");
    }
  });
});

Object.keys(IntegerField.prototype).forEach(function(key) {
  PositiveIntegerField.prototype[key] = IntegerField.prototype[key];
});

var AutoField = Field.subclass(function(kwargs) {
  this.autoincrement = kwargs.autoincrement === undefined ? true : kwargs.autoincrement;
  this.primary_key = true;

  PositiveIntegerField.base.apply(this, [kwargs]);
});

Object.keys(PositiveIntegerField.prototype).forEach(function(key) {
  AutoField.prototype[key] = PositiveIntegerField.prototype[key];
});

AutoField.prototype.negotiateBackendRepr = function(backend) {
  return backend.getType('ID', 'INTEGER')({
    nullable:false,
    unique:false,
    index:true,
    autoincrement:this.autoincrement
  });
};

var BigIntegerField = Field.subclass(function(kwargs) {
  IntegerField.apply(this, [kwargs]);
});

BigIntegerField.prototype.negotiateBackendRepr = function(backend) {
  return backend.getType('BIGINTEGER')({
    nullable:this.nullable,
    unique:this.unique,
    index:this.index,
  });
};

var DateField = Field.subclass(function(kwargs) {
  this.addValidation(function(value) {
    if(isNaN(Date.parse(value))) {
      throw new Error("Value must be Date.parse'able.");
    }
  });
});

DateField.prototype.negotiateBackendRepr = function(backend) {
  return backend.getType('DATE')({
    nullable:this.nullable,
    unique:this.unique,
    index:this.index,
  });
};

var DateTimeField = Field.subclass(function(kwargs) {
  DateField.apply(this, [kwargs]);
});

DateTimeField.prototype.negotiateBackendRepr = function(backend) {
  return backend.getType('DATETIME')({
    nullable:this.nullable,
    unique:this.unique,
    index:this.index
  });
};

var DecimalField = Field.subclass(function(kwargs) {
  if(isNaN(parseInt(kwargs.max_digits, 10)))      throw new Error("Must provide max_digits.");
  if(isNaN(parseInt(kwargs.decimal_places, 10)))  throw new Error("Must provide decimal_places.");

  this.max_digits = ~~kwargs.max_digits;
  this.decimal_places = ~~kwargs.decimal_places;

  this.addValidation(function(value) {
    if(isNaN(Number(value))) { 
      throw new Error("Value must be a number.");
    }
  });
});

DecimalField.prototype.negotiateBackendRepr = function(backend) {
  return backend.getType('DECIMAL')({
    nullable:this.nullable,
    unique:this.unique,
    index:this.index,
    max_digits:this.max_digits,
    decimal_places:this.decimal_places
  });
};

var EmailField = Field.subclass(function(kwargs) {
  kwargs.max_length = kwargs.max_length || 75;
  CharField.apply(this, [kwargs]);

  this.addValidation(function(value) {
    // oh jesus christ. validate email addresses? vom vom vom
    // punting on this one for now.
  });
});

EmailField.__proto__ = Object.create(CharField.prototype);

var FileField = Field.subclass(function(kwargs) {
  kwargs.max_length = kwargs.max_length || 255;
  CharField.apply(this, [kwargs]);
});

FileField.__proto__ = Object.create(CharField.prototype);

FileField.prototype.contributeToClass = function(name, model) {
  // ooo, do some magic.
};

exports.CharField = CharField;
exports.IntegerField = IntegerField;
exports.TextField = TextField;
exports.BooleanField = BooleanField;
exports.URLField = URLField;
exports.AutoField = AutoField;
exports.BigIntegerField = BigIntegerField;
//exports.CommaSeparatedIntegerField = CommaSeparatedIntegerField;
exports.DateField = DateField;
exports.DateTimeField = DateTimeField;
exports.DecimalField = DecimalField;
exports.EmailField = EmailField;
//exports.FileField = FileField;
//exports.FilePathField = FilePathField;
//exports.FloatField = FloatField;
//exports.ImageField = ImageField;
exports.IntegerField = IntegerField;
//exports.IPAddressField = IPAddressField;
//exports.NullBooleanField = NullBooleanField;
//exports.PositiveIntegerField = PositiveIntegerField;
//exports.PositiveSmallIntegerField = PositiveSmallIntegerField;
exports.SlugField = SlugField;
//exports.SmallIntegerField = SmallIntegerField;
exports.TextField = TextField;
//exports.TimeField = TimeField;
exports.URLField = URLField;
//exports.XMLField = XMLField;

exports.Field = Field;
