{unittest, test, models, exceptions} = require './_utils'

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

    'test empty string into charfield interactions':unittest(
        models.namespace 'empty_string', (ns)->
            Nullable = ns.create 'Nullable'
            Nullable.schema
                value:models.CharField {nullable:true}

            Default = ns.create 'Default'
            Default.schema
                value:models.CharField {default:''}

            DefaultValue = ns.create 'DefaultValue'
            DefaultValue.schema
                value:models.CharField {default:'hello world'}

            DefaultNullable = ns.create 'DefaultNullable'
            DefaultNullable.schema
                value:models.CharField {default:'', nullable:yes}

        test 'test plain nullable bare create', (ns, assert)->
            ns.models.Nullable.objects.create({}) assert.async (err, data)->
                assert.fail err
                assert.ok data
                assert.strictEqual data.value, null

        test 'test plain nullable null create', (ns, assert)->
            ns.models.Nullable.objects.create({value:null}) assert.async (err, data)->
                assert.fail err
                assert.ok data
                assert.strictEqual data.value, null

        test 'test plain nullable value create', (ns, assert)->
            expected = 'barf'
            ns.models.Nullable.objects.create({value:expected}) assert.async (err, data)->
                assert.fail err
                assert.ok data
                assert.strictEqual data.value, expected 

        test 'test plain default bare create', (ns, assert)->
            ns.models.Default.objects.create({}) assert.async (err, data)->
                assert.fail err
                assert.ok data
                assert.strictEqual data.value, ''

        test 'test plain default null create', (ns, assert)->
            ns.models.Default.objects.create({value:null}) assert.async (err, data)->
                assert.ok err
                assert.fail data

        test 'test value default null create', (ns, assert)->
            ns.models.DefaultValue.objects.create({value:null}) assert.async (err, data)->
                assert.ok err
                assert.fail data

        test 'test value default empty create', (ns, assert)->
            ns.models.DefaultValue.objects.create({value:''}) assert.async (err, data)->
                assert.fail err
                assert.ok data
                assert.strictEqual data.value, ''

        test 'test value default bare create', (ns, assert)->
            ns.models.DefaultValue.objects.create({}) assert.async (err, data)->
                assert.fail err
                assert.ok data
                assert.strictEqual data.value, 'hello world'

        test 'test plain default value create', (ns, assert)->
            expected = 'barf'
            ns.models.Default.objects.create({value:expected}) assert.async (err, data)->
                assert.fail err
                assert.ok data
                assert.strictEqual data.value, expected

        test 'test default empty nullable empty create', (ns, assert)->
            ns.models.DefaultNullable.objects.create({}) assert.async (err, data)->
                assert.fail err
                assert.ok data
                assert.strictEqual data.value, ''

        test 'test default empty nullable null create', (ns, assert)->
            ns.models.DefaultNullable.objects.create({value:null}) assert.async (err, data)->
                assert.fail err
                assert.ok data
                assert.strictEqual data.value, null
    )

    'test integer default':unittest(
        models.namespace 'integer_default', (ns)->
            Model = ns.create 'Model'
            Model.schema
                name:models.CharField
                value:models.IntegerField {default:0}

            Model2 = ns.create 'Model2'
            Model2.schema 
                name:models.CharField
                value:models.IntegerField {default:1}

            Model3 = ns.create 'Model3'
            Model3.schema
                name:models.CharField
                value:models.IntegerField {default:->0}

        test "Test that creation of a model with a bare, 0 default works.", (ns, assert)->
            expected = 'arfarf'
            ns.models.Model.objects.create({name:expected}) assert.async (err, data)->
                assert.fail err
                assert.ok data
                assert.equal data.name, expected
                assert.equal data.value, 0

        test "Test that creation of a model with a bare, 1 default works.", (ns, assert)->
            expected = 'arfarf'
            ns.models.Model2.objects.create({name:expected}) assert.async (err, data)->
                assert.fail err
                assert.ok data
                assert.equal data.name, expected
                assert.equal data.value, 1

        test "Test that creation of a model with a callable 0 default works.", (ns, assert)->
            expected = 'arfarf'
            ns.models.Model3.objects.create({name:expected}) assert.async (err, data)->
                assert.fail err
                assert.ok data
                assert.equal data.name, expected
                assert.equal data.value, 0

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
