/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope Public 
 */
/*
    Diego Poblete Esteves
    NAME:   SDB | Formulario de Cuotas Siscred (Doc)
    ID:     customscript_sdb_fee_payment_approval

    Objeto:
    El formulario en un principio dibuja sólo un campo "clientes", que al ser fulfilleado es escuchado por un clientScript(fieldChange)
    se dispara y dibuja en el formulario las líneas correspondientes a pagos pendientes del usuario.  

    changeLog: 
        2023.09.22 - edited searches to separate the calculation of insaurance charges. (commented old lines)
        2023.09.27 - added formulas to calc, if corresponds, the owed unemploy insurance  
        2023.12.04 - review about the calc formulas of numbers displayed to the clients
    
*/
                            
var CLIENT_SCRIPT_FILE_ID = 'SuiteScripts/SDB_fee_payment_approval_CS.js';
var SEARCH_EXISTE_DEUDA = 'customsearch_sdb_siscred_existedeuda';
var SEARCH_DEUDAS = 'customsearch_sdb_cuotaspendientes_2';
var TOTAL_DEUDAS = 'customsearch_sdb_siscred_totaldeuda_2'
var SEARCH_VIGENTES = 'customsearch_siscred_cuotasvigentes_2'; 
var PAGE_SIZE = 20;
var lineas = []; 


