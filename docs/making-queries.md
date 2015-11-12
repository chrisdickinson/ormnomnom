# Making Queries

## Basic Querying

ORMnomnom [`DAO`][ref-dao] methods may return a [`QuerySet`][ref-queryset].
QuerySets are best thought of as a [set][def-set] of rows in the table the
`DAO` represents. QuerySets usually start as the set of all rows in the table,
and can be *filtered* to reduce the number of rows they contain. We'll be using
the `BookObjects` `DAO` and `Book` model from the [previous section][guide-building-models] in these examples.

```javascript
const allBooks = BookObjects.all()
const someBooks = allBooks.filter({title: 'equal rites'})
```

Filters may be chained; every `filter` operation will return a new `QuerySet`
instance. The object passed to filter is known as a [`Clause`][ref-clause]. In
the above example, we've created two `QuerySet` instances: one that represents
all books that we know about, and one that represents all books titled "equal
rites". The second `QuerySet` was created by passing the `Clause`, `{title:
'equal rites'}`, to `allBooks.filter()`. `Clause` objects may contain `Promise`
values — the clause object will be settled before running the query; any errors
will be forwarded through the [materialization of the query][link-materialization].

`Clause` arguments may be arrays or objects, as seen above. Each key in a
clause object represents a named column in the table. The pair of key and value
represent a relationship that must hold true for a row to be included in the
set. By default, the relationship between `{column: value}` is "`column` must
equal `value`." However, other relationships can be represented. To represent
another kind of relation, we can add change our `Clause` to
`{'column:relation': value}`. For example, to find all books relating to
Star Wars, we could write:

```javascript
const justStarWars = BookObjects.all().filter({
  'title:startsWith': 'Star Wars'
})
```

If a clause has more than one key in it, the resulting `QuerySet` will
represent rows where *all* of the keys hold true — this has the same effect as
if we had run `filter` twice:

```javascript
const justContact = allBooks.filter({
  byline: 'carl sagan',
  title: 'contact'
})

const justContact = allBooks
  .filter({byline: 'carl sagan'})
  .filter({title: 'contact'})
```

Multiple keys in an object represent a boolean "AND" relationship, while
multiple objects in an array represent boolean "OR". Rows can be excluded
(boolean "NOT") using `.exclude`.

```javascript
// just this book OR this other book
const hofstadterBooksIHaveNotFinished = BookObjects.filter([
  {title: 'I am a strange loop'},
  {title: 'Gödel, Escher, Bach'}
])

// any book that isn't "the brothers karamazov"
const sorryFyodor = BookObjects.exclude({
  title: 'the brothers karamazov'
})
```

There's a lot more available to work with — be sure to check out
the [complete list of clause operations][ref-clause-operations], and the
[`QuerySet` reference docs][ref-queryset] for more information.

## Materializing QuerySets

`QuerySet` objects are lazy. They won't make a database query until you
*materialize* them. There are two ways to materialize a `QuerySet`: as a
[Stream][def-stream], or as a [Promise][def-promise]. There are cases for
both — if you don't know how many rows your query may represent, you should
use a `Stream` and process them row-by-row. If you do, or have limited your
query, then a `Promise` representing all of the rows of the `QuerySet` can
be simpler than working with a stream.

For instance, if we wanted to do some processing on each book in our database,
we might write something like the following:

```javascript
const Writable = require('stream').Writable

BookObjects.all().pipe(new Writable({
  objectMode: true,
  write (book, _, ready) {
    assert(book instanceof Book)
    ready()
  }
}))
```

Alternatively, if we know we only have at most 25 books, we could materialize
that as a `Promise` for an array of `Book` instances:

```javascript
BookObjects.all().slice(0, 25).then(books => {
  assert(Array.isArray(books))
  assert(books.every(xs => xs instanceof Book))
})
```

Some operations *instantly* materialize a `QuerySet`. Operations like `update`,
`delete`, `count`, and `get` will immediately return a `Promise`. `count`,
`update` and `delete` return a number representing how many rows were selected
or affected, while `get` returns a single model instance.

```javascript
BookObjects.filter({
  'title:contains': 'other'
}).update({
  title: 'this book is merely ok'
}).then(num => console.log('Updated %d books', num))

BookObjects.filter({
  'publish_date:lt': new Date(2010, 1, 1)
}).count().then(num => console.log('%d books before 2010'))

BookObjects.filter({
  'byline:endsWith': 'and'
}).delete().then(num => console.log('Deleted %d books'))

BookObjects.get({
  title: 'the road'
}).then(book => console.log('%s is by %s', book.title, book.byline))

