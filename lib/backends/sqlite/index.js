var sqlite = require('sqlite'),
    EventEmitter = require('events').EventEmitter,
    BaseBackend = require('ormnomnom/backends/base').BackendClass,
    util = require('util'),
    parser = require('ormnomnom/model/parser'),
    WhereNode = parser.WhereNode,
    WhereClause = parser.WhereClause,
    FieldClause = parser.FieldClause;

var BackendClass = function() {
};

BackendClass.prototype = new BaseBackend();

BackendClass.prototype.supportsAutoincrement = function() {
  return false;
};

BackendClass.prototype.types = require('ormnomnom/backends/sqlite/fields');
BackendClass.prototype.createClient = function(using) {
  var opts = require('ormnomnom/settings')[using];

  this.client = new sqlite.Database();
  this.client.open(opts.database, function(err) {
    if(err) {
      this.manager.receiveConnectionError(this, err);
    }
  }.bind(this));
};

BackendClass.prototype.closeClient = function() {
  this.client && this.client.close(function() {
      
  });
  this.client = null;
};

BackendClass.prototype.processUPDATEData = function(model, data, cb) {
  cb(null, data.affectedRows);
};

BackendClass.prototype.processDELETEData = function(model, data, cb) {
  cb(null, data.affectedRows);
};

BackendClass.prototype.processINSERTData = function(model, data, cb) {
  model.objects.get({pk__exact:data.lastInsertRowID})(cb);
};

BackendClass.prototype.query = function(type, query) {
  var ee = new EventEmitter();
  this.manager.receiveQueryEvent(this);
  if(!this.client) {
    setTimeout(function() {
      ee.emit('error', new Error("No client available"));
    });
    return ee;
  }

  var qstr = this.buildQuery(query),
      op = query.qs._operation.toString(),
      model = query.qs.model,
      self = this,
      getAffectedRows = (op === 'UPDATE' || op === 'DELETE'),
      lastInsertRowId = (op === 'INSERT'),
      useStep = getAffectedRows || lastInsertRowId;

  this.client.prepare(qstr, {lastInsertRowID:lastInsertRowId, affectedRows:getAffectedRows}, function(err, statement) {
    if(err) { ee.emit('error', err); } else {
      if(useStep) {
        statement.step(function(err, row) {
          if(err) { ee.emit('error', err); } else {
            self.processRowData(model, op, this, function(err, data) {
              if(err) ee.emit('error', err); else {
                ee.emit('data', data);
              };
              statement.finalize(function(err) {
                err && ee.emit('error', err);
                ee.emit('end', err, data);
              });
            });
          }
        });
      } else {
        statement.fetchAll(function(err, rows) {
          if(err) { ee.emit('error', err); } else { 
            statement.finalize(function(err) {
              if(err) { ee.emit('error', err); } else {
                rows.forEach(function(row, ind) {
                  var processed = [];
                  self.processRowData(model, op, row, function(err, data) {
                    processed.push(data);
                    ee.emit('data', data); 
                    if(ind === rows.length-1) {
                      ee.emit('end', null, processed);
                    }
                  });
                }.bind(this));
              }
            });
          }
        });
      }
    }
  });

  return ee;
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


  var selectFields = query.selectFields && query.selectFields.length ? query.selectFields.map(function(field) {
    return field.toSQL(this);
  }.bind(this)) : ['*'];
  tbl_clause.unshift('SELECT ' + selectFields.join(', '));
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

  return 'INSERT INTO "'+opts.getTableName()+'" ("'+columns.join('", "')+'") VALUES ('+values.join(', ') +')';
};

BackendClass.prototype.buildDELETEQuery = function(query) {
  query.selectFields = [new FieldClause(query.root, query.qs.model._meta.getFieldByName('pk'))];
  var innerQuery = this.buildSELECTQuery(query);

  var qstr = 'DELETE FROM "'+query.root+'" ' +
             'WHERE '+query.qs.model._meta.getFieldByName('pk').getColumnName()+' IN ('+innerQuery+')';
  return qstr;
};

BackendClass.prototype.buildUPDATEQuery = function(query) {
  query.selectFields = [new FieldClause(query.root, query.qs.model._meta.getFieldByName('pk'))];
  var innerQuery = this.buildSELECTQuery(query),
      op = query.qs._operation,
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

  var qstr = 'UPDATE "'+query.root+'" SET ' +
             (setClauses.join(', ')) +
             ' WHERE '+query.qs.model._meta.getFieldByName('pk').getColumnName()+' IN ('+innerQuery+')'; 

  return qstr;
};

exports.Backend = new BackendClass();
