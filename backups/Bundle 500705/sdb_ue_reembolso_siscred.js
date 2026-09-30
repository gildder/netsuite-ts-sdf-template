/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(["N/log", "N/search", "N/record"], function (log, search, record) {
  function afterSubmit(context) {
    if (context.type !== context.UserEventType.CREATE) return;
    if (!context.newRecord.getValue("custbody_mc_paid_with_pos") && !context.newRecord.getValue("custbody_paid_with_pos")) return;
    try {
      log.debug("context", context);
      var createdFromSearch = search.lookupFields({
        type: "creditmemo",
        id: context.newRecord.id,
        columns: "createdfrom",
      });

      var invoiceSearch = search.lookupFields({
        type: "invoice",
        id: createdFromSearch.createdfrom[0].value,
        columns: "internalid",
      });
      log.debug("invoiceSearch", invoiceSearch);

      var invoiceId = createdFromSearch.createdfrom[0].value;
      if (!invoiceSearch.internalid) {
        var returnAuthSearch = search.lookupFields({
          type: "returnauthorization",
          id: createdFromSearch.createdfrom[0].value,
          columns: "createdfrom",
        });
        log.debug("returnAuthSearch", returnAuthSearch);
        invoiceId = returnAuthSearch.createdfrom[0].value;
      }

      log.debug("invoiceId", invoiceId);
      var cuotas = [];
      search
        .create({
          type: "customrecord_sdb_siscred_cuota",
          filters: [
            [
              "custrecord_sdb_factura.internalid",
              "anyof",
              invoiceId,
            ],
            "AND",
            ["custrecord_sdb_factura.mainline", "is", "T"],
          ],
          columns: ["internalid"],
        })
        .run()
        .each(function (result) {
          cuotas.push(result.id);
          return true;
        });
      cuotas.forEach((cuota) => {
        record.submitFields({
          type: "customrecord_sdb_siscred_cuota",
          id: cuota,
          values: {
            custrecord_sdb_siscred_estadocuota: 5,
          },
        });
      });
      log.debug("cuotas", cuotas);
    } catch (error) {
      log.debug("aftersubmit error", error);
    }
  }

  return {
    afterSubmit: afterSubmit,
  };
});
