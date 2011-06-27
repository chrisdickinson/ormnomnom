{models, exceptions} = require '../'
{Model} = require './fixtures/models'
{Related, Many} = require './fixtures/related'
{unit} = require 'platoon'

module.exports = exports =
    'test basic api':unit(
        {}
        (assert)->
            'Test that filters are functions.'
            filter = Model.objects.all()
            assert.ok filter.call?
            assert.ok filter.apply?
            assert.isInstance filter, Function
            assert.doesNotThrow Error, ()->
                filter()
        (assert)->
            "Test that filters are event emitters."
            filter = Model.objects.all()
            assert.ok filter.on?
            assert.ok filter.emit?

            expected = Math.random()
            filter.on 'randomthing', assert.async (anything) -> assert.equal anything, expected
            filter.emit 'randomthing', expected
        (assert)->
            "Test that filter chaining results in the same filter."
            filter = Model.objects.all()
            assert.strictEqual filter, filter.filter({anything:'random'})
        (assert)->
            "Test that invalid fields result in an error being emitted."
            filter = Model.objects.filter
                dne:Math.random()

            filter assert.async (err)->
                assert.isInstance err, exceptions.SchemaError
        (assert)->
            "Test that an invalid lookup parameter results in an error being emitted."
            filter = Model.objects.filter
                anything:null

            filter assert.async (err)->
                assert.isInstance err, exceptions.ValidationError
        (assert)->
            "Test that exact filtering returns results as expected."
            creation = Model.objects.create
                anything:'okay'
                validated:'alright'

            creation assert.async (err, data)->
                assert.fail err

                correct = Model.objects.filter {anything:'okay'}
                wrong = Model.objects.filter {anything:'not okay'}

                correct assert.async (err, rows)->
                    assert.equal rows.length, 1
                    assert.isInstance rows[0], Model
                    assert.fail err

                wrong assert.async (err, rows)->
                    assert.fail err
                    assert.equal rows.length, 0
        (assert)->
            "Test that creation with invalid parameters emits a ValidationError."
            creation = Model.objects.create
                anything:'okay'
                validated:'anything?!?'

            creation assert.async (err, data)->
                assert.isInstance err, exceptions.ValidationError
                assert.fail data

            creation2 = Model.objects.create
                validated:'okay'

            creation2 assert.async (err, data)->
                assert.isInstance err, exceptions.ValidationError
                assert.fail data
        (assert)->
            "Test that exclude works as expected."
            random_name = "random_#{~~(Math.random() * 100)}"
            creation = Model.objects.create
                anything:random_name
                validated:'okay'

            creation assert.async (err, data)->
                assert.fail err
                assert.ok data

                pk = data.pk
                exclusion = Model.objects.all().exclude {pk:pk}
                exclusion assert.async (err, data)->
                    assert.fail err
                    assert.ok data
                    assert.strictEqual (instance for instance in data when instance.pk is pk).length, 0
    )
    'test filtering':unit(
        {}
        (assert)->
            "Test that exact grabs the exact model specific."
            random_name = "random_exact_test_#{~~(Math.random()*100)}"
            creation = Model.objects.create
                anything:random_name
                validated:'okay'

            creation assert.async (err, data)->
                assert.fail err
                pk = data.pk
                Model.objects.filter({anything__exact:random_name}) assert.async (err, rows)->
                    assert.equal rows.length, 1
                    assert.equal rows[0].pk, pk
        (assert)->
            "Test that contains grabs the appropriate model."
            random_name = "random_contains_test_#{~~(Math.random()*100)}"
            creation = Model.objects.create
                anything:random_name
                validated:'okay'

            creation assert.async (err, data)->
                assert.fail err
                pk = data.pk
                Model.objects.filter({anything__contains:'_contains_'}) assert.async (err, rows)->
                    assert.equal rows.length, 1
                    assert.equal rows[0].pk, pk
        (assert)->
            "Test that `in` returns the appropriate model(s)."
            random_name = "random_contains_test_#{~~(Math.random()*100)}"
            creation = Model.objects.create
                anything:random_name
                validated:'okay'

            creation assert.async (err, data)->
                assert.fail err
                pk = data.pk
                Model.objects.filter({pk__in:[pk, 1000]}) assert.async (err, rows)->
                    assert.equal rows.length, 1
                    assert.equal rows[0].pk, pk

                Model.objects.filter({pk__in:Model.objects.filter({anything:random_name}).flat_values_list 'pk'}) assert.async (err, rows)->
                    assert.equal rows.length, 1
                    assert.equal rows[0].pk, pk
        (assert)->
            "Test that `gt` returns rows greater than the current number."
            creation1 = Model.objects.create
                anything:'lol'
                validated:'okay'

            creation1 assert.async (err, data)->
                assert.fail err
                pk = data.pk
                creation2 = Model.objects.create
                    anything:'lol2'
                    validated:'okay'
                creation2 assert.async (err, data)->
                    assert.fail err
                    pk2 = data.pk
                    Model.objects.filter({pk__gt:pk}) assert.async (err, data)->
                        assert.fail err

                        assert.equal (model.pk for model in data when model.pk is pk2).length, 1
                        assert.equal (model.pk for model in data when model.pk is pk).length, 0
        (assert)->
            "Test that `gte` returns rows greater or equal than the current number."
            creation1 = Model.objects.create
                anything:'lol'
                validated:'okay'

            creation1 assert.async (err, data)->
                assert.fail err
                pk = data.pk
                creation2 = Model.objects.create
                    anything:'lol2'
                    validated:'okay'
                creation2 assert.async (err, data)->
                    assert.fail err
                    pk2 = data.pk
                    Model.objects.filter({pk__gte:pk}) assert.async (err, data)->
                        assert.fail err

                        assert.equal data.length, 2
                        assert.equal (model.pk for model in data when model.pk is pk2).length, 1
                        assert.equal (model.pk for model in data when model.pk is pk).length, 1
        (assert)->
            "Test that `lt` returns rows lesser than the current number."
            Model.objects.delete() assert.async (err, data)->
                assert.fail err
                creation1 = Model.objects.create
                    anything:'lol'
                    validated:'okay'

                creation1 assert.async (err, data)->
                    assert.fail err
                    pk = data.pk
                    creation2 = Model.objects.create
                        anything:'lol2'
                        validated:'okay'
                    creation2 assert.async (err, data)->
                        assert.fail err
                        pk2 = data.pk
                        Model.objects.filter({pk__lt:pk2}) assert.async (err, data)->
                            assert.fail err

                            assert.equal data.length, 1
                            assert.equal (model.pk for model in data when model.pk is pk2).length, 0 
                            assert.equal (model.pk for model in data when model.pk is pk).length, 1
        (assert)->
            "Test that `lte` returns rows lesser than the current number."
            Model.objects.delete() assert.async (err, data)->
                assert.fail err
                creation1 = Model.objects.create
                    anything:'lol'
                    validated:'okay'

                creation1 assert.async (err, data)->
                    assert.fail err
                    pk = data.pk
                    creation2 = Model.objects.create
                        anything:'lol2'
                        validated:'okay'
                    creation2 assert.async (err, data)->
                        assert.fail err
                        pk2 = data.pk
                        Model.objects.filter({pk__lte:pk2}) assert.async (err, data)->
                            assert.fail err

                            assert.equal data.length, 2
                            assert.equal (model.pk for model in data when model.pk is pk2).length, 1
                            assert.equal (model.pk for model in data when model.pk is pk).length, 1
        (assert)->
            "Test that `startswith` returns rows with fields that start with the value."
            random_name_start = "test_startswith_#{~~(100*Math.random())}_"
            random_name = "#{random_name_start}#{~~(100*Math.random())}"
            rex = new RegExp '^'+random_name_start
            Model.objects.create({anything:random_name, validated:'okay'}) assert.async (err)->
                assert.fail err
                Model.objects.filter({anything__startswith:random_name_start}) assert.async (err, instances)->
                    assert.fail err
                    assert.equal instances.length, 1
                    assert.ok rex.test instances[0].anything
        (assert)->
            "Test that `endswith` returns rows with fields that end with the value."
            random_name_end = "_test_endswith_#{~~(100*Math.random())}"
            random_name = "#{~~(100*Math.random())}#{random_name_end}"
            rex = new RegExp random_name_end+'$'
            Model.objects.create({anything:random_name, validated:'okay'}) assert.async (err)->
                assert.fail err
                Model.objects.filter({anything__endswith:random_name_end}) assert.async (err, instances)->
                    assert.fail err
                    assert.equal instances.length, 1
                    assert.ok rex.test instances[0].anything
        (assert)->
            "Assert that range works."
            random_name = "random_range_test_#{~~(Math.random()*100)}"
            creation = Model.objects.create
                anything:random_name
                validated:'okay'

            creation assert.async (err, data)->
                assert.fail err
                pk = data.pk
                # remember, __range is inclusive.
                Model.objects.filter({pk__range:[pk, pk+1]}) assert.async (err, rows)->
                    assert.equal rows.length, 1
                    assert.equal rows[0].pk, pk

                Model.objects.filter({pk__range:[pk+1, pk+20]}) assert.async (err, rows)->
                    assert.equal rows.length, 0
    )
    'test foreign key filtering api':unit(
        {}

        (assert)->
            'Test that filtering on local relations works as expected.'
            expected_anything = "related_anything_#{~~(100*Math.random())}"
            creation = Related.objects.create
                model:Model.objects.create {anything:expected_anything, validated:'whatever'}

            creation assert.async (err, related_instance)->
                assert.fail err
                Related.objects.filter({model__anything:expected_anything}) assert.async (err, related_list)->
                    assert.fail err
                    related = related_list[0]
                    assert.equal related.pk, related_instance.pk
                    related.model() assert.async (err, model_lhs)->
                        related_instance.model() assert.async (err, model_rhs)->
                            assert.equal model_lhs.pk, model_rhs.pk
                            assert.equal model_lhs.anything, expected_anything
                            assert.equal model_rhs.anything, expected_anything

        (assert)->
            'Test that filtering on reverse relations works as expected.'
            expected_anything = "related_anything_#{~~(100*Math.random())}"
            creation = Related.objects.create
                model:Model.objects.create {anything:expected_anything, validated:'whatever'}

            creation assert.async (err, related_instance)->
                assert.fail err
                assert.ok related_instance
                related_instance.model() assert.async (err, model)->
                    assert.fail err
                    assert.ok model
                    Model.objects.filter({related_set__pk:related_instance.pk}) assert.async (err, data)->
                        assert.fail err
                        assert.ok data
                        assert.equal data.length, 1
                        assert.equal data[0].pk, model.pk


        (assert)->
            'Test that filtering back onto the originating model works as expected.'
            expected_anything = "related_anything_#{~~(100*Math.random())}"
            creation = Related.objects.create
                model:Model.objects.create {anything:expected_anything, validated:'whatever'}

            creation assert.async (err, related_instance)->
                assert.fail err
                assert.ok related_instance
                related_instance.model() assert.async (err, model)->
                    assert.fail err
                    assert.ok model
                    Model.objects.filter({related_set__model__pk:model.pk}) assert.async (err, data)->
                        assert.fail err
                        assert.ok data
                        assert.equal data.length, 1
                        assert.equal data[0].pk, model.pk

        (assert)->
            'Test that filtering on M2M relations works as expected.'
            creation = Related.objects.create
                model:Model.objects.create {anything:'lolwut', validated:'whatever'}
            creation assert.async (err, related)->
                assert.fail err
                assert.ok related
                related.model() assert.async (err, model)->
                    assert.fail err
                    assert.ok model
                    creation = Many.objects.create {}
                    creation assert.async (err, many)->
                        assert.fail err
                        assert.ok many
                        addition = many.related.add related
                        addition assert.async (err, data)->
                            Many.objects.filter({related__model__pk:model.pk}) assert.async (err, rows)->
                                assert.fail err
                                assert.ok rows
                                assert.equal rows.length, 1
                                assert.equal rows[0].pk, many.pk

    )
