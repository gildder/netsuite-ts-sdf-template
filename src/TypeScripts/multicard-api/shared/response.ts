/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 */

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  message: string;
  error: string | null;
}

export const success = <T>(data: T): ApiResponse<T> => ({
  success: true,
  data,
  message: '',
  error: null,
});

export const failure = <T = never>(message: string): ApiResponse<T> => ({
  success: false,
  data: null,
  message,
  error: message,
});
