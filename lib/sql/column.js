'use strict'

module.exports = class Column {
  constructor (name, outputName, info, source, dao) {
    this.name = name
    this.columnName = info.column
    this.outputName = outputName
    this.info = info
    this.source = source
    this.dao = dao

    this.overrideSQLName = null
  }

  get sqlName () {
    return (
      this.overrideSQLName ||
      `"${this.source.targetTableName}"."${this.columnName}"`
    )
  }

  set sqlName (v) {
    this.overrideSQLName = v
  }
}
