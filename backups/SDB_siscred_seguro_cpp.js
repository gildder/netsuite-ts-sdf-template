/**
 *@NApiVersion 2.1
 *@NScriptType UserEventScript
 */
 define([
  "N/search",
  "N/record",
  "N/ui/serverWidget",
  "N/runtime",
  "N/format",
], function (search, record, serverWidget, runtime, format) {
  function beforeSubmit(context) {
      try {

          if (
              (context.type == context.UserEventType.CREATE /*||
                  context.type == context.UserEventType.EDIT*/)
          ) {
              log.debug("context.newRecord", context.newRecord)
              const recordObj = context.newRecord;
              const CASH_ID = recordObj.id;
              log.debug("CASH_ID", CASH_ID);
              const scriptObj = runtime.getCurrentScript();
              const vendorParam = scriptObj.getParameter("custscript_sdb_siscred_cpp_vendor");
              const accountParam = scriptObj.getParameter("custscript_sdb_siscred_cpp_acc");
              const accountPayParam = scriptObj.getParameter("custscript_sdb_siscred_cpp_cpp");
              const itemCargoSeguro = scriptObj.getParameter("custscript_sdb_siscred_cpp_cargo_seguro");

              let lineCount = recordObj.getLineCount({
                  sublistId: "item"
              });
              var amountCargoSeguro = 0;
              for (let i = 0; i < lineCount; i++) {
                  let item = recordObj.getSublistValue({
                      sublistId: "item",
                      fieldId: "item",
                      line: i
                  });

                  if(item == itemCargoSeguro) {
                      let amount = recordObj.getSublistValue({
                          sublistId: "item",
                          fieldId: "amount",
                          line: i
                      });
                      amountCargoSeguro += Number(amount);
                  }
              }
              if(amountCargoSeguro == 0)
                  return;

              let journalEntry = record.create({
                  type: record.Type.JOURNAL_ENTRY,
                  isDynamic: true,
              });

              //Body Fields
              journalEntry.setValue(
                  "subsidiary",
                  6
              );
              journalEntry.setValue("currency", 1);
              journalEntry.setValue("trandate", recordObj.getValue("trandate"));

              //Debit
              addNewLine(journalEntry, accountParam, true, amountCargoSeguro);

              //Credit
              addNewLine(journalEntry, accountPayParam, false, amountCargoSeguro, vendorParam);

              const journalId = journalEntry.save({
                  ignoreMandatoryFields: true,
                  enableSourcing: true,
              });

              log.debug("journalId", journalId);

              recordObj.setValue("custbody_mc_journal", journalId);
              recordObj.setValue("custbody_sdb_mc_journal", journalId);
          }
      } catch (error) {
          log.debug("error beforeSubmit", error);
      }
  }
  return {
      beforeSubmit: beforeSubmit,
  };
});

//------------------------AUXILIAR--------------------

function addNewLine(journalRec, account, debit, amount, entity) {
  try {
      journalRec.selectNewLine({
          sublistId: "line",
      });

      journalRec.setCurrentSublistValue({
          sublistId: "line",
          fieldId: "account",
          value: account,
      });

      journalRec.setCurrentSublistValue({
          sublistId: "line",
          fieldId: debit ? "debit" : "credit",
          value: amount,
      });

      if (entity) {
          journalRec.setCurrentSublistValue({
              sublistId: "line",
              fieldId: "entity",
              value: entity,
          });
      }

      journalRec.commitLine({
          sublistId: "line",
      });
  } catch (e) {
      log.debug("Error in addNewLine", e);
  }
}