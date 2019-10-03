'use strict'

const chain = require('@iterables/chain')
const map = require('@iterables/map')

const Column = require('./column')
const where = require('./where')
const Join = require('./join')

const CONTRIBUTE_COLUMNS = true

module.exports = class Builder {
  constructor (dao, negateSym) {
    this.dao = dao

    this.negateSym = negateSym
    this.selecting = new Map()
    this.childJoins = []
    this.ordering = []
    this.distinctExpressions = []
    this.bounds = [] // offset, limit

    this.grouping = null
    this.only = null
    this.annotations = null

    this.joinMap = new Map()
    this.tables = new Map()
    this.tableNameMap = new Map()
    this.columnMap = new Map()
    this.where = new where.And()
    this.targetTableName = this.registerTable(this.dao.tableName)
    for (const col of this.dao.columns()) {
      this.addTarget(`${col.name}`)
    }
  }

  addOnlyColumns (only) {
    this.only = new Set(only)
  }

  addBoundsFromSlice (slice) {
    this.bounds[0] = slice[0]
    this.bounds[1] = slice[1] - slice[0]
  }

  addGrouping (columns) {
    // if we are already selecting "only" columns,
    //   trust the user, only select them.
    // otherwise,
    //   set an "only" filter.
    //   it should include the grouped columns and any annotations.
    //   if our primary key is present, automatically add all columns from this table.
    this.grouping = new Set(columns)

    if (this.only) {
      return
    }

    this.only = new Set(chain(
      columns,
      this.annotations || [],
      columns.has(this.dao.primaryKeyName)
        ? map(this.dao.columns(), xs => xs.name)
        : []
    ))
  }

  addAnnotations (annotations, values) {
    annotations = Object.assign.apply(Object, [{}].concat(annotations))
    this.dao.registerBuilderColumns(this)

    const push = value => `$${values.push(value)}`
    const ref = name => {
      let isStar = false
      if (/\.\*/.test(name)) {
        isStar = true
        name = name.slice(0, -2)
      }
      const col = this.referenceColumn(name, false, true)

      if (isStar) {
        return col.sqlName.split('.').slice(0, -1).join('.') + '.*'
      }

      return col.sqlName
    }

    this.annotations = new Set(Object.keys(annotations))

    // create all of the columns so that they can reference each other
    for (const key of this.annotations) {
      this.dao.createBuilderColumn(this, key)
    }

    for (const key of this.annotations) {
      const column = this.referenceColumn(key)
      const annotation = annotations[key](ref, push)
      column.sqlName = annotation
      this.selecting.set(key, column)
    }
  }

  addTarget (col) {
    /* istanbul ignore next */
    if (this.selecting.has(col)) {
      return
    }
    this.selecting.set(col, this.referenceColumn(col))
  }

  registerTable (name) {
    if (!this.tableNameMap.has(name)) {
      this.tableNameMap.set(name, 1)
      return name
    }
    const val = this.tableNameMap.get(name)
    this.tableNameMap.set(name, val + 1)
    return `${name}_${val}`
  }

  addWhereAll (clause, parent = this.where) {
    const keys = Object.keys(clause)
    if (!keys.length) {
      parent = clause[this.negateSym]
        ? parent.add(new where.Not()).add(new where.And())
        : parent.add(new where.And())
      return
    }

    if (clause[this.negateSym]) {
      parent = parent.add(new where.Not())
    }

    for (let i = 0; i < keys.length; ++i) {
      const key = keys[i]
      const bits = key.split(':')
      parent.add(new where.Comparison(
        this.referenceColumn(bits[0], CONTRIBUTE_COLUMNS),
        bits[1],
        clause[key],
        key
      ))
    }
  }

  addWhereAny (clause) {
    const root = clause[this.negateSym]
      ? this.where.add(new where.Not()).add(new where.Or())
      : this.where.add(new where.Or())

    for (let i = 0; i < clause.length; ++i) {
      const subclause = root.add(new where.And())
      this.addWhereAll(clause[i], subclause)
    }
  }

  addJoin (path, shouldContributeColumns) {
    const strPath = path.join('.')
    if (this.joinMap.has(strPath)) {
      const join = this.joinMap.get(strPath)
      if (shouldContributeColumns) {
        if (!join.contributed) {
          join.contribute(this)
        }
      }
      return join
    }

    if (path.length > 1) {
      const parentJoin = this.addJoin(
        path.slice(0, -1),
        shouldContributeColumns
      )
      const join = new Join(
        parentJoin,
        path[path.length - 1],
        name => this.registerTable(name)
      )
      this.joinMap.set(strPath, join)
      if (shouldContributeColumns) {
        join.contribute(this)
      }
      return join
    }

    const join = new Join(
      this,
      path[0],
      name => this.registerTable(name)
    )
    this.joinMap.set(strPath, join)
    if (shouldContributeColumns) {
      join.contribute(this)
    }
    return join
  }

  addOrderClause (col) {
    let dir = 'ASC'
    col = col.replace(/^-/, () => {
      dir = 'DESC'
      return ''
    })

    this.ordering.push({
      column: this.referenceColumn(col),
      dir
    })
  }

  addDistinctExpression (set) {
    for (const col of set.values()) {
      this.distinctExpressions.push(this.referenceColumn(col))
    }
  }

  referenceColumn (name, shouldContributeColumns, shouldUnrefFK) {
    const bits = name.split('.')
    const source = (
      bits.length > 1
        ? this.addJoin(bits.slice(0, -1), shouldContributeColumns)
        : this
    )
    const dao = source.dao

    if (this.columnMap.has(name)) {
      return this.columnMap.get(name)
    }

    const descriptor = dao.getColumn(bits[bits.length - 1], this)

    if (shouldUnrefFK && descriptor.isFK) {
      return this.referenceColumn(
        `${name}.${descriptor.remoteColumn()}`,
        shouldContributeColumns
      )
    }

    const column = new Column(
      name,
      `${this.dao.tableName}.${name}`,
      descriptor,
      source,
      dao
    )

    this.columnMap.set(name, column)
    return column
  }

  getWhereClause (values) {
    if (this.where.children.length === 0) {
      return ''
    }
    return `WHERE ${this.where.toSQL(values)}`
  }

  getOrderClause () {
    if (!this.ordering.length) {
      return ''
    }

    const ordering = this.ordering.map(xs => {
      return `${xs.column.sqlName} ${xs.dir}`
    })
    return `ORDER BY ${ordering}`
  }

  getBoundsClause () {
    return (
      isFinite(this.bounds[1])
        ? `LIMIT ${this.bounds[1]} `
        : ''
    ) + (
      this.bounds[0] !== 0 && !isNaN(this.bounds[0])
        ? `OFFSET ${this.bounds[0]}`
        : ''
    )
  }

  getSelectColumnsClause () {
    const distinctClause = (
      this.distinctExpressions.length
        ? `DISTINCT ON (${this.distinctExpressions.map(xs => xs.sqlName)}) `
        : ''
    )

    const fieldFilter = (
      this.only
        ? xs => this.only.has(xs)
        : Boolean
    )
    const selectClause = []
    for (const pair of this.selecting) {
      const targetName = pair[0]
      if (!fieldFilter(targetName)) {
        continue
      }
      const column = pair[1]

      selectClause.push(`
  ${column.sqlName} AS "${column.outputName}"
      `.trim())
    }

    return `${distinctClause}${selectClause.join(', ')}`
  }

  getSelectJoinClause () {
    return Array.from(map(this.joins(), xs => {
      return `
  LEFT ${xs.column.nullable ? 'OUTER' : ''} JOIN
  "${xs.dao.tableName}" "${xs.targetTableName}" ON (
    "${xs.parent.targetTableName}"."${xs.column.column}" =
    "${xs.targetTableName}"."${xs.column.remoteColumn()}"
  )`.trim()
    })).join(' ')
  }

  // XXX: mutates the where clause. call after user-defined where clauses
  // has been added, but before pulling the where clause out of the builder.
  getUpdateJoinClause () {
    const results = Array.from(map(this.joins(), xs => {
      this.addWhereAll({
        [`${xs.parent.prefix || ''}${xs.column.column}:raw`] (col, push) {
          return `${col} = "${xs.targetTableName}"."${xs.column.remoteColumn()}"`
        }
      })
      return `"${xs.dao.tableName}" "${xs.targetTableName}"`
    }))

    if (!results.length) {
      return ''
    }

    return `FROM ${results.join(', ')}`
  }

  // XXX: ditto the getUpdateJoinClause note.
  getDeleteJoinClause () {
    const results = Array.from(map(this.joins(), xs => {
      this.addWhereAll({
        [`${xs.parent.prefix || ''}${xs.column.column}:raw`] (col, push) {
          return `${col} = "${xs.targetTableName}"."${xs.column.remoteColumn()}"`
        }
      })
      return `"${xs.dao.tableName}" "${xs.targetTableName}"`
    }))

    if (!results.length) {
      return ''
    }

    return `USING ${results.join(', ')}`
  }

  getGroupByClause () {
    if (!this.grouping || !this.grouping.size) {
      return ''
    }

    const grouping = Array.from(
      map(this.grouping, xs => this.referenceColumn(xs, false).sqlName)
    ).join(', ')

    return `GROUP BY ${grouping}`
  }

  * joins () {
    for (const xs of this.childJoins) {
      yield xs
      yield * xs.joins()
    }
  }
}