define(['N/ui/serverWidget', 'N/search', 'N/task'],
function (serverWidget, search, task ) {

    function onRequest(context){
        if (context.request.method == 'GET') {
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
            customerSelect.updateDisplayType({
                displayType: serverWidget.FieldDisplayType.DISABLED
            })

            var customerdocument = form.addField({ id: 'custpage_customerdoc', type: 'TEXT', label: 'DOCUMENTO'})

            var scriptObj = runtime.getCurrentScript();
            var bundleArr = scriptObj.bundleIds;
            var pathClient = CLIENT_SCRIPT_FILE_ID;
            if (bundleArr && bundleArr.length) {
                pathClient = 'SuiteBundles/Bundle ' + bundleArr + '/SDB_fee_payment_approval_CS.js';
            }
            form.clientScriptModulePath = pathClient;

            // Get parameters
            var pageId = parseInt(context.request.parameters.page)
            var customerDoc = context.request.parameters.cusdoc;
            log.debug('customerDoc', customerDoc);

            // var customerId = context.request.parameters.clientinternalid? context.request.parameters.clientinternalid : ''; 

            var amount = context.request.parameters.amount? context.request.parameters.amount : 0;
            var scriptId = context.request.parameters.script
            var deploymentId = context.request.parameters.deploy

            log.debug('montoAPagar',amount);

            if(customerDoc){
                var customerId = getCustomerByDocument(customerDoc);
                log.debug('customerId', customerId)
            }

            log.debug("customerId", customerId);

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
                // log.debug('arrayDeuda', fieldsDeuda);

                //add the insurance charges to debt
                var pastInsauranceCharge = getInsauranceCharges(customerId, 'previous');
                log.debug("debt + pastInsauranceCharge: ", pastInsauranceCharge +"+"+fieldsDeuda.deuda+"="+(parseFloat(fieldsDeuda.deuda) + parseFloat(pastInsauranceCharge)))
                Deuda.defaultValue = parseFloat(fieldsDeuda.deuda) + parseFloat(pastInsauranceCharge);
                
                log.debug("acumulado mora: ", fieldsDeuda.deuda)

                //Saved Search: Consulta por cuotas no pagas, y no morosas del cliente.
                //Dependiendo de si el mes es valido como criterio de consulta, podría ser desde el principio de este mes en adelante.
                //'insaurance charges' ("cargo seguro") are separated from the previous searches to calculate apart. Later they are added to the total. 
                
                
                // var cuotasMesActual = getTotalMesActual(customerId);
                var cuotasMesActual = getMontoActual(customerId);
                log.debug('actualCuotas(Total): ', cuotasMesActual.tot);

                var proxCuotas = getProxCuotasCapital(customerId);
                log.debug('proxCuotas(capital): ', proxCuotas.totcapital);
                
                //modify function to apply to every case, before this month and between this month
                var totalInsauranceCharges = getInsauranceCharges(customerId, 'total');
                log.debug('totalInsauranceCharges', totalInsauranceCharges);


                // var TotalAux = parseFloat(proxCuotas.totcapital) + parseFloat(cuotasMesActual.tot) + parseFloat(fieldsDeuda.deuda) + parseFloat(totalInsauranceCharges);
                //ya no se cobnran los insaurance charges futuros, solo los pasados
                var TotalAux = parseFloat(proxCuotas.totcapital) + parseFloat(cuotasMesActual.tot) + parseFloat(fieldsDeuda.deuda) + parseFloat(pastInsauranceCharge);
                log.debug('toFixed(4)',  Number(TotalAux).toFixed(4))
                Total.defaultValue = Number(TotalAux.toFixed(4)); 
                log.debug("total + totalInsauranceCharges: ", parseFloat(proxCuotas.totcapital) +"+"+parseFloat(cuotasMesActual.tot)+"+"+parseFloat(fieldsDeuda.deuda)+"+"+parseFloat(pastInsauranceCharge)+"="+(parseFloat(Total.defaultValue)));
                // log.debug("Datos addSubmitButton: ", customerId+" "+amount+" "+fieldsDeuda.total+" "+existenCuotasMora)
              
            }else if(existenCuotasMora == false && customerId){
                log.debug("estado", "existenCuotasMora == false && customerId")
                var retrieveSearch = runSearch(SEARCH_VIGENTES, PAGE_SIZE, customerId);
                
                log.debug('retrieveSearch', retrieveSearch)

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

                //get the actual insurance charges to apply to visible fields at form output
                var actualInsauranceCharges = getInsauranceCharges(customerId, 'actual');

                log.debug("datosMontoActual", datosMontoActual)
                var montoActualAux =  parseFloat(datosMontoActual.tot) + parseFloat(actualInsauranceCharges);
                montoActual.defaultValue = montoActualAux.toFixed(4);

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
                log.debug('proxCuotas: ', proxCuotas);
                //'insaurance charges' ("cargo seguro") are separated from the previous searches to calculate apart. In the next lines they are added to the total. 
                var totalInsauranceCharges = getInsauranceCharges(customerId, 'total');
                log.debug('insaurance charges amount: ', totalInsauranceCharges);

              var montoTotalAux = parseFloat(datosMontoActual.tot) + parseFloat(proxCuotas.totcapital) + Number(totalInsauranceCharges);
              log.debug('toFixed(4)',  Number(montoTotalAux).toFixed(4))
                montoTotal.defaultValue = Number(montoTotalAux).toFixed(4);
                
              // log.debug("proxCuotas.totcapital", proxCuotas.totcapital)

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
            // var customeDoc = '';

            if (context.request.parameters['custpage_customer']) customerId = context.request.parameters['custpage_customer'];
            if (context.request.parameters['custpage_montoapagar']) montopagado = context.request.parameters['custpage_montoapagar'];
            if (context.request.parameters['custpage_montototal']) montototal = context.request.parameters['custpage_montototal'];
            if (context.request.parameters['custpage_deuda']) deuda = context.request.parameters['custpage_deuda']? "T" : "F";
            // if(context.request.parameters['custpage_customerdoc']) customeDoc = context.request.parameters['custpage_customerdoc'];

            log.debug('customerId',customerId)
            log.debug('montopagado', montopagado)
            log.debug('montototal', montototal)
            log.debug('deuda', deuda)
            log.debug('customerDoc POST: ', customerDoc);


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

    function getInsauranceCharges(internalId, mode){

        //Look at the fee related payment price about selected customer (had or not unemployment insurance)
        var insauranceType = search.lookupFields({
            type: 'customer',
            id: internalId,
            columns: 'custentity_sdb_seg_censatia'
        })
        log.debug("Seguro de cesantía: ", insauranceType);
        //define client unemploy insurance fee price
        var insauranceFee = insauranceType.custentity_sdb_seg_censatia == false? 10 : 15;

        //We have to charge an insurance charge for each month owed
        //  first of all, we count the amount of months owed
        var searchFilter, searchDate;

        if('total' == mode){

            searchFilter = "onorbefore";
            searchDate = "thismonth";

        }else if('previous' == mode){

            //when testing the different cases, verify if other cases are solved by setting 'startofthismonth' as searchFilter
            searchFilter = "before";
            // searchDate = "startofthismonth";
            searchDate = "thismonth";

        }else if('actual' == mode){

            searchFilter = "within";
            searchDate = "thismonth";

        }

        //declare values to calculate owed amount
        var monthsOwed = [];
        var reviewedDate = '';

        //get installments
        log.debug('search filter and date: ', searchFilter + " - " + searchDate);
        var customrecord_sdb_siscred_cuotaSearchObj = search.create({
            type: "customrecord_sdb_siscred_cuota",
            filters:
            [
               ["custrecord_sdb_cliente","anyof", internalId], 
               "AND", 
               ["custrecord_sdb_siscred_estadocuota","anyof","4","1","3"], 
               "AND", 
               ["custrecord_sdb_siscred_fechapago", searchFilter, searchDate]
            ],
            columns:
            [
               search.createColumn({
                  name: "custrecord_sdb_siscred_fechapago",
                  summary: "GROUP",
                  sort: search.Sort.ASC,
                  label: "Fecha a Pagar"
               })
            ]
        });

        var searchResultCount = customrecord_sdb_siscred_cuotaSearchObj.runPaged().count;
        log.debug("customrecord_sdb_siscred_cuotaSearchObj result count",searchResultCount);
        customrecord_sdb_siscred_cuotaSearchObj.run().each(function(result){
            //take the oldest date to filter later insurance payments 
            if(reviewedDate == ''){
                reviewedDate = result.getValue(result.columns[0]);
            }
            monthsOwed.push(result.getValue(result.columns[0]));
            return true;
        });

        //get insurance payments to rest to the calc
        //complements to the "mode" methods applied
        //remember, the objective behind this function is return an amount to add to the respective summary amount (prev, actual or total)

        //technically, in every case (prev, actual or total) we gonna search for every insurancePay record begin in reviewedDate.
        //  we have just 3 posible cases: 
        //      a) doesnt exist records at all
        //      b) exist a record semi paid
        //      c) exist a paid record, and we need calculate the others 

        if(reviewedDate == ''){
            return 0;
        }else{
            var insurancePayments = [];
            var acumulatedInsurancePayments = 0; 
            var customrecord_sdb_pago_seguroSearchObj = search.create({
                type: "customrecord_sdb_pago_seguro",
                filters:
                [
                ["custrecord_sdb_cliente_cuota_paga", "anyof", internalId], 
                "AND", 
                ["custrecord_sdb_pago_cliente_date", "onorafter", reviewedDate]
                ],
                columns:
                [
                search.createColumn({name: "custrecord_sdb_pago_cliente_date", label: "Date Pago Cliente"}),
                search.createColumn({name: "custrecord_sdb_paid_unemployinsurance", label: "SDB | Monto Pagado Seguro C"}),
                search.createColumn({name: "internalid", label: "Internal ID"})
                ]
            });
            log.debug('start acumulating insurancePayments', 'start acumulating insurancePayments')
            log.debug('reviewedDate', reviewedDate);
            log.debug('internalId', internalId)
            var insurancePaymentsCount = customrecord_sdb_pago_seguroSearchObj.runPaged().count;
            log.debug("customrecord_sdb_pago_seguroSearchObj result count", searchResultCount);
            customrecord_sdb_pago_seguroSearchObj.run().each(function(result){
                insurancePayments.push(result.getValue(result.columns[2]));
                acumulatedInsurancePayments += Number(result.getValue(result.columns[1])? result.getValue(result.columns[1]) : 0);
                log.debug('acumulatedInsurancePayments: ', acumulatedInsurancePayments)
                return true;
            });
            // log.debug("insurancePaymentsCount", insurancePaymentsCount);
            // log.debug("insurancePayments.length", insurancePayments.length);
            log.debug('returned amount', (monthsOwed.length * insauranceFee) - acumulatedInsurancePayments);
        
            return (monthsOwed.length * insauranceFee) - acumulatedInsurancePayments;
            // log.debug("Monto seguros: ", "("+monthsOwed+"*"+insauranceFee+"="+monthsOwed*insauranceFee+")")
            // return monthsOwed * insauranceFee;
        }
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

        var actual = {
            cliente: 0,
            capital: 0,
            cAdmin: 0,
            cSeguro: 0, //result.getValue(result.columns[3]), -> responsibility delegated to getInsauranceCharges();
            cMora: 0,
            tot: 0
        };

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

        cuotaSearchObj.run().each(function(result){

            actual.cliente = result.getValue(result.columns[0]),
            actual.capital = result.getValue(result.columns[1]),
            actual.cAdmin = result.getValue(result.columns[2]),
            actual.cSeguro = 0, //result.getValue(result.columns[3]), -> responsibility delegated to getInsauranceCharges();
            actual.cMora = result.getValue(result.columns[4]),
            actual.tot = result.getValue(result.columns[5])
            
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
                'cSeguro': 0, //result.getValue(result.columns[3]), -> responsibility delegated to getInsauranceCharges();
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
               ["custrecord_sdb_cliente.internalid","anyof", internalId], 
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
        scriptTask.scriptId = 1836;
        scriptTask.deploymentId = 'customdeploy_test';
        scriptTask.params = {
            custscript_sdb_param_cliente: customerid,
            custscript_sdb_param_montopagado: montopagado,
            custscript_sdb_param_montototal: montototal,
            custscript_sdb_param_deuda: deuda
        };
        scriptTask.submit()
    }

    function getCustomerByDocument(document) {

        log.debug('document', document)

        var customerInfo;

        var customerSearchObj = search.create({
            type: "customer",
            filters:
            [
               ["custentity_sdb_numero_documento","is", document]
            ],
            columns:
            [
               search.createColumn({name: "internalid", label: "Internal ID"})
            ]
         });
         var searchResultCount = customerSearchObj.runPaged().count;
         log.debug("customerSearchObj result count",searchResultCount);
         customerSearchObj.run().each(function(result){
            
            log.debug('col 0: ', result.getValue(result.columns[0]))
            
            customerInfo = result.getValue(result.columns[0])

        });

        log.debug("customerInfo", customerInfo)

        return customerInfo;

    }

}); 