# QuerySets

QuerySets represent the construction of a query. A queryset is immutable — all
methods of the queryset will return a new queryset instance. The queryset will
not *execute* until an **invoking** method is called. QuerySets return streams
and promises — the rule of thumb is to consume a stream when returning N rows,
and to consume a promise when returning a finite number of rows. 

#### `QuerySet<Model>#all()`

* **Returns:** `QuerySet<Model>`

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

#### `QuerySet#get(Clause)`

* **Returns:** `Promise<Model>`
* **Failure States:**
  * [`DAO<Model>.NotFound`][ref-dao-notfound]
  * [`DAO<Model>.MultipleObjectsReturned`][ref-dao-multipleobjectsreturned]
  * `pg` errors

Return a promise of a single row representation, throwing an error if zero or
more than one rows are represented in the result.

#### `QuerySet#filter(Clause)`

* **Returns:** `QuerySet<Model>`

Return a new queryset representing a set of rows where `Clause` is true,
in addition to all previously added `Clause`'s. See [`Clause`][ref-clause]
for more info on the operations available in a where clause.

#### `QuerySet#exclude(Clause)`

* **Returns:** `QuerySet<Model>`

The antithesis of `filter` — instead of including rows where `Clause` is true,
include only rows where `Clause` is false.

#### `QuerySet#create(Data)`
#### `QuerySet#update(Data)`
#### `QuerySet#delete()`
#### `QuerySet#count()`

#### `QuerySet#slice([start][, end])`

* **Argument:** `start` — an integer offset into the results of the query 
* **Argument:** `end` — an integer offset into the results of the query.
* **Returns:** `QuerySet<Model>`

This method bounds the query relative to previous bounds, if any, or absolutely
if no previous bounds exist.

#### `QuerySet#order(order)`

* **Argument:** `order` — may be a `String` or `Array<String>` representing
  the fields by which to order the query.
* **Returns:** `QuerySet<Model>`

The column format accepted by `order()` is the same as [`Clause`][ref-clause],
with the addition of an optional prefixed `'-'` to indicate "order by column
descending."

```javascript
// order primarily by the owner fk's name, descending, then
// secondarily by publish date
packageDAO.order(['-owner.name', 'published'])
```

#### `QuerySet#values(values)`

* **Argument:** `values` — may be a `String` or `Array<String>` representing
  the fields to contribute to outgoing stream objects.
* **Returns:** `QuerySet<Model>`

The `.values` method disables the default object mapping that ormnomnom does.
Instead, plain objects will be emitted, only containing the keys specified by
`values`.

```javascript
userDAO.values('id', 'username').createStream().on('data', console.log)
// results are [{id: 1, username: 'bloop'}, {id: 3, username: 'jonbonjovi'}]
```

#### `QuerySet#valuesList(values)`

* **Argument:** `values` — may be a `String` or `Array<String>` representing
  the fields to output directly into the stream.
* **Returns:** `QuerySet<Model>`

`.valuesList` operations like `.values`, but returns the columns directly into
the output stream instead of associating them with an object first. This is super
handy for, e.g., generating `in` queries:


#### `QuerySet#distinct(columns)`

* **Argument:** `columns` — may be a `String` or `Array<String>` representing
  the columns to consider when deduplicating. Defaults to `"id"`.
* **Returns:** `QuerySet<Model>`

Returns a queryset that will run `SELECT DISTINCT ON (columns)` instead of
`SELECT`.

Only applies to `SELECT` operations.

```javascript
PackageData.objects.filter('owner_id:in', UserData.filter({
  'name:startsWith': 'bulletproo'
}).valuesList('id'))
```

#### `QuerySet#sql → Promise<String>`

Returns a string holding the potential SQL query that this queryset represents.

## Clauses

Clauses may be objects or arrays of objects. Pairs of keys and values in clause
objects represent a column and its relation to a value.

```
{ 'columnSpec<Model>[:relation]': value }

// examples:
{ 'title': 'exact match' }
{ 'title:contains': 'of the ' }
{ 'author.name:startsWith': 'Gary' }
{ 'book.author.published:lt': new Date(2014, 1, 1) }
```

A `columnSpec` may be any column named to the DAO when it was created.
Additionally, it may be a `foreignKeyName.columnSpec`, where the `columnSpec`
now refers to the target table.

`Clause` objects (and arrays) may contain promises. They will be settled before
the query is executed. If an error is thrown by a clause item, it will be bubbled
through the query:

```javascript
bookDAO.filter({
  title: new Promise((resolve, reject) => reject(new Error('oh no')))
}).catch(err => {
  console.log(err.message)  // oh no
})
```

### Clause Relations

The built in relations are as follows:

