'use strict'

module.exports = {
  privateAPI: Symbol('private-api'),
  clsToDAO: Symbol('cls-to-dao'),
  cleanup: function() {
    this.privateAPI =
    this.clsToDAO = null
  }
}
