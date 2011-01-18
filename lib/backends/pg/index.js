var pg = require('pg'),
    EventEmitter = require('events').EventEmitter,
    util = require('util'),
    BaseBackend = require('ormnomnom/backends/base').BackendClass,
    parser = require('ormnomnom/model/parser'),
    WhereNode = parser.WhereNode,
    WhereClause = parser.WhereClause,
    FieldClause = parser.FieldClause;

var BackendClass = function() {
};
BackendClass.prototype = new BaseBackend();

BackendClass.prototype.types = require('ormnomnom/backends/pg/fields');

BackendClass.prototype.query = function(type, query) {
  var ee = new EventEmitter();
  this.manager.receiveQueryEvent(this);
  if(!this.client) {
    setTimeout(function() {
      ee.emit('error', new Error("No client available"));
    });
    return ee;
  }

  this.client.on('error', function(err) {
    ee.emit('error', err);
    ee.emit('end', err);
  });

  try {
    var q = this.client.query(this.buildQuery(query)),
        rows = [],
        error = null;
  } catch(err) {
    setTimeout(function() {
      ee.emit('error', err);
    });
    return ee;
  }

  q.on('error', function(err) {
    error = null;
    setTimeout(function() {
      ee.emit('error', err);
    });
  });

  q.on('row', function(rowData) {
    this.processRowData(query.qs.model, query.qs._operation.toString(), rowData, function(err, data) {
      rows.push(data);
      ee.emit('data', data);
    });
  }.bind(this));

  q.on('end', function() {
    ee.emit('end', error, rows);
  });

  return ee;
};

BackendClass.prototype.createClient = function(using) {
  var opts = require('ormnomnom/settings')[using];
  this.client = new pg.Client(opts);
  this.client.on('error', this.manager.receiveConnectionError.bind(this.manager, this));
  this.client.on('drain', this.manager.receiveDrainEvent.bind(this.manager, this));
  this.client.connect();
};

BackendClass.prototype.closeClient = function() {
  this.client && this.client.end();
  this.client = null;
};

BackendClass.prototype.buildSELECTQuery = function(query) {
  var tbl_clause = ['FROM "'+query.root+'" "'+query.root.getAliasedName()+'"'],
      join_clause = query.nullable ? 'LEFT OUTER JOIN' : 'LEFT JOIN';

  query.root.children.forEach(function(join) {
    tbl_clause.push(join_clause+' "'+join.childSource+'" "'+join.childSource.getAliasedName()+'" ON ('+join.parentField.toSQL(this)+' = '+join.childField.toSQL(this)+')');
    join.childSource.children.forEach(arguments.callee);
  }.bind(this));

  var where = query.tree.toSQL(this);
  where && (where = ' WHERE '+where) || (where='');

  tbl_clause.unshift('SELECT *');
  return tbl_clause.join(' ')+where;
};

BackendClass.prototype.buildINSERTQuery = function(query) {
  var creationKwargs = query.qs._operation.creationKwargs,
      model = query.qs.model,
      opts = model._meta,
      columns = [],
      values = [];

  Object.keys(opts.fields).forEach(function(key) {
    var field = opts.getFieldByName(key),
        value = creationKwargs[key] || field.getDefault();

    if(query.qs.force || !field.autoincrement) {
      if(value !== undefined && field.validate(value)) {
        columns.push(field.getColumnName());
        values.push(field.negotiateBackendRepr(this).clean(value)); 
      }
    }
  }.bind(this));

  var pkField = opts.getFieldByName('pk');
  return 'INSERT INTO "'+opts.getTableName()+'" ("'+columns.join('", "')+'") VALUES ('+values.join(', ') +') RETURNING "'+opts.getTableName()+'"."'+pkField.getColumnName()+'"';
};

BackendClass.prototype.processINSERTData = function(model, data, cb) {
  model.objects.get({pk__exact:data[model._meta.getFieldByName('pk').name]})(cb);
};

