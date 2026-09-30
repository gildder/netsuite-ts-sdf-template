/**
 *@NApiVersion 2.1
 *@NScriptType MapReduceScript
*/
define(['N/search', 'N/record', 'N/format'], function (search, record, format) {

    const CUOTA_STATUS = {
        PENDIENTE: 1,
        PAGO: 2,
        PARCIAL: 3,
        MORA: 4,
        REEMBOLSADO: 5,
    }

    function getInputData(context) {
        log.debug("inicio:", "inicio");
        try {
            return search.create({
                type: 'customrecord_sdb_siscred_cuota',
                filters: [
                    ["custrecord_sdb_siscred_estadocuota","anyof", CUOTA_STATUS.PENDIENTE, CUOTA_STATUS.PARCIAL, CUOTA_STATUS.MORA],
                    //"AND",
                    //["internalid", "anyof", 2110132]
                    //["custrecord_sdb_cliente", "anyof", 5745]
                ],
                columns: [
                    "custrecord_sdb_cliente",
                    "custrecord_sdb_siscred_fechapago",
                    "custrecord_sdb_total_cargomora",
                    "custrecord_sdb_total_capital",
                    "custrecord_sdb_pago_capital",
                    "custrecord_sdb_total_cargoadministrativo",
                    "custrecord_sdb_total_cobranza",
                    "custrecord_sdb_descuento_dias_mora",
                    "internalid"
                ]
            });
        } catch (error) {
            log.debug("Get Input Data Catch", error);
        }
    }

    function map(context) {
        //var cuota = JSON.parse(context.value);
        //var cuotaValues = cuota.values;
        //log.debug("cuota: ", cuota.values);
        /*let currentDate = new Date();

        let currentDateFormat1 = format.format({
            type: format.Type.DATE,
            value: currentDate
        });
        log.debug("currentDate1", currentDateFormat1);
        
        let currentDateFormat2 = format.format({
            type: format.Type.DATETIME,
            value: currentDate
        });
        log.debug("currentDate2", currentDateFormat2);
        
        */
        
        try {
            var cuota = JSON.parse(context.value);
            var cuotaValues = cuota.values;

            log.debug("cuota: ", cuota.values);
            let today = new Date();

            let currentDate = format.format({
                type: format.Type.DATETIME,
                value: today,
            });
            log.debug("currentDate", currentDate);

            var fechaPago = cuotaValues["custrecord_sdb_siscred_fechapago"];

            log.debug("fechaPago", fechaPago);
            
            var cargoMora = Number(cuotaValues["custrecord_sdb_total_cargomora"]);
            var capital = Number(cuotaValues["custrecord_sdb_total_capital"]);
            var cargoAdm = Number(cuotaValues["custrecord_sdb_total_cargoadministrativo"]);
            var cargoCobranza = Number(cuotaValues["custrecord_sdb_total_cobranza"]);
            var capitalPago = Number(cuotaValues["custrecord_sdb_pago_capital"]);
            var dayDiscounts = Number(cuotaValues["custrecord_sdb_descuento_dias_mora"]);

            var difCapitales = capital - capitalPago;

            
            var diasDiferencia = diasDeDiferencia(fechaPago, currentDate);

            log.debug("diasDiferencia", diasDiferencia);
            if (diasDiferencia > 3) {
                if (dayDiscounts) {
                    diasDiferencia -= dayDiscounts;
                }

                var auxCargoMora = ((0.1 / 100) * difCapitales) * (diasDiferencia-1);
                log.debug("auxCargoMora", auxCargoMora);

                var difMora = auxCargoMora - cargoMora;
                var total = capital + cargoAdm + cargoCobranza + auxCargoMora;
                log.debug("total", total);

                record.submitFields({
                    type: "customrecord_sdb_siscred_cuota",
                    id: cuota.id,
                    values: {
                        "custrecord_sdb_total_cargomora": auxCargoMora,
                        "custrecord_sdb_total_total": total,
                        "custrecord_sdb_siscred_diasatrasado": (diasDiferencia-1) + dayDiscounts,
                        "custrecord_sdb_siscred_estadocuota": CUOTA_STATUS.MORA
                    }
                });

                var customerId = cuotaValues["custrecord_sdb_cliente"].value;

                var customerCuota = search.lookupFields({
                    type: search.Type.CUSTOMER,
                    id: customerId, // ID interno del cliente
                    columns: ['custentity_sdb_siscred_estadotarj'] 
                });

                const customerStatusCard = customerCuota.custentity_sdb_siscred_estadotarj[0].value;

                //log.debug("customerStatusCard", customerStatusCard);

                if(customerStatusCard != 2){
                    //log.debug("customerStatusCard", "ingreso a actualizar customerStatusCard");
                    record.submitFields({
                        type: record.Type.CUSTOMER,
                        id: customerId,
                        values: {
                            "custentity_sdb_siscred_estadotarj": 2
                        }
                    });
                }

                /*const customerRecord = record.load({ type: record.Type.CUSTOMER, id: customerId, isDynamic: false });

                customerRecord.setValue({ fieldId: "custentity_sdb_siscred_estadotarj", value: 2 });
                const savedId = customerRecord.save({ enableSourcing: false, ignoreMandatoryFields: true });*/

                log.debug("cuota morosa: ", {
                    id: cuota.id,
                    newTotal: (total + difMora),
                    tot: total,
                    diferenciaEnMora: difMora,
                    moraCalculada: auxCargoMora
                })
            }
        }
        catch (e) {
            log.error('ERROR - map', e);
            throw e;
        }
       
    }

    function reduce(context) {
        log.debug("Reduce: ", "Reduce executed");
    }

    function summarize(context) {
        log.debug("Map reduce finished");
    }

    function toUTCDate(date) {
        var d = format.parse({
            value: date,
            type: format.Type.DATE
        });

        // Crear fecha pura (año, mes, día) en UTC
        return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    }

    function diasDeDiferencia(inicio, fin) {
        var fechaInicio = toUTCDate(inicio);
        var fechaFin = toUTCDate(fin);

        var diffMs = fechaFin - fechaInicio;
        var dias = diffMs / (1000 * 60 * 60 * 24);

        return Math.round(dias); // o Math.floor(dias)
    }

    return {
        getInputData: getInputData,
        map: map,
        reduce: reduce,
        summarize: summarize
    }
});