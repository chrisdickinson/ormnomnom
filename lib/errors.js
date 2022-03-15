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

class ScopeConflictError extends Error {
  constructor (scopeName) {
    super(`Cannot add scope with reserved name "${scopeName}"`)
    this.name = 'ScopeConflictError'
    Error.captureStackTrace(this, ScopeConflictError)
  }
}

exports.ScopeConflictError = ScopeConflictError
