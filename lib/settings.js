exports.setSettings = function(opts) {
  Object.keys(opts).forEach(function(key) {
    this[key] = opts[key]; 
  }.bind(exports));
};

exports.setConnectionManager = function(using, manager) {
  var backend = require(exports[using].backend).Backend;
  backend.setConnectionManager(manager);
};
