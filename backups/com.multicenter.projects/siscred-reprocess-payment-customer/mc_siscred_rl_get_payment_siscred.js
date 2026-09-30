/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 */
define(['N/log', 'N/record', 'N/runtime', 'N/search'],
    /**
 * @param{log} log
 * @param{record} record
 * @param{runtime} runtime
 */
    (log, record, runtime, search) => {
        const unitsProcessing = (initialUsage) => {
            try {
                // Calculate the units used and the remaining units after the operation
                const currentUsage = runtime.getCurrentScript().getRemainingUsage();
                const unitsUsed = initialUsage - currentUsage;
                log.debug({
                    title: 'Units used in the operation',
                    details: `Used ${unitsUsed} units. Remaining: ${currentUsage} of ${initialUsage}`
                });

                return unitsUsed;

            } catch (err) {
                message = {
                    errorName: err.name,
                    errorMessage: err.message,
                    stackTrace: err.stack,
                }
                log.error({
                    title: 'Error getting remaining units',
                    details: message,
                });
                return message;
            }
        }

        const getSearchObject = (paymentId) => {
            try {
                if (!paymentId) throw new Error('params are required');
                return search.create({
                    type: 'customrecord_sdb_mc_pago_siscred',
                    filters: [
                        ['internalid', 'is', paymentId],
                    ],
                    columns: [
                        'internalid',
                        'isinactive',
                        'custrecord_sdb_mc_pago_siscred_cliente',
                        'custrecord_sdb_mc_pago_siscred_monto',
                        'custrecord_sdb_mc_pago_siscred_fecha',
                        'custrecord_sdb_mc_pago_siscred_reembolso',
                        'custrecord_sdb_mc_seguro',
                        'custrecord_sdb_pago_siscred_so_pos',
                        'custrecord_sdb_pago_siscred_error',
                    ]
                });
            }
            catch (err) {
                message = {
                    errorName: err.name,
                    errorMessage: err.message,
                    stackTrace: err.stack,
                }

                log.error({
                    title: 'Error getting search object',
                    details: message
                });
                return message
            }
        }


        /**
         * Defines the function that is executed when a GET request is sent to a RESTlet.
         * @param {Object} requestParams - Parameters from HTTP request URL; parameters passed as an Object (for all supported
         *     content types)
         * @returns {string | Object} HTTP response body; returns a string when request Content-Type is 'text/plain'; returns an
         *     Object when request Content-Type is 'application/json' or 'application/xml'
         * @since 2015.2
         */
        const post = (requestParams) => {
            // Variable to store the initial units
            var initialUsage = runtime.getCurrentScript().getRemainingUsage();
            try {

                const validateParams = (requestParams) => {
                    if (!requestParams.paymentId) return 'Invalid payment id';
                    return null;
                };
                const validationError = validateParams(requestParams);
                if (validationError) { return { error: validationError } };

                // Get Search Object
                const searchObj = getSearchObject(requestParams.paymentId);
                if (searchObj.message) return { error: searchObj.message };

                const resultSet = searchObj.run().getRange({ start: 0, end: 1 });

                if (resultSet.length === 0) return { error: 'No records found' };

                const payment = resultSet[0];

                // Update initial units for next calculation
                initialUsage = unitsProcessing(initialUsage)

                return {
                    internalid: payment.getValue('internalid'),
                    isinactive: payment.getValue('isinactive'),
                    customer: payment.getValue('custrecord_sdb_mc_pago_siscred_cliente'),
                    amount: payment.getValue('custrecord_sdb_mc_pago_siscred_monto'),
                    date: payment.getValue('custrecord_sdb_mc_pago_siscred_fecha'),
                    reimbursement: payment.getValue('custrecord_sdb_mc_pago_siscred_reembolso'),
                    error: payment.getValue('custrecord_sdb_mc_pago_siscred_error'),
                    soPos: payment.getValue('custrecord_sdb_pago_siscred_so_pos'),
                    seguro: payment.getValue('custrecord_sdb_mc_seguro'),
                };
            } catch (err) {
                unitsProcessing(initialUsage);
                message = {
                    errorName: err.name,
                    errorMessage: err.message,
                    stackTrace: err.stack,
                    requestParams,
                };
                log.error({
                    title: 'Error searching records',
                    details: message
                });
                return message;
            }
        }

        return { post }
    });
