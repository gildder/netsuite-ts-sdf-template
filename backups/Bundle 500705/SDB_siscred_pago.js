/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 */
define(['N/search', 'N/record', 'N/runtime', 'N/format', 'N/https'],

    (search, record, runtime, format, https) => {

        const MARGEN = 0.02;
        const RECORD_SISCRED_CUOTA = "customrecord_sdb_siscred_cuota";
        const RECORD_PAGO_SEGURO = "customrecord_sdb_pago_seguro";
        const RECORD_PAGO_SISCRED = "customrecord_sdb_mc_pago_siscred";
        const RECORD_PAGO_CUOTA = "customrecord_sdb_pago_cuota";
        const LOCATION_MULTIPAGO = 32; // Tienda Oeste
        const PAYMENT_OPTION_SISCRED = 20; // Tienda Oeste
        const STATUS = {
            PENDIENTE: 1,
            PAGO: 2,
            PARCIAL: 3,
            MORA: 4,
        }
        const TAXCODES = {
            IVA: 6,
            NO_IVA: 5
        }
        const CUSTOMER_STATE = {
            ACTIVE: 1,
            INACTIVE: 2,
        }

        const getInputData = () => {
            try {
                let scriptObj = runtime.getCurrentScript();
                let customerId = scriptObj.getParameter('custscript_sdb_siscred_pago_customer');
                let amountToPay = scriptObj.getParameter('custscript_sdb_siscred_pago_amt_to_pay');
                let amountAvailable = amountToPay;
                let totalToPay = scriptObj.getParameter('custscript_sdb_siscred_pago_total');
                const salesOrderPosID = scriptObj.getParameter('custscript_sdb_mr_sales_order_pos');
                const date = scriptObj.getParameter('custscript_sdb_siscred_pago_date');

                const dateFormatted = format.format({
                    type: format.Type.DATE,
                    value: date ? date : new Date(),
                });

                log.audit("Customer to process", {
                    customer: customerId,
                    amount: amountToPay,
                    totalToPay: totalToPay,
                    date: dateFormatted
                });

                if (amountAvailable <= MARGEN) {
                    return [];
                }

                if (!totalToPay) {
                    var customerState = https.requestRestlet({
                        method: 'POST',
                        headers: {
                            'accept': 'application/json',
                            'content-type': 'application/json'
                        },
                        scriptId: 'customscript_sdb_pos_mc_getinfocuotas',
                        deploymentId: 'customdeploy_sdb_pos_mc_getinfocuotas',
                        body: JSON.stringify({
                            internalID: customerId
                        }),
                    });

                    var body = JSON.parse(customerState.body);

                    totalToPay = body.total;
                }

                let customerFields = search.lookupFields({
                    type: search.Type.CUSTOMER,
                    id: customerId,
                    columns: ['custentity_sdb_seg_censatia']
                });

                log.debug("customerFields", customerFields);
                let seguroMonto = customerFields["custentity_sdb_seg_censatia"] == true ? 15 : 12;

                /**
                 * Se obtiene información de cada una de las cuotas del cliente
                 * */
                let cuotasEnMeses = getCuotas(customerId);

                /**
                 * Busca los seguros del cliente
                 * */
                let seguros = findSeguroPartialOrPaided(customerId);

                log.debug("cuotasEnMeses", cuotasEnMeses);
                log.debug("seguros", seguros);

                /**
                 * Aplica la logica de distribucion de pago con la regla mora a las cuotas morosas que se obtuvieron con la funcion getCuota
                 * */
                let montosMora = getMontosMora(cuotasEnMeses.mora, seguros, seguroMonto, amountAvailable);
                log.debug("montosMora", montosMora);
                log.debug("getMontosMora montoConsumido", montosMora.montoConsumido);
                amountAvailable -= montosMora.montoConsumido;

                log.debug("isTotal", totalToPay - amountToPay <= MARGEN);

                /**
                 * Obtiene el mes aproximado y cubre los montos de esas cuotas
                 * */
                let montosMesAproximado = getMontosMesAproximado(cuotasEnMeses.pendientes, seguros, seguroMonto, amountAvailable, totalToPay - amountToPay <= MARGEN);
                log.debug("montosMesAproximado", montosMesAproximado);
                log.debug("montosMesAproximado montoConsumido", montosMesAproximado.montoConsumido);
                amountAvailable -= montosMesAproximado.montoConsumido;

                /**
                 * Aplica la logica de pago cuota a las cuotas futuras, se valida el pago total para el pago unico de capitales
                 * */
                let montosPendientes = getMontosPendientes(cuotasEnMeses.pendientes, seguros, seguroMonto, amountAvailable, totalToPay - amountToPay <= MARGEN);
                log.debug("montosPendientes", montosPendientes);
                log.debug("getMontosPendientes montoConsumido", montosPendientes.montoConsumido);
                amountAvailable -= montosPendientes.montoConsumido;

                log.debug("monto restante", amountAvailable);

                /**
                 * Unifica objetos con cuotas afectadas en un unico objeto
                 * */
                let cuotasAfectadas = {
                    ...montosMora.cuotasAfectadas,
                    ...montosMesAproximado.cuotasAfectadas,
                    ...montosPendientes.cuotasAfectadas
                }
                log.debug("cuotasAfectadas", cuotasAfectadas);

                /**
                 * Unifica objetos con los seguros pagados en un unico objeto
                 * */
                let segurosPagados = {
                    ...montosMora.segurosPagados,
                    ...montosMesAproximado.segurosPagados,
                    ...montosPendientes.segurosPagados
                }
                log.debug("segurosPagados", segurosPagados);

                const totalCargoAdministrativo = montosMora.totalCargoAdministrativo +
                    montosMesAproximado.totalCargoAdministrativo +
                    montosPendientes.totalCargoAdministrativo;
                log.debug("totalCargoAdministrativo", totalCargoAdministrativo);

                const totalSeguro = montosMora.totalSeguro +
                    montosMesAproximado.totalSeguro +
                    montosPendientes.totalSeguro;
                log.debug("totalSeguro", totalSeguro);

                const totalCargoCobranza = montosMora.totalCargoCobranza +
                    montosMesAproximado.totalCargoCobranza +
                    montosPendientes.totalCargoCobranza;
                log.debug("totalCargoCobranza", totalCargoCobranza);

                const totalMora = montosMora.totalMora +
                    montosMesAproximado.totalMora +
                    montosPendientes.totalMora;
                log.debug("totalMora", totalMora);

                /**
                 * Crea los registros del pago, aca se detalla en que cuotas va aplicar, detalla los montos que se van a cubrir y las transacciones que se generan.
                 * Tambien agrega una property extra a las cuotas el cual le indica el pago cuota correspondiente a esa cuota
                 * */
                createSiscredPago(customerId, amountToPay, dateFormatted, cuotasAfectadas, salesOrderPosID, scriptObj);

                /**
                 * Se obtiene todos los records a procesar, customer payment, pago seguro y cash sales
                 * */
                const cuotasSinFactura = Object.keys(cuotasAfectadas).filter(key => !cuotasAfectadas[key].factura);
                if (cuotasSinFactura.length > 0) {
                    log.error("getInputData - Cuotas sin factura vinculada, se excluyen del pago", cuotasSinFactura);
                }

                const recordsToProcess = [
                    ...Object.keys(cuotasAfectadas).filter(key => Number(cuotasAfectadas[key].capital) > 0 && cuotasAfectadas[key].factura).map(key => {
                        const cuota = cuotasAfectadas[key];

                        return {
                            recordToProcess: record.Type.CUSTOMER_PAYMENT,
                            factura: cuota.factura,
                            monto: cuota.capital,
                            transactionDate: dateFormatted,
                            appliedTo: [
                                cuota.pagoCuota
                            ],
                            cuota: key
                        }
                    }),
                    ...Object.keys(segurosPagados).filter(key => Number(segurosPagados[key].monto) > 0).map(key => {
                        const seguro = segurosPagados[key];
                        return {
                            recordToProcess: RECORD_PAGO_SEGURO,
                            fecha: key,
                            appliedTo: [
                                cuotasAfectadas[seguro.cuota].pagoCuota // Se obtiene con el id de la siscred cuota, la cuota del objeto cuotas afectadas para poder acceder a la propiedad pago cuota
                            ],
                            cuota: seguro.cuota,
                            monto: seguro.monto
                        }
                    }),
                ]

                if (totalCargoAdministrativo > 0 || totalMora > 0 || totalCargoCobranza > 0 || totalSeguro > 0) {
                    recordsToProcess.push({
                        recordToProcess: record.Type.CASH_SALE,
                        appliedTo: Object.keys(cuotasAfectadas).map(key => cuotasAfectadas[key].pagoCuota), // Se obtiene el id de el record pago cuota correspondiente a cada una de las cuotas afectadas
                        totalCargoAdministrativo: totalCargoAdministrativo,
                        totalSeguro: totalSeguro,
                        totalCargoCobranza: totalCargoCobranza,
                        totalMora: totalMora,
                        transactionDate: dateFormatted
                    });
                }

                /**
                 * Mueve información de las cuotas afectadas hasta el summaries para luego aplicar esto a las siscred cuotas correspondienntes en caso de que no haya errores
                 * */
                recordsToProcess.push({
                    recordToProcess: "DATA",
                    cuotasAfectadas,
                    regla: totalToPay - amountToPay <= MARGEN ? "TOTAL" : "PARCIAL"
                })

                log.debug("recordsToProcess", recordsToProcess);
                log.debug("remaining usage", runtime.getCurrentScript().getRemainingUsage());

                return recordsToProcess;
            } catch (error) {
                log.error("GetInputData - ERROR:", error);
                return null;
            }
        }

        const map = (mapContext) => {
            let data = JSON.parse(mapContext.value);
            if (data.recordToProcess === "DATA") {
                mapContext.write({
                    key: "DATA",
                    value: data
                });
            }

            const scriptObj = runtime.getCurrentScript();

            const customerId = scriptObj.getParameter('custscript_sdb_siscred_pago_customer');
            const salesOrderPosID = scriptObj.getParameter('custscript_sdb_mr_sales_order_pos');

            let salesOrderPosData = null;

            if (salesOrderPosID)
                salesOrderPosData = getSalesOrderPosData(salesOrderPosID);

            var recordId = -1;
            let cashSale = false;

            try {
                switch (data.recordToProcess) {
                    case record.Type.CUSTOMER_PAYMENT:
                        recordId = createCustomerPayment(customerId, data.factura, data.monto, scriptObj, data.transactionDate, salesOrderPosID, salesOrderPosData);
                        break;
                    case RECORD_PAGO_SEGURO:
                        recordId = createPagoSeguro(customerId, data.fecha, data.monto);
                        break;
                    case record.Type.CASH_SALE:
                        cashSale = true;
                        recordId = createCashSale(customerId, data, scriptObj, data.transactionDate, salesOrderPosID, salesOrderPosData);
                        break;
                }

                for (let i = 0; i < data.appliedTo?.length; i++) {
                    var recordProcessed = {
                        record: data.recordToProcess,
                        id: recordId
                    };

                    if (data.recordToProcess === RECORD_PAGO_SEGURO) {
                        recordProcessed.value = data.monto;
                    }

                    mapContext.write({
                        key: data.appliedTo[i],
                        value: recordProcessed
                    });
                }
            } catch (e) {
                log.error("map - ERROR:", e);

                for (let i = 0; i < data.appliedTo?.length; i++) {
                    mapContext.write({
                        key: data.appliedTo[i],
                        value: {
                            record: data.recordToProcess,
                            id: recordId,
                            errorMessage: e.message ? e.message : e
                        }
                    });
                }
            }
        }

        const reduce = (reduceContext) => {
            let processedRecords = reduceContext.values.map(JSON.parse);
            log.debug("reduce - key", reduceContext.key);
            log.debug("reduce - processedRecords", processedRecords);

            if (reduceContext.key === "DATA") {
                reduceContext.write({
                    key: "DATA",
                    value: processedRecords[0]
                });
                return;
            }

            try {
                let errorMessages = [];
                let fields = {}
                /**
                 * Se obtiene los ids y los valores de los records procesados para actualizar el record de pago cuota
                 * */
                processedRecords.forEach(recordProcessed => {
                    if (recordProcessed.errorMessage) {
                        errorMessages.push(recordProcessed.errorMessage)
                        return;
                    }

                    switch (recordProcessed.record) {
                        case record.Type.CUSTOMER_PAYMENT:
                            fields["custrecord_sdb_mc_payment_capital"] = recordProcessed.id;
                            break;
                        case RECORD_PAGO_SEGURO:
                            fields["custrecord_sdb_mc_cargo_seguro"] = recordProcessed.value;
                            break;
                        case record.Type.CASH_SALE:
                            fields["custrecord_sdb_mc_trans_cargos"] = recordProcessed.id;
                            break;
                    }
                });

                /**
                 * Se obtiene pago siscred y sus valores para no sobrescribir nada.
                 * */
                const pagoCuotaResult = search.lookupFields({
                    type: RECORD_PAGO_CUOTA,
                    id: reduceContext.key,
                    columns: [
                        'custrecord_sdb_mc_pago_siscred',
                        'custrecord_sdb_mc_pago_siscred.custrecord_sdb_mc_seguro',
                        'custrecord_sdb_mc_pago_siscred.custrecord_sdb_pago_siscred_error'
                    ]
                });

                const pagoSiscredResult = pagoCuotaResult["custrecord_sdb_mc_pago_siscred"];
                const pagoSiscred = Array.isArray(pagoSiscredResult) ? pagoSiscredResult[0].value : pagoSiscredResult.value;
                const pagoSiscredSeguro = Number(pagoCuotaResult["custrecord_sdb_mc_pago_siscred.custrecord_sdb_mc_seguro"]) || 0;
                const pagoSiscredErrores = pagoCuotaResult["custrecord_sdb_mc_pago_siscred.custrecord_sdb_pago_siscred_error"];

                const seguroPago = fields["custrecord_sdb_mc_cargo_seguro"];

                /**
                 * Actualizando pago siscred si hay pago de seguro o algun error en el pago cuota actual
                 * */
                if (pagoSiscred && (seguroPago > 0 || errorMessages?.length > 0)) {
                    var values = {}
                    if (seguroPago > 0) {
                        values["custrecord_sdb_mc_seguro"] = pagoSiscredSeguro + seguroPago;
                    }

                    if (errorMessages?.length > 0) {
                        values["custrecord_sdb_pago_siscred_error"] = `
                            ${pagoSiscredErrores} \r\n |
                            Pago Cuota ${reduceContext.key} con errores. \r\n
                            Errores: \r\n
                            ${errorMessages.join('\r\n')}
                        `

                        fields["custrecord_sdb_pago_cuota_has_error"] = true;
                    }

                    record.submitFields({
                        type: RECORD_PAGO_SISCRED,
                        id: pagoSiscred,
                        values: values
                    });
                }

                const recordId = record.submitFields({
                    type: RECORD_PAGO_CUOTA,
                    id: reduceContext.key,
                    values: fields
                });

                log.debug("Reduce - Pago Cuota Id", recordId);

                if (errorMessages.length <= MARGEN) {
                    reduceContext.write({
                        key: "SUCCESS",
                        value: recordId,
                    });
                } else {
                    reduceContext.write({
                        key: "ERROR",
                        value: null,
                    });
                }
            }
            catch (e) {
                log.error("REDUCE ERROR", e);

                if (reduceContext.key) {
                    record.submitFields({
                        type: RECORD_PAGO_CUOTA,
                        id: reduceContext.key,
                        values: {
                            "custrecord_sdb_pago_cuota_has_error": true
                        }
                    });
                }

                reduceContext.write({
                    key: "ERROR",
                    value: e,
                });
            }
        }

        const summarize = (summaryContext) => {

            var hasError = false;
            var data = {};
            summaryContext.output.iterator().each(function (key, value) {
                log.debug("summarize", key + ' ' + value);

                if (key === "SUCCESS")
                    log.debug("SUMMARY - SUCCESS: ", value);
                else if (key === "DATA")
                    data = JSON.parse(value);
                else if (key === "ERROR")
                    hasError = true;

                return true;
            });

            if (hasError) {
                log.error("summarize - Pago con errores. Revisar información asignada en el campo ERROR del record de pago.");
                return;
            }

            Object.keys(data.cuotasAfectadas).forEach(function (key) {
                const cuota = data.cuotasAfectadas[key];
                log.debug("cuota", cuota);

                const searchResult = search.lookupFields({
                    type: RECORD_SISCRED_CUOTA,
                    id: key,
                    columns: [
                        "custrecord_sdb_siscred_estadocuota",
                        "custrecord_sdb_total_capital",
                        "custrecord_sdb_total_cargoadministrativo",
                        "custrecord_sdb_total_cargomora",
                        "custrecord_sdb_total_cobranza",
                        "custrecord_sdb_pago_capital",
                        "custrecord_sdb_pago_cargoadministrativo",
                        "custrecord_sdb_pago_cargomora",
                        "custrecord_sdb_pago_cobranza",
                    ]
                })

                const currentState = Array.isArray(searchResult["custrecord_sdb_siscred_estadocuota"]) ? searchResult["custrecord_sdb_siscred_estadocuota"][0].value : searchResult["custrecord_sdb_siscred_estadocuota"].value;
                const newCapital = (Number(searchResult["custrecord_sdb_pago_capital"]) || 0) + (Number(cuota.capital) || 0);
                const newCargoAdm = (Number(searchResult["custrecord_sdb_pago_cargoadministrativo"]) || 0) + (Number(cuota.cargoAdministrativo) || 0);
                const newMora = (Number(searchResult["custrecord_sdb_pago_cargomora"]) || 0) + (Number(cuota.mora) || 0);
                const newCargoCobranza = (Number(searchResult["custrecord_sdb_pago_cobranza"]) || 0) + (Number(cuota.cargoCobranza) || 0);

                const values = {
                    "custrecord_sdb_pago_capital": newCapital.toFixed(10),
                    "custrecord_sdb_pago_cargoadministrativo": newCargoAdm.toFixed(10),
                    "custrecord_sdb_pago_cargomora": newMora.toFixed(10),
                    "custrecord_sdb_pago_cobranza": newCargoCobranza.toFixed(10),
                    "custrecord_sdb_pago_total": (newCapital + newCargoAdm + newMora + newCargoCobranza).toFixed(10),
                    "custrecord_sdb_siscred_estadocuota": currentState == STATUS.MORA ? STATUS.MORA : STATUS.PARCIAL
                }

                /**
                 * Valida los montos de la cuota junto con la regla aplicada para validar si se marca como parcial o pagada.
                 * */
                if (data.regla === "TOTAL") {
                    if (cuota.cuotaFutura) {
                        if (searchResult["custrecord_sdb_total_capital"] - newCapital <= MARGEN) {
                            values["custrecord_sdb_siscred_estadocuota"] = STATUS.PAGO;
                        }
                    } else {
                        if (searchResult["custrecord_sdb_total_capital"] - newCapital <= MARGEN &&
                            searchResult["custrecord_sdb_total_cobranza"] - newCargoCobranza <= MARGEN &&
                            searchResult["custrecord_sdb_total_cargoadministrativo"] - newCargoAdm <= MARGEN &&
                            searchResult["custrecord_sdb_total_cargomora"] - newMora <= MARGEN) {
                            values["custrecord_sdb_siscred_estadocuota"] = STATUS.PAGO;
                        }
                    }
                } else {
                    if (searchResult["custrecord_sdb_total_capital"] - newCapital <= MARGEN &&
                        searchResult["custrecord_sdb_total_cobranza"] - newCargoCobranza <= MARGEN &&
                        searchResult["custrecord_sdb_total_cargoadministrativo"] - newCargoAdm <= MARGEN &&
                        searchResult["custrecord_sdb_total_cargomora"] - newMora <= MARGEN) {
                        values["custrecord_sdb_siscred_estadocuota"] = STATUS.PAGO;
                    }
                }

                log.debug("summarize - Nuevos valores", values);

                const siscredCuotaId = record.submitFields({
                    type: RECORD_SISCRED_CUOTA,
                    id: key,
                    values: values
                });

                log.debug("summarize - Siscred Cuota Updated", siscredCuotaId);
            });

            /**
             * Validar si el cliente ya no tiene mora, en el caso que no tenga, activar la tarjeta
             * */
            try {
                var customerId = runtime.getCurrentScript().getParameter("custscript_sdb_siscred_pago_customer");
                var cuotasMora = search.create({
                    type: "customrecord_sdb_siscred_cuota",
                    filters:
                        [
                            ["custrecord_sdb_cliente", "anyof", customerId],
                            "AND",
                            ["custrecord_sdb_siscred_estadocuota", "anyof", STATUS.MORA]
                        ]
                }).runPaged().count;

                log.debug("Cuotas en mora restantes: ", cuotasMora);

                if (cuotasMora == 0) {
                    log.debug("Activando tarjeta a cliente");
                    record.submitFields({
                        type: record.Type.CUSTOMER,
                        id: customerId,
                        values: {
                            "custentity_sdb_siscred_estadotarj": CUSTOMER_STATE.ACTIVE
                        }
                    });
                }
            } catch (e) {
                log.error("ERROR Updating customer card state", e);
            }
        }

        function getCuotas(customerId) {
            let cuotasEnMeses = {
                mora: [],
                pendientes: [] //por pagar o parciales
            }

            search.create({
                type: "customrecord_sdb_siscred_cuota",
                filters:
                    [
                        ["custrecord_sdb_cliente", "anyof", customerId],
                        "AND",
                        ["custrecord_sdb_siscred_estadocuota", "noneof", STATUS.PAGO]
                    ],
                columns:
                    [
                        search.createColumn({ name: "custrecord_sdb_cliente", label: "Cliente" }),
                        search.createColumn({ name: "custrecord_sdb_siscred_estadocuota", label: "Estado Cuota" }),
                        search.createColumn({ name: "custrecord_sdb_siscred_fechapago", label: "Fecha a Pagar" }),
                        search.createColumn({ name: "custrecord_sdb_factura", label: "Factura" }),
                        search.createColumn({ name: "custrecord_sdb_pago_capital", label: "Capital" }),
                        search.createColumn({ name: "custrecord_sdb_total_capital", label: "Capital " }),
                        search.createColumn({ name: "custrecord_sdb_pago_cargoadministrativo", label: "Cargo Administrativo" }),
                        search.createColumn({ name: "custrecord_sdb_total_cargoadministrativo", label: "Cargo Administrativo " }),
                        search.createColumn({ name: "custrecord_sdb_pago_cargomora", label: "Cargo Mora" }),
                        search.createColumn({ name: "custrecord_sdb_total_cargomora", label: "Cargo Mora " }),
                        search.createColumn({ name: "custrecord_sdb_total_cobranza", label: "Cargo Cobranza" }),
                        search.createColumn({ name: "custrecord_sdb_pago_cobranza", label: "Cargo Cobranza " }),
                        search.createColumn({ name: "custrecord_sdb_pago_total", label: "Total" }),
                        search.createColumn({ name: "custrecord_sdb_total_total", label: "Total " })
                    ]
            }).run().each(function (result) {
                const cuotaStatus = result.getValue("custrecord_sdb_siscred_estadocuota");
                let cuota = {
                    id: result.id,
                    customer: result.getValue("custrecord_sdb_cliente"),
                    estado: result.getValue("custrecord_sdb_siscred_estadocuota"),
                    fechaPago: result.getValue("custrecord_sdb_siscred_fechapago"),
                    factura: result.getValue("custrecord_sdb_factura"),
                    captial: {
                        monto: Number(result.getValue("custrecord_sdb_total_capital")),
                        pago: Number(result.getValue("custrecord_sdb_pago_capital"))
                    },
                    cargoAdministrativo: {
                        monto: Number(result.getValue("custrecord_sdb_total_cargoadministrativo")),
                        pago: Number(result.getValue("custrecord_sdb_pago_cargoadministrativo"))
                    },
                    mora: {
                        monto: Number(result.getValue("custrecord_sdb_total_cargomora")),
                        pago: Number(result.getValue("custrecord_sdb_pago_cargomora"))
                    },
                    cargoCobranza: {
                        monto: Number(result.getValue("custrecord_sdb_total_cobranza")),
                        pago: Number(result.getValue("custrecord_sdb_pago_cobranza"))
                    },
                    total: {
                        monto: Number(result.getValue("custrecord_sdb_total_total")),
                        pago: Number(result.getValue("custrecord_sdb_pago_total"))
                    },
                }

                switch (Number(cuotaStatus)) {
                    case STATUS.PENDIENTE:
                    case STATUS.PARCIAL:
                        let mesFounded = cuotasEnMeses.pendientes.find(mes => mes.fecha == getDateMonthAndYear(cuota.fechaPago));
                        if (mesFounded) {
                            mesFounded.cuotas.push(cuota)
                        } else {
                            cuotasEnMeses.pendientes.push({
                                fecha: getDateMonthAndYear(cuota.fechaPago),
                                fechaCompleta: cuota.fechaPago,
                                cuotas: [cuota],
                            });
                        }
                        break;
                    case STATUS.MORA:
                        let moraMesFounded = cuotasEnMeses.mora.find(mes => mes.fecha == getDateMonthAndYear(cuota.fechaPago));
                        if (moraMesFounded) {
                            moraMesFounded.cuotas.push(cuota)
                        } else {
                            cuotasEnMeses.mora.push({
                                fecha: getDateMonthAndYear(cuota.fechaPago),
                                fechaCompleta: cuota.fechaPago,
                                cuotas: [cuota],
                            });
                        }
                        break;
                }
                return true;
            });
            cuotasEnMeses.mora.forEach(mes => {
                mes.cuotas?.sort((a, b) => sortFormatDate(a.fechaPago, b.fechaPago))
            });
            cuotasEnMeses.pendientes.forEach(mes => {
                mes.cuotas?.sort((a, b) => sortFormatDate(a.fechaPago, b.fechaPago))
            });
            cuotasEnMeses.mora = cuotasEnMeses.mora.sort((a, b) => sortFormatDate("1/" + a.fecha, "1/" + b.fecha));
            cuotasEnMeses.pendientes = cuotasEnMeses.pendientes.sort((a, b) => sortFormatDate("1/" + a.fecha, "1/" + b.fecha));
            return cuotasEnMeses;
        }

        function getMontosMora(mesCuotas, seguros, seguroMonto, amountAvailable) {
            var disponible = amountAvailable;

            let result = {
                cuotasAfectadas: {},
                segurosPagados: {},
                totalCargoAdministrativo: 0,
                totalCargoCobranza: 0,
                totalMora: 0,
                totalSeguro: 0,
                montoConsumido: 0,
            }

            if (disponible <= MARGEN)
                return result;

            for (let i = 0; i < mesCuotas.length; i++) {
                let mes = mesCuotas[i];

                if (disponible <= MARGEN)
                    break;

                /** CAPITAL */
                mes.cuotas.forEach(cuota => {
                    if (disponible <= MARGEN)
                        return;

                    const restante = cuota.captial.monto - cuota.captial.pago;

                    if (!result.cuotasAfectadas.hasOwnProperty(cuota.id)) {
                        result.cuotasAfectadas[cuota.id] = {
                            factura: cuota.factura
                        }
                    }

                    if (disponible > restante) {
                        result.cuotasAfectadas[cuota.id].capital = restante;
                        disponible -= restante
                    } else {
                        result.cuotasAfectadas[cuota.id].capital = disponible;
                        disponible = 0;
                    }
                });
            }

            if (disponible <= MARGEN) {
                result.montoConsumido = amountAvailable - disponible;
                return result;
            }

            /** SEGUROS */
            for (let i = 0; i < mesCuotas.length; i++) {

                if (disponible <= MARGEN)
                    break;

                let mes = mesCuotas[i];
                let seguro = seguros.find(seguro => getDateMonthAndYear(seguro.date) == mes.fecha);
                let montoSeguro = seguro ? seguro.restante : seguroMonto;
                const cuota = mes.cuotas[0]; // Cuota que se va hacer cargo del seguro mensual

                /** SEGURO */
                if (disponible > montoSeguro) {
                    result.segurosPagados[mes.fechaCompleta] = {
                        cuota: cuota.id,
                        monto: montoSeguro
                    };
                    result.totalSeguro += montoSeguro;
                    disponible -= montoSeguro;
                } else {
                    result.segurosPagados[mes.fechaCompleta] = {
                        cuota: cuota.id,
                        monto: disponible
                    };
                    result.totalSeguro += disponible;
                    disponible = 0;
                }
            }

            if (disponible <= MARGEN) {
                result.montoConsumido = amountAvailable - disponible;
                return result;
            }

            /** CARGO COBRANZA */
            for (let i = 0; i < mesCuotas.length; i++) {
                let mes = mesCuotas[i];

                if (disponible <= MARGEN)
                    break;

                mes.cuotas.forEach(cuota => {
                    if (disponible <= MARGEN)
                        return;

                    const restante = cuota.cargoCobranza.monto - cuota.cargoCobranza.pago;

                    if (!result.cuotasAfectadas.hasOwnProperty(cuota.id)) {
                        result.cuotasAfectadas[cuota.id] = {
                            factura: cuota.factura
                        }
                    }

                    if (disponible > restante) {
                        result.cuotasAfectadas[cuota.id].cargoCobranza = restante;
                        result.totalCargoCobranza += restante;
                        disponible -= restante
                    } else {
                        result.cuotasAfectadas[cuota.id].cargoCobranza = disponible;
                        result.totalCargoCobranza += disponible;
                        disponible = 0;
                    }
                });
            }

            if (disponible <= MARGEN) {
                result.montoConsumido = amountAvailable - disponible;
                return result;
            }

            /** CARGO ADMINISTRATIVO */
            for (let i = 0; i < mesCuotas.length; i++) {
                let mes = mesCuotas[i];

                if (disponible <= MARGEN)
                    break;

                mes.cuotas.forEach(cuota => {
                    if (disponible <= MARGEN)
                        return;

                    const restante = cuota.cargoAdministrativo.monto - cuota.cargoAdministrativo.pago;

                    if (!result.cuotasAfectadas.hasOwnProperty(cuota.id)) {
                        result.cuotasAfectadas[cuota.id] = {
                            factura: cuota.factura
                        }
                    }

                    if (disponible > restante) {
                        result.cuotasAfectadas[cuota.id].cargoAdministrativo = restante;
                        result.totalCargoAdministrativo += restante;
                        disponible -= restante
                    } else {
                        result.cuotasAfectadas[cuota.id].cargoAdministrativo = disponible;
                        result.totalCargoAdministrativo += disponible;
                        disponible = 0;
                    }
                });
            }

            if (disponible <= MARGEN) {
                result.montoConsumido = amountAvailable - disponible;
                return result;
            }

            /** MORA */
            for (let i = 0; i < mesCuotas.length; i++) {
                let mes = mesCuotas[i];

                if (disponible <= MARGEN)
                    break;

                mes.cuotas.forEach(cuota => {
                    if (disponible <= MARGEN)
                        return;

                    const restante = cuota.mora.monto - cuota.mora.pago;

                    if (!result.cuotasAfectadas.hasOwnProperty(cuota.id)) {
                        result.cuotasAfectadas[cuota.id] = {
                            factura: cuota.factura
                        }
                    }

                    if (disponible > restante) {
                        result.cuotasAfectadas[cuota.id].mora = restante;
                        result.totalMora += restante;
                        disponible -= restante
                    } else {
                        result.cuotasAfectadas[cuota.id].mora = disponible;
                        result.totalMora += disponible;
                        disponible = 0;
                    }
                });
            }

            result.montoConsumido = amountAvailable - disponible;

            return result;
        }

        function getMontosMesAproximado(mesCuotas, seguros, seguroMonto, amountAvailable, isTotal) {
            let disponible = amountAvailable;

            let result = {
                cuotasAfectadas: {},
                segurosPagados: {},
                totalCargoAdministrativo: 0,
                totalCargoCobranza: 0,
                totalMora: 0,
                totalSeguro: 0,
                montoConsumido: 0,
            }

            if (disponible <= MARGEN)
                return result;

            let currentDate = format.format({
                type: format.Type.DATE,
                value: new Date()
            });

            let mes = mesCuotas.splice(0, 1)[0];

            let currentDateFormated = getDateMonthAndYear(currentDate);
            let mesActual = currentDateFormated == mes?.fecha;
            let seguroPago = seguros.find(seguro => seguro.restante >= 0 && seguro.restante <= MARGEN);
            let seguroMes = seguros.find(seguro => getDateMonthAndYear(seguro.date) == mes?.fecha);
            let montoSeguro = seguroMes ? seguroMes.restante : seguroMonto;

            log.debug("mes", mes);
            if (mes) {
                /** CAPITAL */
                mes.cuotas.forEach(cuota => {
                    if (disponible <= MARGEN)
                        return;

                    const restante = cuota.captial.monto - cuota.captial.pago;

                    if (!result.cuotasAfectadas.hasOwnProperty(cuota.id)) {
                        result.cuotasAfectadas[cuota.id] = {
                            factura: cuota.factura
                        }

                        if (!mesActual && isTotal) {
                            result.cuotasAfectadas[cuota.id].cuotaFutura = true;
                        }
                    }

                    if (disponible > restante) {
                        result.cuotasAfectadas[cuota.id].capital = restante;
                        disponible -= restante
                    } else {
                        result.cuotasAfectadas[cuota.id].capital = disponible;
                        disponible = 0;
                    }
                });

                if (disponible <= MARGEN) {
                    result.montoConsumido = amountAvailable - disponible;
                    return result;
                }

                /** SEGURO */
                if (mesActual || (!mesActual && seguroPago == null)) {
                    const cuota = mes.cuotas[0]; // Cuota que se va hacer cargo del seguro mensual
                    if (disponible > montoSeguro) {
                        result.segurosPagados[mes.fechaCompleta] = {
                            cuota: cuota.id,
                            monto: montoSeguro
                        };
                        result.totalSeguro += montoSeguro;
                        disponible -= montoSeguro;
                    } else {
                        result.segurosPagados[mes.fechaCompleta] = {
                            cuota: cuota.id,
                            monto: disponible
                        };
                        result.totalSeguro += disponible;
                        disponible = 0;
                    }
                }

                if (disponible <= MARGEN) {
                    result.montoConsumido = amountAvailable - disponible;
                    return result;
                }

                /** CARGO COBRANZA */
                mes.cuotas.forEach(cuota => {
                    if (disponible <= MARGEN)
                        return;

                    const restante = cuota.cargoCobranza.monto - cuota.cargoCobranza.pago;

                    if (!result.cuotasAfectadas.hasOwnProperty(cuota.id)) {
                        result.cuotasAfectadas[cuota.id] = {
                            factura: cuota.factura
                        }
                    }

                    if (disponible > restante) {
                        result.cuotasAfectadas[cuota.id].cargoCobranza = restante;
                        result.totalCargoCobranza += restante;
                        disponible -= restante
                    } else {
                        result.cuotasAfectadas[cuota.id].cargoCobranza = disponible;
                        result.totalCargoCobranza += disponible;
                        disponible = 0;
                    }
                });

                if (disponible <= MARGEN) {
                    result.montoConsumido = amountAvailable - disponible;
                    return result;
                }

                /** CARGO ADMINISTRATIVO */
                if (mesActual || (!mesActual && !isTotal)) {
                    mes.cuotas.forEach(cuota => {
                        if (disponible <= MARGEN)
                            return;

                        const restante = cuota.cargoAdministrativo.monto - cuota.cargoAdministrativo.pago;

                        if (!result.cuotasAfectadas.hasOwnProperty(cuota.id)) {
                            result.cuotasAfectadas[cuota.id] = {
                                factura: cuota.factura
                            }
                        }

                        if (disponible > restante) {
                            result.cuotasAfectadas[cuota.id].cargoAdministrativo = restante;
                            result.totalCargoAdministrativo += restante;
                            disponible -= restante
                        } else {
                            result.cuotasAfectadas[cuota.id].cargoAdministrativo = disponible;
                            result.totalCargoAdministrativo += disponible;
                            disponible = 0;
                        }
                    });
                }

                if (disponible <= MARGEN) {
                    result.montoConsumido = amountAvailable - disponible;
                    return result;
                }

                /** MORA */
                mes.cuotas.forEach(cuota => {
                    if (disponible <= MARGEN)
                        return;

                    const restante = cuota.mora.monto - cuota.mora.pago;

                    if (!result.cuotasAfectadas.hasOwnProperty(cuota.id)) {
                        result.cuotasAfectadas[cuota.id] = {
                            factura: cuota.factura
                        }
                    }

                    if (disponible > restante) {
                        result.cuotasAfectadas[cuota.id].mora = restante;
                        result.totalMora += restante;
                        disponible -= restante
                    } else {
                        result.cuotasAfectadas[cuota.id].mora = disponible;
                        result.totalMora += disponible;
                        disponible = 0;
                    }
                });
            }


            result.montoConsumido = amountAvailable - disponible;
            return result;
        }

        function getMontosPendientes(mesCuotas, seguros, seguroMonto, amountAvailable, isTotal) {
            let disponible = amountAvailable;

            let result = {
                cuotasAfectadas: {},
                segurosPagados: {},
                totalCargoAdministrativo: 0,
                totalCargoCobranza: 0,
                totalMora: 0,
                totalSeguro: 0,
                montoConsumido: 0,
            }

            if (disponible <= MARGEN)
                return result;

            for (let i = 0; i < mesCuotas.length; i++) {
                let mes = mesCuotas[i];

                if (disponible <= MARGEN)
                    break;

                /** CAPITAL */
                mes.cuotas.forEach(cuota => {
                    if (disponible <= MARGEN)
                        return;

                    const restante = cuota.captial.monto - cuota.captial.pago;

                    if (!result.cuotasAfectadas.hasOwnProperty(cuota.id)) {
                        result.cuotasAfectadas[cuota.id] = {
                            factura: cuota.factura,
                            cuotaFutura: true
                        }
                    }

                    if (disponible > restante) {
                        result.cuotasAfectadas[cuota.id].capital = restante;
                        disponible -= restante
                    } else {
                        result.cuotasAfectadas[cuota.id].capital = disponible;
                        disponible = 0;
                    }
                });

                if (disponible <= MARGEN) break;

                //Si no es la primera y esta pagando el total de la orden, continuar para que continue pagando solo capitales
                if (isTotal) continue;

                /** CARGO COBRANZA */
                mes.cuotas.forEach(cuota => {
                    if (disponible <= MARGEN)
                        return;

                    const restante = cuota.cargoCobranza.monto - cuota.cargoCobranza.pago;

                    if (!result.cuotasAfectadas.hasOwnProperty(cuota.id)) {
                        result.cuotasAfectadas[cuota.id] = {
                            factura: cuota.factura,
                            cuotaFutura: true
                        }
                    }

                    if (disponible > restante) {
                        result.cuotasAfectadas[cuota.id].cargoCobranza = restante;
                        result.totalCargoCobranza += restante;
                        disponible -= restante
                    } else {
                        result.cuotasAfectadas[cuota.id].cargoCobranza = disponible;
                        result.totalCargoCobranza += disponible;
                        disponible = 0;
                    }
                });

                if (disponible <= MARGEN) break;

                /** CARGO ADMINISTRATIVO */
                mes.cuotas.forEach(cuota => {
                    if (disponible <= MARGEN)
                        return;

                    const restante = cuota.cargoAdministrativo.monto - cuota.cargoAdministrativo.pago;

                    if (!result.cuotasAfectadas.hasOwnProperty(cuota.id)) {
                        result.cuotasAfectadas[cuota.id] = {
                            factura: cuota.factura,
                            cuotaFutura: true
                        }
                    }

                    if (disponible > restante) {
                        result.cuotasAfectadas[cuota.id].cargoAdministrativo = restante;
                        result.totalCargoAdministrativo += restante;
                        disponible -= restante
                    } else {
                        result.cuotasAfectadas[cuota.id].cargoAdministrativo = disponible;
                        result.totalCargoAdministrativo += disponible;
                        disponible = 0;
                    }
                });

                if (disponible <= MARGEN) break;

                /** MORA */
                mes.cuotas.forEach(cuota => {
                    if (disponible <= MARGEN)
                        return;

                    const restante = cuota.mora.monto - cuota.mora.pago;

                    if (!result.cuotasAfectadas.hasOwnProperty(cuota.id)) {
                        result.cuotasAfectadas[cuota.id] = {
                            factura: cuota.factura,
                            cuotaFutura: true
                        }
                    }

                    if (disponible > restante) {
                        result.cuotasAfectadas[cuota.id].mora = restante;
                        result.totalMora += restante;
                        disponible -= restante
                    } else {
                        result.cuotasAfectadas[cuota.id].mora = disponible;
                        result.totalMora += disponible;
                        disponible = 0;
                    }
                });
            }

            result.montoConsumido = amountAvailable - disponible;
            return result;
        }

        function findSeguroPartialOrPaided(customer) {
            let dates = [];
            search.create({
                type: "customrecord_sdb_pago_seguro",
                filters:
                    [
                        ["custrecord_sdb_cliente_cuota_paga", "anyof", customer]
                    ],
                columns:
                    [
                        search.createColumn({ name: "custrecord_sdb_pago_cliente_date", label: "DATE PAGO CLIENTE" }),
                        search.createColumn({ name: "custrecord_sdb_paid_unemployinsurance", label: "PAGO ACUMULADO SEGURO DESEMPLEO" }),
                        search.createColumn({
                            name: "custentity_sdb_seg_censatia",
                            join: "CUSTRECORD_SDB_CLIENTE_CUOTA_PAGA",
                            label: "Seguro Cesantia"
                        })
                    ]
            }).run().each(function (result) {
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

        function getDateMonthAndYear(date) {
            let formatedDate = format.parse({
                type: format.Type.DATE,
                value: date
            });
            return (formatedDate?.getMonth() + 1) + "/" + formatedDate?.getFullYear();
        }

        function createSiscredPago(customer, amount, date, cuotasAfectadas, salesOrderPosID = null, scriptObj) {
            var pagoSiscred = record.create({
                type: "customrecord_sdb_mc_pago_siscred",
                isDynamic: true,
            });

            pagoSiscred.setValue({
                fieldId: "custrecord_sdb_mc_pago_siscred_cliente",
                value: customer,
            });
            pagoSiscred.setValue({
                fieldId: "custrecord_sdb_mc_pago_siscred_monto",
                value: amount,
            });
            pagoSiscred.setValue({
                fieldId: "custrecord_sdb_mc_pago_siscred_fecha",
                value: format.parse({
                    type: format.Type.DATE,
                    value: format.format({
                        type: format.Type.DATE,
                        value: date,
                    }),
                }),
            });
            if (salesOrderPosID !== null) {
                pagoSiscred.setValue({
                    fieldId: "custrecord_sdb_pago_siscred_so_pos",
                    value: salesOrderPosID,
                });
            }
            if (salesOrderPosID == null) {
                const typePayment = scriptObj.getParameter("custscript_mc_siscred_pago_type");
                var paymentOrigin = 2;
                if (typePayment) {
                    paymentOrigin = 3;
                }

                pagoSiscred.setValue({ fieldId: "custrecord_mc_payment_origin", value: paymentOrigin });
            }

            var pagoSiscredId = pagoSiscred.save({
                enableSourcing: true,
                ignoreMandatoryFields: true,
            });

            log.debug("Pago Siscred Id", pagoSiscredId);

            for (const cuotaId in cuotasAfectadas) {
                createPagoCuota(pagoSiscredId, cuotaId, cuotasAfectadas[cuotaId]);
            }
        }

        function createPagoCuota(parent, cuotaId, cuota) {
            var pagoCuota = record.create({
                type: RECORD_PAGO_CUOTA,
                isDynamic: true,
            });
            pagoCuota.setValue({
                fieldId: "custrecord_sdb_mc_cuota",
                value: cuotaId,
            });
            pagoCuota.setValue({
                fieldId: "custrecord_sdb_mc_trans_capital",
                value: cuota.factura,
            });
            pagoCuota.setValue({
                fieldId: "custrecord_sdb_mc_pago_siscred",
                value: parent,
            });
            pagoCuota.setValue({
                fieldId: "custrecord_sdb_mc_capital",
                value: cuota.capital || 0,
            });
            pagoCuota.setValue({
                fieldId: "custrecord_sdb_mc_cargo_cobranza",
                value: cuota.cargoCobranza || 0,
            });
            pagoCuota.setValue({
                fieldId: "custrecord_sdb_mc_cargo_administrativo",
                value: cuota.cargoAdministrativo || 0,
            });
            pagoCuota.setValue({
                fieldId: "custrecord_sdb_mc_cargo_mora",
                value: cuota.mora || 0,
            });

            var totalCuota =
                cuota.capital +
                cuota.cobranza +
                cuota.administrativo +
                cuota.mora;

            pagoCuota.setValue({
                fieldId: "custrecord_sdb_mc_total",
                value: Number(totalCuota || 0).toFixed(4),
            });

            var pagoCuotaId = pagoCuota.save({
                enableSourcing: true,
                ignoreMandatoryFields: true,
            });

            cuota.pagoCuota = pagoCuotaId;

            log.debug("Pago Cuota ID", pagoCuotaId);
        }

        function createCustomerPayment(customerId, invoice, amount, scriptObj, date, salesOrderPosID = null, salesOrderPosData = null) {
            if (!invoice) {
                throw new Error("La cuota no tiene factura vinculada (custrecord_sdb_factura vacío). Customer: " + customerId + ", Amount: " + amount);
            }

            const accountSiscred = scriptObj.getParameter(
                "custscript_sdb_mr_siscred_account"
            );
            var bankAccount = scriptObj.getParameter(
                "custscript_sdb_mr_bank_account"
            );

            const typePayment = scriptObj.getParameter(
                "custscript_mc_siscred_pago_type"
            );

            if (typePayment) {
                //if(typePayment == 1)
                //    bankAccount = 3137;
                if (typePayment == 2)
                    bankAccount = 3785;
                log.debug("Tipo de Pago: ", typePayment);
            }

            log.debug("Cuenta a usar: ", bankAccount);

            var payment = record.create({
                type: record.Type.CUSTOMER_PAYMENT,
                isDynamic: true,
            });

            payment.setValue({ fieldId: "customer", value: customerId });
            payment.setValue({
                fieldId: "trandate",
                value: format.parse({
                    type: format.Type.DATE,
                    value: date,
                })
            });
            payment.setValue({ fieldId: "currency", value: 1 }); // BOL
            payment.setValue({ fieldId: "aracct", value: accountSiscred });

            if (salesOrderPosID) {
                payment.setValue({
                    fieldId: "custbody_mc_pos_record",
                    value: salesOrderPosID,
                });
                payment.setValue({
                    fieldId: "custbody_sdb_pos_mc_pos_record",
                    value: salesOrderPosID,
                });

                setPaymentAccount(payment, salesOrderPosData, bankAccount);
            } else {
                payment.setValue({ fieldId: "location", value: LOCATION_MULTIPAGO }); // Tienda Oeste
                payment.setValue({ fieldId: "undepfunds", value: "F" });
                payment.setValue({ fieldId: "account", value: bankAccount });
            }

            var lineNumber = payment.findSublistLineWithValue({
                sublistId: "apply",
                fieldId: "internalid",
                value: invoice,
            });

            if (lineNumber === -1) {
                throw new Error("La factura " + invoice + " no fue encontrada en el apply sublist del Customer Payment. Customer: " + customerId);
            }

            payment.selectLine({
                sublistId: "apply",
                line: lineNumber,
            });

            payment.setCurrentSublistValue({
                sublistId: "apply",
                fieldId: "apply",
                value: true,
            });

            payment.setCurrentSublistValue({
                sublistId: "apply",
                fieldId: "amount",
                value: Number(amount).toFixed(10),
                ignoreFieldChange: false,
            });

            var paymentId = payment.save({
                enableSourcing: true,
                ignoreMandatoryFields: true,
            });

            log.audit("invoice id - payment id", invoice + "-" + paymentId);

            return paymentId;
        }

        function createCashSale(customerId, data, scriptObj, date, salesOrderPosID = null, salesOrderPosData = null) {
            var bankAccount = scriptObj.getParameter(
                "custscript_sdb_mr_bank_account"
            );

            const typePayment = scriptObj.getParameter(
                "custscript_mc_siscred_pago_type"
            );

            if (typePayment) {
                //if(typePayment == 1)
                //    bankAccount = 3137;
                if (typePayment == 2)
                    bankAccount = 3785;
                log.debug("Tipo de Pago Cash Sale: ", typePayment);
            }

            log.debug("Cuenta a usar Cash Sale: ", bankAccount);

            const itemCargoAdm = scriptObj.getParameter({
                name: "custscript_sdb_mr_item_cargo_adm",
            });

            const itemCargoSeguro = scriptObj.getParameter({
                name: "custscript_sdb_mr_item_cargo_seguro",
            });

            const itemCargoCobr = scriptObj.getParameter({
                name: "custscript_sdb_mr_item_cargo_cobranza",
            });

            const itemCargoMora = scriptObj.getParameter({
                name: "custscript_sdb_mr_item_cargo_mora",
            });

            let cashSaleRecord = record.create({
                type: record.Type.CASH_SALE,
                isDynamic: true,
            });

            cashSaleRecord.setValue({
                fieldId: "entity",
                value: customerId
            });

            cashSaleRecord.setValue({
                fieldId: "memo",
                value: "cargos cuotas siscred"
            });

            cashSaleRecord.setValue({
                fieldId: "trandate",
                value: format.parse({
                    type: format.Type.DATE,
                    value: date,
                })
            });

            cashSaleRecord.setValue({
                fieldId: "location",
                value: LOCATION_MULTIPAGO
            });

            cashSaleRecord.setValue({
                fieldId: "paymentoption",
                value: PAYMENT_OPTION_SISCRED // Siscred
            });

            if (salesOrderPosID && salesOrderPosData) {

                cashSaleRecord.setValue({
                    fieldId: "location",
                    value: salesOrderPosData.location,
                });
                cashSaleRecord.setValue({
                    fieldId: "custbody_mc_paid_with_pos",
                    value: true,
                });
                cashSaleRecord.setValue({
                    fieldId: "custbody_paid_with_pos",
                    value: true,
                });
                cashSaleRecord.setValue({
                    fieldId: "custbody_mc_pos_record",
                    value: salesOrderPosID,
                });
                cashSaleRecord.setValue({
                    fieldId: "custbody_sdb_pos_mc_pos_record",
                    value: salesOrderPosID,
                });

                let electronicInvoice = salesOrderPosData?.electronic_invoice?.response;
                if (electronicInvoice) {
                    const codigoRecepcion = electronicInvoice.proceso.codigoRecepcion;
                    let locationEmisor = salesOrderPosData.emisor
                        ? salesOrderPosData.emisor
                        : salesOrderPosData.location;

                    const emisor = getEmisor(locationEmisor);

                    var recepcion;
                    if (codigoRecepcion == 908)
                        recepcion = "VALIDADA";
                    else if (codigoRecepcion == 904)
                        recepcion = "RECHAZADA FUERA DE LINEA";
                    else if (codigoRecepcion == 905)
                        recepcion = "ANULADA";
                    else if (electronicInvoice.proceso.fueraLinea)
                        recepcion = "FUERA DE LINEA";
                    else recepcion = "RECHAZADA";

                    if (emisor != -1) {
                        cashSaleRecord.setValue({
                            fieldId: "custbody_sdb_emisor_documento",
                            value: emisor?.toString(),
                        });

                        cashSaleRecord.setValue({
                            fieldId: "custbody_sdb_numero_factura",
                            value: electronicInvoice.facturaCompraVentaBon.cabecera.numeroFactura,
                        });

                        cashSaleRecord.setValue({
                            fieldId: "custbody_sdb_cuf",
                            value: electronicInvoice.facturaCompraVentaBon.cabecera.cuf,
                        });

                        cashSaleRecord.setValue({
                            fieldId: "custbody_sdb_cufd",
                            value: electronicInvoice.proceso.cufd,
                        });

                        cashSaleRecord.setValue({
                            fieldId: "custbody_sdb_fecha_emision",
                            value: electronicInvoice.facturaCompraVentaBon.cabecera.fechaEmision,
                        });

                        cashSaleRecord.setValue({
                            fieldId: "custbody_sdb_fact_electronica_id",
                            value: electronicInvoice.proceso.idDocFiscalERP,
                        });

                        cashSaleRecord.setValue({
                            fieldId: "custbody_sdb_confirmacion_f_electro",
                            value: recepcion,
                        });
                    }
                }
            } else {
                cashSaleRecord.setValue({
                    fieldId: "account",
                    value: bankAccount,
                });
            }

            if (data.totalCargoAdministrativo && data.totalCargoAdministrativo > 0) {
                AddLine(cashSaleRecord, itemCargoAdm, data.totalCargoAdministrativo, TAXCODES.IVA);
            }

            if (data.totalMora && data.totalMora > 0) {
                AddLine(cashSaleRecord, itemCargoMora, data.totalMora, TAXCODES.IVA); //IVA
            }

            if (data.totalCargoCobranza && data.totalCargoCobranza > 0) {
                AddLine(cashSaleRecord, itemCargoCobr, data.totalCargoCobranza, TAXCODES.IVA); //IVA
            }

            if (data.totalSeguro && data.totalSeguro > 0) {
                AddLine(cashSaleRecord, itemCargoSeguro, data.totalSeguro, TAXCODES.NO_IVA); //SIN IVA
            }

            const transactionId = cashSaleRecord.save({
                enableSourcing: true,
                ignoreMandatoryFields: true,
            });

            log.audit("Cash Sale Created:", transactionId);

            return transactionId;
        }

        function AddLine(transaction, item, amount, taxCode) {
            transaction.selectNewLine({
                sublistId: "item"
            });

            transaction.setCurrentSublistValue({
                sublistId: "item",
                fieldId: "item",
                value: item,
            });

            if (taxCode != -1) {
                transaction.setCurrentSublistValue({
                    sublistId: "item",
                    fieldId: "taxcode",
                    value: taxCode,
                });
            }

            var amountString = amount?.toString();
            transaction.setCurrentSublistValue({
                sublistId: "item",
                fieldId: "grossamt",
                value: amountString.length > 15
                    ? Number(amountString.slice(0, 15))
                    : Number(amountString),
                ignoreFieldChange: false,
            });


            transaction.commitLine({
                sublistId: "item"
            });
        }

        function createPagoSeguro(customerId, date, monto) {
            let customRecord = record.create({
                type: RECORD_PAGO_SEGURO,
                isDynamic: true,
            });

            customRecord.setValue("custrecord_sdb_cliente_cuota_paga", customerId);
            log.debug("createPagoSeguro", date);
            customRecord.setValue("custrecord_sdb_pago_cliente_date", format.parse({
                type: format.Type.DATE,
                value: date
            }));
            customRecord.setValue("custrecord_sdb_paid_unemployinsurance", monto);

            const seguroPagoId = customRecord.save({
                enableSourcing: true,
                ignoreMandatoryFields: true,
            });

            log.audit("Pago Seguro created: ", seguroPagoId);

            return seguroPagoId;
        }

        function setPaymentAccount(paymentRecord, salesOrderData, account) {
            try {

                if (salesOrderData.payments?.find((p) => p.payment_method == "cash")) {
                    paymentRecord.setValue({ fieldId: "undepfunds", value: "T" });
                } else {
                    paymentRecord.setValue({ fieldId: "undepfunds", value: "F" });
                    paymentRecord.setValue({ fieldId: "account", value: account });
                }
            } catch (e) {
                log.error("ERROR - setPaymentAccount", e)
            }
        }

        function getSalesOrderPosData(id) {
            var lookUpFieldsResult = search.lookupFields({
                type: "customrecord_sdb_pos_mc_so",
                id: id,
                columns: "custrecord_mc_json_order"
            });
            log.debug("lookUpFieldsResult", lookUpFieldsResult);

            var salesOrderData = JSON.parse(lookUpFieldsResult.custrecord_mc_json_order);

            if (typeof salesOrderData == "string") {
                salesOrderData = JSON.parse(salesOrderData);
            }

            return salesOrderData;
        }

        function getEmisor(locationEmisor) {
            let emisor = -1;
            search
                .create({
                    type: "customrecord_sdb_emisor_documento",
                    filters: [
                        ["custrecord_sdb_emisor_ubicacion", "anyof", locationEmisor],
                    ],
                    columns: ["custrecord_sdb_ultimo_numero_factura"],
                })
                .run()
                .each((result) => {
                    emisor = result.id;
                });

            return emisor;
        }

        return { getInputData, map, reduce, summarize }

    });
