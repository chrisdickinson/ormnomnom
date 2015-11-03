# ormnomnom

ORMnomnom is yet another Node ORM. It is specifically for use with postgres
(via [pg](http://npm.im/pg)), exposes single-async-events as
[bluebird](http://npm.im/bluebird) promises, and exposes async-iterables as
[streams](http://nodejs.org/api/stream.html). It requires a modern version of
Node (v4+).

```javascript
const orm = require('ormnomnom')
const extend = require('xtend')

class Package {
  constructor (opts) {
    extend(this, opts)
  }
}

class Author {
  constructor (opts) {
    extend(this, opts)
  }
}

const PackageObjects = orm(Package, {
  id: orm.joi.number(),
  name: orm.joi.string().lowercase().required(),
  author: Author
})

const AuthorObjects = orm(Author, {
  id: orm.joi.number(),
  name: orm.joi.string().lowercase().required(),
  email: orm.joi.string().email().required()
})

PackageObjects.filter({'author.name:startsWith': 'Gary'}).then(objects => {
  // list of objects
})
```

## Documentation

* [Getting Started with ORMnomnom](docs/getting-started.md)
  * [Building models](docs/building-models.md)
  * [Making queries](docs/making-queries.md)
  * [Validation](docs/understanding-validation.md)
  * [Common Patterns](docs/common-patterns.md)
* **[Reference documentation]()**
  * [Data access objects]()
  * [QuerySets]()
    * [Filters]()

Please refer to the [docs](docs/index.md).

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

* [`all`](#querysetall)
* [`get`](#querysetget)
* [`filter`](#querysetfilter)
* [`exclude`](#querysetexclude)
* [`create`](#querysetcreate)
* [`update`](#querysetupdate)
* [`delete`](#querysetdelete)

**In addition**, the ormnomnom function provides a method, `setConnection`, which
accepts a function that is expected to return a Postgres connection object as a
promise.

Finally, all foreign keys will add a reverse relation to the DAO — if, say, a
Package**DAO** had a foreign key to User, User**DAO** will have a method called
`packageSetFor(<User>) → Promise<Package>`, allowing users to quickly query
associated one-to-many relations from the perspective of the one.

### QuerySets

QuerySets represent the construction of a query. A queryset is immutable — all
methods of the queryset will return a new queryset instance. The queryset will
not *execute* until an **invoking** method is called. QuerySets return streams
and promises — the rule of thumb is to consume a stream when returning N rows,
and to consume a promise when returning a finite number of rows. 

#### `QuerySet#all()`

Return a queryset representing all rows of the backing table. Creating an
empty queryset can be useful in situations where one iteratively builds up
a query by passing the queryset between several APIs.

**Example:**

```javascript
const onlyTheBest = require('./only-the-best-filter')
const onlyConsonants = require('./only-consonants')

// get the best consonant letters
var myLetters = LetterObjects.all()
myLetters = onlyTheBest(onlyConsonants(myLetters))

// get the best letters from the first half of the alphabet
var firstLetters = LetterObjects.all().slice(0, 13)
firstLetters = onlyTheBest(firstLetters)
```

#### `QuerySet#get(WhereClause)`

Return a promise of a single row representation, throwing an error if zero or
more than one rows are represented in the result.

#### `QuerySet#filter(WhereClause)`

Return a new queryset representing a set of rows where `WhereClause` is true,
in addition to all previously added `WhereClause`'s. See [`WhereClause`](#whereclause)
for more info on the operations available in a where clause.

#### `QuerySet#exclude(WhereClause)`

The antithesis of `filter` — instead of including rows where `WhereClause` is true,
include only rows where `WhereClause` is false.

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
