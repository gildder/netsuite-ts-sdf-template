/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
define(['N/record', 'N/search', 'N/render', 'N/format', 'N/query', 'N/log', 'N/runtime'],
    (record, search, render, format, query, log, runtime) => {
  
    const CUOTA_STATUS = {
      PENDIENTE: 1,
      PAGO: 2,
      PARCIAL: 3,
      MORA: 4,
      REEMBOLSADO: 5
    };
  
    const Months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const dias   = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
    const meses  = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  
    function formatHora(date) {
      let horas = date.getHours();
      const minutos = date.getMinutes().toString().padStart(2, '0');
      const ampm = horas >= 12 ? 'pm' : 'am';
      horas = horas % 12;
      horas = horas ? horas : 12;
      return `${horas}:${minutos} ${ampm}`;
    }
  
    function fechaAhoraLP() {
      const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/La_Paz' }));
      const diaSemana = dias[now.getDay()];
      const dia = now.getDate();
      const mes = meses[now.getMonth()];
      const anio = now.getFullYear();
      const hora = formatHora(now);
      return `${diaSemana}, ${dia} de ${mes} de ${anio} ${hora}`;
    }
  
    const onRequest = (ctx) => {
      try {
        const params = ctx.request.parameters || {};
        const customer = params.customer;
  
        if (!customer) {
          ctx.response.write('INVALID CUSTOMER');
          return;
        }
  
        const custInfo = search.lookupFields({
          type: search.Type.CUSTOMER,
          id: customer,
          columns: [
            'firstname',
            'lastname',
            'companyname',
            'isperson',
            'custentity_sdb_numero_documento',
            'custentity_sdb_seg_censatia'
            // 'custentity_sdb_nit_cliente' // si existiera
          ]
        });
  
        // Ciudad del empleado logueado (fallback Santa Cruz)
        let currentUser = runtime.getCurrentUser();
        let employeeCity = 'Santa Cruz';
        try {
          if (currentUser && currentUser.id) {
            const emp = record.load({ type: record.Type.EMPLOYEE, id: currentUser.id });
            employeeCity = emp.getText('custentity_mc_city_employee') || 'Santa Cruz';
          }
        } catch (eLoad) {
          log.debug('No se pudo leer ciudad de empleado', eLoad);
        }
  
        const seguroMontoBase = custInfo['custentity_sdb_seg_censatia'] === true ? 15 : 10;
  
        // Datos financieros
        const cuotas  = getCuotas(customer);
        const seguros = findSeguroPartialOrPaided(customer);
  
        // Estados + deuda
        const estados = analyzeEstados(cuotas);
        const deuda   = getDeuda(cuotas, seguros, seguroMontoBase, estados.hasPendienteOrParcial);
  
        const data = {
          name: custInfo['isperson']
            ? `${custInfo['firstname'] || ''} ${custInfo['lastname'] || ''}`.trim()
            : (custInfo['companyname'] || ''),
          ci: custInfo['custentity_sdb_numero_documento'] || '',
          // nit: custInfo['custentity_sdb_nit_cliente'], // si existiera en el lookup
          currentDate: fechaAhoraLP(),
          indebtedness: deuda,
          hasDebt: estados.hasPendienteOrParcial,
          total: deuda.total.toFixed(2),
          city: employeeCity
        };
  
        // === DECISIONES ===
  
        // 0) 🚫 BLOQUEO por MORA (siempre, independiente de PEND/ PARCIAL)
        if (estados.hasMora) {
          const msg = 'El cliente tiene cuotas en MORA. No procede emitir el certificado. Regularice/valide antes de continuar.';
          returnJsonAlert(ctx, msg);
          log.audit({ title: 'Bloqueado por MORA', details: `Customer: ${customer}` });
          return;
        }
  
        // 1) 🚫 BLOQUEO por PENDIENTE/PARCIAL REPROGRAMADA
        if (estados.hasPendienteParcialReprog) {
          const msg = 'El cliente tiene cuotas PENDIENTES o PARCIALES marcadas como REPROGRAMADAS. Revise el caso antes de emitir.';
          returnJsonAlert(ctx, msg);
          log.audit({ title: 'Bloqueado por PENDIENTE/PARCIAL REPROGRAMADA', details: `Customer: ${customer}` });
          return;
        }
  
        // 2) ⚠️ Alerta si no hay PEND/ PARCIAL pero sí hay REPROGRAMADA
        if (!estados.hasPendienteOrParcial && estados.hasReprog) {
          const msg = 'No hay cuotas pendientes/parciales, pero existe cuota REPROGRAMADA. Revise antes de emitir.';
          returnJsonAlert(ctx, msg);
          log.audit({ title: 'Alerta por REPROGRAMADA sin PEND/PARCIAL', details: `Customer: ${customer}` });
          return;
        }
  
        // 3) 📄 Certificado DEUDOR (hay PEND/ PARCIAL y no cayó en bloqueos previos)
        if (estados.hasPendienteOrParcial) {
          const renderer = render.create();
          renderer.setTemplateByScriptId('CUSTTMPL_DEUDA_VIGENTE');
          renderer.addCustomDataSource({ format: render.DataSource.OBJECT, alias: 'customerState', data });
          const pdf = renderer.renderAsPdf();
          pdf.name = 'Certificado Deuda Vigente.pdf';
          ctx.response.writeFile(pdf, true);
          log.audit({ title: 'Certificado DEUDOR generado', details: `Customer: ${customer}` });
          return;
        }
  
        // 4) 📄 Certificado NO DEUDOR
        const renderer = render.create();
        renderer.setTemplateByScriptId('CUSTTMPL_NO_DEUDOR');
        renderer.addCustomDataSource({ format: render.DataSource.OBJECT, alias: 'customerState', data });
        const pdf = renderer.renderAsPdf();
        pdf.name = 'Certificado No Deudor.pdf';
        ctx.response.writeFile(pdf, true);
        log.audit({ title: 'Certificado NO DEUDOR generado', details: `Customer: ${customer}` });
  
      } catch (e) {
        log.error('onRequest - ERROR', e);
        ctx.response.setHeader({ name: 'Content-Type', value: 'application/json' });
        ctx.response.write(JSON.stringify({ success: false, type: 'alert', message: 'Error inesperado en Suitelet.' }));
      }
    };
  
    /** Enviar alerta JSON (consumida por el ClientScript con alert()) */
    function returnJsonAlert(ctx, message) {
      ctx.response.setHeader({ name: 'Content-Type', value: 'application/json' });
      ctx.response.write(JSON.stringify({ success: false, type: 'alert', message }));
    }
  
    /** Reglas de estado (detecta MORA y REPROGRAMADA por separado) */
    function analyzeEstados(cuotas) {
      let hasPendiente = false;
      let hasParcial   = false;
      let hasMora      = false;
      let hasReprog    = false;
      let hasPendienteParcialReprog = false;
  
      const isReprog = (val) => {
        const v = (val ?? '').toString().trim().toUpperCase();
        // REPROGRAMADA / REPROGRAMADO / booleano/checkbox T/TRUE/1
        return v === 'T' || v === 'TRUE' || v === '1' || v.includes('REPROGRAMAD');
      };
  
      for (const c of cuotas) {
        const estado = Number(c.estadoCuota);
        const reprog = isReprog(c.cuotaReprogramada);
  
        if (estado === CUOTA_STATUS.PENDIENTE) hasPendiente = true;
        if (estado === CUOTA_STATUS.PARCIAL)   hasParcial   = true;
        if (estado === CUOTA_STATUS.MORA)      hasMora      = true;
        if ((estado === CUOTA_STATUS.PENDIENTE || estado === CUOTA_STATUS.PARCIAL || estado === CUOTA_STATUS.MORA) && reprog ) hasReprog = true;
  
        if ((estado === CUOTA_STATUS.PENDIENTE || estado === CUOTA_STATUS.PARCIAL) && reprog) {
          hasPendienteParcialReprog = true;
        }
      }
  
      return {
        hasPendienteOrParcial: hasPendiente || hasParcial,
        hasMora,
        hasReprog,
        hasPendienteParcialReprog
      };
    }
  
    function getCuotas(customer) {
      const q = query.create({ type: 'CUSTOMRECORD_SDB_SISCRED_CUOTA' });
  
      const invJoin = q.joinTo({
        fieldId: 'custrecord_sdb_factura',
        target: 'transaction'
      });
  
      const condCustomer = q.createCondition({
        fieldId: 'custrecord_sdb_cliente',
        operator: query.Operator.ANY_OF,
        values: customer
      });
  
      const condMainline = invJoin.createCondition({
        fieldId: 'transactionLines.mainline',
        operator: query.Operator.IS,
        values: true
      });
  
      q.condition = q.and(condCustomer, condMainline);
  
      q.columns = [
        q.createColumn({ fieldId: 'custrecord_sdb_siscred_fechapago', alias: 'date' }),
        q.createColumn({ fieldId: 'custrecord_sdb_total_capital', alias: 'capital' }),
        q.createColumn({ fieldId: 'custrecord_sdb_pago_capital', alias: 'capitalPago' }),
        q.createColumn({ fieldId: 'custrecord_sdb_total_cargoadministrativo', alias: 'cargosAdministrativos' }),
        q.createColumn({ fieldId: 'custrecord_sdb_pago_cargoadministrativo', alias: 'cargosAdministrativosPago' }),
        q.createColumn({ fieldId: 'custrecord_sdb_total_cobranza', alias: 'cargosCobranza' }),
        q.createColumn({ fieldId: 'custrecord_sdb_pago_cobranza', alias: 'cargosCobranzaPago' }),
        q.createColumn({ fieldId: 'custrecord_sdb_total_cargomora', alias: 'mora' }),
        q.createColumn({ fieldId: 'custrecord_sdb_pago_cargomora', alias: 'moraPago' }),
        q.createColumn({ fieldId: 'custrecord_sdb_siscred_estadocuota', alias: 'estadoCuota' }),
        q.createColumn({ fieldId: 'custrecord_mc_cuota_reprogamada', alias: 'cuotaReprogramada' })
      ];
  
      const res = q.run();
      const rows = res.asMappedResults();
  
      // Trazas para validar IDs de estado si hiciera falta
      log.debug('muestraEstados', rows.slice(0, 10).map(r => r.estadoCuota));
      return rows;
    }
  
    function findSeguroPartialOrPaided(customer) {
      const dates = [];
      search.create({
        type: 'customrecord_sdb_pago_seguro',
        filters: [['custrecord_sdb_cliente_cuota_paga','anyof', customer]],
        columns: [
          search.createColumn({ name: 'custrecord_sdb_pago_cliente_date', label: 'DATE PAGO CLIENTE' }),
          search.createColumn({ name: 'custrecord_sdb_paid_unemployinsurance', label: 'PAGO ACUMULADO SEGURO DESEMPLEO' }),
          search.createColumn({
            name: 'custentity_sdb_seg_censatia',
            join: 'CUSTRECORD_SDB_CLIENTE_CUOTA_PAGA',
            label: 'Seguro Cesantia'
          })
        ]
      }).run().each((r) => {
        const sensatia = r.getValue({
          name: 'custentity_sdb_seg_censatia',
          fieldId: 'custentity_sdb_seg_censatia',
          join: 'CUSTRECORD_SDB_CLIENTE_CUOTA_PAGA'
        });
        const montoPagado = Number(r.getValue('custrecord_sdb_paid_unemployinsurance')) || 0;
        const seguroMonto = sensatia ? 15 : 10;
        dates.push({
          date: r.getValue('custrecord_sdb_pago_cliente_date'),
          montoPagado: montoPagado,
          restante: Math.max(0, seguroMonto - montoPagado)
        });
        return true;
      });
      return dates;
    }
  
    function getDateMonthAndYear(date) {
      const d = format.parse({ type: format.Type.DATE, value: date });
      return `${Months[d?.getMonth()]}-${d?.getFullYear()}`;
    }
  
    function getDeuda(cuotas, seguros, seguroMonto, hasPendienteOrParcial) {
        //  Caso 1: Hay cuotas PENDIENTE / PARCIAL
        //   => La deuda es la suma del CAPITAL de TODAS las cuotas con esos estados,
        //      sin filtrar por fecha.
        if (hasPendienteOrParcial) {
          let capitalSum = 0;
      
          for (const c of cuotas) {
            const estado = Number(c.estadoCuota);
            const esPendOParc = (estado === CUOTA_STATUS.PENDIENTE || estado === CUOTA_STATUS.PARCIAL);
            if (!esPendOParc) continue;
      
            const capital = (Number(c.capital || 0) - Number(c.capitalPago || 0));
            capitalSum += (isNaN(capital) ? 0 : capital);
          }
      
          // Solo capital; demás componentes en 0
          const total = Number(capitalSum) || 0;
          return {
            capital: total,
            cargosAdministrativos: 0,
            cargoCobranza: 0,
            seguro: 0,
            cargoMora: 0,
            total: total
          };
        }
      
        // 🔹 Caso 2: NO hay PENDIENTE/PARCIAL
        //   => Deuda = componentes (capital + cargos + mora + seguro), solo hasta el mes actual.
        let seguroMesesAplicados = [];
        const now = new Date();
        const inicioMesActual = new Date(now.getFullYear(), now.getMonth(), 1);
      
        const result = cuotas.reduce((acc, c) => {
          const monthYear = getDateMonthAndYear(c.date);
          const dateDue = format.parse({ type: format.Type.DATE, value: c.date });
          const inicioMesVenc = new Date(dateDue.getFullYear(), dateDue.getMonth(), 1);
          if (inicioMesVenc.getTime() > inicioMesActual.getTime()) return acc;
      
          const estadoEncontrado = Object.entries(CUOTA_STATUS).find(el => el[1] === Number(c.estadoCuota));
          const stateString = estadoEncontrado ? estadoEncontrado[0] : 'DESCONOCIDO';
          if (stateString === 'PAGO' || stateString === 'REEMBOLSADO') return acc;
      
          const capital   = (Number(c.capital || 0) - Number(c.capitalPago || 0));
          const cargosAdm = (Number(c.cargosAdministrativos || 0) - Number(c.cargosAdministrativosPago || 0));
          const cargoCob  = (Number(c.cargosCobranza || 0) - Number(c.cargosCobranzaPago || 0));
          const mora      = (Number(c.mora || 0) - Number(c.moraPago || 0));
      
          // Seguro mensual (una sola vez por mes)
          let seguroMes = Number(seguroMonto);
          const seg = seguros.find(s => getDateMonthAndYear(s.date) === monthYear);
          if (seg) seguroMes = Number(seg.restante);
          if (seguroMesesAplicados.includes(monthYear)) {
            seguroMes = 0;
          } else {
            seguroMesesAplicados.push(monthYear);
          }
      
          const total = (capital + cargosAdm + cargoCob + seguroMes + mora);
      
          acc.capital += capital;
          acc.cargosAdministrativos += cargosAdm;
          acc.cargoCobranza += cargoCob;
          acc.seguro += seguroMes;
          acc.cargoMora += mora;
          acc.total += total;
          return acc;
      
        }, { capital: 0, cargosAdministrativos: 0, cargoCobranza: 0, seguro: 0, cargoMora: 0, total: 0 });
      
        // Normalizar a números
        Object.keys(result).forEach(k => { result[k] = Number(result[k]) || 0; });
        return result;
      }
      
    return { onRequest };
  });
  