/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @NModuleScope SameAccount
 */
define(["N/log", "N/record", "N/search", "N/runtime", "N/format"], function (
    log,
    record,
    search,
    runtime,
    format
) {
    const STATUS = {
        PENDIENTE: 1,
        PAGO: 2,
        PARCIAL: 3,
        MORA: 4,
    };

    const post = function (requestBody) {
        try {
            const customerId = requestBody.customerId;
            const originalMonto = Number(requestBody.monto);
            let monto = originalMonto;
            const totalToPay = requestBody.totalToPay;

            if (monto <= 0) {
                return [];
            }

            const cuotasEnMeses = getCuotas(customerId);
            const seguros = findSeguroPartialOrPaided(customerId);
            let resultList = [];

            // Procesar cuotas en mora
            let montosMora = processCuotas(cuotasEnMeses.mora, seguros, monto);
            resultList = resultList.concat(montosMora.resultList);
            monto = montosMora.remainingMonto;

            // Procesar cuotas pendientes
            let montosPendientes = processCuotas(cuotasEnMeses.pendientes, seguros, monto);
            resultList = resultList.concat(montosPendientes.resultList);

            return resultList.filter(cuota => cuota.tieneMontos); // Filtrar cuotas sin montos aplicados
        } catch (error) {
            log.error("Error en el script", error);
            return [];
        }
    };

    function processCuotas(mesCuotas, seguros, montoDisponible) {
        let resultList = [];
        let remainingMonto = montoDisponible;

        mesCuotas.forEach(mes => {
            mes.cuotas.forEach(cuota => {
                let cuotaMontos = {
                    cuotaId: cuota.id,
                    tieneMontos: false,
                    montosAplicados: {
                        capital: 0,
                        cargoAdm: 0,
                        cargoCobr: 0,
                        seguro: 0,
                        mora: 0
                    }
                };

                // Aplicar seguro (prioritario, como en el script base)
                const seguroMes = seguros.find(seguro => getDateMonthAndYear(seguro.date) === mes.fecha);
                const seguroMonto = seguroMes ? seguroMes.restante : 0;
                if (remainingMonto > 0 && seguroMonto > 0) {
                    const aplicado = Math.min(remainingMonto, seguroMonto);
                    cuotaMontos.montosAplicados.seguro = aplicado;
                    remainingMonto -= aplicado;
                    cuotaMontos.tieneMontos = true;
                }

                // Procesar capital
                const restanteCapital = cuota.captial.monto - cuota.captial.pago;
                if (remainingMonto > 0 && restanteCapital > 0) {
                    const aplicado = Math.min(remainingMonto, restanteCapital);
                    cuotaMontos.montosAplicados.capital = aplicado;
                    remainingMonto -= aplicado;
                    cuotaMontos.tieneMontos = true;
                }

                // Procesar cargos administrativos, cobranza y mora
                ['cargoAdministrativo', 'cargoCobranza', 'mora'].forEach(cargoKey => {
                    if (remainingMonto > 0) {
                        const restante = cuota[cargoKey].monto - cuota[cargoKey].pago;
                        if (restante > 0) {
                            const aplicado = Math.min(remainingMonto, restante);
                            cuotaMontos.montosAplicados[cargoKey] = aplicado;
                            remainingMonto -= aplicado;
                            cuotaMontos.tieneMontos = true;
                        }
                    }
                });

                // Incluir en resultado solo si tiene montos aplicados
                if (cuotaMontos.tieneMontos) {
                    resultList.push(cuotaMontos);
                }
            });
        });

        return { resultList, remainingMonto };
    }




    /**
* Recupera las cuotas asociadas al cliente organizadas por estado.
* @param {string} customerId - ID del cliente.
* @returns {Object} Cuotas organizadas en "pendientes" y "mora".
*/
    function getCuotas(customerId) {
        let cuotasEnMeses = {
            mora: [],
            pendientes: []
        };

        search.create({
            type: "customrecord_sdb_siscred_cuota",
            filters: [
                ["custrecord_sdb_cliente", "anyof", customerId],
                "AND",
                ["custrecord_sdb_siscred_estadocuota", "noneof", STATUS.PAGO]
            ],
            columns: [
                search.createColumn({ name: "custrecord_sdb_cliente", label: "Cliente" }),
                search.createColumn({ name: "custrecord_sdb_siscred_estadocuota", label: "Estado Cuota" }),
                search.createColumn({ name: "custrecord_sdb_siscred_fechapago", label: "Fecha a Pagar" }),
                search.createColumn({ name: "custrecord_sdb_pago_capital", label: "Capital" }),
                search.createColumn({ name: "custrecord_sdb_total_capital", label: "Capital Total" }),
                search.createColumn({ name: "custrecord_sdb_pago_cargoadministrativo", label: "Cargo Administrativo" }),
                search.createColumn({ name: "custrecord_sdb_total_cargoadministrativo", label: "Cargo Administrativo Total" }),
                search.createColumn({ name: "custrecord_sdb_pago_cargomora", label: "Cargo Mora" }),
                search.createColumn({ name: "custrecord_sdb_total_cargomora", label: "Cargo Mora Total" }),
                search.createColumn({ name: "custrecord_sdb_total_cobranza", label: "Cargo Cobranza Total" }),
                search.createColumn({ name: "custrecord_sdb_pago_cobranza", label: "Cargo Cobranza" }),
                search.createColumn({ name: "custrecord_sdb_total_total", label: "Total" }),
                search.createColumn({ name: "custrecord_sdb_pago_total", label: "Pago Total" })
            ]
        }).run().each(function (result) {
            const cuotaStatus = result.getValue("custrecord_sdb_siscred_estadocuota");
            let cuota = {
                id: result.id,
                estado: result.getValue("custrecord_sdb_siscred_estadocuota"),
                fechaPago: result.getValue("custrecord_sdb_siscred_fechapago"),
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
                }
            };

            switch (Number(cuotaStatus)) {
                case STATUS.PENDIENTE:
                case STATUS.PARCIAL:
                    let mesPendiente = cuotasEnMeses.pendientes.find(mes => mes.fecha == getDateMonthAndYear(cuota.fechaPago));
                    if (mesPendiente) {
                        mesPendiente.cuotas.push(cuota);
                    } else {
                        cuotasEnMeses.pendientes.push({
                            fecha: getDateMonthAndYear(cuota.fechaPago),
                            cuotas: [cuota]
                        });
                    }
                    break;
                case STATUS.MORA:
                    let mesMora = cuotasEnMeses.mora.find(mes => mes.fecha == getDateMonthAndYear(cuota.fechaPago));
                    if (mesMora) {
                        mesMora.cuotas.push(cuota);
                    } else {
                        cuotasEnMeses.mora.push({
                            fecha: getDateMonthAndYear(cuota.fechaPago),
                            cuotas: [cuota]
                        });
                    }
                    break;
            }
            return true;
        });

        return cuotasEnMeses;
    }

    /**
     * Recupera los seguros ya pagados parcial o totalmente.
     * @param {string} customerId - ID del cliente.
     * @returns {Array} Lista de seguros con monto restante.
     */
    function findSeguroPartialOrPaided(customerId) {
        let seguros = [];
        search.create({
            type: "customrecord_sdb_pago_seguro",
            filters: [["custrecord_sdb_cliente_cuota_paga", "anyof", customerId]],
            columns: [
                search.createColumn({ name: "custrecord_sdb_pago_cliente_date", label: "Fecha Pago" }),
                search.createColumn({ name: "custrecord_sdb_paid_unemployinsurance", label: "Seguro Pagado" }),
                search.createColumn({
                    name: "custentity_sdb_seg_censatia",
                    join: "CUSTRECORD_SDB_CLIENTE_CUOTA_PAGA",
                    label: "Seguro Cesantia"
                })
            ]
        }).run().each(function (result) {
            const montoPagado = Number(result.getValue("custrecord_sdb_paid_unemployinsurance"));
            const seguroMonto = result.getValue({ name: "custentity_sdb_seg_censatia", join: "CUSTRECORD_SDB_CLIENTE_CUOTA_PAGA" }) == true ? 15 : 10;
            seguros.push({
                date: result.getValue("custrecord_sdb_pago_cliente_date"),
                montoPagado: montoPagado,
                restante: Math.max(0, seguroMonto - montoPagado)
            });
            return true;
        });
        return seguros;
    }

    /**
     * Formatea una fecha para obtener mes/año.
     * @param {string} date - Fecha en formato string.
     * @returns {string} Mes y año de la fecha.
     */
    function getDateMonthAndYear(date) {
        let formattedDate = format.parse({
            type: format.Type.DATE,
            value: date
        });
        return (formattedDate.getMonth() + 1) + "/" + formattedDate.getFullYear();
    }

    return {
        post: post,
    };
});
