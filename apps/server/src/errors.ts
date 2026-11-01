/** A problem to show the person (status: 400 bad input, 401 not signed in, 403 not allowed, 404 gone, 409 conflict). */
export class ApiError extends Error {
  constructor(public status: number, message: string, public fieldErrors?: Record<string, string>) { super(message); }
}
export const bad = (message: string, fieldErrors?: Record<string, string>) => new ApiError(400, message, fieldErrors);
export const gone = (what = "That record") => new ApiError(404, `${what} no longer exists.`);
