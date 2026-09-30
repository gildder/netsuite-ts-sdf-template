/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 */
define(['N/record', 'N/search', 'N/runtime', 'N/format'],
    /**
 * @param{record} record
 * @param{search} search
 */
    (record, search, runtime, format) => {
        /**
         * Defines the function that is executed at the beginning of the map/reduce process and generates the input data.
         * @param {Object} inputContext
         * @param {boolean} inputContext.isRestarted - Indicates whether the current invocation of this function is the first
         *     invocation (if true, the current invocation is not the first invocation and this function has been restarted)
         * @param {Object} inputContext.ObjectRef - Object that references the input data
         * @typedef {Object} ObjectRef
         * @property {string|number} ObjectRef.id - Internal ID of the record instance that contains the input data
         * @property {string} ObjectRef.type - Type of the record instance that contains the input data
         * @returns {Array|Object|Search|ObjectRef|File|Query} The input data to use in the map/reduce process
         * @since 2015.2
         */

        const getInputData = (inputContext) => {
            let searchCustomer = search.create({
                type: "customer",
                filters:
                    [
                        ["custrecord_sdb_cliente.custrecord_sdb_siscred_estadocuota","anyof","4"]
                        //["internalid","anyof",92259, 1623358, 93285]
                    ],
                columns:
                    [
                        search.createColumn({name: "internalid", label: "Internal ID"})
                    ]
            });

            const countCustomers = searchCustomer.runPaged().count;
            log.debug("Count to proccess: ", countCustomers);

            return searchCustomer;
        }

        /**
         * Defines the function that is executed when the map entry point is triggered. This entry point is triggered automatically
         * when the associated getInputData stage is complete. This function is applied to each key-value pair in the provided
         * context.
         * @param {Object} mapContext - Data collection containing the key-value pairs to process in the map stage. This parameter
         *     is provided automatically based on the results of the getInputData stage.
         * @param {Iterator} mapContext.errors - Serialized errors that were thrown during previous attempts to execute the map
         *     function on the current key-value pair
         * @param {number} mapContext.executionNo - Number of times the map function has been executed on the current key-value
         *     pair
         * @param {boolean} mapContext.isRestarted - Indicates whether the current invocation of this function is the first
         *     invocation (if true, the current invocation is not the first invocation and this function has been restarted)
         * @param {string} mapContext.key - Key to be processed during the map stage
         * @param {string} mapContext.value - Value to be processed during the map stage
         * @since 2015.2
         */

        const map = (mapContext) => {
            var value = JSON.parse(mapContext.value)
            var values = value.values;
            log.debug("Client processed", values);
            try {
                var keys = Object.keys(values)
                var scriptObj = runtime.getCurrentScript();
                var mesesMinimos = scriptObj.getParameter("custscript_sdb_sis_cc_meses_minimos")
                var cargoMonto = scriptObj.getParameter("custscript_sdb_sis_cc_monto")

                var customer = values["internalid"].value;
                var id = -1;
                var date = null;
                var descuentoDias = 0;

                search.create({
                    type: "customrecord_sdb_siscred_cuota",
                    filters:
                        [
                            ["custrecord_sdb_siscred_estadocuota","anyof","4"],
                            "AND",
                            ["custrecord_sdb_cliente","anyof",customer]
                        ],
                    columns:
                        [
                            search.createColumn({
                                name: "custrecord_sdb_siscred_fechapago",
                                sort: search.Sort.ASC,
                                label: "Fecha a Pagar"
                            }),
                            search.createColumn({
                                name: "custrecord_sdb_descuento_d_cargo_cobr",
                                label: "Descuento Dias Cargo Cobranza"
                            })
                        ]
                }).run().each(function(result){
                    id = result.id;
                    date = result.getValue("custrecord_sdb_siscred_fechapago");
                    descuentoDias = result.getValue("custrecord_sdb_descuento_d_cargo_cobr");
                });

                if(id !== -1) {
                    var dateSplit = date?.split("/")
                    var dateFormatted = `${dateSplit[1]}/${dateSplit[0]}/${dateSplit[2]}`

                    var currentDateObj = new Date();
                    var currentDateFormatted = `${currentDateObj.getMonth() + 1}/${currentDateObj.getDate()}/${currentDateObj.getFullYear()}`

                    log.debug("MAP - values",  {
                        customer,
                        id,
                        dateFormatted
                    })

                    log.debug("currentDate", currentDateFormatted);
                    var diasDif = diasDeDiferencia(dateFormatted,currentDateFormatted)
                    log.debug("diasDif", descuentoDias)
                    diasDif -= descuentoDias;
                    log.debug("diasDif", diasDif)

                    var dif = diasDif / 30
                    log.debug("dif", dif)

                    if(dif > 1) {
                        if (dif > 3) dif = 3
                        var monto = Math.floor(dif) * cargoMonto;
                        log.debug("Cuota: " + id + " Monto", monto)
                        record.submitFields({
                            type: "customrecord_sdb_siscred_cuota",
                            id: id,
                            values: {
                                "custrecord_sdb_total_cobranza": monto
                            }
                        })
                    }
                }
            } catch (e) {
                log.error("MAP - ERROR", e)
                log.error("MAP - ERROR Values:", values)
            }
        }

        function diasDeDiferencia(inicio, fin) {
            var fechaInicio = new Date(inicio).getTime();
            var fechaFin = new Date(fin).getTime();

            var diff = fechaFin - fechaInicio;
            return diff / (1000 * 60 * 60 * 24)
        }

        return {
            getInputData, 
            map
        }

    });
