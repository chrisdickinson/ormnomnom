'use strict'

const QuerySet = require('./queryset.js')
const quotemeta = require('quotemeta')
const Promise = require('bluebird')
const joi = require('joi')

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
  constructor (publicAPI, InstanceCls, ddl, options) {
    this.publicAPI = publicAPI
    this.InstanceCls = InstanceCls
    this.ddl = createDDL(ddl)
    options = options || {}
    this.tableName = options.tableName || defaultName(InstanceCls.name)
    this.modelName = options.modelName || InstanceCls.name
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

      return new this.InstanceCls(mapped)
    }
  }

  createValuesTransformer (values) {
    values = Array.isArray(values) ? values : [values]
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
    values = Array.isArray(values) ? values : [values]
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

  contributeColumns (prefix) {
    prefix = prefix || this.tableName()
    var out = []
    for (var key in this.ddl) {
      if (this.ddl[key].isFK) {
        continue
      }
      out.push(`
        "${this.tableName}"."${this.ddl[key].name}" as
        "${prefix}.${this.ddl[key].name}"
      `)
    }
    return out
  }
}

function createDDL (ddl) {
  var out = {}
  for (var key in ddl) {
    if (typeof ddl[key] === 'function') {
      createFK(key, ddl[key], out, `${key}_id`)
      // TODO: create "final" validator that checks for
      // object-wide consistency for inserts, e.g., "has _either_ X or X_id fk"
      // TODO: support `ormnomnom.fk(Function, {columnName, validator})` API
      out[`${key}_id`] = createCol(`${key}_id`, joi.any())
    } else {
      out[key] = createCol(key, ddl[key])
    }
  }
  return out
}

function createFK (name, cls, ddlTarget, localColumn, remoteColumn) {
  ddlTarget[name] = {
    isFK: true,
    name: name,
    column: localColumn,
    getAPI () {
      if (cls[classToDAOSym]) {
        return cls[classToDAOSym][privateAPISym]
      }
      throw new Error('No DAO registered for ' + cls.name)
    },
    cls: cls,
    remoteColumn () {
      const foreignDAO = this.getAPI()
      return remoteColumn || foreignDAO.primaryKeyName
    },
    dbPrepData (val) {
      return this.getAPI().getPrimaryKey(val)
    },
    dbPrepQuery (val) {
      return this.getAPI().getPrimaryKey(val)
    },
    getDataValidator () {
      const foreignDAO = this.getAPI()
      return foreignDAO.ddl[foreignDAO.primaryKeyName].getDataValidator()
    },
    getQueryValidator (query) {
      const foreignDAO = this.getAPI()
      return joi.object({
        [foreignDAO.primaryKeyName]:
          foreignDAO.ddl[foreignDAO.primaryKeyName].getDataValidator().required()
      }).unknown()
    }
  }
}

function createCol (name, validator) {
  return {
    isFK: false,
    name: name,
    column: name,
    getAPI () {
      throw new Error(`${name} is not a join-able column`)
    },
    dbPrepData (val) {
      return val
    },
    dbPrepQuery (val) {
      return val
    },
    getDataValidator () {
      return validator
    },
    getQueryValidator (query) {
      switch (query) {
        case 'raw':
          return joi.any()
        case 'in':
        case 'notIn':
          return joi.array().items(validator)
        case 'isNull':
          return joi.boolean()
        case 'lt':
        case 'gt':
        case 'lte':
        case 'gte':
          return joi.number()
        case 'startsWith':
        case 'endsWith':
        case 'contains':
        case 'iStartsWith':
        case 'iEndsWith':
        case 'iContains':
          return joi.string()
      }
      return validator
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
}

function defaultName (xs) {
  return xs.replace(/[a-z][A-Z]/g, function (m) {
    return m[0] + '_' + m[1]
  }).toLowerCase() + 's'
}
