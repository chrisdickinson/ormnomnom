'use strict'

const column = require('./column.js')
const QuerySet = require('./queryset.js')
const Mapper = require('./mapper.js')

const ForeignKey = column.ForeignKey
const Column = column.Column

module.exports = function () {
  module.exports = null
  let conn = null
  PrivateAPI.setConnection = c => {
    conn = c
  }
  PrivateAPI.getConnection = () => {
    return conn
  }
  PrivateAPI.errorMap = {}
  return PrivateAPI
}

const pendingInstallation = new WeakMap()
const symbols = require('./shared-symbols.js')
const privateAPISym = symbols.privateAPI
const classToDAOSym = symbols.clsToDAO
const fkFieldSym = symbols.fkField
const colFieldSym = symbols.colField

class PrivateAPI {
  constructor (publicAPI, InstanceCls, ddl, options = {}) {
    options = Object.assign({}, {
      tableName: defaultName(InstanceCls.name),
      modelName: InstanceCls.name,
      primaryKey: 'id'
    }, options)

    this.publicAPI = publicAPI
    this.InstanceCls = InstanceCls
    this.ddl = createDDL(ddl)
    this.tableName = options.tableName
    this.modelName = options.modelName
    this.primaryKeyName = options.primaryKey
    this.perBuilderColumns = new WeakMap()
    this.mapper = null
    this.QuerySetClass = getQuerySetClass(options)
  }

  get errorMap () {
    return PrivateAPI.errorMap
  }

  install () {
    install(this)
  }

  getMapper () {
    if (this.mapper) {
      return this.mapper
    }
    this.mapper = new Mapper(this.InstanceCls, this.ddl, this.tableName)
    return this.mapper
  }

  registerBuilderColumns (builder) {
    this.perBuilderColumns.set(builder, {})
  }

  createBuilderColumn (builder, name) {
    this.perBuilderColumns.get(builder)[name] = new Column(name, name, {})
  }

  getColumn (name, builder) {
    if (name in this.ddl) {
      return this.ddl[name]
    }

    const builderDDL = this.perBuilderColumns.get(builder)
    if (builderDDL && name in builderDDL) {
      return builderDDL[name]
    }

    throw new Error(`"${name}" is not a valid column on ${this.InstanceCls.name}.`)
  }

  getQuerySet () {
    return new this.QuerySetClass(this, null)
  }

  getConnection () {
    return PrivateAPI.getConnection()()
  }

  getPrimaryKey (val) {
    return val[this.primaryKeyName]
  }

  createValuesTransformer (values) {
    values = [].concat(values)

    // Fallback column for annotations.
    const fallbackAnnotationColumn = {
      decode (v) {
        return v
      }
    }

    // pre-bake an object mapping "foo.bar.baz" to a concrete Column so
    // we have access to Column#decode().
    const specToColumn = Object.fromEntries(values.map(spec => {
      const bits = spec.split('.')
      let dao = this
      while (bits.length > 1) {
        const next = bits.shift()
        if (dao.ddl[next] && dao.ddl[next].isFK) {
          dao = dao.ddl[next].getAPI()
        } else {
          throw new Error(`Cannot join across unknown column "${next}" in "${spec}"`)
        }
      }

      return [spec, dao.ddl[bits[0]] || fallbackAnnotationColumn]
    }))

    return async (row, push) => {
      push(await values.reduce(async (lhs, rhs) => {
        const bits = rhs.split('.')
        let current = await lhs

        while (bits.length > 1) {
          const next = bits.shift()
          current[next] = current[next] || {}
          current = current[next]
        }

        current[bits[0]] = await specToColumn[rhs].decode(row[`${this.tableName}.${rhs}`])
        return lhs
      }, {}))
    }
  }

  createValuesListTransformer (values) {
    values = [].concat(values)
    values = values.map(spec => {
      if (spec.includes('.')) {
        const bits = spec.split('.')
        let dao = this
        while (bits.length > 1) {
          const next = bits.shift()
          const nextColumn = dao.ddl[next]
          if (nextColumn && nextColumn.isFK) {
            dao = nextColumn.getAPI()
          }
        }

        const column = dao.ddl[bits[0]]
        return async (row, push) => {
          push(await column.decode(row[`${this.tableName}.${spec}`]))
        }
      }

      if (spec in this.ddl) {
        return async (row, push) => {
          push(await this.ddl[spec].decode(row[`${this.tableName}.${spec}`]))
        }
      }

      return (row, push) => push(row[`${this.tableName}.${spec}`])
    })

    return (row, push) => values.map(xs => xs(row, push))
  }

  createObjectTransformer (annotations) {
    const mapper = this.getMapper()
    const fn = mapper.getRowMapFunction(annotations)
    return async (row, push) => {
      push(await fn(row))
    }
  }

  * columns () {
    for (const key in this.ddl) {
      if (this.ddl[key].isFK) {
        continue
      }
      yield this.ddl[key]
    }
  }
}

function createDDL (ddl) {
  const out = {}
  for (const key in ddl) {
    if (ddl[key][fkFieldSym]) {
      const info = ddl[key][fkFieldSym]
      const col = info.column || `${key}_id`
      out[key] = new ForeignKey(key, info.model, col, null, info.nullable || false, true)
      // TODO: create "final" validator that checks for
      // object-wide consistency for inserts, e.g., "has _either_ X or X_id fk"
      // TODO: support `ormnomnom.fk(Function, {columnName, validator})` API

      out[col] = new Column(col, col, info.validator || (
        info.nullable
          ? {}
          : {}
      ))
    } else {
      out[key] = new Column(key, key, ddl[key])
      if (ddl[key][colFieldSym]) {
        out[key].decode = ddl[key][colFieldSym].decode || out[key].decode
        out[key].encode = ddl[key][colFieldSym].encode || out[key].encode
        out[key].encodeQuery = ddl[key][colFieldSym].encodeQuery || out[key].encodeQuery
      }
    }
  }
  return out
}

function install (dao) {
  for (const key in dao.ddl) {
    if (dao.ddl[key].isFK) {
      if (dao.ddl[key].cls[classToDAOSym]) {
        installReverse(dao, key, dao.ddl[key].cls[classToDAOSym])
      } else {
        const cls = dao.ddl[key].cls
        pendingInstallation.set(
          cls, (pendingInstallation.get(cls) || []).concat([{
            dao,
            key
          }])
        )
      }
    }
  }

  const pending = pendingInstallation.get(dao.InstanceCls) || []
  pendingInstallation.delete(dao.InstanceCls)
  pending.forEach(install => {
    installReverse(install.dao, install.key, dao.publicAPI)
  })
}

function installReverse (src, key, target) {
  target[`${src.tableName}SetFor`] = data => {
    return src.getQuerySet().filter({
      [`${key}.id`]: Promise.resolve(data).then(xs => xs.id)
    })
  }

  target[privateAPISym].ddl[src.tableName] = new ForeignKey(
    src.tableName,
    src.InstanceCls,
    target[privateAPISym].primaryKeyName,
    src.ddl[key].column,
    true,
    false
  )
}

function defaultName (xs) {
  return xs.replace(/[a-z][A-Z]/g, m => {
    return `${m[0]}_${m[1]}`
  }).toLowerCase() + 's'
}

function getQuerySetClass (options) {
  const { querySetClass } = options
  if (!querySetClass) {
    return QuerySet
  }
  if (
    typeof querySetClass === 'function' &&
    querySetClass.prototype instanceof QuerySet
  ) {
    return querySetClass
  }
  throw new TypeError('options.querySetClass must refer to a class that extends QuerySet')
}
