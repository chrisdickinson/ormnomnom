var mysql = require('mysql'),
    EventEmitter = require('events').EventEmitter,
    BaseBackend = require('ormnomnom/backends/base').BackendClass,
    util = require('util');

var BackendClass = function() {
};

BackendClass.prototype.createClient = function(using) {
  var opts = require('ormnomnom/settings')[using];

  this.client = new mysql.Client();
  Object.keys(opts).forEach(function(key) {
    this[key] = opts[key];
  }.bind(this.client));

  this.client.connect(function(err) {
    if(err) {
      this.manager.receiveConnectionError(this, err);
    }
  }.bind(this));
};

BackendClass.prototype.closeClient = function() {
  this.client && this.client.end(function(err) {
    if(err) {
      this.client.destroy();
    }   
    this.client = null;
  }.bind(this));
};
