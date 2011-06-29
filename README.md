ORMnomnom
=========

ORMnomnom is designed to be a database-agnostic ORM that interfaces nicely with various templating libraries
and existing JavaScript code, with an eye towards being beautiful to read and write code for using CoffeeScript.

The API design is largely borrowed from [Django's ORM](https://docs.djangoproject.com/en/1.3/topics/db/models/); while
not 100% similar the general theme should be familiar to anyone who has worked with Django before. 

There are currently adapters for [brianc's node-postgres](https://github.com/brianc/node-postgres) and [developmentseed's node-sqlite3](https://github.com/developmentseed/node-sqlite3).

What Does It Look Like?
-----------------------

The three major types of objects are `namespace`s (otherwise known as `Scope`s), `Model`s, and `QuerySet`s.
Namespaces may contain one or more model definitions; these model definitions may refer to models from other namespaces.
Namespaces are (currently) responsible for creation of database tables for their constituent models. The schema and metadata
of a model may only be set within a namespace.

Let's take a look at what the average `models.js` file might look like:

````javascript
var models = require('ormnomnom').models;

exports.ns = 
models.namespace('blog', function(ns) {
    var Post = ns.create('Post');

    Post.schema({
        // field definitions need not be explictly called,
        // uncalled fields will be instantiated with the default options.
        'title':models.CharField,
        'slug':models.CharField({regex:/^[\w\d\-_]*$/g, unique:true}),
        'pub_date':models.DateField({default:function() { return new Date(); }}),
        'description':models.TextField
    });

    Post.meta({
        'order_by':['-pub_date']
    });

    // models returned by `ns.create` are class constructor functions, just like in vanilla JS.
    // all instances of that model will have anything you throw onto their `prototype` available to them.
    Post.prototype.toString = function() {
        return '<Post: '+this.title+'>';
    };

    var Section = ns.create('Section');

    Section.schema({
        'post':models.ForeignKey(Post),
        'header':models.CharField({nullable:true, default:null}),
        'subhead':models.CharField({nullable:true, default:null}),
        'content':models.TextField,
        'ordering':models.PositiveIntegerField
    });

    Schema.meta({
        'order_by':['ordering'],
        'unique_together':['ordering', 'post']
    });

    var Tag = ns.create('Tag');

    Tag.schema({
        'name':models.CharField({max_length:100}),
        'posts':models.ManyToMany(Post, {related_name:'tags'})
    });

    exports.Post = Post;
    exports.Section = Section;
    exports.Tag = Tag;
});
````

In this schema, a `Post` has many `Section`s, and `Tag`s may be associated with many `Post`s. Note that models are just plain-old function constructors,
like any JavaScript class. Also note that the `namespace` callback is executed immediately -- `export`ing models from within the namespace is encouraged.
Outside of the namespace closure, the `schema` and `meta` methods will be unavailable and your models will be ready to use.

Querying Using Models
---------------------

Building on the previous example, let's look at how we might query the above objects.

````javascript
var models = require('./models'),
    Post = models.Post,
    Section = models.Section,
    Tag = models.Tag;

// Model classes are automatically assigned a `Manager` (available under 'Model._default_manager' as well as 'Model.objects') which is responsible for starting queries, like so:
_

// query all of the posts.
var posts = Post.objects.all()

// queries emit either 'data' or 'error', and nothing else.
// when 'data' is emitted, the query has completed.
posts.on('data', function(posts) {
    posts.forEach(function() {
        console.log('Got '+post);
    });
});

posts.on('error', function(err) {
    // handle your error, sir.
});

// you may also call posts as if it was a function taking a callback:
// no casting necessary.
posts(function(err, posts) {
    // do something with posts.
});

// you may filter on the fields available to 'post'.
// multiple arguments in one filter call will be 'AND'd together.
var other_posts = Post.objects.filter({title__contains:'something', slug:'something-else'});

// filters may be chained, and excluded.
// chained filters will be 'AND'd together as well.
// exclude will produce NOT(arg AND arg AND arg)
other_posts.filter({pub_date__lte:new Date()}).exclude({slug__startswith:'butts'});

// you may use a filter to delete objects as well:
other_posts.delete()

other_posts(function(err) {
    // if there's no 'err', your filter has run successfully
});

// if you only need one specific row, use 'get':

Post.objects.get({title:'something'})(function(err, post) {
    // if more than one 'Post' was returned, err will be an instance of Post.MultipleObjectsReturned.
    // if no 'Post's were returned, err will be an instance of Post.DoesNotExist, 

    // otherwise post will be a single Post object.

});


// creation is pretty easy as well:
var my_post = Post.objects.create({
    'title':'Introducing ORMnomnom',
    'slug':'introducing-ormnomnom',
    'pub_date':new Date(),
    'description':'ORMNOMNOM'
});

my_post.on('data', function(post) {
    // our post object exists!
});

// you may also use this format:
var post = new Post({
    'title':'Introducing ORMnomnom',
    'slug':'introducing-ormnomnom',
    'pub_date':new Date(),
    'description':'ORMNOMNOM'
});

post.save().on('data', function(post) {
    // my post!
});

// you may pass querysets to other querysets as arguments without waiting for them to return, as well:

section = Section.objects.create({
    'content':'whoa',
    'ordering':0,
    'post':Post.objects.create({
        'title':'Introducing ORMnomnom',
        'slug':'introducing-ormnomnom',
        'pub_date':new Date(),
        'description':'ORMNOMNOM'
    })
});

// errors from inner queries such as the above will be bubbled up through the 'section' queryset.

// you may query across related tables, as well:

section.objects.filter({post__title__contains:'hats'});

// or in reverse (the default reverse relation name is the name of the model with the foreign key, lowercased, plus '_set'):
Post.objects.filter({section_set__content:'whoa'});

// the above statement about being able to pass querysets applies to filtering, as well
Section.objects.filter({post:Post.objects.get({pk:3})})
Section.objects.filter({post__in:Post.objects.filter({title__contains:'something'})})

// related filtered works with M2M relations:
Tag.objects.filter({post__title:'Yeah!'})

// note that we configured the related name for Tags in the models above.
Post.objects.filter({tags__name__contains:'bowser'})

// filters may be limited and ordered:
// "give me three posts, ordered by title ASC, id DESC"
Post.objects.filter({pk:3}).order_by('title', '-id').limit(3)

// "give me 20 posts starting at 10."
Post.objects.filter({pk:3}).limit(10, 20);

````

Filters execute as soon as the current stack is exhausted. 

License
-------
new BSD

