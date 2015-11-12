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
  author: orm.fk(Author)
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

* **[Getting Started with ORMnomnom](docs/getting-started.md)**
  * [Building models](docs/building-models.md)
  * [Making queries](docs/making-queries.md)
* **[Reference documentation](docs/ref/index.md)**
  * [Data access objects](docs/ref/dao.md)
  * [QuerySets](docs/ref/queryset.md)
    * [Clauses](docs/ref/queryset.md#clauses)

## License

MIT
