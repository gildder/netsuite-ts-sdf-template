/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @NModuleScope SameAccount
 */
define(["N/log", "N/record", "N/search", "N/runtime"], function (
  log,
  record,
  search,
  runtime
) {
  const post = function (requestBody) {
    let customer = { name: "", creditlimit: 0 };
    const ESTADO_MORA = "4";
    try {
      const cardID = requestBody.cardID; // Retrieve the value of the "cardID" parameter
      const internalID = requestBody.internalID;
      log.debug("cardID", cardID);
      log.debug("internalID", internalID);
      var card_status = runtime
        .getCurrentScript()
        .getParameter("custscript_sdb_pos_mc_card_status");
      log.debug("card_status", card_status);
      search
        .create({
          type: "customer",
          filters: [
            ["custentity_sdb_siscred_cli_numtarj", "is", cardID],
            "AND",
            ["internalid", "anyof", internalID],
            "AND",
            ["custentity_sdb_siscred_estadotarj", "is", card_status],
          ],
          columns: [
            search.createColumn({
              name: "entityid",
              sort: search.Sort.ASC,
              label: "ID",
            }),
            search.createColumn({ name: "altname", label: "Name" }),
            search.createColumn({ name: "creditlimit", label: "Credit Limit" }),
            search.createColumn({ name: "balance", label: "BALANCE" }),
            search.createColumn({
              name: "custentity_sdb_siscred_tipocli",
              label: "Tipo de cliente",
            }),
            search.createColumn({
              name: "custentity_sdb_siscred_cli_fechapago",
              label: "Fecha de pago",
            }),
            search.createColumn({
              name: "custentity_sdb_seg_pagado",
              label: "Seguro pago",
            }),
            search.createColumn({
              name: "custentity_sdb_seg_censatia",
              label: "Seguro de Cesantía",
            }),
            search.createColumn({
              name: "custentity_sdb_contrato_is_firmado_mc",
              label: "Contrato Firmado",
            }),
            search.createColumn({
              name: "custentity_sdb_seguro_is_firmado_mc",
              label: "Seguro Firmado",
            }),
          ],
        })
        .run()
        .each((result) => {
          customer.id = result.id;
          customer.name = result.getValue("altname");
          var total =
            result.getValue("creditlimit") - result.getValue("balance");
          total = total > 0 ? total : 0;
          customer.creditlimit = total;
          customer.cesantia = result.getValue("custentity_sdb_seg_censatia");
          customer.seguropago = result.getValue("custentity_sdb_seg_pagado");
          customer.customerType = result.getValue(
            "custentity_sdb_siscred_tipocli"
          );
          customer.payday = result.getText(
            "custentity_sdb_siscred_cli_fechapago"
          );
          customer.contratoFirmado = result.getValue(
            "custentity_sdb_contrato_is_firmado_mc"
          );
          customer.seguroFirmado = result.getValue(
            "custentity_sdb_seguro_is_firmado_mc"
          );
        });
      log.debug("customer", customer);

      var cuotaMoraSearchResult = search.create({
        type: "customrecord_sdb_siscred_cuota",
        filters:
            [
              ["custrecord_sdb_cliente","anyof",customer.id],
              "AND",
              ["custrecord_sdb_siscred_estadocuota","anyof", ESTADO_MORA]
            ],
      });

      var searchResultCount = cuotaMoraSearchResult.runPaged().count;

      if (searchResultCount > 0) {
        return { name: "", creditlimit: 0 };
      }
      
      return customer;
    } catch (error) {
      log.debug("error", error);
      return customer;
    }
  };

  return {
    post: post,
  };
});
