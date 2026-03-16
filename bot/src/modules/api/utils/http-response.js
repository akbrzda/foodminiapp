export const sendSuccess = (res, data = null, status = 200) => {
  if (data === null || data === undefined) {
    return res.status(status).json({ success: true });
  }
  return res.status(status).json({ success: true, data });
};

export const sendError = (res, status, error) => {
  return res.status(status).json({ success: false, error });
};

export default {
  sendSuccess,
  sendError,
};
