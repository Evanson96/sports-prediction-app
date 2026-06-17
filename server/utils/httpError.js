export const httpError = (status, message, details = undefined) => {
  const error = new Error(message);
  error.status = status;
  if (details) error.details = details;
  return error;
};
