{models, Author, Book} = require './models'
{connection} = require 'ormnomnom'


conn = connection.Connection.get_connection 'default'

models.db_creation 'default', yes, ->
    create_book = Book.objects.create
        author:Author.objects.get_or_create {first_name:'Cormac', last_name:'McCarthy', slug:'cormac-mccarthy'}
        title:'Blood Meridian'
        slug:'blood-meridian'
        desc:'A book about violence and cowboys.'

    # `create_book` is an EventEmitter AND a function.
    create_book.on 'data', (book)->
        console.log "Created #{book} with id of #{book.pk}"

        # likewise, so is `book.author()`.
        book.author() (err, author)->
            console.log "using #{author} with id of #{author.pk}"


            # you can join across foreign keys in filters
            books = Book.objects.filter
                author__first_name:'Cormac'

            # for each book returned, log its name. 
            books.each (book)->
                console.log "Got #{book}, #{book.pk}"

            # we're done here.
            books conn.close.bind conn
