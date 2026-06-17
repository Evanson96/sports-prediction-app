import crypto from 'crypto';

export const requestId = (req, res, next) => {
  const incoming = req.get('x-request-id');
  req.id = incoming && incoming.length <= 80 ? incoming : crypto.randomUUID();
  res.setHeader('x-request-id', req.id);
  next();
};
