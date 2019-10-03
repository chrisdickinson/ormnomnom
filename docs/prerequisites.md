# Prerequisites

To use ORMnomnom you'll need Node 12 or greater and a database. Currently
ORMnomnom is only tested with Postgres, so we recommend you use that!

This doc will help you with:

- [Getting Node](#getting-node)
- [Getting Postgres](#getting-postgres)

## Getting Node

To make sure you have an appropriate version of Node installed, run the
following in a shell:

```bash
$ node -v
v12.2.0
```

If the first three characters (`v12`, above) are `12` or greater, congratulations!
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
