/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
*/
define(['N/query', 'N/log', 'N/file'], function (query, log, file) {

    function execute(context) {
        try {
            log.debug({ title: '1. Inicio de la función sales_order_pos', details: 'Iniciando la función para obtener registros de ventas POS' });
            let salesOrders = sales_order_pos();
            if (!salesOrders) {
                log.debug('Error en la función sales_order_pos', 'No se obtuvieron registros de ventas POS');
                return;
            }
            log.debug('Ejecución Sales Order POS', `Total de registros Sales Orders: ${salesOrders.length}`);

            log.debug({ title: '2. Inicio de la función payment_siscred', details: 'Iniciando la función para obtener registros de pagos Siscred' });
            let siscredPayments = payment_siscred();
            if (!siscredPayments) {
                log.debug('Error en la función payment_siscred', 'No se obtuvieron registros de pagos Siscred');
                return;
            }
            log.debug('Ejecución Pagos', `Total de registros Siscred Payments: ${siscredPayments.length}`);

            log.debug('3. Inicio de la función mergeSalesOrdersWithPayments', 'Iniciando la función para combinar Sales Orders y Pagos Siscred');
            let mergedRecords = mergeSalesOrdersWithoutPayments(salesOrders, siscredPayments);
            log.debug('Total de registros combinados:', mergedRecords.length);

            exportToCSV(salesOrders, 'SalesOrders.csv');
            exportToCSV(siscredPayments, 'SiscredPayments.csv');
            exportToCSV(mergedRecords, 'mergedRecords.csv');
            log.debug('Exportación a CSV', 'Exportación completada con éxito');
        } catch (error) {
            log.error('Error en el Script', `${error.message}\n${error.stack}`);
        }
    }

    function sales_order_pos() {
        log.debug('Inicio sales_order_pos', 'Obteniendo registros de ventas POS con runSuiteQLPaged...');
        const records = [];
        const years = [2024];

        try {
            for (const year of years) {
                log.debug(`Procesando año ${year}`);
                const startDate = `${year}-01-01`;
                const endDate = `${year}-12-31`;

                const sql = `
                    SELECT id, created, custrecord_mc_json_order
                    FROM customrecord_sdb_pos_mc_so
                    WHERE custrecord_mc_json_order IS NOT NULL
                      AND created >= TO_DATE('${startDate}', 'YYYY-MM-DD')
                      AND created <= TO_DATE('${endDate}', 'YYYY-MM-DD')
                    ORDER BY id ASC
                `;

                const pagedData = query.runSuiteQLPaged({ query: sql, pageSize: 1000 });
                log.debug(`Resultados totales estimados para ${year}: ${pagedData.count}`);

                pagedData.iterator().each(pageIteratorResult => {
                    const currentPage = pageIteratorResult.value;
                    currentPage.data.asMappedResults().forEach(result => {
                        const recordId = result.id;
                        const created = result.created;
                        const jsonDataRaw = result.custrecord_mc_json_order;

                        if (!jsonDataRaw) {
                            return;
                        }

                        try {
                            const jsonObject = jsonParseData(jsonDataRaw);

                            if (!jsonObject) {
                                log.debug(`Registro ${recordId}`, jsonDataRaw);
                                log.debug(`Registro ${recordId}`, jsonObject);
                                return;
                            }

                            const paidAmount = Number(jsonObject.pay_cuota?.payed || 0);
                            if (paidAmount <= 0) {
                                return;
                            }

                            const sales_pos = {
                                pos_id: recordId,
                                pos_fecha: created,
                                pos_total_pagodo: Number(jsonObject.pay_cuota?.total_to_pay || 0),
                                pos_pagado: paidAmount,
                                pos_cliente_id: jsonObject.entity || '',
                                pos_empleado_id: jsonObject.employee || '',
                                pos_cajero: jsonObject.cash_register || '',
                                pos_ubicacion: jsonObject.location || '',
                                pos_notas: jsonObject.memos || '',
                                pos_metodo_pago: jsonObject.payment_method || '',
                                pos_cuf: jsonObject.electronic_invoice?.response?.facturaCompraVentaBon?.cabecera?.cuf || '',
                                pos_key_ref: `${jsonObject.entity || ''}-${paidAmount}-${created}`
                            };

                            records.push(sales_pos);

                        } catch (error) {
                            log.error(`Error procesando registro POS ID ${recordId}`, {
                                message: error.message,
                                stack: error.stack,
                                rawJsonPreview: jsonDataRaw ? jsonDataRaw.substring(0, 200) : 'N/A'
                            });
                        }
                    });
                    return true;
                });
            }

            log.debug('Fin sales_order_pos', `Total de registros procesados y válidos: ${records.length}`);
            return records;

        } catch (error) {
            log.error('Error fatal en sales_order_pos', { message: error.message, stack: error.stack });
            return null;
        }
    }

    function jsonParseData(jsonDataRaw) {
        if (!jsonDataRaw || typeof jsonDataRaw !== 'string' || jsonDataRaw.trim().length === 0) {
            log.debug('jsonParseData: Input inválido (null, no string, o vacío).');
            return null;
        }

        let cleanedData = jsonDataRaw;
        let finalObject = null;
        const originalPreview = jsonDataRaw.substring(0, 200) + '...';

        try {
            cleanedData = cleanedData
                .replace(/&quot;/g, '"')
                .replace(/&nbsp;/g, ' ')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace('<p>', '')
                .replace('</p>', '')
                .replace('<br />', '')
                .replace(/<[^>]*>/g, '')
                .replace(/\r?\n|\r/g, '')
                .trim();

            const cleanedPreview = cleanedData.substring(0, 200) + '...';

            if (cleanedData.length === 0) {
                log.debug('jsonParseData: Data vacía después de limpiar.');
                return null;
            }

            let parsedData = JSON.parse(cleanedData);
            if (typeof parsedData === 'string') {
                const innerJsonString = parsedData.trim();
                const innerPreview = innerJsonString.substring(0, 200) + '...';

                const innerStartsWithBracket = innerJsonString.startsWith('{') && innerJsonString.endsWith('}');
                const innerStartsWithSquare = innerJsonString.startsWith('[') && innerJsonString.endsWith(']');

                if (innerStartsWithBracket || innerStartsWithSquare) {
                    try {
                        finalObject = JSON.parse(innerJsonString);
                    } catch (secondParseError) {
                        log.error('Error en jsonParseData (Segundo Intento de Parse)', {
                            message: secondParseError.message,
                            stringAttempted: innerPreview,
                            originalStringPreview: originalPreview
                        });
                        return null;
                    }
                } else {
                    log.debug('jsonParseData: Resultado del primer parse es string, pero no estructura JSON válida.', {
                        stringAfterFirstParsePreview: innerPreview,
                        originalStringPreview: originalPreview
                    });
                    return null;
                }
            } else if (typeof parsedData === 'object' && parsedData !== null) {
                finalObject = parsedData;
            } else {
                log.debug('jsonParseData: Primer parse resultó en tipo inesperado.', {
                    type: typeof parsedData,
                    cleanedPreview: cleanedPreview,
                    originalStringPreview: originalPreview
                });
                return null;
            }

            if (typeof finalObject !== 'object' || finalObject === null) {
                log.error('jsonParseData: Resultado final parseado no es un objeto/array no nulo', {
                    finalType: typeof finalObject,
                    cleanedPreview: cleanedPreview,
                    originalStringPreview: originalPreview
                });
                return null;
            }
            return finalObject;
        } catch (error) {
            log.error('Error en jsonParseData', {
                message: error.message,
                cleanedPreview: (typeof cleanedData === 'string' ? cleanedData.substring(0, 200) + '...' : '[No es string después de limpiar]'),
                originalPreview: originalPreview,
            });
            return null;
        }
    }

    function payment_siscred() {
        log.audit('Inicio payment_siscred', 'Obteniendo registros de pagos Siscred por rangos de 2 días...');
        const records = [];
        const years = [2024];
        const DAY_RANGE = 1;
        const MAX_RESULTS_PER_QUERY = 5000;

        try {
            for (const year of years) {
                log.audit(`Procesando año ${year}`);
                const startOfYear = new Date(Date.UTC(year, 0, 1));
                const endOfYear = new Date(Date.UTC(year, 11, 31));

                let currentStart = new Date(startOfYear);

                while (currentStart <= endOfYear) {
                    let currentEnd = new Date(currentStart);
                    currentEnd.setUTCDate(currentEnd.getUTCDate() + DAY_RANGE);

                    if (currentEnd > endOfYear) {
                        currentEnd = new Date(endOfYear);
                    }

                    const startDateStr = currentStart.toISOString().split('T')[0];
                    const endDateStr = currentEnd.toISOString().split('T')[0];

                    let lastPagoCuotaId = 0;
                    let keepFetching = true;
                    let resultsInThisRange = 0;

                    while (keepFetching) {
                        const sql = `
                        SELECT
                            pago_siscred.id AS pago_siscred_id,
                            pago_siscred.custrecord_sdb_mc_pago_siscred_cliente AS pago_siscred_cliente,
                            BUILTIN.DF(pago_siscred.custrecord_sdb_mc_pago_siscred_cliente) AS pago_siscred_cliente_doc,
                            pago_siscred.custrecord_sdb_mc_pago_siscred_fecha AS pago_siscred_fecha,
                            pago_siscred.custrecord_sdb_mc_pago_siscred_monto AS pago_siscred_monto,
                            pago_siscred.custrecord_sdb_mc_seguro AS pago_siscred_seguro,
                            pago_siscred.custrecord_sdb_pago_siscred_so_pos AS pago_siscred_so_pos,
                            pc.id AS pago_cuota_id,
                            pc.created AS pago_cuota_fecha,
                            pc.custrecord_sdb_mc_capital AS pago_cuota_capital,
                            pc.custrecord_sdb_mc_cargo_administrativo AS pago_cuota_cargo_administrativo,
                            pc.custrecord_sdb_mc_cargo_cobranza AS pago_cuota_cargo_cobranza,
                            pc.custrecord_sdb_mc_cargo_mora AS pago_cuota_cargo_mora,
                            pc.custrecord_sdb_mc_cargo_seguro AS pago_cuota_cargo_seguro,
                            pc.custrecord_sdb_mc_total AS pago_cuota_total,
                            pc.custrecord_sdb_mc_trans_capital AS trans_capital,
                            BUILTIN.DF(pc.custrecord_sdb_mc_trans_capital) AS trans_capital_doc,
                            BUILTIN.DF(tx_capital.status) AS trans_capital_estado,
                            pc.custrecord_sdb_mc_trans_cargos AS trans_cargos,
                            BUILTIN.DF(pc.custrecord_sdb_mc_trans_cargos) AS trans_cargos_doc,
                            BUILTIN.DF(tx_cargos.status) AS trans_cargos_estado,
                            tx_cargos.custbody_sdb_cuf AS trans_cargos_cuf,
                            tx_cargos.custbody_sdb_numero_factura AS trans_cargos_nro_factura,
                            tx_cargos.custbody_sdb_confirmacion_f_electro AS trans_cargos_conf_elec,
                            tx_cargos.custbody_sdb_fact_electronica_id AS trans_cargos_id_fiscal,
                            pc.custrecord_sdb_mc_payment_capital AS payment_capital,
                            BUILTIN.DF(pc.custrecord_sdb_mc_payment_capital) AS payment_capital_doc,
                            BUILTIN.DF(tx_pago.status) AS payment_capital_estado,
                            CASE WHEN NVL(tx_pago.location, 0) = 0 THEN 'NO' ELSE 'SI' END AS payment_capital_is_multipago,
                            pc.custrecord_sdb_mc_cuota AS cuota,
                            cuota.custrecord_sdb_siscredcuota_num AS cuota_nro,
                            cuota.custrecord_sdb_siscred_fechapago AS cuota_fecha_pago,
                            BUILTIN.DF(cuota.custrecord_sdb_siscred_estadocuota) AS cuota_estado,
                            pc.custrecord_sdb_pago_cuota_has_error  AS has_error,
                            pago_siscred.custrecord_sdb_mc_pago_siscred_cliente || '-' || custrecord_sdb_mc_pago_siscred_monto || '-' || pago_siscred.created AS key_ref
                        FROM customrecord_sdb_pago_cuota AS pc
                        LEFT JOIN customrecord_sdb_mc_pago_siscred AS pago_siscred
                            ON pc.custrecord_sdb_mc_pago_siscred = pago_siscred.id
                        LEFT JOIN customrecord_sdb_siscred_cuota AS cuota
                            ON pc.custrecord_sdb_mc_cuota = cuota.id
                        LEFT JOIN Transaction AS tx_capital
                            ON pc.custrecord_sdb_mc_trans_capital = tx_capital.id
                            AND tx_capital.type IN ('CustInvc', 'CashSale')
                        LEFT JOIN Transaction AS tx_cargos
                            ON pc.custrecord_sdb_mc_trans_cargos = tx_cargos.id
                            AND tx_cargos.type IN ('CustInvc', 'CashSale')
                        LEFT JOIN Transaction AS tx_pago
                            ON pc.custrecord_sdb_mc_payment_capital = tx_pago.id
                            AND tx_pago.type = 'CustPymt'
                        WHERE pc.isinactive = 'F'
                        AND pc.name IS NOT NULL
                        AND pago_siscred.custrecord_sdb_mc_pago_siscred_reembolso = 'F'
                        AND pago_siscred.isinactive = 'F'
                        AND pc.created >= TO_DATE('${startDateStr}', 'YYYY-MM-DD')
                        AND pc.created <= TO_DATE('${endDateStr}', 'YYYY-MM-DD')
                        AND pc.id > ${lastPagoCuotaId}  -- Condición para paginación manual
                        ORDER BY pc.id ASC
                    `;

                        const results = query.runSuiteQL({ query: sql }).asMappedResults();
                        const resultCount = results.length;
                        resultsInThisRange += resultCount;

                        if (resultCount > 0) {
                            records.push(...results);
                            lastPagoCuotaId = results[resultCount - 1].pago_cuota_id;
                        }

                        if (resultCount < MAX_RESULTS_PER_QUERY) {
                            keepFetching = false;
                        } else {
                            log.debug(`Límite alcanzado (${MAX_RESULTS_PER_QUERY}) en rango ${startDateStr}-${endDateStr}. Obteniendo siguiente página...`);
                        }
                    }
                    currentStart.setUTCDate(currentStart.getUTCDate() + DAY_RANGE + 1);
                }
            }

            log.audit('Fin payment_siscred', `Total de registros de pagos Siscred procesados: ${records.length}`);
            return records;

        } catch (error) {
            log.error('Error fatal en payment_siscred', { message: error.message, stack: error.stack });
            return null;
        }
    }


    function mergePaymentsWithSalesOrders(salesOrders, siscredPayments) {
        let mergedRecords = [];

        siscredPayments.forEach(payment => {
            let matchedOrders =
                (payment.trans_cargos_cuf && salesOrders.filter(order => order.pos_cuf === payment.trans_cargos_cuf)) ||
                (payment.pago_siscred_so_pos && salesOrders.filter(order => order.pos_id === payment.pago_siscred_so_pos)) ||
                (payment.pago_siscred_cliente && payment.pago_siscred_monto && payment.pago_siscred_fecha &&
                    salesOrders.filter(sales => sales.key_ref === `${payment.pago_siscred_cliente}-${payment.pago_siscred_monto}-${payment.pago_siscred_fecha}`)) || [];

            matchedOrders.forEach(order => {
                mergedRecords.push({ ...order, ...payment });
            });
        });

        return mergedRecords;
    }

    function mergeSalesOrdersWithPayments(salesOrders, siscredPayments) {
        const mergedRecords = [];
        const paymentsMapByCuf = new Map();
        const paymentsMapByPosId = new Map();
        const paymentsMapByKeyRef = new Map();

        siscredPayments.forEach(payment => {
            if (payment.trans_cargos_cuf) {
                if (!paymentsMapByCuf.has(payment.trans_cargos_cuf)) {
                    paymentsMapByCuf.set(payment.trans_cargos_cuf, []);
                }
                paymentsMapByCuf.get(payment.trans_cargos_cuf).push(payment);
            }
            const posIdKey = String(payment.pago_siscred_so_pos || '');
            if (posIdKey) {
                if (!paymentsMapByPosId.has(posIdKey)) {
                    paymentsMapByPosId.set(posIdKey, []);
                }
                paymentsMapByPosId.get(posIdKey).push(payment);
            }
            if (payment.key_ref) {
                if (!paymentsMapByKeyRef.has(payment.key_ref)) {
                    paymentsMapByKeyRef.set(payment.key_ref, []);
                }
                paymentsMapByKeyRef.get(payment.key_ref).push(payment);
            }
        });

        let matchedCount = 0;
        let unmatchedCount = 0;
        let exceptionCount = 0;

        salesOrders.forEach((order, index) => {
            let matchedPayments = [];
            let matchType = 'Ninguno';
            let cufException = false;

            // a. Intenta coincidir por CUF y verifica si es único
            if (order.pos_cuf && paymentsMapByCuf.has(order.pos_cuf)) {
                const potentialMatches = paymentsMapByCuf.get(order.pos_cuf);
                if (potentialMatches.length === 1) {
                    matchedPayments = potentialMatches;
                    matchType = 'CUF';
                } else if (potentialMatches.length > 1) {
                    cufException = true;
                    exceptionCount++;
                }
            }

            // b. Si NO hubo coincidencia única por CUF (o no había CUF), intenta por ID de SO POS
            if (matchType === 'Ninguno' && !cufException && order.pos_id && paymentsMapByPosId.has(String(order.pos_id))) {
                matchedPayments = paymentsMapByPosId.get(String(order.pos_id));
                matchType = 'ID POS';
                if (matchedPayments.length > 1) {
                    log.debug('Coincidencia Múltiple por ID POS', `Orden POS ID ${order.pos_id} coincidió con ${matchedPayments.length} pagos via ID POS.`);
                }
            }
            // c. Si aún no hay coincidencia, intenta por KeyRef
            else if (matchType === 'Ninguno' && !cufException && order.pos_key_ref && paymentsMapByKeyRef.has(order.pos_key_ref)) {
                matchedPayments = paymentsMapByKeyRef.get(order.pos_key_ref);
                matchType = 'KeyRef';
                if (matchedPayments.length > 1) {
                    log.debug('Coincidencia Múltiple por KeyRef', `Orden POS ID ${order.pos_id} coincidió con ${matchedPayments.length} pagos via KeyRef.`);
                }
            }

            // 3. Procesar las coincidencias encontradas (si las hay)
            if (matchedPayments.length > 0) {
                matchedCount++;
                matchedPayments.forEach(payment => {
                    mergedRecords.push({ ...order, ...payment, match_type: matchType });
                });
            } else {
                if (!cufException) {
                    unmatchedCount++;
                }
            }

            if ((index + 1) % 1000 === 0) {
                log.debug('Progreso Merge', `Procesadas ${index + 1}/${salesOrders.length} órdenes. Coincidentes: ${matchedCount}, Sin Pago: ${unmatchedCount}, Excepciones CUF: ${exceptionCount}`);
            }
        });

        log.debug('Fin Merge', `Total Órdenes: ${salesOrders.length}, Órdenes con Pago(s): ${matchedCount}, Órdenes sin Pago: ${unmatchedCount}, Excepciones CUF Múltiple: ${exceptionCount}. Total Registros Combinados: ${mergedRecords.length}`);
        return mergedRecords;
    }

    function mergeSalesOrdersWithoutPayments(salesOrders, siscredPayments) {
        const unmergedRecords = [];
        const paymentsMapByCuf = new Map();
        const paymentsMapByPosId = new Map();
        const paymentsMapByKeyRef = new Map();

        // 1. Crear mapas de los pagos Siscred... (igual que antes)
        siscredPayments.forEach(payment => {
            if (payment.trans_cargos_cuf) {
                if (!paymentsMapByCuf.has(payment.trans_cargos_cuf)) {
                    paymentsMapByCuf.set(payment.trans_cargos_cuf, []);
                }
                paymentsMapByCuf.get(payment.trans_cargos_cuf).push(payment);
            }
            const posIdKey = String(payment.pago_siscred_so_pos || '');
            if (posIdKey) {
                if (!paymentsMapByPosId.has(posIdKey)) {
                    paymentsMapByPosId.set(posIdKey, []);
                }
                paymentsMapByPosId.get(posIdKey).push(payment);
            }
            if (payment.key_ref) {
                if (!paymentsMapByKeyRef.has(payment.key_ref)) {
                    paymentsMapByKeyRef.set(payment.key_ref, []);
                }
                paymentsMapByKeyRef.get(payment.key_ref).push(payment);
            }
        });

        let unmatchedCount = 0;

        // 2. Iterar sobre los Sales Orders
        salesOrders.forEach((order, index) => {
            let hasMatch = false;

            // a. Intenta coincidir por CUF y verifica si es único
            if (order.pos_cuf && paymentsMapByCuf.has(order.pos_cuf)) {
                const potentialMatches = paymentsMapByCuf.get(order.pos_cuf);
                if(potentialMatches.length > 0) { hasMatch = true; }
            }

            // b. Si NO hubo coincidencia única por CUF (o no había CUF), intenta por ID de SO POS
            if (!hasMatch && order.pos_id && paymentsMapByPosId.has(String(order.pos_id))) {
                const potentialMatches = paymentsMapByPosId.get(String(order.pos_id));
                if(potentialMatches.length > 0) { hasMatch = true; }
            }

            // c. Si aún no hay coincidencia, intenta por KeyRef
            if (!hasMatch && order.pos_key_ref && paymentsMapByKeyRef.has(order.pos_key_ref)) {
                const potentialMatches = paymentsMapByKeyRef.get(order.pos_key_ref);
                if(potentialMatches.length > 0) { hasMatch = true; }
            }

            if(!hasMatch) {
                unmatchedCount++;
                unmergedRecords.push(order);
            }
        });
        return unmergedRecords;
    }

    function exportToCSV(dataArray, fileName) {
        if (!dataArray.length) {
            log.debug(`exportToCSV`, `No hay datos para exportar en ${fileName}`);
            return;
        }

        const MAX_SIZE = 5 * 1024 * 1024; // 10 MB en bytes
        const HEADER = Object.keys(dataArray[0]).join(';') + '\n';
        let currentContent = HEADER;
        let partNumber = 1;
        let currentSize = currentContent.length;

        dataArray.forEach(row => {
            const rowContent = Object.values(row).map(value => `"${value}"`).join(';') + '\n';
            currentSize += rowContent.length;

            if (currentSize >= MAX_SIZE) {
                saveCSVFile(currentContent, fileName, partNumber);
                partNumber++;
                currentContent = HEADER + rowContent;
                currentSize = currentContent.length;
            } else {
                currentContent += rowContent;
            }
        });

        if (currentContent.length > HEADER.length) {
            saveCSVFile(currentContent, fileName, partNumber);
        }
    }

    function saveCSVFile(content, fileName, partNumber) {
        try {
            const finalFileName = `${fileName}_part${partNumber}.csv`;
            let csvFile = file.create({
                name: finalFileName,
                fileType: file.Type.CSV,
                contents: content,
                folder: 221524
            });

            let fileId = csvFile.save();
            log.debug('Archivo CSV Guardado', `Archivo ${finalFileName} guardado con ID: ${fileId}`);
        } catch (error) {
            log.error(`Error al crear CSV ${fileName}_part${partNumber}`, error);
        }
    }

    return {
        execute: execute
    };
});
