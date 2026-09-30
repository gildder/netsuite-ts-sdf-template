/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
define(['N/record', 'N/search', 'N/render', 'N/format', 'N/query'],
    /**
     * @param{record} record
     * @param{search} search
     * @param{render} render
     * @param{format} format
     * @param{query} query
     */
    (record, search, render, format, query) => {

        const CUOTA_STATUS = {
            PENDIENTE: 1,
            PAGO: 2,
            PARCIAL: 3,
            MORA: 4,
            REEMBOLSADO: 5,
        }

        const Months = [
            "ene",
            "feb",
            "mar",
            "abr",
            "may",
            "jun",
            "jul",
            "ago",
            "sep",
            "oct",
            "nov",
            "dic"
        ]

        const onRequest = (scriptContext) => {
            try {
                const parameters = scriptContext.request.parameters;
                const customer = parameters.customer;

                if(!customer) {
                    scriptContext.response.write("INVALID CUSTOMER");
                    return;
                }

                let searchCustomerResult = search.lookupFields({
                    type: search.Type.CUSTOMER,
                    id: customer,
                    columns: [
                        'firstname',
                        'lastname',
                        'companyname',
                        'isperson',
                        'custentity_sdb_numero_documento',
                        'custentity_sdb_siscred_cli_fechapago',
                        'creditlimit',
                        'balance',
                        'custentity_sdb_seg_censatia'
                    ]
                });
                log.debug("searchCustomerResult", searchCustomerResult);

                const payDayResult = searchCustomerResult["custentity_sdb_siscred_cli_fechapago"];
                const payDay = Array.isArray(payDayResult) ? payDayResult[0].text : payDayResult.text;
                let seguroMonto = searchCustomerResult["custentity_sdb_seg_censatia"] == true ? 15 : 12;

                let cuotas = getCuotas(customer);
                let seguros = findSeguroPartialOrPaided(customer);

                log.debug("cuotas", cuotas);
                log.debug("seguros", seguros);

                const data = {
                    name: searchCustomerResult["isperson"] ?
                        `${searchCustomerResult["firstname"]} ${searchCustomerResult["lastname"]}` :
                        searchCustomerResult["companyname"],
                    ci: searchCustomerResult["custentity_sdb_numero_documento"],
                    payDay: payDay,
                    currentDate: format.format({
                        type: format.Type.DATE,
                        value: new Date()
                    }),
                    creditLimit: Number(searchCustomerResult["creditlimit"]).toFixed(2),
                    creditUsed: Number(searchCustomerResult["balance"]).toFixed(2),
                    creditAvailable: (searchCustomerResult["creditlimit"] - searchCustomerResult["balance"]).toFixed(2),
                    activePaymentPlans: getActivePaymentPlans(cuotas),
                    charges: getCargos(cuotas, seguros, seguroMonto),
                    payments: getPayments(customer),
                    indebtedness: getDeuda(cuotas, seguros, seguroMonto),
                    futurePayments: getMesesFuturos(cuotas, seguroMonto)
                }

                var renderer = render.create();

                renderer.setTemplateByScriptId("CUSTTMPL_SDB_EXTRACTO_CLIENTE");

                renderer.addCustomDataSource({
                    format: render.DataSource.OBJECT,
                    alias: "customerState",
                    data: data
                });

                var pdfName = renderer.renderAsPdf();

                pdfName.name = "Extracto Cliente.pdf";

                scriptContext.response.writeFile(pdfName, true);
            } catch (e) {
                log.error("onRequest - ERROR", e);
                scriptContext.response.write(JSON.stringify(e));
            }
        }

        function getCuotas(customer) {
            var querySiscred = query.create({
                type: "CUSTOMRECORD_SDB_SISCRED_CUOTA"
            })

            var invoiceJoin = querySiscred.joinTo({
                fieldId: "custrecord_sdb_factura",
                target: "transaction"
            })

            var customerCondition = querySiscred.createCondition({
                fieldId: 'custrecord_sdb_cliente',
                operator: query.Operator.ANY_OF,
                values: customer
            })

            var mainLineCondition = invoiceJoin.createCondition({
                fieldId: 'transactionLines.mainline',
                operator: query.Operator.IS,
                values: true
            })

            querySiscred.condition = querySiscred.and(customerCondition, mainLineCondition)

            querySiscred.columns = [
                querySiscred.createColumn({
                    fieldId: "id",
                    alias: "siscredCuotaId",
                    aggregate: query.Type.COUNT
                }),
                invoiceJoin.createColumn({
                    fieldId: "id",
                }),
                invoiceJoin.createColumn({
                    fieldId: "transactionLines.location.name",
                    alias: "location",
                }),
                invoiceJoin.createColumn({
                    fieldId: "tranDate",
                    alias: "tranDate",
                }),
                querySiscred.createColumn({
                    fieldId: "custrecord_sdb_siscred_fechapago",
                    alias: "date",
                }),
                invoiceJoin.createColumn({
                    fieldId: "tranId",
                    alias: "description",
                }),
                invoiceJoin.createColumn({
                    fieldId: "foreignTotal",
                    alias: "totalAmount",
                }),
                querySiscred.createColumn({
                    fieldId: "custrecord_sdb_siscred_montofinanc",
                    alias: "financialAmount",
                }),
                invoiceJoin.createColumn({
                    fieldId: "custbody_mc_monto_financiado",
                    alias: "financialAmount2New",
                }),
                invoiceJoin.createColumn({
                    fieldId: "custbody_sdb_mc_monto_financiado",
                    alias: "financialAmount2",
                }),
                querySiscred.createColumn({
                    fieldId: "custrecord_sdb_siscredcuota_num",
                    alias: "numeroCuota",
                }),
                querySiscred.createColumn({
                    fieldId: "custrecord_sdb_total_capital",
                    alias: "capital",
                }),
                querySiscred.createColumn({
                    fieldId: "custrecord_sdb_pago_capital",
                    alias: "capitalPago",
                }),
                querySiscred.createColumn({
                    fieldId: "custrecord_sdb_total_cargoadministrativo",
                    alias: "cargosAdministrativos",
                }),
                querySiscred.createColumn({
                    fieldId: "custrecord_sdb_pago_cargoadministrativo",
                    alias: "cargosAdministrativosPago",
                }),
                querySiscred.createColumn({
                    fieldId: "custrecord_sdb_total_cobranza",
                    alias: "cargosCobranza",
                }),
                querySiscred.createColumn({
                    fieldId: "custrecord_sdb_pago_cobranza",
                    alias: "cargosCobranzaPago",
                }),
                querySiscred.createColumn({
                    fieldId: "custrecord_sdb_total_cargomora",
                    alias: "mora",
                }),
                querySiscred.createColumn({
                    fieldId: "custrecord_sdb_pago_cargomora",
                    alias: "moraPago",
                }),
                querySiscred.createColumn({
                    fieldId: "custrecord_sdb_total_total",
                    alias: "installmentAmount",
                }),
                querySiscred.createColumn({
                    fieldId: "custrecord_sdb_pago_total",
                    alias: "installmentAmountPaid",
                }),
                querySiscred.createColumn({
                    fieldId: "custrecord_sdb_siscred_estadocuota",
                    alias: "estadoCuota",
                }),
            ]

            let queryRun = querySiscred.run();

            return queryRun.asMappedResults();
        }

        function getActivePaymentPlans(cuotas) {
            const result = cuotas.reduce((result, current) => {
                const cuotaPendientePago = (current.estadoCuota !== CUOTA_STATUS.PAGO ||
                    current.estadoCuota !== CUOTA_STATUS.REEMBOLSADO);

                if (current.estadoCuota === CUOTA_STATUS.REEMBOLSADO)
                    return result;


                const numeroCouta = Number(current.numeroCuota);
                let dueAmount = 0;
                if (current.estadoCuota !== CUOTA_STATUS.PAGO)
                    dueAmount = Number(current.installmentAmount) - Number(current.installmentAmountPaid);

                if (result.hasOwnProperty(current.id)) {
                    if (result[current.id].installmentCount < numeroCouta)
                        result[current.id].installmentCount = numeroCouta;
                    result[current.id].installmentAmount = Number(current.installmentAmount.toFixed(2));
                    if (cuotaPendientePago)
                        result[current.id].totalDue = Number((result[current.id]?.totalDue + dueAmount).toFixed(2));
                } else {
                    const financialAmount = current.financialAmount ? current.financialAmount : current.financialAmount2;

                    if (dueAmount < 0)
                        dueAmount = 0;

                    result[current.id] = {
                        id: current.id,
                        location: current.location,
                        date: current.tranDate,
                        description: current.description ? current.description : "",
                        totalAmount:  Number(current.totalAmount?.toFixed(2)),
                        financialAmount: Number(financialAmount?.toFixed(2)),
                        installmentAmount: Number(current.installmentAmount?.toFixed(2)),
                        installmentCount: numeroCouta,
                        totalDue: cuotaPendientePago ? Number(dueAmount.toFixed(2)) : 0,
                    }
                }
                return result;
            }, {});

            log.debug("getActivePaymentPlans", result);

            return Object.values(result)
        }

        function getCargos(cuotas, seguros, seguroMonto) {
            const result = cuotas.reduce((result, current) => {
                const currentDate = getDateMonthAndYear(current.date);

                var date = format.parse({
                    type: format.Type.DATE,
                    value: current.date
                });
                date.setDate(1);

                var now = new Date();

                if (date.getTime() >= now.getTime()) {
                    return result;
                }

                let stateString = Object.entries(CUOTA_STATUS).find(el => el[1] === current.estadoCuota)[0];

                if (stateString == "REEMBOLSADO")
                    return result;

                const capital =  Number(current.capital || 0);
                const cargosAdministrativos = Number(current.cargosAdministrativos || 0);
                const cargosCobranza = Number(current.cargosCobranza || 0);
                const mora = Number(current.mora || 0);

                var seguro = seguros.find(s => getDateMonthAndYear(s.date) == currentDate);
                log.debug("seguro detalle", {
                    seguroFound: seguro,
                    date: currentDate,
                    state: stateString
                });
                let seguroMes = 0;

                if (stateString == "PAGO") {
                    seguroMes = seguro ? Number(seguro.montoPagado) : 0;
                } else {
                    seguroMes = Number(seguroMonto);
                }

                const total = (capital +
                    cargosAdministrativos +
                    cargosCobranza +
                    mora) || 0;

                let currentMonth = result[currentDate];
                if (currentMonth) {
                    currentMonth.capital = Number((currentMonth.capital + capital).toFixed(2));
                    currentMonth.cargosAdministrativos = Number((currentMonth.cargosAdministrativos + cargosAdministrativos).toFixed(2));
                    currentMonth.cargoCobranza = Number((currentMonth.cargoCobranza + cargosCobranza).toFixed(2));
                    currentMonth.cargoMora = Number((currentMonth.cargoMora + mora).toFixed(2));
                    currentMonth.total = Number((currentMonth.total + total).toFixed(2));
                    currentMonth.estado = getMonthState(currentMonth.estado, stateString);
                } else {
                    result[currentDate] = {
                        date: current.date,
                        periodo: currentDate,
                        capital: capital,
                        cargosAdministrativos: cargosAdministrativos,
                        seguro: seguroMes,
                        cargoCobranza: cargosCobranza,
                        cargoMora: mora,
                        total: total + seguroMes,
                        estado: stateString,
                    }
                }
                return result;
            }, {})

            log.debug("Cargos", result);

            return Object.values(result).sort((a, b) => sortFormatDate(a.date, b.date));
        }

        function getMonthState(monthState, currentState) {
            let state = monthState;
            log.debug("getMonthState - currentState", state);
            switch (monthState) {
                case "PENDIENTE":
                    if (currentState == "PARCIAL" || currentState == "MORA") {
                        state = currentState;
                    } else if (currentState == "PAGO") {
                        state = "PARCIAL";
                    }

                    break;
                case "PARCIAL":
                    if (currentState == "MORA") {
                        state = currentState;
                    }
                    break;
                case "PAGO":
                    if (currentState == "MORA" || currentState == "PARCIAL") {
                        state = currentState;
                    } else if (currentState == "PENDIENTE") {
                        state = "PARCIAL"
                    }
                    break;
                case "REEMBOLSADO":
                    state = currentState;
                    break;
            }
            log.debug("getMonthState - newState", state);

            return state;
        }

        function getDateMonthAndYear(date) {
            let formatedDate = format.parse({
                type: format.Type.DATE,
                value: date
            });
            return (Months[formatedDate?.getMonth()]) + "-" + formatedDate?.getFullYear();
        }

        function sortFormatDate(a, b) {
            let dateA = format.parse({
                type: format.Type.DATE,
                value: a
            });

            let dateB = format.parse({
                type: format.Type.DATE,
                value: b
            });

            return dateA.getTime() - dateB.getTime();
        }

        function findSeguroPartialOrPaided(customer) {
            let dates = [];
            search.create({
                type: "customrecord_sdb_pago_seguro",
                filters:
                    [
                        ["custrecord_sdb_cliente_cuota_paga","anyof",customer]
                    ],
                columns:
                    [
                        search.createColumn({name: "custrecord_sdb_pago_cliente_date", label: "DATE PAGO CLIENTE"}),
                        search.createColumn({name: "custrecord_sdb_paid_unemployinsurance", label: "PAGO ACUMULADO SEGURO DESEMPLEO"}),
                        search.createColumn({
                            name: "custentity_sdb_seg_censatia",
                            join: "CUSTRECORD_SDB_CLIENTE_CUOTA_PAGA",
                            label: "Seguro Cesantia"
                        })
                    ]
            }).run().each(function(result){
                let sensatia = result.getValue({
                    name: "custentity_sdb_seg_censatia",
                    fieldId: "custentity_sdb_seg_censatia",
                    join: "CUSTRECORD_SDB_CLIENTE_CUOTA_PAGA"
                });
                let montoPagado = result.getValue("custrecord_sdb_paid_unemployinsurance");
                let seguroMonto = sensatia ? 15 : 12;
                dates.push({
                    date: result.getValue("custrecord_sdb_pago_cliente_date"),
                    montoPagado: montoPagado,
                    restante: seguroMonto - montoPagado < 0 ? 0 : seguroMonto - montoPagado
                });
                return true;
            });
            return dates;
        }

        function getPayments(customer) {
            let payments = {};
            search.create({
                type: "customrecord_sdb_mc_pago_siscred",
                filters:
                    [
                        ["custrecord_sdb_mc_pago_siscred_cliente","anyof",customer],
                        "AND",
                        ["custrecord_sdb_mc_pago_siscred_reembolso","is","F"]
                    ],
                columns:
                    [
                        search.createColumn({name: "custrecord_sdb_mc_pago_siscred_fecha", label: "Fecha"}),
                        search.createColumn({name: "custrecord_sdb_mc_pago_siscred_monto", label: "Monto"}),
                        search.createColumn({name: "custrecord_mc_payment_origin", label: "Origen Pago"}),
                        search.createColumn({
                            name: "custrecord_sdb_mc_capital",
                            join: "CUSTRECORD_SDB_MC_PAGO_SISCRED",
                            label: "Capital"
                        }),
                        search.createColumn({
                            name: "custrecord_sdb_mc_cargo_administrativo",
                            join: "CUSTRECORD_SDB_MC_PAGO_SISCRED",
                            label: "Cargo Administrativo"
                        }),
                        search.createColumn({
                            name: "custrecord_sdb_mc_cargo_cobranza",
                            join: "CUSTRECORD_SDB_MC_PAGO_SISCRED",
                            label: "Cargo Cobranza"
                        }),
                        search.createColumn({
                            name: "custrecord_sdb_mc_cargo_mora",
                            join: "CUSTRECORD_SDB_MC_PAGO_SISCRED",
                            label: "Cargo Mora"
                        }),
                        search.createColumn({
                            name: "custrecord_sdb_mc_cargo_seguro",
                            join: "CUSTRECORD_SDB_MC_PAGO_SISCRED",
                            label: "Cargo Seguro"
                        }),
                        search.createColumn({
                            name: "custrecord_sdb_mc_total",
                            join: "CUSTRECORD_SDB_MC_PAGO_SISCRED",
                            label: "Total"
                        }),
                        search.createColumn({
                            name: "custrecord_sdb_mc_trans_cargos",
                            join: "CUSTRECORD_SDB_MC_PAGO_SISCRED",
                            label: "Transaccion Cargos"
                        }),
                        search.createColumn({
                            name: "custrecord_sdb_mc_payment_capital",
                            join: "CUSTRECORD_SDB_MC_PAGO_SISCRED",
                            label: "Payment"
                        })
                    ]
            }).run().each(function(result){
                var id = result.id;

                var date = result.getValue({
                    name: "custrecord_sdb_mc_pago_siscred_fecha",
                });
                var paymentAmount = result.getValue({
                    name: "custrecord_sdb_mc_pago_siscred_monto",
                });

                var paymentOrigin = result.getValue({
                    name: "custrecord_mc_payment_origin",
                });

                var capital = Number(result.getValue({
                    name: "custrecord_sdb_mc_capital",
                    join: "CUSTRECORD_SDB_MC_PAGO_SISCRED"
                }) || 0);

                var cargoAdministrativo = Number(result.getValue({
                    name: "custrecord_sdb_mc_cargo_administrativo",
                    join: "CUSTRECORD_SDB_MC_PAGO_SISCRED",
                }) || 0);

                var cargoSeguro = Number(result.getValue({
                    name: "custrecord_sdb_mc_cargo_seguro",
                    join: "CUSTRECORD_SDB_MC_PAGO_SISCRED",
                }) || 0);

                var cargoCobranza = Number(result.getValue({
                    name: "custrecord_sdb_mc_cargo_cobranza",
                    join: "CUSTRECORD_SDB_MC_PAGO_SISCRED",
                }) || 0);

                var cargoMora = Number(result.getValue({
                    name: "custrecord_sdb_mc_cargo_mora",
                    join: "CUSTRECORD_SDB_MC_PAGO_SISCRED"
                }) || 0);

                var paymentTotal = Number(result.getValue({
                    name: "custrecord_sdb_mc_total",
                    join: "CUSTRECORD_SDB_MC_PAGO_SISCRED",
                }) || 0);

                var cargoTransaction = result.getValue({
                    name: "custrecord_sdb_mc_trans_cargos",
                    join: "CUSTRECORD_SDB_MC_PAGO_SISCRED",
                });

                var paymentTransaction = result.getValue({
                    name: "custrecord_sdb_mc_payment_capital",
                    join: "CUSTRECORD_SDB_MC_PAGO_SISCRED",
                });

                var currentPayment = payments[id];
                if (currentPayment) {
                    log.debug("currentPayment", currentPayment);
                    log.debug("cargoSeguro", cargoSeguro);
                    if (capital)
                        currentPayment.totalCapital = Number((currentPayment?.totalCapital + capital).toFixed(2));
                    if (cargoAdministrativo)
                        currentPayment.totalAdministrativeCharges = Number((currentPayment?.totalAdministrativeCharges + cargoAdministrativo).toFixed(2));
                    if (cargoSeguro)
                        currentPayment.totalInsurance = Number((currentPayment?.totalInsurance + cargoSeguro).toFixed(2));
                    if (cargoCobranza)
                        currentPayment.totalCollectionCharges = Number((currentPayment?.totalCollectionCharges + cargoCobranza).toFixed(2));
                    if (cargoMora)
                        currentPayment.totalMora = Number((currentPayment?.totalMora + cargoMora).toFixed(2));
                } else {
                    let paymentChannel = "MultiPago";
                    if(paymentOrigin){
                        if(paymentOrigin == 2)
                            paymentChannel = "MultiPago";
                        if(paymentOrigin == 3)
                            paymentChannel = "Wabi";
                    }else{
                        if (cargoTransaction) {
                            log.debug("cargoTransaction", cargoTransaction);
                            const _lr1 = search.lookupFields({
                                type: record.Type.CASH_SALE,
                                id: cargoTransaction,
                                columns: ["custbody_mc_pos_record", "custbody_sdb_pos_mc_pos_record"]
                            });
                            const searchResult = _lr1["custbody_mc_pos_record"]?.length > 0 ? _lr1["custbody_mc_pos_record"] : _lr1["custbody_sdb_pos_mc_pos_record"];

                            const posId = Array.isArray(searchResult) ? searchResult[0]?.value : searchResult.value;
                            log.debug("posId", posId);
                            if (posId)
                                paymentChannel = "Pago en tienda";
                        } else if (paymentTransaction) {
                            log.debug("paymentTransaction", paymentTransaction);
                            const _lr2 = search.lookupFields({
                                type: record.Type.CUSTOMER_PAYMENT,
                                id: paymentTransaction,
                                columns: ["custbody_mc_pos_record", "custbody_sdb_pos_mc_pos_record"]
                            });
                            const searchResult = _lr2["custbody_mc_pos_record"]?.length > 0 ? _lr2["custbody_mc_pos_record"] : _lr2["custbody_sdb_pos_mc_pos_record"];

                            const posId = Array.isArray(searchResult) ? searchResult[0]?.value : searchResult.value;
                            log.debug("posId", posId);
                            if (posId)
                                paymentChannel = "Pago en tienda";
                        } else {
                            paymentChannel = "";
                        }
                    }

                    payments[id] = {
                        concept: "Pago",
                        date:  date,
                        totalCapital: capital,
                        totalAdministrativeCharges: cargoAdministrativo,
                        totalInsurance: cargoSeguro,
                        totalCollectionCharges: cargoCobranza,
                        totalMora: cargoMora,
                        totalAmount: paymentAmount,
                        paymentChannel: paymentChannel,
                    }
                }
                return true;
            });

            return Object.values(payments).sort((a, b) => sortFormatDate(a.date, b.date));
        }

        function getDeuda(cuotas, seguros, seguroMonto) {
            let seguroMesesAplicados = [];
            const now = new Date();
            //Se crea una nueva fecha que representa el primer dia del mes actual
            const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const result = cuotas.reduce((result, current) => {
                const monthYear = getDateMonthAndYear(current.date);
                var date = format.parse({
                    type: format.Type.DATE,
                    value: current.date
                });

                //Se cea una nueva fecha que representa el primer dia del mes en que vence la cuota
                const startOfDueDate = new Date(date.getFullYear(), date.getMonth(), 1);

                //Se comparan ambas fechas y solo se descartan aquellas cuotas que su mes de vencimiento es estrictamente mayor al mes actual, de esta forma las cuotas YA vencidas
                //o las que vencen dentro del mes actual se mostraran en el PDF
                if (startOfDueDate.getTime() > startOfCurrentMonth.getTime()) {
                    return result;
                }

                let stateString = Object.entries(CUOTA_STATUS).find(el => el[1] === current.estadoCuota)[0];

                if (stateString == "PAGO" || stateString == "REEMBOLSADO")
                    return result;

                const capital =  Number(current.capital || 0) - Number(current.capitalPago || 0);
                const cargosAdministrativos = Number(current.cargosAdministrativos || 0) - Number(current.cargosAdministrativosPago || 0);
                const cargoCobranza = Number(current.cargosCobranza || 0) - Number(current.cargosCobranzaPago || 0);
                const mora = Number(current.mora || 0) - Number(current.moraPago || 0);
                var seguro = seguros.find(s => getDateMonthAndYear(s.date) == monthYear);

                let seguroMes = Number(seguroMonto);

                if (seguro) {
                    seguroMes = Number(seguro.restante);
                }

                if (!seguroMesesAplicados.includes(monthYear)) {
                    seguroMesesAplicados.push(monthYear);
                } else {
                    seguroMes = 0;
                }

                const total = (capital +
                    cargosAdministrativos +
                    cargoCobranza +
                    seguroMes +
                    mora) || 0;

                result.capital = Number((result.capital + capital)) || 0;
                result.cargosAdministrativos = Number((result.cargosAdministrativos + cargosAdministrativos)) || 0;
                result.cargoCobranza = Number((result.cargoCobranza + cargoCobranza)) || 0;
                result.seguro = Number((result.seguro + seguroMes)) || 0;
                result.cargoMora = Number((result.cargoMora + mora)) || 0;
                result.total = Number((result.total + total)) || 0;

                return result;
            }, {
                capital: 0,
                cargosAdministrativos: 0,
                cargoCobranza: 0,
                seguro: 0,
                cargoMora: 0,
                total: 0,
            });

            log.debug("Deuda result", result);

            return result;
        }

        function getMesesFuturos(cuotas, seguroMonto) {
            const result = cuotas.reduce((result, current) => {
                const currentDate = getDateMonthAndYear(current.date)

                var date = format.parse({
                    type: format.Type.DATE,
                    value: current.date
                });

                date.setDate(1);

                var now = format.parse({
                    type: format.Type.DATE,
                    value: new Date()
                });

                now.setDate(1);

                if (date.getTime() <= now.getTime()) {
                    return result;
                }

                let stateString = Object.entries(CUOTA_STATUS).find(el => el[1] === current.estadoCuota)[0];

                if (stateString == "REEMBOLSADO" || stateString == "PAGO")
                    return result;

                const capital = Number(current.capital || 0) - Number(current.capitalPago || 0);
                const cargoAdministrativo = Number(current.cargosAdministrativos || 0) - Number(current.cargosAdministrativosPago || 0);
                const cargoCobranza = Number(current.cargosCobranza || 0) - Number(current.cargosCobranzaPago || 0);
                const cargoMora = Number(current.mora || 0) - Number(current.moraPago || 0);
                const cuota =  capital + cargoAdministrativo;
                const total = cuota + cargoCobranza + cargoMora;

                let currentMonth = result[currentDate];
                if (currentMonth) {
                    currentMonth.cuota = Number((currentMonth.cuota + cuota).toFixed(2));
                    currentMonth.cargoCobranza = Number((currentMonth.cargoCobranza + cargoCobranza).toFixed(2));
                    currentMonth.cargoMora = Number((currentMonth.cargoMora + cargoMora).toFixed(2));
                    currentMonth.total = Number((currentMonth.total + total).toFixed(2));
                } else {
                    result[currentDate] = {
                        date: current.date,
                        cuota: cuota,
                        seguro: seguroMonto,
                        cargoCobranza: cargoCobranza,
                        cargoMora: cargoMora,
                        total: total + seguroMonto,
                    }
                }
                return result;
            }, {})

            log.debug("getMesesFuturos", result);

            return Object.values(result).sort((a, b) => sortFormatDate(a.date, b.date));
        }

        return {onRequest}

    });