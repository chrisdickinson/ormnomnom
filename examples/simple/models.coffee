{models} = require 'ormnomnom'

models.configure 'default',
    backend:'ormnomnom/lib/backends/postgres'
    name:'testdb'

exports.models =
models.namespace 'authors', (ns)->
    Author = ns.create 'Author'

    Author.schema
        first_name:models.CharField {max_length:255}
        last_name:models.CharField {max_length:255}
        slug:models.CharField {max_length:255}

    Author.meta
        order_by:['last_name', 'first_name']

    Author::toString =->
        "<Author: \"#{@get_full_name()}\">"

    Author::get_full_name = ->
        [@first_name, @last_name].join ' '

    Book = ns.create 'Book'

    Book.schema
        author: models.ForeignKey Author
        title: models.CharField {max_length:255}
        slug: models.CharField {max_length:255}
        desc: models.TextField

    Book::toString =->
        "<Book: \"#{@title}\">"

    exports.Author = Author
    exports.Book = Book
