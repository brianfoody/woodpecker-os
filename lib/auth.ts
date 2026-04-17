export function validateRequest(request: Request): boolean {
  const token = request.headers.get("X-Woodpecker-Token");
  return token === process.env.WOODPECKER_AUTH_TOKEN;
}
