/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 */

export interface CustomerStatus {
  name: string;
  description: string;
}

export const STATUS_UNKNOWN: CustomerStatus = {
  name: 'UNKNOWN',
  description: 'No se encontró el número de documento ingresado',
};

export const STATUS_DISABLED: CustomerStatus = {
  name: 'DISABLED',
  description: 'Tarjeta multicard inhabilitada',
};

export const STATUS_MORA: CustomerStatus = {
  name: 'MORA',
  description: 'Cliente tiene cuotas con Mora',
};

export const STATUS_NOPHONE: CustomerStatus = {
  name: 'NOPHONE',
  description: 'No tiene un número de teléfono móvil válido',
};

export const STATUS_NOBALANCE: CustomerStatus = {
  name: 'NOBALANCE',
  description: 'No tiene saldo disponible',
};

export const STATUS_SUCCESS: CustomerStatus = {
  name: 'SUCCESS',
  description: 'Cliente habilitado',
};
