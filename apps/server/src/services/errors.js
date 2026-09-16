/** Ошибка с HTTP-статусом и машиночитаемым кодом. Сообщение показывается пользователю. */
export class AppError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const notFound = (message = 'Не найдено') => new AppError(404, 'not_found', message);
export const badRequest = (message) => new AppError(400, 'bad_request', message);
export const conflict = (code, message) => new AppError(409, code, message);
export const unavailable = (code, message) => new AppError(503, code, message);
