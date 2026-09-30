/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(["N/runtime"],
    
    (runtime) => {

        /**
         * Defines the function definition that is executed before record is submitted.
         * @param {Object} scriptContext
         * @param {Record} scriptContext.newRecord - New record
         * @param {Record} scriptContext.oldRecord - Old record
         * @param {string} scriptContext.type - Trigger type; use values from the context.UserEventType enum
         * @since 2015.2
         */
        const beforeSubmit = (scriptContext) => {
            if (runtime.executionContext !== runtime.ContextType.USER_INTERFACE)
                return;
            var recordObj = scriptContext.newRecord;

            log.debug("Cuota ID:", recordObj.id)

            var scriptObj = runtime.getCurrentScript();
            var montoCargoCobranza = scriptObj.getParameter("custscript_sdb_calc_mora_monto_cargo_c");

            try {
                var difCapitales = recordObj.getValue("custrecord_sdb_total_capital") - recordObj.getValue("custrecord_sdb_pago_capital");
                var diasAtrasado = recordObj.getValue("custrecord_sdb_siscred_diasatrasado");
                var diasADescontarMora = recordObj.getValue("custrecord_sdb_descuento_dias_mora");
                var diasADescontarCargoCobranza = recordObj.getValue("custrecord_sdb_descuento_d_cargo_cobr");
                var cargoCobranza = recordObj.getValue("custrecord_sdb_total_cobranza");

                var diasCargoMora = diasAtrasado - diasADescontarMora;
                var diasCargoCobranza = diasAtrasado - diasADescontarCargoCobranza;

                var montoMora = 0;

                if(diasCargoMora >= 0) {
                    montoMora = ((0.1 / 100) * difCapitales) * diasCargoMora;

                    recordObj.setValue("custrecord_sdb_total_cargomora", montoMora);

                    var total = recordObj.getValue("custrecord_sdb_total_capital") +
                        recordObj.getValue("custrecord_sdb_total_cargoadministrativo") + montoMora;

                    recordObj.setValue("custrecord_sdb_total_total", total)
                }

                //Solo se calcula y asigna en map/reduce, aca solo se actualiza con los dias de descuento
                if(cargoCobranza > 0 && diasCargoCobranza >= 0) {
                    var dif = diasCargoCobranza / 30;
                    if (dif > 3) dif = 3
                    var monto = Math.floor(dif) * montoCargoCobranza;
                    recordObj.setValue("custrecord_sdb_total_cobranza", monto);
                }
            } catch (e) {
                log.error("ERROR BeforeSubmit", e);
            }

        }


        return {beforeSubmit}

    });
