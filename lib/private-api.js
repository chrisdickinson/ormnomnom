'use strict'

const QuerySet = require('./queryset.js')
const quotemeta = require('quotemeta')

module.exports = function () {
  module.exports = null
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
    this.tableName = options.tableName || instanceCls.name.toLowerCase()
    install(this)
  }

  getQuerySet () {
    return new QuerySet(this, null)
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
          mapped[key.slice(prefix + 1)] = this[ddl][key].fromSQL(row[key])
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
        out.push(`"${this.tableName()}"."${key}" as "${prefix}.${key}"`)
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
}

function createFK (name, cls, ddlTarget) {
  ddlTarget[name + '_id'] = createCol(name + '_id', {})
  ddlTarget[name] = {
    isFK: true
    isColumn: false,
    getApi () {
      if (cls[classToDAOSym]) {
        return cls[classToDAOSym]
      }
      throw new Error('No DAO registered for ' + cls.name)
    },
    fromSQL (val) {
    }
    toSQL (val, output) {
      output[name + '_id'] = val.id
    }
  }
}

function createCol (name, info) {
  return {
    isFK: false,
    isColumn: true,
    fromSQL (val) {
      return val
    },
    toSQL (val, output) {
      if (info.validate) {
        var result = info.validate(val)
        if (result.error) {
          throw result.error
        }
        output[name] = result.value
      } else {
        output[name] = val
      }
    }
  }
}
