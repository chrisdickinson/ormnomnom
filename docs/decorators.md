# Decorators

ORMnomnom includes a couple of decorators to make working with your models a little easier.

## autoNow

First there's the `autonow` decorator which will automatically set timestamps on a column on `.create()` and (optionally) `.update()`. It is used like so:


```javascript
const orm = require('ormnomnom')
const autoNow = require('ormnomnom/decorators/autonow')

class Book {
  constructor ({id, created, updated, deleted, title, byline}={}) {
    this.id = id
    this.created = created
    this.updated = updated
    this.deleted = deleted
    this.title = title
    this.byline = byline
  }
}

Book.rawObjects = orm(Book, {
  id: { type: 'integer' },
  created: { anyOf: [{ type: 'null'}, { type: 'string', format: 'date-time' }], default: null },
  updated: { anyOf: [{ type: 'null'}, { type: 'string', format: 'date-time' }], default: null },
  deleted: { anyOf: [{ type: 'null'}, { type: 'string', format: 'date-time' }], default: null },
  title: { type: 'string' },
  byline: { type: 'string' }
})

Book.objects = autoNow(Book.rawObjects, {column: 'created', createOnly: true}) // createOnly defaults to false
Book.objects = autoNow(Book.objects, {column: 'updated'})
```

You'll note that we first create a DAO at `Book.rawObjects` before assigning a decorated DAO to `Book.objects`. This allows us to use the convenience features of the decorator when we want them (via `Book.objects`) and skip them when we don't (via `Book.rawObjects`). You'll also see that we're decorating our already decorated DAO with a second column, this allows us to have different behavior for multiple columns.

In the above example, the `created` column will be set when an object is created, but will be left alone when the object is updated. The `updated` column will be set on create, as well as every time an object is updated.

Here's a bit of example code to illustrate this behavior:

```javascript
return Book.objects.create({title: 'John Dies at the End'}).then(book => {
  assert.ok(book.created != null, 'created has been set')
  assert.ok(book.updated != null, 'updated has been set')
  return Book.objects.filter({id: book.id}).update({byline: 'STOP. You should not have touched this book with your bare hands.'}).then(updatedBook => {
    assert.ok(book.created.getTime() === updatedBook.created.getTime(), 'created column has NOT been modified')
    assert.ok(book.updated.getTime() < updatedBook.updated.getTime(), 'updated column HAS been modified')
  })
})
```

## softDelete

The `softdelete` decorator overrides the `.delete()` method to instead write a timestamp on a column. It additionally intercepts the various read methods `.all()`, `.get()` and `.filter()` to additionally filter out rows which have the specified column set (as in, not `null`).

Its usage can be illustrated like so (building off of the `Book` model from the above examples):

```javascript
const softDelete = require('ormnomnom/decorators/softdelete')

Book.objects = softDelete(Book.objects, {column: 'deleted'})

return Book.objects.filter({title: 'John Dies at the End'}).delete().then(count => {
  assert.ok(count === 1, 'deleted one row')
  return Book.objects.filter({title: 'John Dies at the End'})
}).then(books => {
  assert.ok(books.length === 0, 'returns no rows')
  return Book.rawObjects.filter({title: 'John Dies at the End'})
}).then(books => {
  assert.ok(books.length === 1, 'returns one row (because the row still exists)')
  assert.ok(books[0].deleted != null, 'the deleted column has been set')
  return Book.objects.get({id: books[0].id}).catch(Book.objects.NotFound, err => {
    assert.pass('NotFound is raised even though we tried to get the row by id')
    return Book.objects.all()
  })
}).then(allBooks => {
  assert.ok(books.length === 0, 'all() returns no books as well')
})
```

## timestamps

In addition to the above two decorators, a third `timestamps` middleware exists which combines the above patterns into a single convenience function. These three lines:

```javascript
Book.objects = softDelete(Book.rawObjects, {column: 'deleted'})
Book.objects = autoNow(Book.objects, {column: 'updated'})
Book.objects = autoNow(Book.objects, {column: 'created', createOnly: true})
```

Can be replaced with the following:

```javascript
const timestamps = require('ormnomnom/decorators/timestamps')

Book.objects = timestamps(Book.rawObjects, { created: 'created', updated: 'updated', deleted: 'deleted' })
// Note that the above is actually the default settings, and as such this can be done even more simply as
// Book.objects = timestamps(Book.rawObjects)
```
