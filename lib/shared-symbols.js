'use strict'

module.exports = {
  privateAPI: Symbol('private-api'),
  queryEvent: Symbol('queryEvent'),
  clsToDAO: Symbol('cls-to-dao'),
  querySet: Symbol('queryset'),
  fkField: Symbol('fk-field'),
  colField: Symbol('col-field'),
  cleanup: function () {
    this.queryEvent =
    this.privateAPI =
    this.clsToDAO =
    this.querySet =
    this.colField =
    this.fkField = null
  }
}