Relation Name | Description                                         | Effect on validation
------------- | --------------------------------------------------- | -----------------------
(nothing)     | Omitted relations are treated as "eq".              | Applied from DAO DDL
`eq`          | Column should equal value.                          | Applied from DAO DDL
`neq`         | Column should not equal value.                      | Applied from DAO DDL
`contains`    | Column should contain string.                       | Must be string
`iContains`   | Column should contain string, case-insensitive.     | Must be string
`startsWith`  | Column should start with string.                    | Must be string
`iStartsWith` | Column should start with string, case-insensitive.  | Must be string
`endsWith`    | Column should end with string.                      | Must be string
`iEndsWith`   | Column should end with string, case-insensitive.    | Must be string
`in`          | Column should be one of the provided values.        | DAO DDL applied to each array element
`notIn`       | Column should not be any of the provided values.    | DAO DDL applied to each array element
`isNull`      | Presence of `NULL` in column should match value.    | Must be boolean
`lt`          | Column must be less than value.                     | Must be string or date
`gt`          | Column must be greater than value.                  | Must be string or date
`lte`         | Column must be less than or equal to value.         | Must be string or date
`gte`         | Column must be greater than or equal to value.      | Must be string or date
`raw`         | User-defined.                                       | No validation.

`raw` may be used for missing operations. An example:

```javascript
bookDAO.filter({
  'name:raw' (column, addValue) {
    return `char_length(${column}) = $${addValue(100)}`
  }
})
```

## Aggregation, Grouping, and Annotation

As of v3.0.0, ORMnomnom supports grouping, aggregates, and annotations. We'll use the
following models for all examples below:

```javascript
const orm = require('ormnomnom')

class Invoice {
  constructor ({id, name, date}) {
    this.id = id
    this.name = name
    this.date = date
  }
}

Invoice.objects = orm(Invoice, {
  id: orm.joi.number().required(),
  name: orm.joi.string(),
  date: orm.joi.date()
})

class LineItem {
  constructor ({id, subtotal, discount, invoice_id, invoice}) {
    this.id = id
    this.subtotal = subtotal
    this.discount = discount
    this.invoice_id = invoice_id
    this.invoice = invoice
  }
}

LineItem.objects = orm(LineItem, {
  id: orm.joi.number().required(),
  invoice: orm.fk(Invoice),
  subtotal: orm.joi.number(),
  discount: orm.joi.number()
})
```

**Annotations** are extra data that you wish to include in your query, derived from
the columns of the queryset. For example, you could "annotate" a query with the sum
of two fields: 

```javascript
LineItem.objects.all().annotate({
  total (ref) {
    return `${ref('subtotal')} - ${ref('discount')}`
  }
}).then(results => {
  results.map(([lineItem, annotation]) => {
    console.log(
      '%s - %s = %s',
      lineItem.subtotal,
      lineItem.discount,
      annotation.total
    )
  })
})
```

**Aggregations** are extra data derived across the entire set of rows represented
by a query. For example, `QuerySet#count` is implemented as an aggregate. The only
result of an aggregation query is the aggregated value itself.

```javascript
Invoice.objects.all().aggregate(
  ref => `array_agg(distinct ${ref('date')})`
).then(dates => {
  // what dates are available?
})
```

**Grouping** is handy for collapsing foreign relations into a set of items,
especially when combined with **Aggregation**:

```javascript
Invoice.objects.all().group().annotate({
  lineItems: ref => `json_agg(${ref('line_items.*')})`
}).then(results => {
  results.map(([invoice, {lineItems}]) => {
    // invoice will be an Invoice object,
    // lineItems will be an Array of Objects suitable for passing to `new LineItem`
  })
})
```

#### `QuerySet#aggregate(fn)`

`fn` should be of the form:

```javascript
const fn = (ref, push) => {
  return `count(*)`
}
```

When called on a QuerySet, the queryset will be modified to select a single column, the
result of the `aggregate` fn. Only the first row will be returned. 

#### `QuerySet#annotate(obj)`

`obj` should be of the form:

```javascript
const obj = {
  nameOfField: (ref, push) {
    return 'SQL()'
  }
}
```

Each key of `obj` should refer to an annotation function.

Each annotation function should return a string and take two arguments,
`ref` and `push`.

- `ref` is used to refer to target columns: `ref('path.to.column')` or
  `ref('fk.*')` both work.
- `push` is used to pass values from JS to SQL, like `:raw`.

Every key in `obj` will appear in the annotations of the queryset.

If `values` or `valuesList` are given, the keys of annotation object will
appear in-line if they are selected. Otherwise, the queryset will return an
array of `[ModelInstance, Object]` for each matching row.

#### `QuerySet#group(by)`

Groups a query by a set of columns. If `by` is not given, it will be set to the
primary key of the `QuerySet`'s target table, if any. `by` may be given as a
string or an array of strings representing column lookups.

When `group` is called: the columns selected by the queryset will be limited to:

- If `valuesList` or `values` was called on the queryset, the column selection will
  not be affected by calls to `group()`.
- Otherwise, if `by` includes the primary key of the target table, all of the
  target table's columns and annotations.

[ref-dao-notfound]: ./dao.md#daomodelnotfound
[ref-dao-multipleobjectsreturned]: ./dao.md#daomodelmultipleobjectsreturned
