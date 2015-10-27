'use strict'

const QuerySet = require('./queryset.js')
const quotemeta = require('quotemeta')
const Promise = require('bluebird')

module.exports = function () {
  module.exports = null
  var conn = null
  PrivateAPI.setConnection = function (c) {
    conn = c
  }
  PrivateAPI.getConnection = function () {
    return conn
  }
  return PrivateAPI
}

const pendingInstallation = new WeakMap()
const symbols = require('./shared-symbols.js')
const privateAPISym = symbols.privateAPI
const classToDAOSym = symbols.clsToDAO

class PrivateAPI {
  constructor (publicAPI, instanceCls, ddl, options) {
    this.publicAPI = publicAPI
    this.instanceCls = instanceCls
    this.ddl = createDDL(ddl)
    options = options || {}
    this.tableName = options.tableName || defaultName(instanceCls.name)
    this.modelName = options.modelName || instanceCls.name
    this.primaryKeyName = options.primaryKey || 'id'
    install(this)
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

  createMapper (prefix) {
    var subMappers = {}
    for (var rel in this.ddl) {
      if (this.ddl[rel].isFK) {
        subMappers[rel] = this.ddl[rel].getAPI()
          .createMapper(`${prefix}.${rel}`)
      }
    }
    var rex = new RegExp(quotemeta(prefix) + '\\.\\w+$')

    return (row) => {
      var mapped = null
      var seen = 0
      for (var key in row) {
        if (rex.test(key)) {
          mapped = mapped || {}
          var val = row[key]
          key = key.slice(prefix.length + 1)
          mapped[key] = val
        }
      }

      if (mapped === null) {
        return mapped
      }

      for (var rel in subMappers) {
        mapped[rel] = subMappers[rel](row)
      }

      return new this.instanceCls(mapped)
    }
  }

  createValuesTransformer (values) {
    return (row, push) => {
      push(values.reduce((lhs, rhs) => {
        var bits = rhs.split('.')
        var current = lhs
        while (bits.length > 1) {
          var next = bits.shift()
          current[next] = current[next] || {}
          current = current[next]
        }
        current[rhs] = row[this.tableName + '.' + rhs]
        return lhs
      }, {}))
    }
  }

  createValuesListTransformer (values) {
    return (row, push) => values.map(xs => {
      push(row[this.tableName + '.' + xs])
    })
  }

  createObjectTransformer () {
    var mapper = this.createMapper(this.tableName)
    return (row, push) => {
      push(mapper(row))
    }
  }

  addColumns (prefix) {
    prefix = prefix || this.tableName()
    var out = []
    for (var key in this.ddl) {
      if (this.ddl[key].isColumn) {
        out.push(`"${this.tableName}"."${key}" as "${prefix}.${key}"`)
      }
    }
    return out
  }
}

function createDDL (ddl) {
  var out = {}
  for (var key in ddl) {
    if (typeof ddl[key] === 'function') {
      createFK(key, ddl[key], out)
    } else {
      out[key] = createCol(key, ddl[key])
    }
  }
  return out
}

function createFK (name, cls, ddlTarget) {
  ddlTarget[name] = {
    isFK: true,
    isColumn: false,
    name: `${name}_id`,
    getAPI () {
      if (cls[classToDAOSym]) {
        return cls[classToDAOSym][privateAPISym]
      }
      throw new Error('No DAO registered for ' + cls.name)
    },
    cls: cls,
    dbPrepData (val) {
      return this.getAPI().getPrimaryKey(val)
    },
    dbPrepQuery (val) {
      return this.getAPI().getPrimaryKey(val)
    }
  }
}

function createCol (name, info) {
  return {
    isFK: false,
    isColumn: true,
    name: name,
    getAPI () {
      throw new Error(`${name} is not a join-able column`)
    },
    dbPrepData (val) {
      if (info.validate) {
        var result = info.validate(val)
        if (result.error) {
          throw result.error
        }
        return result.value
      }
      return val
    },
    dbPrepQuery (val) {
      return val
    }
  }
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

  var pending = pendingInstallation.get(dao.instanceCls) || []
  pendingInstallation.delete(dao.instanceCls)
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
}

function defaultName (xs) {
  return xs.replace(/[a-z][A-Z]/g, function (m) {
    return m[0] + '_' + m[1]
  }).toLowerCase() + 's'
}
