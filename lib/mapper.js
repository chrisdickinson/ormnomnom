'use strict'

const reduce = require('@iterables/reduce')
const quotemeta = require('quotemeta')
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

    return async (acc, tuple) => {
      const key = tuple[0]
      const value = tuple[1]
      if (!regex.test(key)) {
        return acc
      }

      acc = acc || {}
      const name = key.slice(prefix.length + 1)
      const column = this.ddl[name]

      // Column may not exist! For example, this key might be an annotation on
      // a table, in which we should pass it through directly.
      acc[name] = column ? await column.decode(value) : value

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

    const reducer = async (acc, tuple) => {
      acc = await acc

      for (const set of mappers) {
        acc.set(set[0], await set[2](acc.get(set[0]), tuple))
      }

      return acc
    }

    return async row => {
      // result is a map from "lookup.rel.map" -> {args for instantiation of CLS} | null.
      // The initial order is "shallowest to deepest" relation: starting at the current
      // InstanceCls, ending up with foreign keys to foreign keys to the deepest InstanceCls.
      const result = await reduce(
        Object.entries(row),
        reducer,
        new Map()
      )

      // Now, we walk through the mappers in reverse order, which is to say: deepest
      // to most shallow. For each of these mappers, load the arguments to the mapper's
      // InstanceCls, attempt to instantiate the class with the stored args, then store
      // the "finished" model in result.
      //
      // We'll end at the current model.
      for (const set of reversedMappers) {
        const rel = set[0]
        const mapper = set[1]
        const target = result.get(rel)
        if (!target) {
          // Assume that if we didn't see a result for a given mapper on this row, we
          // won't see it for subsequent rows.
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

      // Fetch the current model from the result cache. Et voila.
      return result.get(this.tableName)
    }
  }
}

Mapper.PREFIX_TO_REGEXP = new Map()
