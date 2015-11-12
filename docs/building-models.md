# Building Models

Models in ORMnomnom work slightly differently than most ORMs, in that ORMnomnom
models are really [Data Access Objects][ref-dao]. While individual rows
resulting from queries made to the database are still realized as instances the
model class you provide, ORMnomnom does not install any new methods or require
any subclassing on your model's part. Indeed, ORMnomnom does not even require
that data passed to it be *instances* of your model class.

To see what this looks like, consider this simple example:

```javascript
const orm = require('ormnomnom')

class Book {
  constructor ({id, title, publish_date, byline}={}) {
    this.id = id
    this.title = title
    this.publishDate = publish_date
    this.byline = byline
  }
}

const BookObjects = orm(Book, {
  id: orm.joi.number(),
  title: orm.joi.string().required(),
  publish_date: orm.joi.date(),
  byline: orm.joi.string()
})
```

A model, `Book`, is defined as a class that accepts an object containing
`title`, `publish_date`, and `byline` properties. It does not extend any other
classes. A [Data Access Object][ref-dao] (henceforth known as a *DAO*) is
created by calling `orm(Book, {<some properties>})`, and assigned to
`BookObjects`.

All querying — creating, reading, updating, and deleting — for the `Book` model
is performed by `BookObjects`, the DAO for `Book`s. It's important to note that
ORMnomnom *does not* add any methods to `Book` — **everything** is done through
`BookObjects`. `Book` is used solely to materialize rows, and as a way to infer
a table name for the query builder.

By default, ORMnomnom will assume that the [table name][def-table]
of a given model is `constructor.name.toLowerCase() + 's'` – that is, the
lowercased, pluralized name of the constructor function passed to ORMnomnom.
Additionally, ORMnomnom will assume that the name of the [primary
key][def-primary-key] for the table is `id`. You can read about all of
the options ORMnomnom accepts in the [DAO reference
documentation][ref-dao].

```javascript
// an example of manually specifying the tableName and primaryKey column name:

class Octopus {
  /* ... */
}

orm(Octopus, {
  tableName: 'octopode',
  primaryKey: 'isbn'
})
```

The DAO object is primarily a mechanism for generating
[`QuerySet`][ref-queryset] objects and holding metadata about the model.
Queries begin with `.filter`, `.all`, `.get`, `.update`, or `.delete`, and
represent a single query against the database. Some queries return object
instances, others return a count of affected rows. This topic will be covered
further in the next section, but for now let's look at a simple query:

```javascript
const getBook = BookObjects.get({title: 'A Hat Full of Sky'})
```

This particular query will return a promise for single `Book` object. It could
fail a number of ways: if there are no `Book`'s by that title, it will fail with
a `BookObjects.NotFound` error. If there are multiple books by that name, it will
fail with `BookObjects.MultipleObjectsReturned`. These errors are subclasses of
`orm.NotFound` and `orm.MultipleObjectsReturned`, respectively, and ultimately
are subclasses of `Error`. The DAO holds references to these classes in order
to allow users to more easily determine the origin of a given error.

In the next section, we'll [explore the full query API][guide-querying].

[ref-dao]: ./ref/dao.md
[def-table]: http://www.sqlcourse.com/table.html
[def-primary-key]: https://en.wikipedia.org/wiki/Unique_key#Summary
[ref-queryset]: ./ref/queryset.md
[guide-querying]: ./making-queries.md
