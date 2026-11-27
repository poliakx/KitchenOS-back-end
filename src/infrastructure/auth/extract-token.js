import { AuthError } from "../../errors/classes/authorization/auth.errors.js"

export const extractToken = (req) => {
  const authHeader = req.headers.authorization;
 
  if (!authHeader) {
    throw new AuthError("Authorization header missing");
  };

  const [type, token] = authHeader.trim().split(" ");

  if (type?.toLowerCase() !== "bearer" || !token) {
    throw new AuthError("Invalid authorization format. Use: Bearer <token>");
  };

  return token
}