'use strict'

module.exports = {
  props
}

async function props (object) {
  object = object || {}
  // Explanatory comment: transform an object into an array of promises
  // for [key, value], where we are awaiting the value. Once all of the
  // [key, value] pairs resolve, reconstruct an object.
  //
  // This has the effect of turning {a: Promise<T>} into Promise<{a: T}>.
  return Object.fromEntries(
    await Promise.all(
      Object.keys(object).map(
        async key => [key, await object[key]]
      )
    )
  )
}
