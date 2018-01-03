'use strict'

const Promise = require('bluebird')
const joi = require('joi')

const column = require('./column.js')
const QuerySet = require('./queryset.js')
const Mapper = require('./mapper.js')

const ForeignKey = column.ForeignKey
const Column = column.Column

module.exports = function () {
  module.exports = null
  var conn = null
  PrivateAPI.setConnection = function (c) {
    conn = c
  }
  PrivateAPI.getConnection = function () {
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

class PrivateAPI {
  constructor (publicAPI, InstanceCls, ddl, options) {
    this.publicAPI = publicAPI
    this.InstanceCls = InstanceCls
    this.ddl = createDDL(ddl)
    options = options || {}
    this.tableName = options.tableName || defaultName(InstanceCls.name)
    this.modelName = options.modelName || InstanceCls.name
    this.primaryKeyName = options.primaryKey || 'id'
    this.perBuilderColumns = new WeakMap()
    this.mapper = null
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
    this.perBuilderColumns.get(builder)[name] = new Column(name, name, joi.any())
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
    return new QuerySet(this, null)
  }

  getConnection () {
    return PrivateAPI.getConnection()()
  }

  getPrimaryKey (val) {
    return val[this.primaryKeyName]
  }

  createValuesTransformer (values) {
    values = [].concat(values)
    return (row, push) => {
      push(values.reduce((lhs, rhs) => {
        var bits = rhs.split('.')
        var current = lhs
        while (bits.length > 1) {
          var next = bits.shift()
          current[next] = current[next] || {}
          current = current[next]
        }
        current[bits[0]] = row[this.tableName + '.' + rhs]
        return lhs
      }, {}))
    }
  }

  createValuesListTransformer (values) {
    values = [].concat(values)
    return (row, push) => values.map(xs => {
      push(row[this.tableName + '.' + xs])
    })
  }

  createObjectTransformer (annotations) {
    const mapper = this.getMapper()
    const fn = mapper.getRowMapFunction(annotations)
    return (row, push) => {
      push(fn(row))
    }
  }

  * columns () {
    for (var key in this.ddl) {
      if (this.ddl[key].isFK) {
        continue
      }
      yield this.ddl[key]
    }
  }
}

function createDDL (ddl) {
  var out = {}
  for (var key in ddl) {
    if (ddl[key][fkFieldSym]) {
      var info = ddl[key][fkFieldSym]
      var col = info.column || `${key}_id`
      out[key] = new ForeignKey(key, info.model, col, null, info.nullable || false, true)
      // TODO: create "final" validator that checks for
      // object-wide consistency for inserts, e.g., "has _either_ X or X_id fk"
      // TODO: support `ormnomnom.fk(Function, {columnName, validator})` API

      out[col] = new Column(col, col, info.validator || (
        info.nullable
        ? joi.any().optional()
        : joi.any()
      ))
    } else {
      out[key] = new Column(key, key, ddl[key])
    }
  }
  return out
}

function install (dao) {
  for (var key in dao.ddl) {
    if (dao.ddl[key].isFK) {
      if (dao.ddl[key].cls[classToDAOSym]) {
        installReverse(dao, key, dao.ddl[key].cls[classToDAOSym])
      } else {
        var cls = dao.ddl[key].cls
        pendingInstallation.set(
          cls, (pendingInstallation.get(cls) || []).concat([{
            dao,
            key
          }])
        )
      }
    }
  }

  var pending = pendingInstallation.get(dao.InstanceCls) || []
  pendingInstallation.delete(dao.InstanceCls)
  pending.forEach(install => {
    installReverse(install.dao, install.key, dao.publicAPI)
  })
}

function installReverse (src, key, target) {
  target[src.tableName + 'SetFor'] = function (data) {
    data = Promise.cast(data)
    return src.getQuerySet().filter({
      [key + '.id']: data.get('id')
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
  return xs.replace(/[a-z][A-Z]/g, function (m) {
    return m[0] + '_' + m[1]
  }).toLowerCase() + 's'
}
