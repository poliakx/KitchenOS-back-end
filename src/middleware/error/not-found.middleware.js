import { NotFoundError } from "../../errors/classes/http/http.errors.js"

export const notFoundMiddleware = (req, res, next) => {
  return next( new NotFoundError(`Route`))
}