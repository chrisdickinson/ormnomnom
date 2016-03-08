'use strict'

const CONTRIBUTE_COLUMNS = true

class Builder {
  constructor (dao, negateSym) {
    this.dao = dao

    this.negateSym = negateSym
    this.selecting = new Map()
    this.childJoins = []
    this.ordering = []

    this.joinMap = new Map()
    this.tables = new Map()
    this.tableNameMap = new Map()
    this.columnMap = new Map()
    this.where = new And()
    this.targetTableName = this.registerTable(this.dao.tableName)
    for (const col of this.dao.columns()) {
      this.addTarget(`${col.name}`)
    }
  }

  addTarget (col) {
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
    var val = this.tableNameMap.get(name)
    this.tableNameMap.set(name, val + 1)
    return `${name}_${val}`
  }

  addWhereAll (clause, parent) {
    parent = parent || this.where
    if (clause[this.negateSym]) {
      parent = parent.add(new Not())
    }
    for (var key in clause) {
      const bits = key.split(':')
      parent.add(new Where(
        this.referenceColumn(bits[0], CONTRIBUTE_COLUMNS),
        bits[1],
        clause[key]
      ))
    }
  }

  addWhereAny (clause) {
    const root = this.where.add(
      clause[this.negateSym]
      ? new Not().add(new Or())
      : new Or()
    )
    for (var i = 0; i < clause.length; ++i) {
      const subclause = root.add(new And())
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
    var dir = 'ASC'
    col = col.replace(/^-/, () => {
      dir = 'DESC'
      return ''
    })

    this.ordering.push({
      column: this.referenceColumn(col),
      dir
    })
  }

  referenceColumn (name, shouldContributeColumns) {
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

    const column = new QueryColumn(
      name,
      `${this.dao.tableName}.${name}`,
      dao.ddl[bits[bits.length - 1]],
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
    return 'WHERE ' + this.where.toSQL(values)
  }

  * joins () {
    for (const xs of this.childJoins) {
      yield xs
      yield * xs.joins()
    }
  }
}

module.exports = Builder

class QueryColumn {
  constructor (name, outputName, info, source, dao) {
    this.name = name
    this.columnName = info.column
    this.outputName = outputName
    this.info = info
    this.source = source
    this.dao = dao
  }

  get sqlName () {
    return `"${this.source.targetTableName}"."${this.columnName}"`
  }
}

class QueryOperand {
  constructor () {
    this.children = []
  }

  add (target) {
    this.children.push(target)
    return target
  }
}

class And extends QueryOperand {
  toSQL (values) {
    if (this.children.length === 0) {
      return '1'
    }
    return (
      this.children.length < 2
      ? this.children[0].toSQL(values)
      : `(${this.children.map(xs => xs.toSQL(values)).join(' AND ')})`
    )
  }
}

class Or extends QueryOperand {
  toSQL (values) {
    if (this.children.length === 0) {
      return '1'
    }
    return (
      this.children.length < 2
      ? this.children[0].toSQL(values)
      : `(${this.children.map(xs => xs.toSQL(values)).join(' OR ')})`
    )
  }
}

class Not extends QueryOperand {
  toSQL (values) {
    return `NOT ${this.children[0].toSQL(values)}`
  }
}

class Where {
  constructor (column, operand, value) {
    this.column = column
    this.operand = operand || 'eq'
    this.value = value
  }

  toSQL (values) {
    const validator = this.column.info.getQueryValidator(this.operand)
    const validResult = validator.validate(this.value)
    if (validResult.error) {
      throw validResult.error
    }
    return OPERATION_MAP[this.operand](
      this.column.sqlName,
      this.value,
      finalValue => values.push(this.column.info.dbPrepQuery(finalValue))
    )
  }
}

class Join {
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

const OPERATION_MAP = {
  eq (col, val, push) {
    return `${col} = $${push(val)}`
  },
  neq (col, val, push) {
    return `${col} != $${push(val)}`
  },
  raw (col, val, push) {
    return val(col, push)
  },
  contains (col, val, push) {
    return `${col} like $${push('%' + val.replace(/%/g, '%%') + '%')}`
  },
  startsWith (col, val, push) {
    return `${col} like $${push(val.replace(/%/g, '%%') + '%')}`
  },
  endsWith (col, val, push) {
    return `${col} like $${push('%' + val.replace(/%/g, '%%'))}`
  },
  in (col, val, push) {
    if (val.length < 1) {
      return `false`
    }
    return `${col} in (${val.map(xs => '$' + push(xs))})`
  },
  notIn (col, val, push) {
    if (val.length < 1) {
      return `true`
    }
    return `${col} not in (${val.map(xs => '$' + push(xs))})`
  },
  isNull (col, val, push) {
    return `${col} is ${val ? '' : 'NOT'} NULL`
  },
  lt (col, val, push) {
    return `${col} < $${push(val)}`
  },
  gt (col, val, push) {
    return `${col} > $${push(val)}`
  },
  lte (col, val, push) {
    return `${col} <= $${push(val)}`
  },
  gte (col, val, push) {
    return `${col} >= $${push(val)}`
  },
  iContains (col, val, push) {
    return `UPPER(${col}) like UPPER($${push('%' + val.replace(/%/g, '%%') + '%')})`
  },
  iStartsWith (col, val, push) {
    return `UPPER(${col}) like UPPER($${push(val.replace(/%/g, '%%') + '%')})`
  },
  iEndsWith (col, val, push) {
    return `UPPER(${col}) like UPPER($${push('%' + val.replace(/%/g, '%%'))})`
  }
}
