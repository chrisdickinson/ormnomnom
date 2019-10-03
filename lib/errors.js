'use strict'

class ValidationError extends Error {
  constructor (input, errors) {
    super(`Failed to validate:\n - ${[].concat(errors).map(xs => xs.message).join('\n - ')}`)
    this.name = 'ValidationError'
    this.input = input
    this.errors = errors
    Error.captureStackTrace(this, ValidationError)
  }
}

exports.ValidationError = ValidationError
