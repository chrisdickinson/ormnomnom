var base = require('ormnomnom/fields/base'),
    related = require('ormnomnom/fields/related');

Object.keys(base).forEach(function(key) {
  exports[key] = base[key];
});

Object.keys(related).forEach(function(key) {
  exports[key] = related[key];
});
