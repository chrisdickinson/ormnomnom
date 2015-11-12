# Data Access Objects

The first step of using ormnomnom is to require it and apply it to a function.
This function won't be touched in any visible way; it serves as the factory for
row instances.

```
const orm = require('ormnomnom')

const dao = orm(MyFunction, {id: true}) 
```

Given a function and an object describing the columns the backing table has,
ormnomnom will return a "data access object," or **"DAO"**. The DAO exposes all
of the functionality that ormnomnom provides. Primarily, the DAO provides
access to [QuerySets](./queryset.md), which represent postgres operations as a
set of their results.

## Public API

```javascript
const orm = require('ormnomnom')
```

##### `orm.setConnection(Function → Promise<{connection, release}>)`

This method provides ORMnomnom with a user-supplied function to call for
attaining database connections. The function provided should return a promise
for an object with two properties, `connection` and `release`. `connection` should
be a [pg][def-pg] [`Client`][def-pg-client] object. `release` should be a function
that returns `Client` to a pool, or shuts the client down.

```javascript
const orm = require('ormnomnom')
const pg = require('pg')

// use pg's built-in connection pooling
orm.setConnection(() => {
  return new Promise((resolve, reject) => {
    pg.connect('postgres://localhost/database', (err, connection, release) => {
      if (err) {
        return reject(err)
      }
      return resolve({connection, release})
    })
  })
})
```

##### `orm(Model, DDL[, options]) → DAO<Model>`

##### `orm.fk(Model[, options]) → ForeignKeyDefinition`

##### `DAO<Model>#all() → QuerySet<Model>`

##### `DAO<Model>#filter(Clause) → QuerySet<Model>`

##### `DAO<Model>#exclude(Clause) → QuerySet<Model>`

##### `DAO<Model>#get(Clause) → Promise<Model>`

##### `DAO<Model>#create(Object) → Promise<Model>`

##### `DAO<Model>#getOrCreate(Object) → Promise<[Boolean, Model]>`

##### `DAO<Model>#update(Data) → Promise<Number>`

##### `DAO<Model>#delete() → Promise<Number>`

### Errors

##### `orm.NotFound`
##### `DAO<Model>.NotFound`

##### `orm.MultipleObjectsReturned`
##### `DAO<Model>.MultipleObjectsReturned`

##### `orm.Conflict`
##### `DAO<Model>.Conflict`

[def-pg]: https://www.npmjs.org/package/pg
[def-pg-client]: https://github.com/brianc/node-postgres/wiki/Client
