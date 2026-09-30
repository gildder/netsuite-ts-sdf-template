/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
/*
    Diego Poblete Esteves
    NAME:   SDB | Formulario de Cuotas Siscred
    ID:     customscript_sdb_fee_payment_approval

    Objeto:
    El formulario en un principio dibuja sólo un campo "clientes", que al ser fulfilleado es escuchado por un clientScript(fieldChange)
    se dispara y dibuja en el formulario las líneas correspondientes a pagos pendientes del usuario.  
*/
                            
var CLIENT_SCRIPT_FILE_ID = 'SuiteScripts/SDB_fee_payment_approval_CS.js';
var SEARCH_EXISTE_DEUDA = 'customsearch_sdb_siscred_existedeuda';
var SEARCH_DEUDAS = 'customsearch_sdb_cuotaspendientes_2';
var TOTAL_DEUDAS = 'customsearch_sdb_siscred_totaldeuda_2'
var SEARCH_VIGENTES = 'customsearch_siscred_cuotasvigentes_2'; 
var PAGE_SIZE = 20;
var lineas = []; 


define(['N/ui/serverWidget', 'N/search', 'N/task', 'N/runtime'],
function (serverWidget, search, task, runtime) {

    function onRequest(context){
        if (context.request.method == 'GET') {
            log.debug('normal','normal')
            //url params
            // var params = JSON.stringify(context.request.parameters);
            //Formulario
            var form = serverWidget.createForm({
                title: 'Pago de Cuotas',
                hideNavBar: false
            });

            var jsonSelected = form.addField({ id: 'custpage_jsonselected', type: 'LONGTEXT', label: 'jsonSelected' });
            jsonSelected.updateDisplayType({
                displayType: serverWidget.FieldDisplayType.HIDDEN
            });

            var customerSelect = form.addField({ id: 'custpage_customer', type: 'SELECT', label: 'CLIENTE', source: 'customer' });
            
            var customerdocument = form.addField({ id: 'custpage_customerdoc', type: 'TEXT', label: 'DOCUMENTO'})
            customerdocument.updateDisplayType({
                displayType: serverWidget.FieldDisplayType.DISABLED
            })

            var scriptObj = runtime.getCurrentScript();
            var bundleArr = scriptObj.bundleIds;
            var pathClient = CLIENT_SCRIPT_FILE_ID;
            if (bundleArr && bundleArr.length) {
                pathClient = 'SuiteBundles/Bundle ' + bundleArr + '/SDB_fee_payment_approval_CS.js';
            }
            form.clientScriptModulePath = pathClient;

            // Get parameters
            var pageId = parseInt(context.request.parameters.page)
            var customerId = context.request.parameters.clientinternalid? context.request.parameters.clientinternalid : ''; 
            var amount = context.request.parameters.amount? context.request.parameters.amount : 0;
            var scriptId = context.request.parameters.script
            var deploymentId = context.request.parameters.deploy

            log.debug('montoAPagar',amount);

            if(customerId){
                var existenCuotasMora = existenCuotasConMora(customerId); 
                log.debug('existenCuotasMora', existenCuotasMora)
                customerSelect.defaultValue = customerId;

                // var nroDoc = getCustomerDocument(customerId);
                var datosCliente = getCustomerData(customerId);
                log.debug('datosCliente', datosCliente)
                var nroDoc = datosCliente.nroDoc;
                var fechaPago = datosCliente.fechaPago;
                customerdocument.defaultValue = nroDoc;
            }

            //si existen cuotas pendientes, creo un array donde ingreso las líneas para luego dibujar la sublista.
            //si no existen cuotas pendientes, creo los array de vigentes y el histórico para dibujar las sublistas.

            //adjust the variables values according to the case
            if(existenCuotasMora == true && customerId){

                // Run search and determine page count
                // var retrieveSearch = runSearch(TOTAL_DEUDAS, PAGE_SIZE, customerId);
                // var pageCount = Math.ceil(retrieveSearch.count / PAGE_SIZE);
                // var columns = retrieveSearch.searchDefinition.columns;
                   
                log.debug('total_deudas', retrieveSearch);
                log.debug('montoAPagar', montoAPagar);

                var Monto = form.addField({
                    id : 'custpage_montoapagar',
                    type : serverWidget.FieldType.FLOAT,
                    label : 'Monto a pagar'
                });
                if(amount){
                    Monto.defaultValue = amount;
                }
    
                var Deuda = form.addField({
                    id : 'custpage_deuda',
                    type : serverWidget.FieldType.FLOAT,
                    label : 'Mora'
                }).updateDisplayType({
                    displayType: serverWidget.FieldDisplayType.DISABLED
                });

                var Total = form.addField({
                    id : 'custpage_montototal',
                    type : serverWidget.FieldType.FLOAT,
                    label : 'Monto Total'
                }).updateDisplayType({
                    displayType: serverWidget.FieldDisplayType.DISABLED
                });
                //Saved Search: consulta por cuotas morosas:
                var fieldsDeuda = getDeudaFields(customerId);
                log.debug('arrayDeuda', fieldsDeuda);
                Deuda.defaultValue = fieldsDeuda.deuda;
                

                //Saved Search: Consulta por cuotas no pagas, y no morosas del cliente.
                //Dependiendo de si el mes es valido como criterio de consulta, podría ser desde el principio de este mes en adelante.
                var cuotasMesActual = getTotalMesActual(customerId);
                var proxCuotas = getProxCuotasCapital(customerId);
                Total.defaultValue =  parseFloat(proxCuotas.totcapital) + parseFloat(cuotasMesActual.totalmesactual) + parseFloat(fieldsDeuda.deuda)
                
        

                log.debug("Datos addSubmitButton: ", customerId+" "+amount+" "+fieldsDeuda.total+" "+existenCuotasMora)

            }else if(existenCuotasMora == false && customerId){
                log.debug("estado", "existenCuotasMora == false && customerId")
                var retrieveSearch = runSearch(SEARCH_VIGENTES, PAGE_SIZE, customerId);
                // log.debug('retrieveSearch', retrieveSearch)
                var pageCount = Math.ceil(retrieveSearch.count / PAGE_SIZE);
                var columns = retrieveSearch.searchDefinition.columns;
                var montoAPagar = form.addField({
                    id : 'custpage_montoapagar',
                    type : serverWidget.FieldType.FLOAT,
                    label : 'Monto a pagar'
                });
                if(amount){
                    montoAPagar.defaultValue=amount;
                }

                var montoActual = form.addField({
                    id : 'custpage_montoactual',
                    type : serverWidget.FieldType.FLOAT,
                    label : 'Monto Actual'
                }).updateDisplayType({
                    displayType: serverWidget.FieldDisplayType.DISABLED
                });
                var datosMontoActual = getMontoActual(customerId);  

                datosMontoActual? datosMontoActual = datosMontoActual : datosMontoActual = { 'tot': 0 }

                log.debug("datosMontoActual", datosMontoActual)
                montoActual.defaultValue = datosMontoActual.tot;

                log.debug('datosMontoActual', datosMontoActual)
                log.debug('montoActual', montoActual);

                var montoTotal = form.addField({
                    id : 'custpage_montototal',
                    type : serverWidget.FieldType.FLOAT,
                    label : 'Monto Total'
                }).updateDisplayType({
                    displayType: serverWidget.FieldDisplayType.DISABLED
                });
                // var datosMontoTotal = getMontoTotal(customerId); 
                var proxCuotas = getProxCuotasCapital(customerId);
                montoTotal.defaultValue = parseFloat(datosMontoActual.tot) + parseFloat(proxCuotas.totcapital);
                log.debug("proxCuotas.totcapital", proxCuotas.totcapital)

                // Add sublist that will show results           
                var sublist = form.addSublist({
                    id: 'custpage_table',
                    type: serverWidget.SublistType.LIST,
                    label: 'Cuotas del mes'                    
                });
                //columns: toma de la definición de la search las columnas y crea un "th" para c/u
                for (var i = 0; i < columns.length; i++) {
                    var column = columns[i];                    
                    sublist.addField({
                        id: 'column' + i,
                        type: serverWidget.FieldType.TEXT,
                        label: column.label
                    });
                }
    
                // Set pageId to correct value if out of index  
                if (!pageId || pageId == '' || pageId < 0){
                    pageId = 0;
                } else if (pageId >= pageCount){
                    pageId = pageCount - 1;
                }
                // Add buttons to simulate Next & Previous
                if (pageId != 0) {
                    form.addButton({
                        id: 'custpage_previous',
                        label: 'Anterior',
                        functionName: 'getSuiteletPage(' + scriptId + ', ' + deploymentId + ', ' + (pageId - 1) + ')'
                    });
                }
                if (pageId != pageCount - 1) {
                    form.addButton({
                        id: 'custpage_next',
                        label: 'Siguiente',
                        functionName: 'getSuiteletPage(' + scriptId + ', ' + deploymentId + ', ' + (pageId + 1) + ')'
                    });
                }
                // if (retrieveSearch.count > 0) {
                //     form.addButton({
                //         id: 'custpage_selectAll',
                //         label: 'Seleccionar todas',
                //         functionName: 'selectAll(' + retrieveSearch.count + ')'
                //     });
                // }
                //agrego botón para pagar cuotas del mes o más
                
                log.debug("Datos addSubmitButton: ", customerId+" "+amount+" "+datosMontoActual.tot+" "+existenCuotasMora)

                // form.addSubmitButton({
                //     id: 'installmentsButton',
                //     label: 'Pagar cuotas',
                //     function: ejecutarSchedule(customerId, amount , datosMontoTotal.tot, existenCuotasMora)
                // });
    
                // Add drop-down and options to navigate to specific page
                var selectOptions = form.addField({
                    id: 'custpage_pageid',
                    label: 'Page Index',
                    type: serverWidget.FieldType.SELECT
                }).updateDisplayType({
                    displayType: serverWidget.FieldDisplayType.HIDDEN 
                });
    
                for (var i = 0; i < pageCount; i++) {
                    if (i == pageId) {
                        selectOptions.addSelectOption({
                            value: 'pageid_' + i,
                            text: ((i * PAGE_SIZE) + 1) + ' - ' + ((i + 1) * PAGE_SIZE),
                            isSelected: true
                        });
                    } else {
                        selectOptions.addSelectOption({
                            value: 'pageid_' + i,
                            text: ((i * PAGE_SIZE) + 1) + ' - ' + ((i + 1) * PAGE_SIZE)
                        });
                    }
                }
    
                // Get subset of data to be shown on page
                var addResults = fetchSearchResult(retrieveSearch, pageId);
                addResults.forEach(function (result, j) {
                    sublist.setSublistValue({
                        id: 'custpage_id',
                        line: j,
                        value: result[0],
                    });
                    result.splice(0, 1);
                    result.forEach(function (value, i) {
                        if (value) {
                            sublist.setSublistValue({
                                id: 'column' + i,
                                line: j,
                                value: value,
                            });
                        }
                    })
                });
            };

            form.addSubmitButton({ label: 'Submit' })
            //draw form
            context.response.writePage(form);

        } else if (context.request.method === 'POST') {
            log.debug('normal','normal')
            log.debug("Suitelet is posting.")
            var customerId = '';
            var montopagado = '';
            var montototal = '';
            var deuda = '';

            if (context.request.parameters['custpage_customer']) customerId = context.request.parameters['custpage_customer'];
            if (context.request.parameters['custpage_montoapagar']) montopagado = context.request.parameters['custpage_montoapagar'];
            if (context.request.parameters['custpage_montototal']) montototal = context.request.parameters['custpage_montototal'];
            if (context.request.parameters['custpage_deuda']) deuda = context.request.parameters['custpage_deuda']? "T" : "F";

            log.debug('customerId',customerId)
            log.debug('montopagado', montopagado)
            log.debug('montototal', montototal)
            log.debug('deuda', deuda)


            // try{
                var scriptTask = task.create({taskType: task.TaskType.SCHEDULED_SCRIPT}); 
                scriptTask.scriptId = 'customscriptcustomscript_sdb_fee_payment';
                scriptTask.deploymentId = null;
                scriptTask.params = {
                    custscript_sdb_param_cliente: customerId,
                    custscript_sdb_param_montopagado: montopagado,
                    custscript_sdb_param_montototal: montototal,
                    custscript_sdb_param_deuda: deuda
                };
                var scheduledScriptTaskId = scriptTask.submit();
                log.debug("scheduledScriptTaskId: ", scheduledScriptTaskId)
            // }catch(e){
            //     log.debug('error en post: ', e)
            // }
        }        
    }

    return {
        onRequest: onRequest
    };

    function runSearch(searchId, searchPageSize, internalId){
        var searchObj = search.load({
            id: searchId
        })
        var filters = searchObj.filters;
        if(internalId){
            var customerFilter = search.createFilter({
                name: 'internalid',
                operator: search.Operator.ANYOF,
                join: "CUSTRECORD_SDB_CLIENTE",
                values: [internalId]
            });
            filters.push(customerFilter);
        }
        return searchObj.runPaged({
            pageSize: searchPageSize
        });
    }

    function getDeudaFields(internalId){
        var searchObj = search.load({
            id: TOTAL_DEUDAS
        })
        var filters = searchObj.filters;
        if(internalId){
            var customerFilter = search.createFilter({
                name: 'internalid',
                operator: search.Operator.ANYOF,
                join: "CUSTRECORD_SDB_CLIENTE",
                values: [internalId]
            });
            filters.push(customerFilter);
        }
        var resultsFields = [];
        searchObj.run().each(function(result) {
            resultsFields = {
                'deuda': result.getValue(result.columns[2]),
                'total': result.getValue(result.columns[3]),
                'pagado': result.getValue(result.columns[4])
            }
        });
        return resultsFields
    }

    function existenCuotasConMora(internalId){
        //corroborar que existan cuotas pendientes (deuda)
        //método:   tomo la search de existe deuda y agrego filtro por cliente
        //          si el resultado de la search es distinto a undefined, existen cuotas pendientes.
        var existeDeudaSearch = search.load({
            id: SEARCH_EXISTE_DEUDA
        })
        var filters = existeDeudaSearch.filters;
        if(internalId){
            var internalIdFilter = search.createFilter({
                name: 'internalid',
                operator: search.Operator.ANYOF,
                values: [internalId]
            });
            filters.push(internalIdFilter);
        }
        var retrieveSearch = existeDeudaSearch.run().getRange({'start': 0, 'end': 1});
        var existeDeuda = retrieveSearch.length == 1 ? true : false;
        return existeDeuda;
    }

    function getCustomerData(internalId) {
        var customerInfo;
        var customerSearchObj = search.create({
            type: "customer",
            filters:
            [
                ["internalid","anyof",internalId]
            ],
            columns:
            [
                search.createColumn({name: "custentity_sdb_numero_documento", label: "num documento"}),
                search.createColumn({name: "custentity_sdb_siscred_cli_fechapago", label: "fecha de pago"})
            ]
        });
        var searchGetCustomerDocumentCount = customerSearchObj.runPaged().count;
        customerSearchObj.run().each(function(result){
            if(searchGetCustomerDocumentCount == 1){
                customerInfo =  {
                    nroDoc: result.getValue('custentity_sdb_numero_documento'),
                    fechaPago: result.getText('custentity_sdb_siscred_cli_fechapago')
                }
            };
        });
        return customerInfo;
    }
    
    function fetchSearchResult(pagedData, pageIndex) {
        if (pagedData.count == 0) return [];
        var searchPage = pagedData.fetch({
            index: pageIndex
        });
        var columns = pagedData.searchDefinition.columns;
        var results = new Array();
        searchPage.data.forEach(function (result) {
            var values = [];
            values.push(result.id);
            for (var i = 0; i < columns.length; i++) {
                var value = result.getText(columns[i]);
                if (!value) {
                    value = result.getValue(columns[i]);
                }
                values.push(value);
            }
            results.push(values);
        });
        return results;
    }

    function getMontoActual(InternalId){
        // var from = new Date();   
        // var formattedFrom = fechaPago+'/'+from.getMonth()+'/'+from.getFullYear();

        // log.debug(formattedFrom)
        // var to = new Date();
        // var toMonth = to.getMonth()+1   
        // var formattedTo = fechaPago+'/'+toMonth+'/'+to.getFullYear();
        // log.debug(formattedTo)

        // log.debug('desde-hasta', formattedFrom +' - '+formattedTo)

        var cuotaSearchObj = search.create({
            type: "customrecord_sdb_siscred_cuota",
            filters:
            [
               ["custrecord_sdb_siscred_estadocuota","anyof",'3', '1'], 
               "AND", 
               ["custrecord_sdb_siscred_fechapago","within",'thismonth'], 
               "AND", 
               ["custrecord_sdb_cliente","anyof",InternalId]
            ],
            columns:
            [
               search.createColumn({
                  name: "custrecord_sdb_cliente",
                  summary: "GROUP",
                  label: "Cliente"
               }),
               search.createColumn({
                  name: "formulanumeric",
                  summary: "SUM",
                  formula: "{custrecord_sdb_total_capital}-{custrecord_sdb_pago_capital}",
                  label: "Formula (Numeric)"
               }),
               search.createColumn({
                  name: "formulanumeric",
                  summary: "SUM",
                  formula: "{custrecord_sdb_total_cargoadministrativo}-{custrecord_sdb_pago_cargoadministrativo}",
                  label: "Formula (Numeric)"
               }),
               search.createColumn({
                  name: "formulanumeric",
                  summary: "SUM",
                  formula: "{custrecord_sdb_total_cargoseguro}-{custrecord_sdb_pagado_cargoseguro}",
                  label: "Formula (Numeric)"
               }),
               search.createColumn({
                  name: "formulanumeric",
                  summary: "SUM",
                  formula: "{custrecord_sdb_total_cargomora}-{custrecord_sdb_pago_cargomora}",
                  label: "Formula (Numeric)"
               }),
               search.createColumn({
                  name: "formulacurrency",
                  summary: "SUM",
                  formula: "{custrecord_sdb_total_total}-{custrecord_sdb_pago_total}",
                  label: "Formula (Currency)"
               })
            ]
         });
        var actual;
        cuotaSearchObj.run().each(function(result){
            actual =  {
                'cliente': result.getValue(result.columns[0]),
                'capital': result.getValue(result.columns[1]),
                'cAdmin': result.getValue(result.columns[2]),
                'cSeguro': result.getValue(result.columns[3]),
                'cMora': result.getValue(result.columns[4]),
                'tot': result.getValue(result.columns[5])
            }
            log.debug('actual', actual)

        });
        return actual;
    }

    function getMontoTotal(internalId){
        var cuotaSearchObj_tot = search.create({
            type: "customrecord_sdb_siscred_cuota",
            filters:
            [
               ["custrecord_sdb_cliente.internalid","anyof",internalId], 
               "AND", 
               ["custrecord_sdb_siscred_estadocuota","anyof","1","3","4"]
            ],
            columns:
            [
               search.createColumn({
                  name: "custrecord_sdb_cliente",
                  summary: "GROUP",
                  label: "Cliente"
               }),
               search.createColumn({
                  name: "formulanumeric",
                  summary: "SUM",
                  formula: "{custrecord_sdb_total_capital}-{custrecord_sdb_pago_capital}",
                  label: "Formula (Numeric)"
               }),
               search.createColumn({
                  name: "formulanumeric",
                  summary: "SUM",
                  formula: "{custrecord_sdb_total_cargoadministrativo}-{custrecord_sdb_pago_cargoadministrativo}",
                  label: "Formula (Numeric)"
               }),
               search.createColumn({
                  name: "formulanumeric",
                  summary: "SUM",
                  formula: "{custrecord_sdb_total_cargoseguro}-{custrecord_sdb_pagado_cargoseguro}",
                  label: "Formula (Numeric)"
               }),
               search.createColumn({
                  name: "formulanumeric",
                  summary: "SUM",
                  formula: "{custrecord_sdb_total_cargomora}-{custrecord_sdb_pago_cargomora}",
                  label: "Formula (Numeric)"
               }),
               search.createColumn({
                  name: "formulanumeric",
                  summary: "SUM",
                  formula: "{custrecord_sdb_total_total}-{custrecord_sdb_pago_total}",
                  label: "Formula (Numeric)"
               })
            ]
         });
        var actual;
        cuotaSearchObj_tot.run().each(function(result){
            actual =  {
                'cliente': result.getValue(result.columns[0]),
                'capital': result.getValue(result.columns[1]),
                'cAdmin': result.getValue(result.columns[2]),
                'cSeguro': result.getValue(result.columns[3]),
                'cMora': result.getValue(result.columns[4]),
                'tot': result.getValue(result.columns[5])
            }
        });
        return actual;
    }

    function getProxCuotasCapital(internalId){
        var actual;
        var customrecord_sdb_siscred_cuotaSearchObj = search.create({
            type: "customrecord_sdb_siscred_cuota",
            filters:
            [
               ["custrecord_sdb_cliente.internalid","anyof",internalId], 
               "AND", 
               ["custrecord_sdb_siscred_fechapago","after","thismonth"]
            ],
            columns:
            [
               search.createColumn({
                  name: "formulanumeric",
                  summary: "SUM",
                  formula: "{custrecord_sdb_total_capital}-{custrecord_sdb_pago_capital}",
                  label: "Formula (Numeric)"
               }),
               search.createColumn({
                  name: "custrecord_sdb_cliente",
                  summary: "GROUP",
                  label: "Cliente"
               })
            ]
         });
         var searchResultCount = customrecord_sdb_siscred_cuotaSearchObj.runPaged().count;
         log.debug("customrecord_sdb_siscred_cuotaSearchObj result count",searchResultCount);
         customrecord_sdb_siscred_cuotaSearchObj.run().each(function(result){
            actual =  {
                'totcapital': result.getValue(result.columns[0])
            }
        });
        return actual;
    }

    function getTotalMesActual(internalId){
        var obj;
        var customrecord_sdb_siscred_cuotaSearchObj = search.create({
            type: "customrecord_sdb_siscred_cuota",
            filters:
            [
               ["custrecord_sdb_siscred_fechapago","within","thismonth"], 
               "AND", 
               ["custrecord_sdb_cliente.internalid","anyof",internalId]
            ],
            columns:
            [
               search.createColumn({
                  name: "formulanumeric",
                  summary: "SUM",
                  formula: "{custrecord_sdb_total_total}-{custrecord_sdb_pago_total}",
                  label: "Formula (Numeric)"
               }),
               search.createColumn({
                  name: "custrecord_sdb_cliente",
                  summary: "GROUP",
                  label: "Cliente"
               })
            ]
         });
         var searchResultCount = customrecord_sdb_siscred_cuotaSearchObj.runPaged().count;
         log.debug("customrecord_sdb_siscred_cuotaSearchObj result count",searchResultCount);
         customrecord_sdb_siscred_cuotaSearchObj.run().each(function(result){
            obj =  {
                'totalmesactual': result.getValue(result.columns[0])
            }
         });
         return obj;
    }

    function ejecutarSchedule(customerid, montopagado, montototal, deuda){

        var scriptTask = task.create({taskType: task.TaskType.SCHEDULED_SCRIPT}); 
        scriptTask.scriptId = 1838;
        scriptTask.deploymentId = 'customdeploy_sdb_fee_payment_sl';
        scriptTask.params = {
            custscript_sdb_param_cliente: customerid,
            custscript_sdb_param_montopagado: montopagado,
            custscript_sdb_param_montototal: montototal,
            custscript_sdb_param_deuda: deuda
        };
        scriptTask.submit()
    }

});
