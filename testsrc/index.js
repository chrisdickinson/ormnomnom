require('coffee-script');

var models = require('../').models;

models.configure('default', {
    'sqlite':{backend:'ormnomnom/lib/backends/sqlite', name:':memory:'},
    'postgres':{backend:'ormnomnom/lib/backends/postgres', name:'test_ormnomnom'},
    'mysql':{backend:'ormnomnom/lib/backends/mysql', name:'test_ormnomnom'}
}[process.env.TESTING_BACKEND || 'postgres']);

var export_module = function(module_name) {
  var mod = require('./'+module_name);
  for(var key in mod) {
    exports[module_name+': '+key] = mod[key];
  }
};

export_module('models');
export_module('filters');
