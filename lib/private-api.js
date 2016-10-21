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
  }

  get errorMap () {
    return PrivateAPI.errorMap
  }

  install () {
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
      if (this.ddl[rel].isFK &&
          this.ddl[rel].isForwardRelation) {
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
      createFK(key, info.model, out, col, null, info.nullable || false, true)
      // TODO: create "final" validator that checks for
      // object-wide consistency for inserts, e.g., "has _either_ X or X_id fk"
      // TODO: support `ormnomnom.fk(Function, {columnName, validator})` API

      var validator = info.validator || (
        info.nullable
        ? joi.any().optional()
        : joi.any()
      )
      out[col] = createCol(col, validator)
    } else {
      out[key] = createCol(key, ddl[key])
    }
  }
  return out
}

function createFK (name, cls, ddlTarget, localColumn, remoteColumn, nullable, isForward) {
  ddlTarget[name] = {
    isFK: true,
    name: name,
    column: localColumn,
    nullable: nullable,
    isForwardRelation: isForward,
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
      if (val) {
        return this.getAPI().getPrimaryKey(val)
      }
      return val
    },
    dbPrepQuery (val) {
      return this.getAPI().getPrimaryKey(val)
    },
    getDataValidator () {
      const foreignDAO = this.getAPI()
      const validator = foreignDAO.ddl[foreignDAO.primaryKeyName].getDataValidator()
      if (nullable) {
        return joi.alternatives().try(
          validator,
          joi.any().default(null, 'null').allow(null)
        )
      }
      return validator
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
          return joi.alternatives().try(joi.number(), joi.date())
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
  createFK(
    src.tableName,
    src.InstanceCls,
    target[privateAPISym].ddl,
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
