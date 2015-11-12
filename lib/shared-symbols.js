'use strict'

module.exports = {
  privateAPI: Symbol('private-api'),
  clsToDAO: Symbol('cls-to-dao'),
  fkField: Symbol('fk-field'),
  cleanup: function () {
    this.privateAPI =
    this.clsToDAO =
    this.fkField = null
  }
}