BookObjects.create({
  title: 'a self-published great book',
  byline: 'chris d',
  publish_date: new Date()
}).then(book => {
  // I wrote my own book!
})

```

By default, rows are materialized by instantiating the model constructor
associated with the `DAO` and providing it with an object representing the
data from the database. However, you can control this behavior (including
only selecting certain columns) using `.values()` and `.valuesList()`

```javascript
const onlyBookIds = BookObjects.all().exclude({
  'title:iContains': 'YELLING SOUNDS'
}).slice(0, 25).valuesList(['id'])

onlyBookIds.then(ids => {
  console.log(ids)    // [1, 2, 3, ...]
})

const simpleBooks = BookObjects.all().filter({
  'id:in': onlyBookIds
}).values(['title', 'published']).then(objs => {
  console.log(objs)   // [{title, published}, ...]
})
```

This can be useful when only certain columns are needed.

Remember, when materializing a QuerySet: only use promises when the number of
rows is known ahead of time. Materializing a hundred thousand row table as a
single array could take a lot of time!

## Using Joins

Before we talk about joins, we should revisit our sample model, the `Book`
class. Let's add an `Author` table, and link `Book` objects to an author via
a [foreign key][def-foreign-key], `author_id`.

```javascript
const orm = require('ormnomnom')

class Book {
  constructor ({id, title, publish_date, author, author_id}={}) {
    this.id = id
    this.title = title
    this.publishDate = publish_date
    this.author = author
    this.author_id = author_id
  }
}

class Author {
  constructor ({id, name, age}={}) {
    this.id = id
    this.name = name
    this.age = age
  }
}

const BookObjects = orm(Book, {
  id: orm.joi.number(),
  title: orm.joi.string().required(),
  publish_date: orm.joi.date(),
  author: orm.fk(Author)
})

const AuthorObjects(Author, {
  id: orm.joi.number(),
  name: orm.joi.string().required(),
  age: orm.joi.number(),
})
```

In order to let ORMnomnom know about the foreign key relationship, we define it
in the [schema definition][def-schema] that we pass to `orm` using
`orm.fk(<Other Model>)`. Once we've done this, we can easily write queries
involving a [`LEFT JOIN`][def-left-join]. We can query across any foreign
key using `<foreign-key-name>.column` in our `Clause`:

```javascript
BookObjects.filter({
  'author.name': 'Gary Busey'
}).then(books => {
  console.log(books[0].author) // Author { id: 1, name: 'Gary Busey', age: 50 }
})
```

Similarly, if we want to order by a remote column, or include it in a
`values` or `valuesList` query:

```javascript
// ordering:
BookObjects.all().order(['-author.age'])

// specifying as a column:
BookObjects.all().valuesList(['author.name']).then(names => {
  console.log(names) // ['James Joyce', 'Terry Pratchett', ...]
})

BookObjects.all().values(['author.name', 'title']).then(objs => {
  console.log(objs[0]) // {author: {name: 'Jake Busey'}, title: '???'}
})
```

Related objects will **not** be materialized unless it is necessary to join to
their table for the purposes of filtering, ordering, or selecting.

It is possible to specify multiple joins in a query at once. For example, if we
had a `Review` model linked to `Book`s, we could query reviews by author details:

```javascript
class Review {
  // ...
}
const ReviewObjects = orm(Review, {
  id: orm.joi.number(),
  rating: orm.joi.number().required(),
  book: orm.fk(Book)
})

ReviewObjects.filter({
  'book.author.name:contains': 'Murakami'
})
```

Foreign key'd objects are easy to instantiate together, as well:

```javascript
ReviewObjects.create({
  rating: 5,
  book: BookObjects.create({
    title: 'a thing!',
    author: AuthorObjects.create({
      name: 'jamstopher jaminson',
      age: 30
    })
  })
}).then(review => {
  console.log(review) // Rating { rating: 5, book: Book { ... }}
})
```

[ref-dao]: ./ref/dao.md
[ref-queryset]: ./ref/queryset.md
[def-set]: https://en.wikipedia.org/wiki/Set_(mathematics)
[guide-building-models]: ./building-models.md
[ref-clause]: ./ref/queryset.md#clauses
[link-materialization]: #materializing-querysets
[ref-clause-operations]: ./ref/queryset.md#clause-operations
[def-stream]: https://nodejs.org/api/stream.html#stream_stream
[def-promise]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise
[def-foreign-key]: https://en.wikipedia.org/wiki/Foreign_key
[def-schema]: https://en.wikipedia.org/wiki/Database_schema
[def-left-join]: http://www.postgresql.org/docs/9.4/static/tutorial-join.html
