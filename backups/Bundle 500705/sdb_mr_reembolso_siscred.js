/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope Public
 */
define([
  "N/log",
  "N/search",
  "N/record",
  "N/runtime",
  "N/transaction",
  "N/format",
], function (log, search, record, runtime, transaction, format) {
  var ESTADO_CUOTA = { PENDIENTE: 1, PARCIAL: 3, MORA: 4 };
  function getInputData(context) {
    var idPagoSiscred = runtime
      .getCurrentScript()
      .getParameter("custscript_sdb_id_pago_siscred");
    log.debug("getInputData idPagoSiscred", idPagoSiscred);
    var customrecord_sdb_pago_cuotaSearchObj = search.create({
      type: "customrecord_sdb_pago_cuota",
      filters: [["custrecord_sdb_mc_pago_siscred", "anyof", idPagoSiscred]],
      columns: [
        "internalid",
        "custrecord_sdb_mc_trans_capital",
        "custrecord_sdb_mc_trans_cargos",
        "custrecord_sdb_mc_cuota",
        "custrecord_sdb_mc_cargo_administrativo",
        "custrecord_sdb_mc_capital",
        "custrecord_sdb_mc_cargo_mora",
        "custrecord_sdb_mc_cargo_seguro",
        "custrecord_sdb_mc_cargo_cobranza",
        "custrecord_sdb_mc_pago_siscred",
        "custrecord_sdb_mc_payment_capital",
        "custrecord_sdb_mc_total",
      ],
    });
    return customrecord_sdb_pago_cuotaSearchObj;
  }

  function map(context) {
    try {
      log.debug("context", context);
      let item_map = JSON.parse(context.value);
      log.debug("item_map", item_map);
      let map_values = item_map.values;
      log.debug("map_values", map_values);
      //Variables
      var montoCapital = map_values.custrecord_sdb_mc_capital || 0;
      var montoAdministrativo =
        map_values.custrecord_sdb_mc_cargo_administrativo || 0;
      var montoMora = map_values.custrecord_sdb_mc_cargo_mora || 0;
      var montoSeguro = map_values.custrecord_sdb_mc_cargo_seguro || 0;
      var montoCobranza = map_values.custrecord_sdb_mc_cargo_cobranza || 0;
      var montoTotal = map_values.custrecord_sdb_mc_total || 0;

      var siscredCuotaId = map_values.custrecord_sdb_mc_cuota.value;
      var trxCargosId = map_values.custrecord_sdb_mc_trans_cargos.value;
      var trxCapitalId = map_values.custrecord_sdb_mc_trans_capital.value;
      var pagoSiscredId = map_values.custrecord_sdb_mc_pago_siscred.value;
      var paymentCapital = map_values.custrecord_sdb_mc_payment_capital.value;

      log.debug("variables", {
        montoCapital,
        montoAdministrativo,
        montoMora,
        montoSeguro,
        montoCobranza,
        montoTotal,
        trxCargosId,
        trxCapitalId,
        pagoSiscredId,
        paymentCapital,
      });

      //Void payment a invoice de capital
      if (paymentCapital) {
        var voided = false;
        search
          .create({
            type: "customerpayment",
            filters: [
              ["type", "anyof", "CustPymt"],
              "AND",
              ["voided", "is", "T"],
              "AND",
              ["internalid", "anyof", paymentCapital],
            ],
            columns: ["internalid"],
          })
          .run()
          .each(function (result) {
            voided = true;
          });
        log.debug("payment-voided", paymentCapital + "-" + voided);
        if (!voided) {
          transaction.void({
            id: paymentCapital,
            type: transaction.Type.CUSTOMER_PAYMENT,
          });
        }
      }

      //Refund cashsale
      // if (trxCargosId) {
      //   var refunded = false;
      //   search
      //     .create({
      //       type: "cashrefund",
      //       filters: [
      //         ["type", "anyof", "CashRfnd"],
      //         "AND",
      //         ["createdfrom.internalid", "anyof", trxCargosId],
      //       ],
      //       columns: ["internalid"],
      //     })
      //     .run()
      //     .each(function (result) {
      //       refunded = true;
      //     });

      //   log.debug("trxCargosId-refunded", trxCargosId + "-" + refunded);
      //   if (!refunded) {
      //     let cs_to_cr = record.transform({
      //       fromType: record.Type.CASH_SALE,
      //       fromId: trxCargosId,
      //       toType: record.Type.CASH_REFUND,
      //       isDynamic: false,
      //     });
      //     var cr_id = cs_to_cr.save({ ignoreMandatoryFields: true });
      //     log.debug("cr_id", cr_id);
      //   }
      // }

      //Le resto a la siscred cuota afectada los montos del pago de cuota
      var siscredCuota = record.load({
        type: "customrecord_sdb_siscred_cuota",
        id: siscredCuotaId,
        isDynamic: true,
      });

      //Elimino el seguro pagado
      var cuotaDate = siscredCuota.getValue("custrecord_sdb_siscred_fechapago");
      var cuotaCustomer = siscredCuota.getValue("custrecord_sdb_cliente");
      log.debug("cuotaCustomer", cuotaCustomer);
      log.debug("cuotaDate", cuotaDate);
      var date = format.format({
        type: format.Type.DATE,
        value: cuotaDate,
      });
      log.debug("format date", date);
      if (Number(montoSeguro) > 0) {
        search
          .create({
            type: "customrecord_sdb_pago_seguro",
            filters: [
              ["custrecord_sdb_cliente_cuota_paga", "anyof", cuotaCustomer],
              "AND",
              ["custrecord_sdb_pago_cliente_date", "on", date],
            ],
          })
          .run()
          .each(function (result) {
            var deletedRecord = record.delete({
              type: "customrecord_sdb_pago_seguro",
              id: result.id,
            });
            log.debug("seguro eliminado", deletedRecord);
            return true;
          });
      }

      var nuevoPagoCapital =
        Number(siscredCuota.getValue("custrecord_sdb_pago_capital")) -
          Number(montoCapital) >
        0.002
          ? Number(siscredCuota.getValue("custrecord_sdb_pago_capital")) -
            Number(montoCapital)
          : 0;
      siscredCuota.setValue("custrecord_sdb_pago_capital", nuevoPagoCapital);

      var nuevoPagoAdmin =
        Number(
          siscredCuota.getValue("custrecord_sdb_pago_cargoadministrativo")
        ) -
          Number(montoAdministrativo) >
        0.002
          ? Number(
              siscredCuota.getValue("custrecord_sdb_pago_cargoadministrativo")
            ) - Number(montoAdministrativo)
          : 0;
      siscredCuota.setValue(
        "custrecord_sdb_pago_cargoadministrativo",
        nuevoPagoAdmin
      );

      var nuevoPagoMora =
        Number(siscredCuota.getValue("custrecord_sdb_pago_cargomora")) -
          Number(montoMora) >
        0.002
          ? Number(siscredCuota.getValue("custrecord_sdb_pago_cargomora")) -
            Number(montoMora)
          : 0;
      siscredCuota.setValue("custrecord_sdb_pago_cargomora", nuevoPagoMora);

      var nuevoPagoSeguro =
        Number(siscredCuota.getValue("custrecord_sdb_pagado_cargoseguro")) -
          Number(montoSeguro) >
        0.002
          ? Number(siscredCuota.getValue("custrecord_sdb_pagado_cargoseguro")) -
            Number(montoSeguro)
          : 0;
      siscredCuota.setValue(
        "custrecord_sdb_pagado_cargoseguro",
        nuevoPagoSeguro
      );

      var nuevoPagoCobranza =
        Number(siscredCuota.getValue("custrecord_sdb_pago_cobranza")) -
          Number(montoCobranza) >
        0.002
          ? Number(siscredCuota.getValue("custrecord_sdb_pago_cobranza")) -
            Number(montoCobranza)
          : 0;
      siscredCuota.setValue("custrecord_sdb_pago_cobranza", nuevoPagoCobranza);

      var nuevoPagoTotal =
        Number(siscredCuota.getValue("custrecord_sdb_pago_total")) -
          Number(montoTotal) >
        0.002
          ? Number(siscredCuota.getValue("custrecord_sdb_pago_total")) -
            Number(montoTotal)
          : 0;
      siscredCuota.setValue("custrecord_sdb_pago_total", nuevoPagoTotal);

      var totalPago =
        nuevoPagoCapital + nuevoPagoAdmin + nuevoPagoCobranza + nuevoPagoSeguro;

      var fechaPago = siscredCuota.getValue("custrecord_sdb_siscred_fechapago");
      log.debug("typeof fechaPago", typeof fechaPago);

      var fechaActual = new Date();

      var diferencia = fechaActual - fechaPago;
      var diasDiferencia = Math.floor(diferencia / (1000 * 60 * 60 * 24));
      log.debug("datos fecha", {
        fechaPago,
        fechaActual,
        diferencia,
        diasDiferencia,
      });
      var estadoCuota =
        Number(montoMora) != 0 || diasDiferencia > 3
          ? ESTADO_CUOTA.MORA
          : totalPago == 0
          ? ESTADO_CUOTA.PENDIENTE
          : ESTADO_CUOTA.PARCIAL;
      siscredCuota.setValue("custrecord_sdb_siscred_estadocuota", estadoCuota);
      siscredCuota.setValue("custrecord_sdb_pago_total", 0);
      siscredCuota.save({ ignoreMandatoryFields: true });

      record.submitFields({
        type: "customrecord_sdb_mc_pago_siscred",
        id: pagoSiscredId,
        values: {
          custrecord_sdb_mc_pago_siscred_reembolso: true,
        },
      });
    } catch (error) {
      log.error("error map", error);
    }
  }

  function reduce(context) {}

  return {
    getInputData: getInputData,
    map: map,
    reduce: reduce,
  };
});
