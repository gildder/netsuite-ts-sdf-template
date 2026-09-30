/**
 * @NApiVersion 2.1
 * @NScriptType WorkflowActionScript
 */
define(["N/search", "N/task"], function (search, task) {
  function onAction(context) {
    try {
      var newRecord = context.newRecord;
      var reembolsado = newRecord.getValue(
        "custrecord_sdb_mc_pago_siscred_reembolso"
      );

      log.debug("newRecord.id", newRecord.id);
      log.debug("reembolsado", reembolsado);
      if (reembolsado) return;
      var customrecord_sdb_pago_cuotaSearchObj = search.create({
        type: "customrecord_sdb_pago_cuota",
        filters: [["custrecord_sdb_mc_pago_siscred", "anyof", newRecord.id]],
        columns: ["internalid"],
      });
      var count = customrecord_sdb_pago_cuotaSearchObj.runPaged().count;
      log.debug("customrecord_sdb_pago_cuotaSearchObj.runPaged().count", count);
      if (count == 0) return;

      let scriptTask = task.create({
        taskType: task.TaskType.MAP_REDUCE,
      });
      scriptTask.scriptId = "customscript_sdb_mr_reembolso_siscred";
      scriptTask.deploymentId = null;
      scriptTask.params = {
        custscript_sdb_id_pago_siscred: newRecord.id,
      };
      try {
        let scriptTaskId = scriptTask.submit();
        log.debug({
          title: "scriptTaskId id ",
          details: scriptTaskId,
        });
      } catch (e) {
        log.debug({
          title: "Error in again run map",
          details: e.message,
        });
      }
    } catch (e) {
      log.debug("onAction error: ", e);
    }
  }

  return {
    onAction: onAction,
  };
});
