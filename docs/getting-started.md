# Getting Started with ORMnomnom

ORMnomnom is a lightweight ORM; its goal is to make the code
you write around 80% of your business logic fast and flexible,
and then get out of your way for the remaining 20%.

The first step in getting started with ORMnomnom is to determine
whether or not it will fit your needs.

In particular, ORMnomnom:

* Exposes a Promise-based API.
* Requires Node v4+.
* Is only tested with Postgres.
* Does not provide a solution for aggregates or self-referencing queries.
* Does not handle database migrations.

If these things sound okay to you, or **you don't know what these things
mean but this sounds fun anyway**, read on!

## Getting Node

To make sure you have an appropriate version of Node installed, run the
following in a shell:

```bash
$ node -v
v4.2.1
```

If the first two characters (`v4`, above) are `4` or greater, congratulations!
Otherwise, you will have to [upgrade Node](https://nodejs.org/).

Once you have a working Node, make sure you have a working Postgres installation.

## Getting Postgres

There are a few good options here, depending on what OS you're running.

* OSX:
  * [Postgres.app](http://postgresapp.com/)
  * [Homebrew](http://brew.sh/): `brew install postgres`
* Linux:
  * Debian/Ubuntu: `apt-get install postgresql-9.4`
  * RHEL/CentOS: [YUM installation guide](https://wiki.postgresql.org/wiki/YUM_Installation)
* Windows:
  * [Scoop.sh](http://scoop.sh/): `scoop install postgresql`

ORMnomnom generates fairly backwards compatible SQL, and should work from
versions 9.1 up, **however** it is only tested on 9.4+.

## Installing ORMnomnom in Your Project

In your shell, navigate to your project. In your project directory, run the
following command:

```bash
$ npm install ormnomnom pg --save
```

This will install `ormnomnom` and the [`pg`](https://npmjs.org/package/pg)
client and record the dependencies in your project's `package.json`, if it
exists.

If you get any errors from this process, please [open an
issue](https://github.com/chrisdickinson/ormnomnom/issues/new).

## Setting up a Connection

ORMnomnom does not know how to get a postgres connection out of the box — your
application is in charge of telling ORMnomnom how to attain a connection as
well as how to release it. ORMnomnom will try to attain a connection whenever a
query is about to be run, and will release that connection after the query has
executed.

An example of creating a connection follows:

```javascript
const Promise = require('bluebird')
const orm = require('ormnomnom')
const pg = require('pg')

orm.setConnection(function () {
  const deferred = Promise.defer()
  pg.connect({/* params */}, function (err, conn, done) {
    if (err) {
      return deferred.reject(err)
    }
    return deferred.resolve({connection: conn, release: done})
  })
  return deferred.promise
})

```

The next step is to [start defining models](./building-models.md)!
