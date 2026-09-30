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
  }

  const post = function (requestBody) {
    let total = 0;
    try {
      const customerId = requestBody.internalID;

      let customerFields = search.lookupFields({
        type: search.Type.CUSTOMER,
        id: customerId,
        columns: ['custentity_sdb_seg_censatia']
      });

      log.debug("customerFields", customerFields);
      let seguroMonto = customerFields["custentity_sdb_seg_censatia"] == true ? 15 : 10;
      let cuotasEnMeses = getCuotas(customerId);
      let cuotasPagas = getCuotasPagas(customerId);
      log.debug("cuotasPagas", cuotasPagas);
      let seguros = findSeguroPartialOrPaided(customerId);

      log.debug("cuotasEnMeses", cuotasEnMeses);
      log.debug("seguros", seguros);

      if (cuotasEnMeses.mora?.length === 0 && cuotasEnMeses.pendientes?.length === 0) {
        return {
          total: 0,
          actual: 0,
          deuda: 0,
          cuotas: []
        }
      }


      let currentDate = format.format({
        type: format.Type.DATE,
        value: new Date()
      });

      let currentDateFormated = getDateMonthAndYear(currentDate);
      let montoDeuda = 0;

      let mesAproximadoPagoTotalMonto = 0;
      let mesAproximadoMontoActual = 0;
      let mesActual = false;
      let mesAproximado = null;

      /**         */
      log.debug("cuotasEnMeses.mora.length", cuotasEnMeses.mora?.length);
      cuotasEnMeses.mora.forEach(mes => {
        if(currentDateFormated == mes?.fecha) {
          mesAproximado = mes;
          return;
        }
        let seguro = seguros.find(seguro => getDateMonthAndYear(seguro.date) == mes.fecha);
        log.debug("montoDeuda, seguro", montoDeuda + " - " + JSON.stringify(seguro));
        montoDeuda += seguro ? seguro.restante : seguroMonto;
        log.debug("montoDeuda after", montoDeuda);
        mes.cuotas.forEach(cuota => {
          log.debug("cuota", cuota);
          montoDeuda += cuota.captial.monto - cuota.captial.pago;
          montoDeuda += cuota.cargoAdministrativo.monto - cuota.cargoAdministrativo.pago;
          montoDeuda += cuota.mora.monto - cuota.mora.pago;
          montoDeuda += cuota.cargoCobranza.monto - cuota.cargoCobranza.pago;
        });
      });
      log.debug("montoDeuda", montoDeuda);

      /**         */
      if(mesAproximado == null) {
        mesAproximado = cuotasEnMeses.pendientes.splice(0, 1)[0];
      }

      log.debug("mesAproximado", mesAproximado);

      if (mesAproximado) {
        mesActual = currentDateFormated == mesAproximado?.fecha;

        log.debug("cuotasPagas.pagos?.length > 0", cuotasPagas.pagos?.length > 0);

        let seguroPago = seguros.find(seguro => seguro.restante >= 0 && seguro.restante <= 0.02);
        let seguroMes = seguros.find(seguro => getDateMonthAndYear(seguro.date) == mesAproximado?.fecha);
        let montoSeguro = seguroMes ? seguroMes.restante : seguroMonto;

        if(mesActual) {
          mesAproximadoPagoTotalMonto = montoSeguro;
          mesAproximadoMontoActual = montoSeguro;
          log.debug("montoSeguro mesactual", montoSeguro)
        } else if(!mesActual && seguroPago == null) {
          mesAproximadoPagoTotalMonto = montoSeguro;
          mesAproximadoMontoActual = montoSeguro;
        }

        mesAproximado?.cuotas.forEach(cuota => {
          let cuotaMonto = 0;
          cuotaMonto += cuota.captial.monto - cuota.captial.pago;
          cuotaMonto += cuota.cargoCobranza.monto - cuota.cargoCobranza.pago;
          cuotaMonto += cuota.mora.monto - cuota.mora.pago;
          mesAproximadoMontoActual += cuotaMonto + (cuota.cargoAdministrativo.monto - cuota.cargoAdministrativo.pago);
          if(mesActual)
            mesAproximadoPagoTotalMonto += cuotaMonto + (cuota.cargoAdministrativo.monto - cuota.cargoAdministrativo.pago);
          else
            mesAproximadoPagoTotalMonto += cuotaMonto;
        });
      }



      let montoAdeudado = montoDeuda + mesAproximadoPagoTotalMonto;
      for (let i = 0; i < cuotasEnMeses.pendientes.length; i++) {
        let mes = cuotasEnMeses.pendientes[i];
        for (let j = 0; j < mes.cuotas.length; j++) {
          let cuota = mes.cuotas[j];
          montoAdeudado += cuota.captial.monto - cuota.captial.pago;
        }
      }
      log.debug("montoAdeudado after", montoAdeudado);

      return {
        total: montoAdeudado,
        actual: mesAproximadoMontoActual,
        deuda: montoDeuda > 0 ? montoDeuda + mesAproximadoMontoActual : 0,
        cuotas: mesActual ? mesAproximado?.cuotas?.map((cuota, i) => {
          let seguro = seguros.find(seguro => getDateMonthAndYear(seguro.date) == mesAproximado.fecha);
          let montoSeguro = seguro ? seguro.restante : Number(seguroMonto);
          let total = Number(cuota.total.monto);
          let totalpago = Number(cuota.total.pago);
          if(i == 0) {
            total += Number(seguroMonto);
            if(seguro)
              totalpago += Number(seguro.montoPagado);
          }
          log.debug("cuota.cargoAdministrativo.monto", cuota.cargoAdministrativo.monto);
          log.debug("cuota.cargoAdministrativo.pago", cuota.cargoAdministrativo.pago);
          log.debug("cuota.cargoAdministrativo.monto - cuota.cargoAdministrativo.pago", cuota.cargoAdministrativo.monto - cuota.cargoAdministrativo.pago);
          return {
            internalid: cuota.id,
            factura: cuota.factura,
            capital: cuota.captial.monto - cuota.captial.pago,
            adm: cuota.cargoAdministrativo.monto - cuota.cargoAdministrativo.pago,
            seguro: i == 0 ? montoSeguro : 0,
            mora: 0,
            cobranza: cuota.cargoCobranza.monto - cuota.cargoCobranza.pago,
            total: total - totalpago
          }
        }) : []
      };
    } catch (error) {
      log.debug("error", error);
      return null;
    }
  };
  function getCuotas(customerId) {
    let cuotasEnMeses = {
      mora: [],
      pendientes: [] //por pagar o parciales
    }
    log.debug("getCuotas - customerId", customerId);
    search.create({
      type: "customrecord_sdb_siscred_cuota",
      filters:
          [
            ["custrecord_sdb_cliente","anyof",customerId],
            "AND",
            ["custrecord_sdb_siscred_estadocuota","noneof",STATUS.PAGO]
          ],
      columns:
          [
            search.createColumn({name: "custrecord_sdb_cliente", label: "Cliente"}),
            search.createColumn({name: "custrecord_sdb_siscred_estadocuota", label: "Estado Cuota"}),
            search.createColumn({name: "custrecord_sdb_siscred_fechapago", label: "Fecha a Pagar"}),
            search.createColumn({name: "custrecord_sdb_factura", label: "Factura"}),
            search.createColumn({name: "custrecord_sdb_pago_capital", label: "Capital"}),
            search.createColumn({name: "custrecord_sdb_total_capital", label: "Capital "}),
            search.createColumn({name: "custrecord_sdb_pago_cargoadministrativo", label: "Cargo Administrativo"}),
            search.createColumn({name: "custrecord_sdb_total_cargoadministrativo", label: "Cargo Administrativo "}),
            search.createColumn({name: "custrecord_sdb_pago_cargomora", label: "Cargo Mora"}),
            search.createColumn({name: "custrecord_sdb_total_cargomora", label: "Cargo Mora "}),
            search.createColumn({name: "custrecord_sdb_total_cobranza", label: "Cargo Cobranza"}),
            search.createColumn({name: "custrecord_sdb_pago_cobranza", label: "Cargo Cobranza "}),
            search.createColumn({name: "custrecord_sdb_pago_total", label: "Total"}),
            search.createColumn({name: "custrecord_sdb_total_total", label: "Total "})
          ]
    }).run().each(function(result){
      const cuotaStatus = result.getValue("custrecord_sdb_siscred_estadocuota");
      let cuota = {
        id: result.id,
        customer: result.getValue("custrecord_sdb_cliente"),
        estado: result.getValue("custrecord_sdb_siscred_estadocuota"),
        fechaPago: result.getValue("custrecord_sdb_siscred_fechapago"),
        factura: result.getValue("custrecord_sdb_factura"),
        captial: {
          monto: result.getValue("custrecord_sdb_total_capital"),
          pago: result.getValue("custrecord_sdb_pago_capital")
        },
        cargoAdministrativo: {
          monto: result.getValue("custrecord_sdb_total_cargoadministrativo"),
          pago: result.getValue("custrecord_sdb_pago_cargoadministrativo")
        },
        mora: {
          monto: result.getValue("custrecord_sdb_total_cargomora"),
          pago: result.getValue("custrecord_sdb_pago_cargomora")
        },
        cargoCobranza: {
          monto: result.getValue("custrecord_sdb_total_cobranza"),
          pago: result.getValue("custrecord_sdb_pago_cobranza")
        },
        total: {
          monto: result.getValue("custrecord_sdb_total_total"),
          pago: result.getValue("custrecord_sdb_pago_total")
        },
      }
      switch (Number(cuotaStatus)) {
        case STATUS.PENDIENTE:
        case STATUS.PARCIAL:
          let mesFounded = cuotasEnMeses.pendientes.find(mes => mes.fecha == getDateMonthAndYear(cuota.fechaPago));
          if(mesFounded) {
            mesFounded.cuotas.push(cuota)
          }else {
            cuotasEnMeses.pendientes.push({
              fecha: getDateMonthAndYear(cuota.fechaPago),
              cuotas: [ cuota ],
            });
          }
          break;
        case STATUS.MORA:
          let moraMesFounded = cuotasEnMeses.mora.find(mes => mes.fecha == getDateMonthAndYear(cuota.fechaPago));
          if(moraMesFounded) {
            moraMesFounded.cuotas.push(cuota)
          } else {
            cuotasEnMeses.mora.push({
              fecha: getDateMonthAndYear(cuota.fechaPago),
              cuotas: [ cuota ],
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
    cuotasEnMeses.pendientes = cuotasEnMeses.pendientes.sort((a, b) => sortFormatDate("1/" + a.fecha,"1/" + b.fecha));
    return cuotasEnMeses;
  }
  function getCuotasPagas(customerId) {
    let cuotasEnMeses = {
      pagos: []
    }
    log.debug("getCuotas - customerId", customerId);
    search.create({
      type: "customrecord_sdb_siscred_cuota",
      filters:
          [
            ["custrecord_sdb_cliente","anyof",customerId],
            "AND",
            ["custrecord_sdb_siscred_estadocuota","anyof",STATUS.PAGO],
            "AND",
            ["custrecord_sdb_siscred_fechapago","onorafter","startofthismonth"]
          ],
      columns:
          [
            search.createColumn({name: "custrecord_sdb_cliente", label: "Cliente"}),
            search.createColumn({name: "custrecord_sdb_siscred_estadocuota", label: "Estado Cuota"}),
            search.createColumn({name: "custrecord_sdb_siscred_fechapago", label: "Fecha a Pagar"}),
            search.createColumn({name: "custrecord_sdb_factura", label: "Factura"}),
            search.createColumn({name: "custrecord_sdb_pago_capital", label: "Capital"}),
            search.createColumn({name: "custrecord_sdb_total_capital", label: "Capital "}),
            search.createColumn({name: "custrecord_sdb_pago_cargoadministrativo", label: "Cargo Administrativo"}),
            search.createColumn({name: "custrecord_sdb_total_cargoadministrativo", label: "Cargo Administrativo "}),
            search.createColumn({name: "custrecord_sdb_pago_cargomora", label: "Cargo Mora"}),
            search.createColumn({name: "custrecord_sdb_total_cargomora", label: "Cargo Mora "}),
            search.createColumn({name: "custrecord_sdb_total_cobranza", label: "Cargo Cobranza"}),
            search.createColumn({name: "custrecord_sdb_pago_cobranza", label: "Cargo Cobranza "}),
            search.createColumn({name: "custrecord_sdb_pago_total", label: "Total"}),
            search.createColumn({name: "custrecord_sdb_total_total", label: "Total "})
          ]
    }).run().each(function(result){
      const cuotaStatus = result.getValue("custrecord_sdb_siscred_estadocuota");
      let cuota = {
        id: result.id,
        customer: result.getValue("custrecord_sdb_cliente"),
        estado: result.getValue("custrecord_sdb_siscred_estadocuota"),
        fechaPago: result.getValue("custrecord_sdb_siscred_fechapago"),
        factura: result.getValue("custrecord_sdb_factura"),
        captial: {
          monto: result.getValue("custrecord_sdb_total_capital"),
          pago: result.getValue("custrecord_sdb_pago_capital")
        },
        cargoAdministrativo: {
          monto: result.getValue("custrecord_sdb_total_cargoadministrativo"),
          pago: result.getValue("custrecord_sdb_pago_cargoadministrativo")
        },
        mora: {
          monto: result.getValue("custrecord_sdb_total_cargomora"),
          pago: result.getValue("custrecord_sdb_pago_cargomora")
        },
        cargoCobranza: {
          monto: result.getValue("custrecord_sdb_total_cobranza"),
          pago: result.getValue("custrecord_sdb_pago_cobranza")
        },
        total: {
          monto: result.getValue("custrecord_sdb_total_total"),
          pago: result.getValue("custrecord_sdb_pago_total")
        },
      }
      switch (Number(cuotaStatus)) {
        case STATUS.PAGO:
          let mesFounded = cuotasEnMeses.pagos.find(mes => mes.fecha == getDateMonthAndYear(cuota.fechaPago));
          if(mesFounded) {
            mesFounded.cuotas.push(cuota)
          }else {
            cuotasEnMeses.pagos.push({
              fecha: getDateMonthAndYear(cuota.fechaPago),
              cuotas: [ cuota ],
            });
          }
          break;
      }
      return true;
    });
    cuotasEnMeses.pagos.forEach(mes => {
      mes.cuotas?.sort((a, b) => sortFormatDate(a.fechaPago, b.fechaPago));
    });
    cuotasEnMeses.pagos = cuotasEnMeses.pagos.sort((a, b) => sortFormatDate("1/" + a.fecha,"1/" + b.fecha));
    return cuotasEnMeses;
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
      let seguroMonto = sensatia ? 15 : 10;
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
  return {
    post: post,
  };
});
