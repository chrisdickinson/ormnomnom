'use strict';

const Iron = require('@hapi/iron');


module.exports = function(schema, cryptoOpts) {
  cryptoOpts.iron = cryptoOpts.iron
    ? { ...Iron.defaults, ...cryptoOpts.iron }
    : { ...Iron.defaults };

  return orm.col(schema, {
    encode (appData) {
      return Iron.seal(appData, cryptoOpts.password, cryptoOpts.iron)
    },
    decode (dbData) {
      return Iron.unseal(dbData, cryptoOpts.password, cryptoOpts.iron)
    },
    encodeQuery (appData) {
      return Iron.seal(appData, cryptoOpts.password, cryptoOpts.iron)
    }
  });
}
