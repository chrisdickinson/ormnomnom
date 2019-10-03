'use strict'

module.exports = class Join {
  constructor (parent, name, registerTable) {
    this.prefix = (
      parent.prefix
        ? `${parent.prefix}${name}.`
        : `${name}.`
    )
    this.parent = parent
    this.name = name
    this.column = parent.dao.ddl[name]

    this.dao = this.column.getAPI()
    this.targetTableName = registerTable(this.dao.tableName)
    this.childJoins = []
    this.contributed = false
    this.parent.childJoins.push(this)
  }

  contribute (builder) {
    if (this.contributed) {
      return
    }
    this.contributed = true
    for (const col of this.dao.columns()) {
      builder.addTarget(`${this.prefix}${col.name}`)
    }
    if (this.parent && this.parent !== builder) {
      this.parent.contribute(builder)
    }
  }

  * joins () {
    for (const xs of this.childJoins) {
      yield xs
      yield * xs.joins()
    }
  }
}
