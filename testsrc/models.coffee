{unit} = require 'platoon'
{models, exceptions} = require '../'
{BaseModel} = models

module.exports = exports =
    'test BaseModel static methods':unit(
        {}

        (assert)->
            '''Test BaseModel.lock disables models schema and meta methods, delegates to .compile and .create_manager'''
            expected = new Object

            expected.schema = -> noop?
            expected.meta = -> noop?

            fake_model_base =
                compile:(model_fn)->
                    assert.strictEqual model_fn, expected
                create_manager:(model_fn)->
                    assert.strictEqual model_fn, expected
                lock:BaseModel.lock
            fake_model_base.lock(expected)

            assert.throws Error, -> expected.schema()
            assert.throws Error, -> expected.meta()

        (assert)->
            '''Test BaseModel.set_meta delegates to `model_fn._meta.set`'''
            mock_meta = {collection:{}}
            mock_meta.set = (key, val)-> @collection[key] = val
            mock_model = {_meta:mock_meta}

            expected = {}
            for i in [0...~~(Math.random()*100)+1]
                expected["random_#{i}"] = Math.random()

            BaseModel.set_meta mock_model, expected

            assert.deepEqual mock_meta.collection, expected

        (assert)->
            '''Test BaseModel.set_schema delegates to `model_fn._schema.set`'''
            mock_schema = {collection:{}}
            mock_schema.set = (key, val)-> @collection[key] = val
            mock_model = {_schema:mock_schema}

            expected = {}
            for i in [0...~~(Math.random()*100)+1]
                expected["random_#{i}"] = Math.random()

            BaseModel.set_schema mock_model, expected

            assert.deepEqual mock_schema.collection, expected

        (assert)->
            '''Test BaseModel.compile adds a primary key named `id` and aliases it if model_fn does not
            already have a primary key.'''
            {Schema, Meta} = require '../src/schema'
            {AutoField} = require '../src/fields'
            model = -> lol?
            schema = new Schema model
            schema.connect_related = assert.async -> assert.ok 'just testing that this gets triggered'
            model._schema = schema

            assert.fail model._schema.get_field_by_name 'id'
            assert.fail model._schema.get_field_by_name 'pk'

            BaseModel.compile model

            assert.ok model._schema.get_field_by_name 'id'
            assert.ok model._schema.get_field_by_name 'pk'
            assert.strictEqual model._schema.get_field_by_name('id'), model._schema.get_field_by_name('pk')
            assert.isInstance model._schema.get_field_by_name('id'), AutoField

        (assert)->
            '''Test BaseModel.compile will not add a primary key if schema says that it already has one.'''
            {Schema, Meta} = require '../src/schema'
            {AutoField} = require '../src/fields'
            model = -> noop?
            schema = new Schema model
            schema.connect_related = assert.async -> assert.ok 'just testing that this gets triggered'
            schema.has_primary_key = yes
            model._schema = schema

            assert.fail model._schema.get_field_by_name 'id'
            assert.fail model._schema.get_field_by_name 'pk'

            BaseModel.compile model

            assert.fail model._schema.get_field_by_name 'id'
            assert.fail model._schema.get_field_by_name 'pk'

        (assert)->
            '''Test BaseModel.create_manager automatically creates an instance of Manager passing `model_fn`'''
            {Manager} = require '../src/managers'
            model_fn = -> noop?

            BaseModel.create_manager model_fn

            assert.isInstance model_fn._default_manager, Manager
            assert.isInstance model_fn.objects, Manager
            assert.strictEqual model_fn.objects, model_fn._default_manager

        (assert)->
            '''Test BaseModel.create_manager will use user-provided managers'''
            {Manager} = require '../src/managers'
            FakeManager = (model_fn) -> assert.isInstance @, FakeManager
            model_fn = -> noop?
            model_fn.objects = FakeManager

            BaseModel.create_manager model_fn
            assert.isInstance model_fn._default_manager, Manager
            assert.isInstance model_fn.objects, FakeManager
            assert.strictNotEqual model_fn.objects, model_fn._default_manager
    )
    'test BaseModel prototype methods':unit(
        {}

        (assert)->
            '''Test BaseModel#assign throws errors when given values not present in schema'''
            {Meta, Schema} = require '../src/schema'
            MockModel = -> noop?
            MockModel._schema = new Schema MockModel
            MockModel._meta = new Meta MockModel
            MockModel:: = BaseModel::
            MockModel::constructor = MockModel
            model = new MockModel
            assert.throws exceptions.ValidationError, -> model.assign {'anything':Math.random()}

        (assert)->
            '''Test BaseModel#assign delegates to Field#apply_value.'''
            {Schema} = require '../src/schema'
            expected_field_name = "random_#{~~(100*Math.random())}"
            MockModel = -> noop?
            MockModel._schema = new Schema
            MockModel._schema.set expected_field_name, models.IntegerField()
            MockModel:: = BaseModel::
            MockModel::constructor = MockModel
            model = new MockModel

            assert.doesNotThrow exceptions.ValidationError, ->
                value = {}
                expected_value = ~~(Math.random() * 100)
                value[expected_field_name] = expected_value
                model.assign(value)
                assert.equal model[expected_field_name], expected_value

        (assert)->
            '''Test that BaseModel#save runs an update when `pk` is available'''
            {Model} = require './fixtures/models'
            Model.objects.create({anything:'anything', validated:'okay'}) assert.async (err, instance)->
                assert.fail err
                assert.ok instance.pk
                pk = instance.pk
                expected_name = "anything_#{~~(Math.random()*100)}"
                instance.anything = expected_name
                instance.save() assert.async (err, data)->
                    assert.fail err
                    Model.objects.get({pk:pk}) assert.async (err, instance2)->
                        assert.fail err
                        assert.equal instance2.pk, instance.pk
                        assert.equal instance2.anything, expected_name

        (assert)->
            '''Test that BaseModel#save runs a create when `pk` is not available'''
            {Model} = require './fixtures/models'
            expected = "I fully expect this to be #{~~(Math.random()*100)}"
            model = new Model {anything:expected, validated:'okay'}
            assert.fail model.pk
            model.save() assert.async (err, data)->
                assert.fail err
                assert.ok data.pk
                assert.equal data.anything, expected

        (assert)->
            '''Test that BaseModel#delete runs a delete when `pk` is available'''
            {Model} = require './fixtures/models'
            Model.objects.create({anything:'anything', validated:'okay'}) assert.async (err, instance)->
                assert.fail err
                assert.ok instance.pk
                instance.delete() assert.async (err, data)->
                    assert.fail err
                    Model.objects.filter({pk:instance.pk}) assert.async (err, data)->
                        assert.fail err
                        assert.equal data.length, 0

        (assert)->
            '''Test that BaseModel#delete throws an error when `pk` is not available'''
            {Model} = require './fixtures/models'
            model = new Model {anything:'anything', validated:'okay'}
            assert.fail model.pk
            assert.throws Error, -> model.delete()

        (assert)->
            '''Test that creating models with DateFields works as expected'''
            [{Related}, {Model}] = [require('./fixtures/related'), require('./fixtures/models')]
            date = new Date
            creation = Related.objects.create
                model:Model.objects.create {anything:'anything', validated:'great'}
                pub_date:date

            creation assert.async (err, data)->
                assert.fail err
                assert.isInstance data.pub_date, Date
                assert.equal data.pub_date.getUTCFullYear(), date.getUTCFullYear()
                assert.equal data.pub_date.getUTCMonth(), date.getUTCMonth()
                assert.equal data.pub_date.getUTCDate(), date.getUTCDate()

    )
