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
      const customerId = requestBody.customerId;
      const orignalMonto = Number(requestBody.monto);
      let monto = orignalMonto;
      const totalToPay = requestBody.totalToPay;

      if(monto <= 0) {
        return {};
      }

      let customerFields = search.lookupFields({
        type: search.Type.CUSTOMER,
        id: customerId,
        columns: ['custentity_sdb_seg_censatia']
      });

      log.debug("customerFields", customerFields);
      let seguroMonto = customerFields["custentity_sdb_seg_censatia"] == true ? 15 : 10;
      let cuotasEnMeses = getCuotas(customerId);
      let seguros = findSeguroPartialOrPaided(customerId);

      log.debug("cuotasEnMeses", cuotasEnMeses);
      log.debug("seguros", seguros);

      let montosMora = getMontosMora(cuotasEnMeses.mora, seguros, seguroMonto, monto);
      log.debug("montosMora", montosMora);
      monto -= montosMora.montoPagoCapitales + montosMora.montoPagoCargoAdm +
          montosMora.montoPagoCargoCobr + montosMora.montoPagoSeguro + montosMora.montoCargoMora;
      log.debug("montosMora after - monto", monto);

      log.debug("isTotal", totalToPay - orignalMonto <= 0.02);

      let montosMesAproximado =  getMontosMesAproximado(cuotasEnMeses.pendientes, seguros, seguroMonto, monto, totalToPay - orignalMonto <= 0.02);
      log.debug("montosMesAproximado", montosMesAproximado);
      log.debug("getMontosMesAproximado before - monto", monto);
      monto -= montosMesAproximado.montoPagoCapitales + montosMesAproximado.montoPagoCargoAdm +
          montosMesAproximado.montoPagoCargoCobr + montosMesAproximado.montoPagoSeguro;
      log.debug("getMontosMesAproximado after - monto", monto);

      let montosPendientes = getMontosPendientes(cuotasEnMeses.pendientes, seguros, seguroMonto, monto, totalToPay - orignalMonto <= 0.02);
      log.debug("montosPendientes", montosPendientes);

      log.debug("return", {
        montoPagoCapitales: (montosMora.montoPagoCapitales + montosMesAproximado.montoPagoCapitales + montosPendientes.montoPagoCapitales),
        montoPagoCargoAdm: (montosMora.montoPagoCargoAdm + montosMesAproximado.montoPagoCargoAdm + montosPendientes.montoPagoCargoAdm),
        montoPagoCargoCobr: (montosMora.montoPagoCargoCobr + montosMesAproximado.montoPagoCargoCobr + montosPendientes.montoPagoCargoCobr),
        montoPagoSeguro: (montosMora.montoPagoSeguro + montosMesAproximado.montoPagoSeguro + montosPendientes.montoPagoSeguro),
        montoMora: montosMora.montoCargoMora
      })
      return {
        montoPagoCapitales: (montosMora.montoPagoCapitales + montosMesAproximado.montoPagoCapitales + montosPendientes.montoPagoCapitales)?.toFixed(8),
        montoPagoCargoAdm: (montosMora.montoPagoCargoAdm + montosMesAproximado.montoPagoCargoAdm + montosPendientes.montoPagoCargoAdm)?.toFixed(8),
        montoPagoCargoCobr: (montosMora.montoPagoCargoCobr + montosMesAproximado.montoPagoCargoCobr + montosPendientes.montoPagoCargoCobr)?.toFixed(8),
        montoPagoSeguro: (montosMora.montoPagoSeguro + montosMesAproximado.montoPagoSeguro + montosPendientes.montoPagoSeguro)?.toFixed(8),
        montoMora: montosMora.montoCargoMora?.toFixed(8)
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
      log.debug("mora mes.cuotas", mes.cuotas);
      mes.cuotas?.sort((a, b) => sortFormatDate(a.fechaPago, b.fechaPago))
    });
    cuotasEnMeses.pendientes.forEach(mes => {
      log.debug("mora mes.cuotas", mes.cuotas);
      mes.cuotas?.sort((a, b) => sortFormatDate(a.fechaPago, b.fechaPago))
    });
    cuotasEnMeses.mora = cuotasEnMeses.mora.sort((a, b) => sortFormatDate("1/" + a.fecha, "1/" + b.fecha));
    cuotasEnMeses.pendientes = cuotasEnMeses.pendientes.sort((a, b) => sortFormatDate("1/" + a.fecha,"1/" + b.fecha));
    return cuotasEnMeses;
  }
  function getMontosMora(mesCuotas, seguros, seguroMonto, disponible) {

    let montos = {
      montoPagoCapitales: 0,
      montoPagoCargoAdm: 0,
      montoPagoCargoCobr: 0,
      montoPagoSeguro: 0,
      montoCargoMora: 0
    }

    for (let i = 0; i < mesCuotas.length; i++) {
      let mes = mesCuotas[i];
      /** CAPITAL */
      mes.cuotas.forEach(cuota => {
        const restante = cuota.captial.monto - cuota.captial.pago;
        if (disponible > restante) {
          montos.montoPagoCapitales += restante;
          disponible -= restante
        } else {
          montos.montoPagoCapitales += disponible;
          disponible = 0;
        }
      });
    }

    if(disponible <= 0) return montos;

    /** SEGUROS */
    for (let i = 0; i < mesCuotas.length; i++) {
      let mes = mesCuotas[i];
      let seguro = seguros.find(seguro => getDateMonthAndYear(seguro.date) == mes.fecha);
      let montoSeguro = seguro ? seguro.restante : seguroMonto;
      log.debug("SEGURO DISPONBILE", disponible);
      /** SEGURO */
      if (disponible > montoSeguro) {
        montos.montoPagoSeguro += montoSeguro;
        disponible -= montoSeguro;
      } else {
        montos.montoPagoSeguro += disponible;
        disponible = 0;
      }
    }

    if(disponible <= 0) return montos;

    /** CARGO COBRANZA */
    for (let i = 0; i < mesCuotas.length; i++) {
      let mes = mesCuotas[i];
      mes.cuotas.forEach(cuota => {
        const restante = cuota.cargoCobranza.monto - cuota.cargoCobranza.pago;
        if (disponible > restante) {
          montos.montoPagoCargoCobr += restante;
          disponible -= restante
        } else {
          montos.montoPagoCargoCobr += disponible;
          disponible = 0;
        }
      });
    }

    if(disponible <= 0) return montos;

    /** CARGO ADMINISTRATIVO */
    for (let i = 0; i < mesCuotas.length; i++) {
      let mes = mesCuotas[i];
      mes.cuotas.forEach(cuota => {
        const restante = cuota.cargoAdministrativo.monto - cuota.cargoAdministrativo.pago;
        if (disponible > restante) {
          montos.montoPagoCargoAdm += restante;
          disponible -= restante
        } else {
          montos.montoPagoCargoAdm += disponible;
          disponible = 0;
        }
      });
    }

    if(disponible <= 0) return montos;

    /** MORA */
    for (let i = 0; i < mesCuotas.length; i++) {
      let mes = mesCuotas[i];
      mes.cuotas.forEach(cuota => {
        const restante = cuota.mora.monto - cuota.mora.pago;
        if(disponible > restante) {
          montos.montoCargoMora += restante;
          disponible -= restante
        } else {
          montos.montoCargoMora += disponible;
          disponible = 0;
        }
      });
    }

    return montos;
  }
  function getMontosMesAproximado(mesCuotas, seguros, seguroMonto, disponible, isTotal) {
    log.debug("getMontosMesAproximado - mesCuotas", mesCuotas);
    let montos = {
      montoPagoCapitales: 0,
      montoPagoCargoAdm: 0,
      montoPagoCargoCobr: 0,
      montoPagoSeguro: 0
    }


    let currentDate = format.format({
      type: format.Type.DATE,
      value: new Date()
    });

    let mes = mesCuotas.splice(0, 1)[0];

    let currentDateFormated = getDateMonthAndYear(currentDate);
    let mesActual = currentDateFormated == mes?.fecha;
    let seguroPago = seguros.find(seguro => seguro.restante >= 0 && seguro.restante <= 0.02);
    let seguroMes = seguros.find(seguro => getDateMonthAndYear(seguro.date) == mes?.fecha);
    let montoSeguro = seguroMes ? seguroMes.restante : seguroMonto;


    log.debug("getMontosMesAproximado - mes", mes);
    if(mes) {
      log.debug("CAPITAL DISPONBILE", disponible);
      /** CAPITAL */
      mes.cuotas.forEach(cuota => {
        const restante = cuota.captial.monto - cuota.captial.pago;
        if(disponible > restante) {
          montos.montoPagoCapitales += restante;
          disponible -= restante
        } else {
          montos.montoPagoCapitales += disponible;
          disponible = 0;
        }
      });

      if(disponible <= 0)
        return montos;

      log.debug("SEGURO DISPONBILE", disponible);
      /** SEGURO */
      if(mesActual || (!mesActual && seguroPago == null)) {
        if(disponible > montoSeguro) {
          montos.montoPagoSeguro += montoSeguro;
          disponible -= montoSeguro;
        } else {
          montos.montoPagoSeguro += disponible;
          disponible = 0;
        }
      }

      if(disponible <= 0)
        return montos;

      log.debug("CARGO COBRANZA DISPONBILE", disponible);
      /** CARGO COBRANZA */
      mes.cuotas.forEach(cuota => {
        const restante = cuota.cargoCobranza.monto - cuota.cargoCobranza.pago;
        if(disponible > restante) {
          montos.montoPagoCargoCobr += restante;
          disponible -= restante
        } else {
          montos.montoPagoCargoCobr += disponible;
          disponible = 0;
        }
      });

      if(disponible <= 0)
        return montos;

      log.debug("CARGO ADMINISTRATIVO DISPONBILE", disponible);
      /** CARGO ADMINISTRATIVO */
      if (mesActual || (!mesActual && !isTotal)) {
        mes.cuotas.forEach(cuota => {
          const restante = cuota.cargoAdministrativo.monto - cuota.cargoAdministrativo.pago;
          if(disponible > restante) {
            montos.montoPagoCargoAdm += restante;
            disponible -= restante
          } else {
            montos.montoPagoCargoAdm += disponible;
            disponible = 0;
          }
        });
      }

      if(disponible <= 0)
        return montos;

      log.debug("MORA", disponible);
      /** MORA */
      mes.cuotas.forEach(cuota => {
        const restante = cuota.mora.monto - cuota.mora.pago;
        if(disponible > restante) {
          montos.mora += restante;
          disponible -= restante
        } else {
          montos.mora += disponible;
          disponible = 0;
        }
      });
    }
    return montos;
  }
  function getMontosPendientes(mesCuotas, seguros, seguroMonto, disponible, isTotal) {
    log.debug("getMontosPendientes - isTotal", isTotal);
    let montos = {
      montoPagoCapitales: 0,
      montoPagoCargoAdm: 0,
      montoPagoCargoCobr: 0,
      montoPagoSeguro: 0
    }

    for (let i = 0; i < mesCuotas.length; i++) {
      let mes = mesCuotas[i];

      log.debug("CAPITAL DISPONBILE", disponible);
      /** CAPITAL */
      mes.cuotas.forEach(cuota => {
        const restante = cuota.captial.monto - cuota.captial.pago;
        if(disponible > restante) {
          montos.montoPagoCapitales += restante;
          disponible -= restante
        } else {
          montos.montoPagoCapitales += disponible;
          disponible = 0;
        }
      });

      if(disponible <= 0) break;

      //Si no es la primera y esta pagando el total de la orden, continuar para que continue pagando solo capitales
      if(isTotal) continue;

      log.debug("CARGO COBRANZA DISPONBILE", disponible);
      /** CARGO COBRANZA */
      mes.cuotas.forEach(cuota => {
        const restante = cuota.cargoCobranza.monto - cuota.cargoCobranza.pago;
        if(disponible > restante) {
          montos.montoPagoCargoCobr += restante;
          disponible -= restante
        } else {
          montos.montoPagoCargoCobr += disponible;
          disponible = 0;
        }
      });

      if(disponible <= 0) break;
      log.debug("CARGO ADMINISTRATIVO DISPONBILE", disponible);
      /** CARGO ADMINISTRATIVO */
      mes.cuotas.forEach(cuota => {
        const restante = cuota.cargoAdministrativo.monto - cuota.cargoAdministrativo.pago;
        if(disponible > restante) {
          montos.montoPagoCargoAdm += restante;
          disponible -= restante
        } else {
          montos.montoPagoCargoAdm += disponible;
          disponible = 0;
        }
      });

      if(disponible <= 0) break;
      log.debug("MORA", disponible);
      /** MORA */
      mes.cuotas.forEach(cuota => {
        const restante = cuota.mora.monto - cuota.mora.pago;
        if(disponible > restante) {
          montos.mora += restante;
          disponible -= restante
        } else {
          montos.mora += disponible;
          disponible = 0;
        }
      });
    }
    return montos;
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
