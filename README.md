# ormnomnom

Yet another orm, but hopefully you will forgive me. Every time I work on a web
service, I start wishing for this ORM, but now that it's a reality, I think we
can agree that some things should remain daydreams.

*Caution*: This library exposes bluebird promises to calling modules.

```javascript

const PackageObjects = ormnomnom(Package, {
  id: joi.number().required(),
  name: joi.string().required(),
  created: joi.date(),
  updated: joi.date(),
  deleted: joi.date()
})

const UsageObjects = ormnomnom(Usage, {
  id: true,           // we can also be suuu-uuuper inspecific
  name: true,
  package: Package    // we can reference other tables by referring to their
                      // associated functions
})

function Package (data) {
  util._extend(this, data)
}

function Usage (data) {
  util._extend(this, data)
}

```

## API

### Data Access Objects

The first step of using ormnomnom is to require it and apply it to a function.
This function won't be touched in any visible way; it serves as the factory for
row instances.

```
var dao = ormnomnom(MyFunction, {id: true}) 
```

Given a function and an object describing the columns the backing table has,
ormnomnom will return a "data access object," or **"DAO"**. The DAO exposes all of
the functionality that ormnomnom provides. Primarily, the DAO provides access
to [QuerySets](#querysets), which represent postgres operations as a set of their
results.

DAOs provide the following querying methods:

* [`all`](#queryset-all)
* [`get`](#queryset-get)
* [`filter`](#queryset-filter)
* [`create`](#queryset-create)
* [`update`](#queryset-update)
* [`delete`](#queryset-delete)

**In addition**, the ormnomnom function provides a method, `setConnection`, which
accepts a function that is expected to return a Postgres connection object as a
promise.

### QuerySets

QuerySets represent the construction of a query. A queryset is immutable — all
methods of the queryset will return a new queryset instance. The queryset will
not *execute* until an **invoking** method is called. QuerySets return streams
and promises — the rule of thumb is to consume a stream when returning N rows,
and to consume a promise when returning a finite number of rows. 

#### `QuerySet#all()`

Return a queryset representing all rows of the backing table.

#### `QuerySet#get()`

Return a promise of a single row representation, throwing an error if zero or
more than one rows are represented in the result.

#### `QuerySet#filter()`
#### `QuerySet#create()`
#### `QuerySet#update()`
#### `QuerySet#delete()`
#### `QuerySet#count()`
#### `QuerySet#slice()`
#### `QuerySet#order()`
#### `QuerySet#values(values)`

* `values` — `values` may be a `String` or `Array<String>` representing the
  fields to contribute to outgoing stream objects.

The `.values` method disables the default object mapping that ormnomnom does.
Instead, plain objects will be emitted, only containing the keys specified by
`values`.

```javascript
userDAO.values('id', 'username').createStream().on('data', console.log)
// results are [{id: 1, username: 'bloop'}, {id: 3, username: 'jonbonjovi'}]
```

#### `QuerySet#valuesList(values)`

* `values` — `values` may be a `String` or `Array<String>` representing the
  fields to output directly into the stream.

`.valuesList` operations like `.values`, but returns the columns directly into
the output stream instead of associating them with an object first. This is super
handy for, e.g., generating `in` queries:

```javascript
PackageData.objects.filter('owner_id:in', UserData.filter({
  'name:startsWith': 'bulletproo'
}).valuesList('id'))
```

#### `QuerySet#sql → Promise<String>`

Returns a string holding the potential SQL query that this queryset represents.

### Filters

### DAO<Function>.create(Data)
