{unit, test} = require 'platoon'
{models, exceptions} = require '../'

unittest = (ns, functions...)->
    coerce = (fn)->
        r = fn.bind({}, ns)
        r.__doc__ = fn.__doc__
        r

    unit(
        {
            setup:(ready)->
                ns.db_creation 'default', yes, (err, data)->
                    ready()
            teardown:(ready)->
                ns.db_deletion 'default', yes, (err, data)->
                    ready()
        }
        (coerce fn for fn in functions)...
    )

module.exports = exports =
    'test autofield pk':unittest(
        models.namespace 'custom_pk', (ns)->
            Model = ns.create 'Model'
            Model.schema
                my_own_pk:models.AutoField
                handle:models.CharField {default:->"whatever"}

        test "Test that creation of a custom pk model works as expected.", (ns, assert)->
            creation = ns.models.Model.objects.create {}
            creation assert.async (err, data)->
                assert.fail err
                assert.ok data
                assert.strictEqual data.pk, data.my_own_pk
                assert.fail data.id
                assert.fail ns.models.Model._schema.get_field_by_name 'id'

        test "Test that filtering based on pk returns appropriate results.", (ns, assert)->
            expected = 'filtering_test_'+~~(Math.random()*100)
            creation = ns.models.Model.objects.create {}
            creation assert.async (err, data)->
                assert.fail err
                assert.ok data
                assert.strictEqual data.pk, data.my_own_pk
                ns.models.Model.objects.get({pk__exact:data.my_own_pk}) assert.async (err, instance)->
                    assert.fail err
                    assert.ok instance
                    assert.equal instance.handle, data.handle
    )

    'test non-integer pk':unittest(
        models.namespace 'custom_nonint_pk', (ns)->
            Model = ns.create 'Model'
            Model.schema
                my_personal_pk:models.CharField {primary_key:true}

            FKModel = ns.create 'FKModel'
            FKModel.schema
                model:models.ForeignKey Model
                name:models.CharField {default:->"anything really #{~~(Math.random()*100)}"}

            M2MModel = ns.create 'M2MModel'
            M2MModel.schema
                models:models.ManyToMany Model
                name:models.CharField {default:->"anything really #{~~(Math.random()*100)}"}

        test "Test that non-integer primary key INSERT works as expected.", (ns, assert)->
            Model = ns.models.Model
            expected = 'text_pk_'+~~(Math.random()*100)
            creation = Model.objects.create {my_personal_pk:expected}
            creation assert.async (err, data)->
                assert.fail err
                assert.ok data
                assert.equal data.pk, expected
                assert.equal data.my_personal_pk, data.pk

        test "Test that non-integer primary key SELECT works as expected.", (ns, assert)->
            Model = ns.models.Model
            i = 0
            fn = ->
                if i < 10
                    expected = 'select_text_pk_'+~~(Math.random()*100)+'_'+(i++)
                    creation = Model.objects.create {my_personal_pk:expected}
                    creation fn
                else done()
            done = assert.async ->
                Model.objects.filter({pk__startswith:'select_text_'}) assert.async (err, pk_data)->
                    assert.fail err
                    assert.ok pk_data
                    assert.equal pk_data.length, 10
                    Model.objects.filter({my_personal_pk__startswith:'select_text_'}) assert.async (err, n_data)->
                        assert.fail err
                        assert.ok n_data
                        assert.equal n_data.length, pk_data.length
                        for i in [0...n_data.length]
                            assert.equal n_data[i].pk, pk_data[i].pk
                            assert.equal n_data[i].my_personal_pk, pk_data[i].my_personal_pk
                            assert.equal n_data[i].pk, pk_data[i].my_personal_pk
                            assert.equal n_data[i].my_personal_pk, pk_data[i].pk
            fn()

        test "Test that non-integer primary key UPDATE works as expected.", (ns, assert)->
            Model = ns.models.Model
            expected = 'text_pk_'+~~(Math.random()*100)
            expected2 = 'yeah_text_pk_'+~~(Math.random()*100)
            creation = Model.objects.create {my_personal_pk:expected}
            creation assert.async (err, data)->
                assert.fail err
                assert.ok data
                assert.equal data.pk, expected
                update = Model.objects.filter({pk:data.pk}).update {pk:expected2}
                update assert.async (err, data)->
                    assert.fail err
                    Model.objects.filter({pk:expected2}) assert.async (err, data)->
                        assert.fail err
                        assert.equal data.length, 1
                        assert.equal data[0].pk, expected2

        test "Test that non-integer primary key DELETE works as expected.", (ns, assert)->
            Model = ns.models.Model
            expected = 'text_pk_'+~~(Math.random()*100)
            expected2 = 'yeah_text_pk_'+~~(Math.random()*100)
            creation = Model.objects.create {my_personal_pk:expected}
            creation assert.async (err, data)->
                assert.fail err
                assert.ok data
                assert.equal data.pk, expected
                Model.objects.filter({pk:data.pk}).delete() assert.async (err)->
                    assert.fail err
                    Model.objects.filter({pk:data.pk}) assert.async (err, data)->
                        assert.fail err
                        assert.equal data.length, 0

        test "Test that non-integer primary key instance DELETE works as expected.", (ns, assert)->
            Model = ns.models.Model
            expected = 'text_pk_'+~~(Math.random()*100)
            expected2 = 'yeah_text_pk_'+~~(Math.random()*100)
            creation = Model.objects.create {my_personal_pk:expected}
            creation assert.async (err, data)->
                assert.fail err
                assert.ok data
                assert.equal data.pk, expected
                data.delete() assert.async (err)->
                    assert.fail err
                    Model.objects.filter({pk:data.pk}) assert.async (err, data)->
                        assert.fail err
                        assert.equal data.length, 0

        test "Test that foreign key relations work as expected.", (ns, assert)->
            {Model, FKModel} = ns.models
            expected = 'text_pk_'+~~(Math.random()*100)
            FKModel.objects.create({model:Model.objects.create({pk:expected})}) assert.async (err, fkdata)->
                assert.fail err
                assert.ok fkdata
                fkdata.model() assert.async (err, data)->
                    assert.fail err
                    assert.equal data.pk, expected
                    data.fkmodel_set.all() assert.async (err, data)->
                        assert.fail err
                        assert.ok data
                        assert.equal data.length, 1
                        assert.equal fkdata.pk, data[0].pk

        test "Test that many to many relations work as expected.", (ns, assert)->
            {Model, M2MModel} = ns.models
            expected = 'text_pk_'+~~(Math.random()*100)
            creation = Model.objects.create {my_personal_pk:expected}
            creation assert.async (err, model)->
                assert.fail err
                assert.ok model
                assert.equal model.pk, expected
                M2MModel.objects.create({name:expected+'_m2m'}) assert.async (err, m2m)->
                    assert.fail err
                    assert.ok m2m
                    m2m.models.add(model) assert.async (err, rel)->
                        assert.fail err
                        model.m2mmodel_set.filter({name:expected+'_m2m', pk:m2m.pk}) assert.async (err, m2mlist)->
                            assert.fail err
                            assert.equal m2mlist.length, 1
                            assert.equal m2mlist[0].pk, m2m.pk

                        m2m.models.filter({pk:expected}) assert.async (err, modellist)->
                            assert.fail err
                            assert.equal modellist.length, 1
                            assert.equal modellist[0].pk, model.pk
                            assert.equal model.pk, expected

    )
