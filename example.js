// settings.js
require.paths.push(process.cwd());
var EventEmitter = require('events').EventEmitter;

var manager = new EventEmitter();

manager.receiveConnectionError = function(backend, err) {
  this.emit('end');
};

manager.receiveQueryEvent = function(backend) {
  if(this.drained) {
    this.emit('start', 'default');
    this.drained = false;
  }
};

manager.receiveDrainEvent = function(backend) {  
  this.drainTimeout = setTimeout(function() {
    this.drained = true;
    this.emit('end');
  }.bind(this));
};

var ormnomnom = require('ormnomnom'),
    fields = ormnomnom.fields,
    plate = require('plate');

ormnomnom.settings({
  'default':{
    'database':'project.db',
    'user':'cdickinson',
    'backend':'ormnomnom/backends/sqlite',
    'password':null,
    'port':null,
    'host':'localhost'
  }
});
ormnomnom.connectionsThrough('default', manager);
manager.emit('start', 'default');

// models.js
var Author = ormnomnom.Model.define('Author', {
  'name':fields.CharField({max_length:255}),
  'psuedonym':fields.CharField({max_length:255, nullable:true}),
  'slug':fields.SlugField({unique:true}),
  'date_of_birth':fields.DateField(),
  'date_of_death':fields.DateField({nullable:true})
});

Author.meta({
  'order_by':['name']
});

Author.prototype.toString = function() {
  return '<Author: '+this.name+'>';
};

var Book = ormnomnom.Model.define('Book', {
  'title':fields.CharField({max_length:255}),
  'published':fields.DateField(),
  'slug':fields.SlugField(),
  'author':fields.ForeignKey(Author)
});

Book.meta({
  'order_by':['author','-published'],
  'unique_together':['author', 'slug']
});


Book.prototype.get_absolute_url = function() {
  return escaperoute.reverse('book_detail', [
    this.published.getYear(),
    format(this.published, 'b'),
    this.published.getDay()
  ]);
};

exports.Book = Book;
exports.Author = Author;

console.log(Book.objects.createTable());
// filtering.js
/*
Author.objects.get({pk:2}).
  on('data', function(author) {
    console.log(author);
  }).
  on('error', function(author) {
    console.log("Could not find author by pk of "+2);
  });
*/

var authors = Author.objects.all()

authors.on('data', function(author) {
  console.log(author.toString());  
});

authors.on('error', function(err) {
  console.log(err.stack);  
});

var chris = Author.objects.filter({name__contains:'Chris'});
chris(function(err, data) {
  // shortcut for chris -> end
  err && console.log(err);
  data && console.log('CALL Results: '+data);
});

chris.on('end', function(err, data) {
  err && console.log('There was an error: '+err);
  data && console.log('END Results: '+data);
});

var awesome_books = Book.objects.filter({author__name:'Cormac Mccarthy'});
awesome_books = awesome_books.filter({title__contains:"pretty horses"}).on('data', function(data) {
  console.log('got data:' + data.length);
}).on('error', function(error) {
  console.log('got error:' + error);
});

//console.log(awesome_books);
var p = new plate.Template('{% for book in books %}<a href="{{ book.get_absolute_url }}">\n\t{{ book.title }}\n</a>\n{% endfor %}');

p.render({books:awesome_books}, function(err, data) {
  if(err) {
    console.error(err);
  } else {
    console.log(data);
  }
});

// creating.js

Author.objects.all().delete()(function(err, data) {
  console.log('Deleted '+data+' authors.');
});

var chris = Author.objects.create({
  'name':'Chris Dickinson',
  'date_of_birth':new Date('3 Jan 1986'),
  'slug':'chris-dickinson',// or ormnomnom.fromFields(['name'])
});

chris.on('data', function(author) {
  console.log('Got author dude'+arguments[0]);
  console.log(arguments[0]);
});

chris.on('error', function(error) {
  console.log('Things went wrong.');
  console.log(error);
});

// or of course:

chris(function(err, data) {
  console.log(['chris on end', err, data]);
});

chris(function(err, author) {
  author && author.book_set && author.book_set.create({
    'title':'my awesome life',
    'published':Date.now(),
    'slug':'2010-01-20-my-awesome-life', // or ormnomnom.fromFields(['published', 'title'])
  }).on('end', request.attemptContinue.bind(request));
});

// basically set a process.nextTick message after a query is defined. 
// Once we're out of the woods of the originating function, we can decide exactly what the query was meant to do.
Author.objects.filter({
  name__contains:'asdf'
}).update({
  name:'Chewbacca Solo'
}).on('end', function(err, data) {
  console.log('MWRRARRRRWWRRRRR');
  console.log(arguments);
});

// deleting:
var bookBurning = Book.objects.filter({author__name:'Chris Dickinson'}).delete();
bookBurning(function(err, data) {
  console.log('burnt '+data+' books');
});