BackendClass.prototype.buildDELETEQuery = function(query) {
  var whereClauses = [],
      fromTables = [],
      setClauses = [];

  query.root.children.forEach(function(join) {
    whereClauses.push(new WhereClause(
      join.parentField,
      'exact',
      join.childField
    ));
    fromTables.push('"'+join.childSource+'" "'+join.childSource.getAliasedName()+'"');
    join.childSource.children.forEach(arguments.callee);
  });

  var whereNode = whereClauses.length ? 
    new WhereNode(query.root, [new WhereNode(query.root, whereClauses), query.tree]) :
    query.tree;

  var qstr = 'DELETE FROM "'+query.root+'" "'+query.root.getAliasedName()+'"' +
             (fromTables.length ? ' USING '+fromTables.join(', ') : '') +
             (whereNode.children.length ? ' WHERE ' +whereNode.toSQL(this) : ''); 

  return qstr;
};

BackendClass.prototype.buildUPDATEQuery = function(query) {
  var whereClauses = [],
      fromTables = [],
      setClauses = [];

  query.root.children.forEach(function(join) {
    whereClauses.push(new WhereClause(
      join.parentField,
      'exact',
      join.childField
    ));
    fromTables.push('"'+join.childSource+'" "'+join.childSource.getAliasedName()+'"');
    join.childSource.children.forEach(arguments.callee);
  });

  var op = query.qs._operation,
      kwargs = {},
      setClauses = [];
  while(op !== null) {
    op.updateKwargs && Object.keys(op.updateKwargs).forEach(function(key) {
      kwargs[key] === undefined && (function() {
        var field = query.qs.model._meta.getFieldByName(key);
        if(field.validate(op.updateKwargs[key])) {
          kwargs[key] = true;
          var value = field.negotiateBackendRepr(this).clean(op.updateKwargs[key]);
          setClauses.push(field.getColumnName() + ' = ' + value);
        }
      }.bind(this))();
    }.bind(this));

    op = op.prevOp; 
  }


  var whereNode = whereClauses.length ? 
    new WhereNode(query.root, [new WhereNode(query.root, whereClauses), query.tree]) :
    query.tree;

  var qstr = 'UPDATE "'+query.root+'" "'+query.root.getAliasedName()+'" SET ' +
             (setClauses.join(', ')) + 
             (fromTables.length ? ' FROM '+fromTables.join(', ') : '') +
             (whereNode.children.length ? ' WHERE ' +whereNode.toSQL(this) : ''); 

  return qstr;
};

BackendClass.prototype.Lookups = Object.create(BackendClass.prototype.Lookups);
BackendClass.prototype.Lookups.iexact = function(field, value) {
  var backendField = field.negotiateBackendRepr(this);
  return 'UPPER("'+field.alias.table+'"."'+field.alias.column+'"::text) = UPPER('+backendField.clean(value)+')';
};

BackendClass.prototype.Lookups.icontains = function(field, value) {
  var backendField = field.negotiateBackendRepr(this);
  return 'UPPER("'+field.alias.table+'"."'+field.alias.column+'"::text) LIKE UPPER('+backendField.clean(value).modify(function(val) {
    return '%'+val+'%';
  })+')';
};

BackendClass.prototype.Lookups.istartswith = function(field, value) {
  var backendField = field.negotiateBackendRepr(this);
  return 'UPPER("'+field.alias.table+'"."'+field.alias.column+'"::text) LIKE UPPER('+backendField.clean(value).modify(function(val) {
    return val+'%';
  })+')';
};

BackendClass.prototype.Lookups.iendswith = function(field, value) {
  var backendField = field.negotiateBackendRepr(this);
  return 'UPPER("'+field.alias.table+'"."'+field.alias.column+'"::text) LIKE UPPER('+backendField.clean(value).modify(function(val) {
    return '%'+val;
  })+')';
};

BackendClass.prototype.Lookups.month = function(field, value) {
  var backendField = field.negotiateBackendRepr(this);
  return 'EXTRACT(\'month\' FROM "'+field.alias.table+'"."'+field.alias.column+'") = EXTRACT(\'month\' FROM '+backendField.clean(value)+')';
};

BackendClass.prototype.Lookups.day = function(field, value) {
  var backendField = field.negotiateBackendRepr(this);
  return 'EXTRACT(\'day\' FROM "'+field.alias.table+'"."'+field.alias.column+'") = EXTRACT(\'day\' FROM '+backendField.clean(value)+')';
};

BackendClass.prototype.Lookups.week_day = function(field, value) {
  var backendField = field.negotiateBackendRepr(this);
  return 'EXTRACT(\'dow\' FROM "'+field.alias.table+'"."'+field.alias.column+'") = EXTRACT(\'dow\' FROM '+backendField.clean(value)+')';
};

exports.Backend = new BackendClass();
