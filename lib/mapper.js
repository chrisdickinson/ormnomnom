'use strict'

const reduce = require('@iterables/reduce')
const quotemeta = require('quotemeta')
const zip = require('@iterables/zip')
const map = require('@iterables/map')

const Mapper = module.exports = class Mapper {
  constructor (InstanceClass, ddl, tableName) {
    this.InstanceClass = InstanceClass
    this.ddl = ddl
    this.submappers = new Map()
    this.tableName = tableName
    for (const rel in this.ddl) {
      if (this.ddl[rel].isFK &&
          this.ddl[rel].isForwardRelation) {
        this.submappers.set(
          rel,
          this.ddl[rel].getAPI().getMapper()
        )
      }
    }
  }

  static getRegex (prefix) {
    let regex = Mapper.PREFIX_TO_REGEXP.get(prefix)
    if (regex) {
      return regex
    }
    regex = new RegExp(quotemeta(prefix) + '\\.\\w+$')
    Mapper.PREFIX_TO_REGEXP.set(prefix, regex)
    return regex
  }

  * mappers (prefix, annotations) {
    yield [prefix, this]
    for (const tuple of this.submappers) {
      yield * tuple[1].mappers(`${prefix}.${tuple[0]}`, null)
    }
  }

  getRowReducer (prefix) {
    const regex = Mapper.getRegex(prefix)

    return (acc, tuple) => {
      const key = tuple[0]
      const value = tuple[1]
      if (!regex.test(key)) {
        return acc
      }

      acc = acc || {}
      const name = key.slice(prefix.length + 1)
      acc[name] = value

      return acc
    }
  }

  getRowMapFunction (annotations) {
    // mappers are: ["foo.bar.baz", Mapper, reducefn]
    const mappers = Array.from(map(this.mappers(this.tableName, annotations), tuple => {
      return [tuple[0], tuple[1], tuple[1].getRowReducer(tuple[0])]
    }))

    // new Map() silently drops 3rd element of each row (the reducer)
    const reversedMappers = new Map(mappers.slice().reverse())

    const reducer = (acc, tuple) => {
      for (const set of mappers) {
        acc.set(set[0], set[2](acc.get(set[0]), tuple))
      }

      return acc
    }

    return row => {
      // result is "lookup.rel.map" -> {result object} | null
      const result = reduce(
        zip(keys(row), values(row)),
        reducer,
        new Map()
      )

      // now walk backwards through our mappers
      for (const set of reversedMappers) {
        const rel = set[0]
        const mapper = set[1]
        const target = result.get(rel)
        if (!target) {
          // if we didn't see it this time, we won't see it ever again!
          reversedMappers.delete(rel)
          continue
        }

        for (const subrel of mapper.submappers.keys()) {
          target[subrel] = result.get(`${rel}.${subrel}`)
        }

        if (mapper === this &&
            annotations &&
            annotations.size) {
          result.set(rel, [
            new mapper.InstanceClass(target),
            reduce(annotations, (acc, key) => {
              acc[key] = target[key]
              return acc
            }, {})
          ])
        } else {
          result.set(rel, new mapper.InstanceClass(target))
        }
      }

      return result.get(this.tableName)
    }
  }
}

Mapper.PREFIX_TO_REGEXP = new Map()

function * keys (obj) {
  for (const key in obj) {
    yield key
  }
}

function * values (obj) {
  for (const key in obj) {
    yield obj[key]
  }
}
